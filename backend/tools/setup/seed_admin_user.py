#!/usr/bin/env python3
"""
Seed the deployment database with a default admin user.
Username: Admin
Password: Admin

Uses same env as app: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, DB_HOST, DB_PORT.
Run from repo root or backend: python backend/tools/setup/seed_admin_user.py
Or from backend: python tools/setup/seed_admin_user.py
"""

import os
import sys

# Add backend to path so we can use werkzeug (app dependency)
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import psycopg2
from werkzeug.security import generate_password_hash

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'database': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Hercules'),
    'port': int(os.getenv('DB_PORT', 5432)),
}

USERNAME = 'Admin'
PASSWORD = 'Admin'
ROLE = 'admin'


def main():
    password_hash = generate_password_hash(PASSWORD)
    print(f"Connecting to {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']} ...")
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM users WHERE username = %s",
            (USERNAME,)
        )
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE users SET password_hash = %s, role = %s WHERE username = %s",
                (password_hash, ROLE, USERNAME)
            )
            print(f"User '{USERNAME}' updated (password and role set).")
        else:
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                (USERNAME, password_hash, ROLE)
            )
            print(f"User '{USERNAME}' created with role '{ROLE}'.")
    except psycopg2.ProgrammingError as e:
        if 'does not exist' in str(e) or 'relation "users"' in str(e):
            print("Error: users table not found. Run the users migration first:")
            print("  python backend/tools/migrations/run_users_migration.py")
        else:
            print(f"Database error: {e}")
        sys.exit(1)
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        sys.exit(1)
    finally:
        if conn is not None:
            conn.close()


if __name__ == '__main__':
    main()
