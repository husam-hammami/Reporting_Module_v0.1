#!/usr/bin/env python3
"""
Add fcl_receivers column to FCL tables
Simple migration - only adds the new column, no deletions
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import os

# Database connection parameters
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'database': os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
    'port': os.getenv('DB_PORT', 5433)
}

def get_db_connection():
    """Create database connection"""
    return psycopg2.connect(**DB_CONFIG)

def add_fcl_receivers_column():
    """Add fcl_receivers column to FCL tables"""
    print("\n" + "=" * 60)
    print("Adding fcl_receivers Column to FCL Tables")
    print("=" * 60)
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                
                # Step 1: Add column to live monitoring table
                print("\n[1/4] Adding fcl_receivers to fcl_monitor_logs...")
                cur.execute("""
                    ALTER TABLE fcl_monitor_logs 
                    ADD COLUMN IF NOT EXISTS fcl_receivers JSONB DEFAULT '[]'::jsonb;
                """)
                print("✅ Column added to fcl_monitor_logs")
                
                # Step 2: Add column to archive table
                print("\n[2/4] Adding fcl_receivers to fcl_monitor_logs_archive...")
                cur.execute("""
                    ALTER TABLE fcl_monitor_logs_archive 
                    ADD COLUMN IF NOT EXISTS fcl_receivers JSONB DEFAULT '[]'::jsonb;
                """)
                print("✅ Column added to fcl_monitor_logs_archive")
                
                # Step 3: Verify live table
                print("\n[3/4] Verifying fcl_monitor_logs table...")
                cur.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'fcl_monitor_logs'
                    AND column_name = 'fcl_receivers';
                """)
                result = cur.fetchone()
                if result:
                    print(f"✅ Column verified: {result['column_name']} ({result['data_type']})")
                else:
                    print("⚠️  Column not found!")
                    return False
                
                # Step 4: Verify archive table
                print("\n[4/4] Verifying fcl_monitor_logs_archive table...")
                cur.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'fcl_monitor_logs_archive'
                    AND column_name = 'fcl_receivers';
                """)
                result = cur.fetchone()
                if result:
                    print(f"✅ Column verified: {result['column_name']} ({result['data_type']})")
                else:
                    print("⚠️  Column not found!")
                    return False
                
                # Commit changes
                conn.commit()
                
                print("\n" + "=" * 60)
                print("✅ SUCCESS! fcl_receivers column added to both tables")
                print("=" * 60)
                
                return True
                
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        print(f"Error code: {e.pgcode}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    print("\n🚀 Starting FCL database update...\n")
    
    success = add_fcl_receivers_column()
    
    if success:
        print("\n📝 Next steps:")
        print("   1. Restart backend: python app.py")
        print("   2. Check logs for: [FCL] Receivers: 081=X.X t/h, FCL_2_520WE=Y.Y t/h")
        print("   3. Verify both receivers appear in live monitor")
        print()
        sys.exit(0)
    else:
        print("\n❌ Migration failed. Please check the error messages above.\n")
        sys.exit(1)

