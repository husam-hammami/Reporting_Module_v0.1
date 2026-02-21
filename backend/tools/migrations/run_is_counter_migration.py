#!/usr/bin/env python3
"""
Migration Script: Add is_counter to Tags Table (Single Historian — Critical Improvement #1)
Description: Marks cumulative/counter tags so historian uses SUM(value_delta) over time.
"""

import psycopg2
import os
import sys

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'database': os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
    'port': os.getenv('DB_PORT', 5433)
}

def run_migration():
    print("\n" + "=" * 70)
    print("Running Migration: Add is_counter to Tags Table")
    print("=" * 70)
    migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'add_is_counter_to_tags.sql')
    if not os.path.exists(migration_file):
        print(f"Migration file not found: {migration_file}")
        sys.exit(1)
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_script = f.read()
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute(sql_script)
    cursor.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'tags' AND column_name = 'is_counter'
    """)
    if cursor.fetchone():
        print("Migration completed: tags.is_counter added.")
    cursor.close()
    conn.close()
    print("=" * 70)

if __name__ == '__main__':
    run_migration()
