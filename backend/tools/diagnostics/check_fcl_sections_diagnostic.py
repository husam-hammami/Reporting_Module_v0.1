"""
Diagnostic script to check FCL layout sections and columns
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import get_db_connection
from psycopg2.extras import RealDictCursor
from contextlib import closing

def check_fcl_layout():
    """Check FCL layout configuration"""
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Find FCL layout
        cursor.execute("""
            SELECT id, layout_name, is_published, config
            FROM live_monitor_layouts
            WHERE LOWER(layout_name) LIKE '%fcl%' AND is_published = TRUE
            ORDER BY id DESC
            LIMIT 1
        """)
        layout = cursor.fetchone()
        
        if not layout:
            print("❌ No published FCL layout found")
            return
        
        layout_id = layout['id']
        layout_name = layout['layout_name']
        print(f"✅ Found layout: {layout_name} (ID: {layout_id})")
        
        # Check sections in database
        cursor.execute("""
            SELECT id, section_name, section_type, is_active
            FROM live_monitor_sections
            WHERE layout_id = %s
            ORDER BY display_order
        """, (layout_id,))
        sections = cursor.fetchall()
        
        print(f"\n📋 Sections in database: {len(sections)}")
        for section in sections:
            section_id = section['id']
            section_name = section['section_name']
            print(f"  - {section_name} (ID: {section_id}, Type: {section['section_type']}, Active: {section['is_active']})")
            
            # Check columns
            cursor.execute("""
                SELECT column_label, source_type, tag_name, display_order
                FROM live_monitor_columns
                WHERE section_id = %s
                ORDER BY display_order
            """, (section_id,))
            columns = cursor.fetchall()
            
            print(f"    Columns: {len(columns)}")
            for col in columns:
                print(f"      - {col['column_label']}: {col['source_type']} -> {col['tag_name']}")
            
            # Check table config
            cursor.execute("""
                SELECT tag_group_id, row_mode
                FROM live_monitor_table_config
                WHERE section_id = %s
            """, (section_id,))
            table_config = cursor.fetchone()
            if table_config:
                print(f"    Table config: row_mode={table_config['row_mode']}, tag_group_id={table_config['tag_group_id']}")
        
        # Check config JSONB
        config = layout.get('config')
        if config:
            import json
            if isinstance(config, str):
                config = json.loads(config)
            
            config_sections = config.get('sections', [])
            print(f"\n📋 Sections in config JSONB: {len(config_sections)}")
            for section in config_sections:
                section_name = section.get('section_name', 'N/A')
                section_id = section.get('id', 'N/A')
                print(f"  - {section_name} (ID: {section_id})")
                
                tables = section.get('config', {}).get('tables', [])
                for table in tables:
                    columns = table.get('columns', [])
                    print(f"    Columns in config: {len(columns)}")
                    for col in columns:
                        tag_name = col.get('tag_name', '')
                        label = col.get('label', col.get('column_label', ''))
                        print(f"      - {label}: {tag_name}")

if __name__ == '__main__':
    check_fcl_layout()

