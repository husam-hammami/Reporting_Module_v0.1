"""
Dynamic Table Creation Utility

Creates and manages dynamic tables for published layouts.
"""

import logging
from contextlib import closing
from psycopg2.extras import RealDictCursor
import psycopg2

logger = logging.getLogger(__name__)


def sanitize_table_name(layout_name):
    """Convert layout name to valid PostgreSQL table name"""
    # Remove special characters, replace spaces with underscores
    sanitized = ''.join(c if c.isalnum() or c == '_' else '_' for c in layout_name)
    # Ensure it starts with a letter
    if sanitized and not sanitized[0].isalpha():
        sanitized = 'layout_' + sanitized
    # Convert to lowercase
    return sanitized.lower()


def create_dynamic_monitor_tables(layout_id, layout_name, db_connection_func):
    """
    Create live and archive tables for a dynamic layout.
    Tables are created with a flexible JSONB structure to store any tag values.
    """
    sanitized_name = sanitize_table_name(layout_name)
    live_table = f"{sanitized_name}_monitor_logs"
    archive_table = f"{sanitized_name}_monitor_logs_archive"
    
    with closing(db_connection_func()) as conn:
        # ✅ FIX: Create a regular cursor (not RealDictCursor) for table creation
        # The connection may have RealDictCursor as default, so explicitly use None
        cursor = conn.cursor(cursor_factory=None)
        
        try:
            # ✅ FIX: Check if table exists and has correct schema
            # If table exists but is missing layout_id column, drop and recreate it
            import time
            check_start = time.time()
            logger.debug(f"Checking if table {live_table} exists...")
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                );
            """, (live_table,))
            check_time = (time.time() - check_start) * 1000
            if check_time > 1000:
                logger.warning(f"⚠️ Table existence check took {check_time:.2f}ms (slow!)")
            result = cursor.fetchone()
            if result is None:
                logger.warning(f"Unexpected: fetchone() returned None for table existence check")
                table_exists = False
            else:
                table_exists = bool(result[0]) if isinstance(result, (tuple, list)) else bool(result)
            logger.debug(f"Table {live_table} exists: {table_exists}")
            
            if table_exists:
                # Check if layout_id column exists
                logger.debug(f"Checking if table {live_table} has layout_id column...")
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = %s 
                        AND column_name = 'layout_id'
                    );
                """, (live_table,))
                result = cursor.fetchone()
                if result is None:
                    logger.warning(f"Unexpected: fetchone() returned None for column check")
                    has_layout_id = False
                else:
                    # Handle both tuple (regular cursor) and dict (RealDictCursor) results
                    if isinstance(result, dict):
                        has_layout_id = bool(result.get('exists', False))
                    elif isinstance(result, (tuple, list)):
                        has_layout_id = bool(result[0])
                    else:
                        has_layout_id = bool(result)
                logger.debug(f"Table {live_table} has layout_id column: {has_layout_id}")
                
                if not has_layout_id:
                    logger.warning(f"Table {live_table} exists but missing layout_id column. Dropping and recreating...")
                    cursor.execute(f"DROP TABLE IF EXISTS {live_table} CASCADE;")
                    table_exists = False
            
            # Create live table (stores data every second)
            if not table_exists:
                cursor.execute(f"""
                    CREATE TABLE {live_table} (
                        id SERIAL PRIMARY KEY,
                        layout_id INTEGER NOT NULL,
                        order_name TEXT,
                        tag_values JSONB NOT NULL DEFAULT '{{}}',
                        computed_values JSONB DEFAULT '{{}}',
                        active_sources JSONB DEFAULT '{{}}',
                        line_running BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                """)
                logger.info(f"✅ Created table: {live_table}")
            else:
                logger.info(f"✅ Table {live_table} already exists with correct schema")
            
            # Create indexes for performance (only if they don't exist)
            cursor.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{sanitized_name}_live_layout 
                ON {live_table}(layout_id);
            """)
            cursor.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{sanitized_name}_live_created 
                ON {live_table}(created_at);
            """)
            cursor.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{sanitized_name}_live_order 
                ON {live_table}(order_name);
            """)
            
            # ✅ FIX: Check archive table similarly
            logger.debug(f"Checking if archive table {archive_table} exists...")
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                );
            """, (archive_table,))
            result = cursor.fetchone()
            if result is None:
                logger.warning(f"Unexpected: fetchone() returned None for archive table existence check")
                archive_exists = False
            else:
                # Handle both tuple (regular cursor) and dict (RealDictCursor) results
                if isinstance(result, dict):
                    archive_exists = bool(result.get('exists', False))
                elif isinstance(result, (tuple, list)):
                    archive_exists = bool(result[0])
                else:
                    archive_exists = bool(result)
            logger.debug(f"Archive table {archive_table} exists: {archive_exists}")
            
            if archive_exists:
                logger.debug(f"Checking if archive table {archive_table} has layout_id column...")
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = %s 
                        AND column_name = 'layout_id'
                    );
                """, (archive_table,))
                result = cursor.fetchone()
                if result is None:
                    logger.warning(f"Unexpected: fetchone() returned None for archive column check")
                    archive_has_layout_id = False
                else:
                    # Handle both tuple (regular cursor) and dict (RealDictCursor) results
                    if isinstance(result, dict):
                        archive_has_layout_id = bool(result.get('exists', False))
                    elif isinstance(result, (tuple, list)):
                        archive_has_layout_id = bool(result[0])
                    else:
                        archive_has_layout_id = bool(result)
                logger.debug(f"Archive table {archive_table} has layout_id column: {archive_has_layout_id}")
                
                if not archive_has_layout_id:
                    logger.warning(f"Table {archive_table} exists but missing layout_id column. Dropping and recreating...")
                    cursor.execute(f"DROP TABLE IF EXISTS {archive_table} CASCADE;")
                    archive_exists = False
            
            # Create archive table (stores hourly aggregated data)
            if not archive_exists:
                cursor.execute(f"""
                    CREATE TABLE {archive_table} (
                        id SERIAL PRIMARY KEY,
                        layout_id INTEGER NOT NULL,
                        order_name TEXT,
                        tag_values JSONB NOT NULL DEFAULT '{{}}',
                        computed_values JSONB DEFAULT '{{}}',
                        active_sources JSONB DEFAULT '{{}}',
                        per_bin_weights JSONB DEFAULT '{{}}',
                        line_running BOOLEAN DEFAULT FALSE,
                        archive_hour TIMESTAMP NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                """)
                logger.info(f"✅ Created table: {archive_table}")
            else:
                logger.info(f"✅ Table {archive_table} already exists with correct schema")
            
            # Create indexes for archive table
            cursor.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{sanitized_name}_archive_layout 
                ON {archive_table}(layout_id);
            """)
            cursor.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{sanitized_name}_archive_hour 
                ON {archive_table}(archive_hour);
            """)
            cursor.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{sanitized_name}_archive_order 
                ON {archive_table}(order_name);
            """)
            
            conn.commit()
            logger.info(f"✅ Tables ready: {live_table} and {archive_table}")
            
            return live_table, archive_table
            
        except Exception as e:
            conn.rollback()
            error_msg = str(e) if e else repr(e) if e else "Unknown error"
            logger.error(f"❌ Error creating tables for layout {layout_name}: {error_msg}", exc_info=True)
            logger.error(f"❌ Exception type: {type(e).__name__}")
            logger.error(f"❌ Exception args: {e.args if hasattr(e, 'args') else 'N/A'}")
            raise Exception(f"Failed to create tables: {error_msg}") from e


