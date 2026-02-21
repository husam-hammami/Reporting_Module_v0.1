"""
Check if migration has been run and run it if needed
"""
import psycopg2
import sys
import io

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from app import get_db_connection

def check_and_run_migration():
    """Check if migration tables exist, run migration if needed"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Check if dynamic_monitor_registry table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'dynamic_monitor_registry'
                );
            """)
            
            result = cursor.fetchone()
            # Handle both tuple and dict results
            table_exists = result[0] if isinstance(result, tuple) else result.get('exists', False)
            
            if not table_exists:
                print("⚠️ Migration tables not found. Running migration...")
                
                # Read and execute migration file
                with open('migrations/add_dynamic_monitoring_tables.sql', 'r') as f:
                    migration_sql = f.read()
                
                cursor.execute(migration_sql)
                conn.commit()
                
                print("Migration completed successfully")
            else:
                print("Migration tables already exist")
                
            # Verify columns exist in live_monitor_layouts
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'live_monitor_layouts' 
                AND column_name IN ('is_published', 'published_at', 'monitoring_enabled')
            """)
            
            results = cursor.fetchall()
            # Handle both tuple and dict results
            columns = [row[0] if isinstance(row, tuple) else row.get('column_name') for row in results]
            if len(columns) < 3:
                print("⚠️ Some columns missing in live_monitor_layouts. Adding them...")
                cursor.execute("""
                    ALTER TABLE live_monitor_layouts 
                    ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS order_status_tag_name VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS order_prefix VARCHAR(50) DEFAULT '',
                    ADD COLUMN IF NOT EXISTS order_start_value INTEGER DEFAULT 1,
                    ADD COLUMN IF NOT EXISTS order_stop_value INTEGER DEFAULT 0;
                """)
                conn.commit()
                print("Added missing columns")
            else:
                print("All required columns exist")
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    check_and_run_migration()

