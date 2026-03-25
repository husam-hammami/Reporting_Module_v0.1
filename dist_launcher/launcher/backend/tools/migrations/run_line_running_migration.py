#!/usr/bin/env python3
"""
Run migration to add line running tag fields to live_monitor_layouts table
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import get_db_connection
from contextlib import closing

def run_migration():
    """Run the migration to add line running tag fields"""
    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            
            # Read migration file
            migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'add_line_running_tag_fields.sql')
            with open(migration_file, 'r') as f:
                migration_sql = f.read()
            
            # Execute migration
            cursor.execute(migration_sql)
            conn.commit()
            
            print("✅ Migration completed successfully!")
            print("Added columns: include_line_running_tag, line_running_tag_name")
            
    except Exception as e:
        print(f"❌ Error running migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    run_migration()

