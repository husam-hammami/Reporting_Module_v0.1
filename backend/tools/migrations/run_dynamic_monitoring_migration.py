"""
Run migration to add dynamic monitoring tables
"""

import psycopg2
from app import get_db_connection

def run_migration():
    """Run the dynamic monitoring migration"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Read and execute migration file
            with open('migrations/add_dynamic_monitoring_tables.sql', 'r') as f:
                migration_sql = f.read()
            
            cursor.execute(migration_sql)
            conn.commit()
            
            print("✅ Migration completed successfully")
            print("Added tables:")
            print("  - dynamic_monitor_registry")
            print("  - dynamic_order_counters")
            print("  - dynamic_orders")
            print("Added columns to live_monitor_layouts:")
            print("  - is_published, published_at, monitoring_enabled")
            print("  - order_status_tag_name, order_prefix")
            print("  - order_start_value, order_stop_value")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    run_migration()

