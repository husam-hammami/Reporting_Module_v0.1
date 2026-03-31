"""
Standalone database initialization for the desktop installer.

Called by Electron setup wizard via child_process.execFile BEFORE the Flask
backend starts. Must NOT import Flask or any app module.

Usage:
    python init_db.py [--db-name NAME] [--db-port PORT] [--db-password PASS]

Environment variables (override defaults):
    POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, DB_HOST, DB_PORT
"""
import argparse
import os
import sys

# If frozen, look for migrations relative to the exe
if getattr(sys, 'frozen', False):
    _BASE = sys._MEIPASS
else:
    _BASE = os.path.dirname(os.path.abspath(__file__))

MIGRATIONS_DIR = os.path.join(_BASE, 'migrations')

MIGRATION_ORDER = [
    'create_tags_tables.sql',
    'create_users_table.sql',
    'create_bins_and_materials_tables.sql',
    'create_report_builder_tables.sql',
    'create_tag_history_tables.sql',
    'create_kpi_engine_tables.sql',
    'add_is_counter_to_tags.sql',
    'add_bin_activation_fields.sql',
    'add_value_formula_field.sql',
    'add_layout_config_field.sql',
    'add_line_running_tag_fields.sql',
    'add_dynamic_monitoring_tables.sql',
    'alter_tag_history_nullable_layout.sql',
    'create_licenses_table.sql',
    'create_mappings_table.sql',
    'add_tag_history_archive_unique_universal.sql',
    'add_license_machine_info.sql',
    'add_site_and_license_name.sql',
    'create_distribution_rules_table.sql',
    'add_archive_granularity.sql',
    'create_report_execution_log.sql',
    'add_must_change_password.sql',
    'create_hercules_ai_tables.sql',
    'add_ai_summary_to_distribution.sql',
]


def connect(dbname, host, port, user, password):
    try:
        import psycopg2
    except ImportError:
        print('ERROR: psycopg2 not installed.')
        sys.exit(1)

    conn = psycopg2.connect(
        host=host, port=port, user=user, password=password,
        dbname=dbname, connect_timeout=15,
    )
    conn.autocommit = True
    return conn


def create_database(host, port, user, password, db_name):
    print(f'[init_db] Connecting to postgres@{host}:{port} ...')
    conn = connect('postgres', host, port, user, password)
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
    if cur.fetchone():
        print(f'[init_db] Database "{db_name}" already exists.')
    else:
        cur.execute(f'CREATE DATABASE "{db_name}"')
        print(f'[init_db] Created database "{db_name}".')

    cur.close()
    conn.close()


def run_migrations(host, port, user, password, db_name):
    print(f'[init_db] Running migrations on "{db_name}" ...')
    conn = connect(db_name, host, port, user, password)
    cur = conn.cursor()

    for filename in MIGRATION_ORDER:
        path = os.path.join(MIGRATIONS_DIR, filename)
        if not os.path.exists(path):
            print(f'  SKIP  {filename} (not found)')
            continue
        with open(path, 'r', encoding='utf-8') as f:
            sql = f.read()
        try:
            cur.execute(sql)
            print(f'  OK    {filename}')
        except Exception as e:
            conn.rollback()
            conn.autocommit = True
            msg = str(e).split('\n')[0]
            print(f'  SKIP  {filename} ({msg})')

    cur.close()
    conn.close()


def create_default_admin(host, port, user, password, db_name):
    print('[init_db] Ensuring default admin user ...')
    conn = connect(db_name, host, port, user, password)
    cur = conn.cursor()

    try:
        cur.execute("SELECT 1 FROM users WHERE username = 'admin'")
        if cur.fetchone():
            print('  Admin user already exists.')
        else:
            from werkzeug.security import generate_password_hash
            hashed = generate_password_hash('admin')
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                ('admin', hashed, 'admin'),
            )
            print('  Created default admin user (admin / admin).')
    except Exception as e:
        print(f'  WARN: Could not create admin: {e}')

    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Initialize Hercules database (standalone).')
    parser.add_argument('--db-name', default=os.getenv('POSTGRES_DB', 'dynamic_db_hercules'))
    parser.add_argument('--db-port', type=int, default=int(os.getenv('DB_PORT', 5432)))
    parser.add_argument('--db-password', default=os.getenv('POSTGRES_PASSWORD', ''))
    parser.add_argument('--db-host', default=os.getenv('DB_HOST', '127.0.0.1'))
    parser.add_argument('--db-user', default=os.getenv('POSTGRES_USER', 'postgres'))
    args = parser.parse_args()

    create_database(args.db_host, args.db_port, args.db_user, args.db_password, args.db_name)
    run_migrations(args.db_host, args.db_port, args.db_user, args.db_password, args.db_name)
    create_default_admin(args.db_host, args.db_port, args.db_user, args.db_password, args.db_name)
    print('[init_db] Done.')


if __name__ == '__main__':
    main()
