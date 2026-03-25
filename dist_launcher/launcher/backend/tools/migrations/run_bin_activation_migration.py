#!/usr/bin/env python3
"""
Migration Script: Add Bin Activation Fields to Tags Table
Description: Adds fields to support dynamic active bin detection based on activation conditions
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

def run_migration():
    """Run the bin activation fields migration"""
    print("\n" + "=" * 70)
    print("🔄 Running Migration: Add Bin Activation Fields to Tags Table")
    print("=" * 70)
    
    try:
        # Read SQL file
        migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'add_bin_activation_fields.sql')
        
        if not os.path.exists(migration_file):
            print(f"❌ Migration file not found: {migration_file}")
            sys.exit(1)
        
        print(f"\n📄 Reading migration file: {migration_file}")
        with open(migration_file, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        # Connect to database
        print(f"\n🔌 Connecting to database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True  # Required for ALTER TABLE statements
        cursor = conn.cursor()
        
        # Execute SQL script
        print("\n⚙️  Executing migration script...")
        cursor.execute(sql_script)
        
        # Verify the columns were added
        print("\n🔍 Verifying migration...")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'tags'
            AND column_name IN ('is_bin_tag', 'activation_tag_name', 'activation_condition', 'activation_value')
            ORDER BY column_name
        """)
        
        columns = cursor.fetchall()
        
        if len(columns) == 4:
            print("\n✅ Migration completed successfully!")
            print("\n📊 Added columns to 'tags' table:")
            for col_name, data_type, is_nullable in columns:
                nullable = "NULL" if is_nullable == 'YES' else "NOT NULL"
                print(f"   ✅ {col_name} ({data_type}, {nullable})")
            
            # Check index
            cursor.execute("""
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'tags'
                AND indexname = 'idx_tags_is_bin_tag'
            """)
            index_exists = cursor.fetchone()
            if index_exists:
                print(f"\n   ✅ Index created: idx_tags_is_bin_tag")
            else:
                print(f"\n   ⚠️  Warning: Index idx_tags_is_bin_tag not found (may already exist)")
        else:
            print(f"\n⚠️  Warning: Expected 4 columns, found {len(columns)}")
            print("   Columns found:")
            for col_name, data_type, is_nullable in columns:
                print(f"   - {col_name} ({data_type})")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 70)
        print("✅ Migration script completed!")
        print("=" * 70)
        print("\n📝 Next steps:")
        print("   1. Restart the backend server to load the updated code")
        print("   2. Configure bin tags in Settings → Tags")
        print("   3. Test dynamic bin filtering in Dynamic Reports")
        print("\n")
        
    except psycopg2.OperationalError as e:
        print(f"\n❌ Database connection error: {e}")
        print("\n💡 Troubleshooting:")
        print("   - Check if PostgreSQL is running")
        print("   - Verify database credentials in environment variables")
        print("   - Ensure database '{}' exists".format(DB_CONFIG['database']))
        sys.exit(1)
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"\n❌ File not found: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    run_migration()