def register_dynamic_monitor(layout_id, layout_name, live_table, archive_table, db_connection_func):
    """Register a layout in the monitor registry"""
    with closing(db_connection_func()) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            logger.info(f"📝 Registering monitor: layout_id={layout_id}, layout_name={layout_name}, live_table={live_table}, archive_table={archive_table}")
            cursor.execute("""
                INSERT INTO dynamic_monitor_registry 
                (layout_id, layout_name, live_table_name, archive_table_name, is_active)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (layout_id) 
                DO UPDATE SET 
                    layout_name = EXCLUDED.layout_name,
                    live_table_name = EXCLUDED.live_table_name,
                    archive_table_name = EXCLUDED.archive_table_name,
                    is_active = EXCLUDED.is_active
            """, (layout_id, layout_name, live_table, archive_table, True))
            
            conn.commit()
            
            # ✅ VERIFY: Check that the monitor was actually registered
            cursor.execute("""
                SELECT * FROM dynamic_monitor_registry 
                WHERE layout_id = %s
            """, (layout_id,))
            registered = cursor.fetchone()
            if registered:
                logger.info(f"✅ Registered monitor for layout {layout_name} (verified: is_active={registered.get('is_active')})")
            else:
                logger.error(f"❌ Monitor registration failed - not found in registry after insert!")
                raise Exception(f"Failed to register monitor for layout {layout_name}")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Error registering monitor: {e}", exc_info=True)
            raise


def get_active_monitors(db_connection_func):
    """Get all active monitors from registry"""
    with closing(db_connection_func()) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM dynamic_monitor_registry
            WHERE is_active = TRUE
        """)
        return [dict(row) for row in cursor.fetchall()]

