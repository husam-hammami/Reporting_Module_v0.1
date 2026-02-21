#!/usr/bin/env python3
"""
Run the users table migration. Use this if Create Account returns 500 or
"relation \"users\" does not exist". Uses same env as app: POSTGRES_DB,
POSTGRES_USER, POSTGRES_PASSWORD, DB_HOST, DB_PORT.
"""

import psycopg2
import os
import sys

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'database': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Hercules'),
    'port': int(os.getenv('DB_PORT', 5432)),
}

def main():
    migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'create_users_table.sql')
    if not os.path.exists(migration_file):
        print(f"Migration file not found: {migration_file}")
        sys.exit(1)

    print(f"Connecting to {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']} ...")
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        with open(migration_file, 'r', encoding='utf-8') as f:
            sql = f.read()
        conn.cursor().execute(sql)
        print("Users table migration completed successfully.")
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        sys.exit(1)
    finally:
        if conn is not None:
            conn.close()

if __name__ == '__main__':
    main()
