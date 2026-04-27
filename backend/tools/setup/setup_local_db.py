#!/usr/bin/env python3
"""
Local Database Setup Script
============================
One-shot script to create the PostgreSQL database, run all migrations,
seed demo data, and verify the result.

Usage:
    python setup_local_db.py              # full setup with demo data
    python setup_local_db.py --no-seed    # tables only, no demo data

Prerequisites:
    - PostgreSQL 17 installed and running on localhost
    - pg_hba.conf set to 'trust' for local connections (see docs/LOCAL_DB_SETUP.md)
    - backend/.env file exists (copy from .env.example)
"""

import os
import sys
import io
import argparse

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Resolve paths relative to the backend root (two levels up from tools/setup/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
ENV_FILE = os.path.join(BACKEND_DIR, '.env')

def load_dotenv_simple(path):
    """Load .env file into os.environ (no external dependency needed)."""
    if not os.path.exists(path):
        return False
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            os.environ.setdefault(key.strip(), value.strip())
    return True

load_dotenv_simple(ENV_FILE)

DB_NAME = os.getenv('POSTGRES_DB', 'dynamic_db_hercules')
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASS = os.getenv('POSTGRES_PASSWORD', '')
DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
DB_PORT = int(os.getenv('DB_PORT', 5432))

# ── Ordered migrations (dependencies go first) ───────────────────────────
MIGRATIONS_DIR = os.path.join(BACKEND_DIR, 'migrations')

MIGRATION_ORDER = [
    # Phase 1: base tables
    'create_tags_tables.sql',
    'create_users_table.sql',
    'create_bins_and_materials_tables.sql',
    'create_report_builder_tables.sql',
    # Phase 2: tables that reference phase 1
    'create_tag_history_tables.sql',
    'create_kpi_engine_tables.sql',
    # Phase 3: ALTER TABLE on tags
    'add_is_counter_to_tags.sql',
    'add_bin_activation_fields.sql',
    'add_value_formula_field.sql',
    # Phase 4: ALTER TABLE on live_monitor_layouts + new tables
    'add_layout_config_field.sql',
    'add_line_running_tag_fields.sql',
    'add_dynamic_monitoring_tables.sql',
    # Phase 5: Universal historian (layout_id nullable)
    'alter_tag_history_nullable_layout.sql',
    # Phase 6: License activation
    'create_licenses_table.sql',
    # Phase 7: Mappings + archive unique
    'create_mappings_table.sql',
    'add_tag_history_archive_unique_universal.sql',
    # Phase 8: Desktop app — license machine info
    'add_license_machine_info.sql',
    # Phase 9: String-valued historian (value_text column)
    'add_value_text_to_tag_history.sql',
]

DIVIDER = '=' * 60


def print_header(text):
    print(f'\n{DIVIDER}')
    print(f'  {text}')
    print(DIVIDER)


def connect(dbname='postgres'):
    """Return a psycopg2 connection. Exits on failure."""
    try:
        import psycopg2
    except ImportError:
        print('psycopg2 is not installed. Run:  pip install psycopg2-binary')
        sys.exit(1)

    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            dbname=dbname,
            connect_timeout=10,
        )
        conn.autocommit = True
        return conn
    except psycopg2.OperationalError as e:
        print(f'\nCould not connect to PostgreSQL at {DB_HOST}:{DB_PORT}')
        print(f'Error: {e}')
        print('\nCheck that:')
        print('  1. PostgreSQL is installed and the service is running')
        print('  2. pg_hba.conf is set to "trust" for local connections')
        print('  3. backend/.env has the correct DB_HOST and DB_PORT')
        print('\nSee docs/LOCAL_DB_SETUP.md for full instructions.')
        sys.exit(1)


# ── Step 1: Create database ──────────────────────────────────────────────
def create_database():
    print_header('Step 1 — Create database')
    conn = connect('postgres')
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
    if cur.fetchone():
        print(f'  Database "{DB_NAME}" already exists — skipping.')
    else:
        cur.execute(f'CREATE DATABASE "{DB_NAME}"')
        print(f'  Created database "{DB_NAME}".')

    cur.close()
    conn.close()


# ── Step 2: Run migrations ───────────────────────────────────────────────
def run_migrations():
    print_header('Step 2 — Run migrations')
    conn = connect(DB_NAME)
    cur = conn.cursor()

    for filename in MIGRATION_ORDER:
        path = os.path.join(MIGRATIONS_DIR, filename)
        if not os.path.exists(path):
            print(f'  SKIP  {filename}  (file not found)')
            continue

        with open(path, 'r', encoding='utf-8') as f:
            sql = f.read()

        try:
            cur.execute(sql)
            print(f'  OK    {filename}')
        except Exception as e:
            # Likely "already exists" — safe to ignore for IF NOT EXISTS scripts
            conn.rollback()
            conn.autocommit = True
            msg = str(e).split('\n')[0]
            print(f'  SKIP  {filename}  ({msg})')

    # Auto-discover migrations not in MIGRATION_ORDER (e.g. delivered via OTA update)
    all_sql = set(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith('.sql'))
    ordered = set(MIGRATION_ORDER)
    extra = sorted(all_sql - ordered)
    for filename in extra:
        path = os.path.join(MIGRATIONS_DIR, filename)
        with open(path, 'r', encoding='utf-8') as f:
            sql = f.read()
        try:
            cur.execute(sql)
            print(f'  OK    {filename}  (auto-discovered)')
        except Exception as e:
            conn.rollback()
            conn.autocommit = True
            msg = str(e).split('\n')[0]
            print(f'  SKIP  {filename}  ({msg})')

    cur.close()
    conn.close()


