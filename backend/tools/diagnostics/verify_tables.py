#!/usr/bin/env python3
"""
Verification Script: Check Tag-Related Tables
Description: Verifies that all required tag-related tables exist in the database
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

def verify_tables():
    """Verify all tag-related tables exist"""
    required_tables = [
        'tags',
        'tag_groups',
        'tag_group_members',
        'live_monitor_layouts',
        'live_monitor_sections',
        'live_monitor_columns',
        'live_monitor_table_config',
        'live_monitor_kpi_config'
    ]
    
    print("\n" + "=" * 70)
    print("🔍 Verifying Tag-Related Tables")
    print("=" * 70)
    
    try:
        print(f"\n🔌 Connecting to database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check which tables exist
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN %s
            ORDER BY table_name
        """, (tuple(required_tables),))
        
        existing_tables = [row[0] for row in cursor.fetchall()]
        
        print(f"\n📊 Table Status: {len(existing_tables)}/{len(required_tables)} tables found\n")
        
        all_exist = True
        for table in required_tables:
            status = "✅" if table in existing_tables else "❌"
            print(f"   {status} {table}")
            if table not in existing_tables:
                all_exist = False
        
        # Check indexes
        print("\n📋 Checking Indexes:")
        cursor.execute("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND tablename IN %s
            ORDER BY tablename, indexname
        """, (tuple(required_tables),))
        
        indexes = cursor.fetchall()
        if indexes:
            print(f"   ✅ Found {len(indexes)} indexes")
            for idx in indexes[:10]:  # Show first 10
                print(f"      - {idx[0]}")
            if len(indexes) > 10:
                print(f"      ... and {len(indexes) - 10} more")
        else:
            print("   ⚠️  No indexes found")
        
        # Check triggers
        print("\n🔔 Checking Triggers:")
        try:
            placeholders = ','.join(['%s'] * len(required_tables))
            cursor.execute(f"""
                SELECT trigger_name, event_object_table
                FROM information_schema.triggers
                WHERE event_object_schema = 'public'
                AND event_object_table IN ({placeholders})
                AND trigger_name LIKE '%updated_at%'
                ORDER BY event_object_table
            """, required_tables)
            
            triggers = cursor.fetchall()
            if triggers:
                print(f"   ✅ Found {len(triggers)} update triggers")
                for trigger in triggers:
                    if len(trigger) >= 2:
                        print(f"      - {trigger[0]} on {trigger[1]}")
                    else:
                        print(f"      - {trigger}")
            else:
                print("   ⚠️  No update triggers found")
        except Exception as e:
            print(f"   ⚠️  Error checking triggers: {e}")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 70)
        if all_exist:
            print("🎉 All tables created successfully!")
            print("=" * 70)
            print("\n✅ System is ready for dynamic tag-based live monitoring!")
            print("\n💡 Next steps:")
            print("   1. Start backend: python app.py")
            print("   2. Access Tag Manager: /settings/tags")
            print("   3. Create tags with PLC addresses")
            print("   4. Create tag groups: /settings/tag-groups")
            print("   5. Create live monitor layouts: /live-monitor/layouts-manager")
            print()
            return True
        else:
            missing = set(required_tables) - set(existing_tables)
            print("⚠️  Some tables are missing!")
            print("=" * 70)
            print(f"\n❌ Missing tables: {', '.join(missing)}")
            print("\n💡 To create missing tables, run:")
            print("   python run_migration.py")
            print()
            return False
        
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        print(f"   Error code: {e.pgcode}")
        print(f"   Error message: {e.pgerror}")
        print("\n💡 Please check:")
        print("   1. Database is running")
        print("   2. Connection parameters are correct")
        print("   3. Database exists: " + DB_CONFIG['database'])
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    success = verify_tables()
    sys.exit(0 if success else 1)

