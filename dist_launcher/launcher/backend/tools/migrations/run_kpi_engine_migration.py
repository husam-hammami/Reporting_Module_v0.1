#!/usr/bin/env python3
"""
Migration Script: Create KPI Engine Tables (KPI_ENGINE_PLAN.md Phase 2)
Creates kpi_config, kpi_tag_mapping, kpi_history.
Run from backend dir: python run_kpi_engine_migration.py
"""

import os
import sys

import psycopg2

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "database": os.getenv("POSTGRES_DB", "Dynamic_DB_Hercules"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "Admin@123"),
    "port": os.getenv("DB_PORT", "5433"),
}


def run_migration():
    print("\n" + "=" * 70)
    print("KPI Engine migration: create kpi_config, kpi_tag_mapping, kpi_history")
    print("=" * 70)

    migration_file = os.path.join(os.path.dirname(__file__), "migrations", "create_kpi_engine_tables.sql")
    if not os.path.exists(migration_file):
        print(f"Migration file not found: {migration_file}")
        sys.exit(1)

    with open(migration_file, "r", encoding="utf-8") as f:
        sql_script = f.read()

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql_script)
        cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'kpi_config'")
        if cur.fetchone()[0]:
            print("Tables created: kpi_config, kpi_tag_mapping, kpi_history")
        cur.close()
        conn.close()
        print("Done.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