# ── Step 3: Create default user ──────────────────────────────────────────
def create_default_user():
    print_header('Step 3 — Create default user')
    import psycopg2
    conn = connect(DB_NAME)
    cur = conn.cursor()

    try:
        from werkzeug.security import generate_password_hash
        hashed = generate_password_hash('admin', method='pbkdf2:sha256')
    except ImportError:
        hashed = 'pbkdf2:sha256:1000000$L8PYc32OmEHANAxE$041d9b91b968b44ffe538df07458f6a82ed6ddfff50a146453f79d7ff960a4d0'

    try:
        cur.execute("SELECT 1 FROM users WHERE username = 'Yaser'")
        if cur.fetchone():
            print('  User "Yaser" already exists — skipping.')
        else:
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                ('Yaser', hashed, 'admin'),
            )
            print('  Created user "Yaser" (password: admin).')
    except psycopg2.errors.UndefinedColumn:
        conn.rollback()
        conn.autocommit = True
        try:
            cur.execute("SELECT 1 FROM users WHERE username = 'Yaser'")
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                    ('Yaser', hashed, 'admin'),
                )
                print('  Created user "Yaser" (password: admin).')
        except Exception as e2:
            print(f'  SKIP  Could not create user: {e2}')

    cur.close()
    conn.close()


# ── Step 4: Seed Mil B production data (always runs) ─────────────────────
def seed_production_data():
    print_header('Step 4 — Seed Mil B production data')
    if SCRIPT_DIR not in sys.path:
        sys.path.insert(0, SCRIPT_DIR)
    try:
        from seed_mil_b_data import seed as mil_b_seed
        conn = connect(DB_NAME)
        conn.autocommit = False
        mil_b_seed(conn)
        conn.close()
    except Exception as e:
        print(f'  WARN  Could not seed Mil B data: {e}')


# ── Step 4b: Seed Power Consumption tags (always runs) ────────────────────
def seed_power_data():
    print_header('Step 4b — Seed Power Consumption tags (C32, M30, M31)')
    if SCRIPT_DIR not in sys.path:
        sys.path.insert(0, SCRIPT_DIR)
    try:
        from seed_power_tags import seed as power_seed
        conn = connect(DB_NAME)
        conn.autocommit = False
        power_seed(conn)
        conn.close()
    except Exception as e:
        print(f'  WARN  Could not seed power tags: {e}')


# ── Step 5: Seed demo data ───────────────────────────────────────────────
def seed_demo_data():
    print_header('Step 5 — Seed demo data (layout + report templates)')

    seed_layout = os.path.join(SCRIPT_DIR, 'seed_demo_layout.py')
    seed_reports = os.path.join(SCRIPT_DIR, 'seed_report_templates.py')

    if os.path.exists(seed_layout):
        print('  Running seed_demo_layout.py ...')
        result = os.system(f'"{sys.executable}" "{seed_layout}"')
        if result != 0:
            print('  WARN  seed_demo_layout.py returned non-zero exit code')
    else:
        print(f'  SKIP  seed_demo_layout.py not found')

    if os.path.exists(seed_reports):
        print('  Running seed_report_templates.py (from docs/report-templates/) ...')
        result = os.system(f'"{sys.executable}" "{seed_reports}"')
        if result != 0:
            print('  WARN  seed_report_templates.py returned non-zero exit code')
    else:
        print(f'  SKIP  seed_report_templates.py not found')


# ── Step 5: Verify ───────────────────────────────────────────────────────
def verify():
    print_header('Step 6 — Verify')
    conn = connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    """)
    tables = [row[0] for row in cur.fetchall()]

    print(f'  Found {len(tables)} tables in "{DB_NAME}":')
    for t in tables:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        count = cur.fetchone()[0]
        print(f'    {t:<45} {count:>6} rows')

    cur.close()
    conn.close()


# ── Main ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Set up local PostgreSQL database for Hercules.')
    parser.add_argument('--no-seed', action='store_true', help='Skip demo data seeding')
    args = parser.parse_args()

    print(f'\n  Hercules — Local Database Setup')
    print(f'  Target: {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}')

    create_database()
    run_migrations()
    create_default_user()
    seed_production_data()
    seed_power_data()

    if not args.no_seed:
        seed_demo_data()
    else:
        print_header('Step 5 — Seed demo data (SKIPPED via --no-seed)')

    verify()

    print_header('Done')
    print('  Your local database is ready.')
    print(f'  Start the backend:  python app.py')
    print()


if __name__ == '__main__':
    main()
