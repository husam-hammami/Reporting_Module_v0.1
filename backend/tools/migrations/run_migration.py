#!/usr/bin/env python3
"""
Migration Script: Create Tag-Related Tables
Description: Runs the SQL migration to create all tag-related tables for the dynamic live monitor system
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
    """Run the tags table migration"""
    print("\n" + "=" * 70)
    print("🔄 Running Migration: Create Tag-Related Tables")
    print("=" * 70)
    
    try:
        # Read SQL file
        migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'create_tags_tables.sql')
        
        if not os.path.exists(migration_file):
            print(f"❌ Migration file not found: {migration_file}")
            sys.exit(1)
        
        print(f"\n📄 Reading migration file: {migration_file}")
        with open(migration_file, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        # Connect to database
        print(f"\n🔌 Connecting to database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True  # Required for CREATE TABLE statements
        cursor = conn.cursor()
        
        # Execute SQL script
        print("\n⚙️  Executing migration script...")
        cursor.execute(sql_script)
        
        print("\n✅ Migration completed successfully!")
        print("\n📊 Created tables:")
        print("   ✅ tags")
        print("   ✅ tag_groups")
        print("   ✅ tag_group_members")
        print("   ✅ live_monitor_layouts")
        print("   ✅ live_monitor_sections")
        print("   ✅ live_monitor_columns")
        print("   ✅ live_monitor_table_config")
        print("   ✅ live_monitor_kpi_config")
        print("\n📋 Created indexes and triggers:")
        print("   ✅ Indexes for performance optimization")
        print("   ✅ Update timestamp triggers")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 70)
        print("🎉 Migration completed successfully!")
        print("=" * 70)
        print("\n💡 Next steps:")
        print("   1. Verify tables using: python verify_tables.py")
        print("   2. Start backend: python app.py")
        print("   3. Create tags via UI: /settings/tags")
        print()
        
        return True
        
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        print(f"   Error code: {e.pgcode}")
        print(f"   Error message: {e.pgerror}")
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

