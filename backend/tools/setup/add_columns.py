import psycopg2
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
            host=os.getenv('DB_HOST', '127.0.0.1'),
            port=os.getenv('DB_PORT', 5433)
        )
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

def add_columns():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Define columns to add
        columns_to_add = [
            ("fcl_monitor_logs", "cleaning_scale_bypass", "BOOLEAN"),
            ("fcl_monitor_logs_archive", "cleaning_scale_bypass", "BOOLEAN")
        ]
        
        for table, column, type_ in columns_to_add:
            try:
                logger.info(f"Checking {table} for {column}...")
                cur.execute(f"""
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                       WHERE table_name='{table}' AND column_name='{column}') THEN 
                            ALTER TABLE {table} ADD COLUMN {column} {type_}; 
                            RAISE NOTICE 'Added column {column} to {table}'; 
                        ELSE 
                            RAISE NOTICE 'Column {column} already exists in {table}'; 
                        END IF; 
                    END $$;
                """)
                conn.commit()
                logger.info(f"✅ Successfully processed {column} for {table}")
            except Exception as e:
                conn.rollback()
                logger.error(f"❌ Error adding {column} to {table}: {e}")

    except Exception as e:
        logger.error(f"❌ Critical error: {e}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed")

if __name__ == "__main__":
    add_columns()

