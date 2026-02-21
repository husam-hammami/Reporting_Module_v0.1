#!/usr/bin/env python3
"""
Verification Script: Verify Bin Activation Fields Migration
Description: Verifies that the bin activation fields were added to the tags table
"""

import psycopg2
import os
import sys

# Database connection configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'database': os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
    'port': os.getenv('DB_PORT', 5433)
}

def verify_migration():
    """Verify that the migration was successful"""
    print("\n" + "=" * 70)
    print("🔍 Verifying Bin Activation Fields Migration")
    print("=" * 70)
    
    try:
        # Connect to database
        print(f"\n🔌 Connecting to database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check columns
        print("\n📋 Checking columns in 'tags' table...")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'tags'
            AND column_name IN ('is_bin_tag', 'activation_tag_name', 'activation_condition', 'activation_value')
            ORDER BY column_name
        """)
        
        columns = cursor.fetchall()
        
        expected_columns = {
            'is_bin_tag': 'boolean',
            'activation_tag_name': 'character varying',
            'activation_condition': 'character varying',
            'activation_value': 'character varying'
        }
        
        if len(columns) == 4:
            print("\n✅ All 4 columns found:")
            all_correct = True
            for col_name, data_type, is_nullable in columns:
                expected_type = expected_columns.get(col_name, 'unknown')
                status = "✅" if expected_type in data_type.lower() else "⚠️"
                nullable = "NULL" if is_nullable == 'YES' else "NOT NULL"
                print(f"   {status} {col_name}: {data_type} ({nullable})")
                if expected_type not in data_type.lower():
                    all_correct = False
            
            if all_correct:
                print("\n✅ All column types are correct!")
            else:
                print("\n⚠️  Some column types may be incorrect")
        else:
            print(f"\n❌ Expected 4 columns, found {len(columns)}")
            if columns:
                print("   Columns found:")
                for col_name, data_type, is_nullable in columns:
                    print(f"   - {col_name}: {data_type}")
            else:
                print("   No columns found. Migration may not have run successfully.")
        
        # Check index
        print("\n📋 Checking index...")
        cursor.execute("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'tags'
            AND indexname = 'idx_tags_is_bin_tag'
        """)
        index_exists = cursor.fetchone()
        
        if index_exists:
            print("   ✅ Index 'idx_tags_is_bin_tag' exists")
        else:
            print("   ⚠️  Index 'idx_tags_is_bin_tag' not found")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 70)
        if len(columns) == 4 and index_exists:
            print("✅ Migration verification: SUCCESS")
        else:
            print("⚠️  Migration verification: INCOMPLETE")
        print("=" * 70)
        print()
        
    except psycopg2.OperationalError as e:
        print(f"\n❌ Database connection error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    verify_migration()

