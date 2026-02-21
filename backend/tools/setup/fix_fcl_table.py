#!/usr/bin/env python3
"""
Script to add missing columns to monitor log tables.
Fixes:
- fcl_receivers column in fcl_monitor_logs
- created_at column in mila_monitor_logs
- Any other missing columns
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_connection():
    """Create database connection using same config as app.py"""
    try:
        conn = psycopg2.connect(
            dbname=os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
            host=os.getenv('DB_HOST', '127.0.0.1'),
            port=os.getenv('DB_PORT', 5433),
            cursor_factory=RealDictCursor
        )
        return conn
    except psycopg2.Error as e:
        print(f"❌ Database connection error: {e}")
        sys.exit(1)

def fix_fcl_table():
    """Add missing columns to fcl_monitor_logs table"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        print("🔧 Fixing fcl_monitor_logs table...")
        
        # Check if column exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'fcl_monitor_logs' 
            AND column_name = 'fcl_receivers'
        """)
        
        if cursor.fetchone():
            print("✅ Column 'fcl_receivers' already exists in fcl_monitor_logs")
        else:
            print("➕ Adding 'fcl_receivers' column to fcl_monitor_logs...")
            cursor.execute("""
                ALTER TABLE fcl_monitor_logs 
                ADD COLUMN fcl_receivers JSONB DEFAULT '[]'::jsonb
            """)
            conn.commit()
            print("✅ Column 'fcl_receivers' added successfully!")
        
        # Also check and add cleaning_scale_bypass if missing
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'fcl_monitor_logs' 
            AND column_name = 'cleaning_scale_bypass'
        """)
        
        if cursor.fetchone():
            print("✅ Column 'cleaning_scale_bypass' already exists in fcl_monitor_logs")
        else:
            print("➕ Adding 'cleaning_scale_bypass' column to fcl_monitor_logs...")
            cursor.execute("""
                ALTER TABLE fcl_monitor_logs 
                ADD COLUMN cleaning_scale_bypass BOOLEAN DEFAULT FALSE
            """)
            conn.commit()
            print("✅ Column 'cleaning_scale_bypass' added successfully!")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

def fix_mila_table():
    """Add missing created_at column to mila_monitor_logs table"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        print("\n🔧 Fixing mila_monitor_logs table...")
        
        # Check if created_at column exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'mila_monitor_logs' 
            AND column_name = 'created_at'
        """)
        
        if cursor.fetchone():
            print("✅ Column 'created_at' already exists in mila_monitor_logs")
        else:
            print("➕ Adding 'created_at' column to mila_monitor_logs...")
            cursor.execute("""
                ALTER TABLE mila_monitor_logs 
                ADD COLUMN created_at TIMESTAMP DEFAULT NOW()
            """)
            conn.commit()
            print("✅ Column 'created_at' added successfully!")
        
        # Verify all columns
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'mila_monitor_logs'
            ORDER BY ordinal_position
        """)
        
        columns = cursor.fetchall()
        print("\n📋 Current mila_monitor_logs table structure:")
        print("-" * 50)
        for col in columns:
            print(f"  {col['column_name']:<25} {col['data_type']}")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    print("=" * 60)
    print("Monitor Logs Tables Fix Script")
    print("=" * 60)
    fix_fcl_table()
    fix_mila_table()
    print("\n✅ All table fixes completed! You can now restart the backend server.")

