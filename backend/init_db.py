"""
Standalone database initialization script for desktop mode.

Called by the Electron setup wizard via child_process.execFile — NOT through Flask.
Creates the database, all tables (from migrations), and a default admin user.

Usage:
    python init_db.py --host 127.0.0.1 --port 5432 --password <pg_password>
"""

import argparse
import os
import sys
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

DB_NAME = 'Dynamic_DB_Hercules'

# Migration files in dependency order
MIGRATION_ORDER = [
    'create_users_table.sql',
    'create_tags_tables.sql',
    'create_tag_history_tables.sql',
    'create_report_builder_tables.sql',
    'create_mappings_table.sql',
    'create_licenses_table.sql',
    'create_kpi_engine_tables.sql',
    'create_bins_and_materials_tables.sql',
    'add_is_counter_to_tags.sql',
    'add_value_formula_field.sql',
    'add_bin_activation_fields.sql',
    'add_line_running_tag_fields.sql',
    'add_layout_config_field.sql',
    'add_dynamic_monitoring_tables.sql',
    'alter_tag_history_nullable_layout.sql',
    'add_tag_history_archive_unique_universal.sql',
    'add_license_machine_info.sql',
]


def get_migrations_dir():
    """Get the migrations directory, handling both frozen and normal mode."""
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'migrations')


def create_database(host, port, user, password):
    """Create the database if it doesn't exist."""
    conn = psycopg2.connect(
        dbname='postgres', user=user, password=password,
        host=host, port=port
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
    if not cur.fetchone():
        cur.execute(f'CREATE DATABASE "{DB_NAME}"')
        logger.info("Created database: %s", DB_NAME)
    else:
        logger.info("Database already exists: %s", DB_NAME)

    cur.close()
    conn.close()


def run_migrations(host, port, user, password):
    """Run all migration SQL files in order."""
    migrations_dir = get_migrations_dir()
    conn = psycopg2.connect(
        dbname=DB_NAME, user=user, password=password,
        host=host, port=port
    )
    conn.autocommit = True
    cur = conn.cursor()

    for filename in MIGRATION_ORDER:
        filepath = os.path.join(migrations_dir, filename)
        if not os.path.isfile(filepath):
            logger.warning("Migration file not found, skipping: %s", filename)
            continue
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                sql = f.read()
            cur.execute(sql)
            logger.info("Ran migration: %s", filename)
        except psycopg2.Error as e:
            # Most migrations use IF NOT EXISTS, so duplicates are fine
            logger.warning("Migration %s: %s", filename, e)
            conn.rollback()
            conn.autocommit = True

    cur.close()
    conn.close()


def create_default_admin(host, port, user, password, admin_user='admin', admin_pass='admin'):
    """Create default admin user if no users exist."""
    conn = psycopg2.connect(
        dbname=DB_NAME, user=user, password=password,
        host=host, port=port, cursor_factory=RealDictCursor
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) as cnt FROM users")
    count = cur.fetchone()['cnt']
    if count == 0:
        pw_hash = generate_password_hash(admin_pass)
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, 'admin')",
            (admin_user, pw_hash)
        )
        logger.info("Created default admin user: %s", admin_user)
    else:
        logger.info("Users already exist (%d), skipping default admin creation", count)

    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Initialize Hercules database')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--user', default='postgres')
    parser.add_argument('--password', default='postgres')
    parser.add_argument('--admin-user', default='admin')
    parser.add_argument('--admin-pass', default='admin')
    args = parser.parse_args()

    logger.info("Initializing Hercules database at %s:%d", args.host, args.port)

    try:
        create_database(args.host, args.port, args.user, args.password)
        run_migrations(args.host, args.port, args.user, args.password)
        create_default_admin(args.host, args.port, args.user, args.password,
                             args.admin_user, args.admin_pass)
        logger.info("Database initialization complete!")
        print("SUCCESS")  # Electron reads this from stdout
        return 0
    except Exception as e:
        logger.error("Database initialization failed: %s", e, exc_info=True)
        print(f"FAILED: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
