#!/usr/bin/env python3
"""
Migration Script: Add Value Formula Field to Tags Table
Description: Adds value_formula field to allow formula-based transformations of PLC tag values
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
    """Run the value_formula field migration"""
    print("\n" + "=" * 70)
    print("🔄 Running Migration: Add Value Formula Field to Tags Table")
    print("=" * 70)
    
    try:
        # Read SQL file
        migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'add_value_formula_field.sql')
        
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
        
        # Verify the column was added
        print("\n🔍 Verifying migration...")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'tags'
            AND column_name = 'value_formula'
        """)
        
        column = cursor.fetchone()
        
        if column:
            col_name, data_type, is_nullable = column
            nullable = "NULL" if is_nullable == 'YES' else "NOT NULL"
            print("\n✅ Migration completed successfully!")
            print(f"\n📊 Added column to 'tags' table:")
            print(f"   ✅ {col_name} ({data_type}, {nullable})")
        else:
            print("\n⚠️  Warning: Column 'value_formula' not found")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 70)
        print("✅ Migration script completed!")
        print("=" * 70)
        print("\n📝 Next steps:")
        print("   1. Restart the backend server to load the updated code")
        print("   2. Use 'Value Transformation Formula' field in tag configuration")
        print("   3. Example formulas:")
        print("      - value * 0.277778 (t/h to kg/s)")
        print("      - value / 1000 (g to kg)")
        print("      - value * 1.8 + 32 (°C to °F)")
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

