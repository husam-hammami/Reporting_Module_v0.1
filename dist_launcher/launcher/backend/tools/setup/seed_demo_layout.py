"""
Seed a demo layout into live_monitor_layouts and register it in dynamic_monitor_registry.
Uses direct DB + utility functions (no Flask HTTP routes — avoids circular imports).
Idempotent: checks for existing layout before inserting.
"""

import sys
import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5432'),
}

# Add backend to sys.path for importing utils
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from utils.dynamic_tables import create_dynamic_monitor_tables, register_dynamic_monitor

LAYOUT_NAME = 'Grain Terminal Demo'

LAYOUT_CONFIG = {
    "sections": [
        {
            "section_name": "Silo Status",
            "section_type": "table",
            "columns": [
                {"column_label": "Silo 1 Level", "tag_name": "Silo1_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 2 Level", "tag_name": "Silo2_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 3 Level", "tag_name": "Silo3_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 4 Level", "tag_name": "Silo4_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 5 Level", "tag_name": "Silo5_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 6 Level", "tag_name": "Silo6_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 7 Level", "tag_name": "Silo7_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 8 Level", "tag_name": "Silo8_Level", "source_type": "Tag", "unit": "%"},
                {"column_label": "Silo 1 Tons", "tag_name": "Silo1_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 2 Tons", "tag_name": "Silo2_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 3 Tons", "tag_name": "Silo3_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 4 Tons", "tag_name": "Silo4_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 5 Tons", "tag_name": "Silo5_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 6 Tons", "tag_name": "Silo6_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 7 Tons", "tag_name": "Silo7_Tons", "source_type": "Tag", "unit": "t"},
                {"column_label": "Silo 8 Tons", "tag_name": "Silo8_Tons", "source_type": "Tag", "unit": "t"},
            ]
        },
        {
            "section_name": "Process",
            "section_type": "kpi_cards",
            "config": {
                "kpi_cards": [
                    {"card_label": "Flow Rate", "tag_name": "FlowRate_2_521WE", "source_type": "Tag", "unit": "t/h"},
                    {"card_label": "Water Flow", "tag_name": "Water_Flow", "source_type": "Tag", "unit": "m\u00b3/h"},
                    {"card_label": "Temperature", "tag_name": "Temperature_1", "source_type": "Tag", "unit": "\u00b0C"},
                    {"card_label": "Power", "tag_name": "Power_Consumption", "source_type": "Tag", "unit": "kW"},
                ]
            }
        },
        {
            "section_name": "Energy",
            "section_type": "kpi_cards",
            "config": {
                "kpi_cards": [
                    {"card_label": "Effective Power", "tag_name": "C2.EffectivePower", "source_type": "Tag", "unit": "kW"},
                    {"card_label": "Total Active Energy", "tag_name": "C2.Total_Active_Energy", "source_type": "Tag", "unit": "kWh"},
                ]
            }
        }
    ]
}


def get_db_connection():
    """Connection factory for dynamic_tables functions."""
    return psycopg2.connect(**DB_CONFIG)


def main():
    conn = get_db_connection()
    cur = conn.cursor()

    # Check if layout already exists
    cur.execute("SELECT id FROM live_monitor_layouts WHERE layout_name = %s", (LAYOUT_NAME,))
    row = cur.fetchone()

    if row:
        layout_id = row[0]
        print(f"Layout '{LAYOUT_NAME}' already exists with id={layout_id}. Updating config...")
    else:
        # Insert new layout
        cur.execute("""
            INSERT INTO live_monitor_layouts (layout_name, is_active, is_published, monitoring_enabled)
            VALUES (%s, true, true, true)
            RETURNING id;
        """, (LAYOUT_NAME,))
        layout_id = cur.fetchone()[0]
        print(f"Created layout '{LAYOUT_NAME}' with id={layout_id}")

    # Update config
    cur.execute("""
        UPDATE live_monitor_layouts SET config = %s, is_published = true, monitoring_enabled = true, is_active = true
        WHERE id = %s;
    """, (json.dumps(LAYOUT_CONFIG), layout_id))

    conn.commit()
    cur.close()
    conn.close()

    print("Creating dynamic monitor tables...")
    live_table, archive_table = create_dynamic_monitor_tables(layout_id, LAYOUT_NAME, get_db_connection)
    print(f"  Live table: {live_table}")
    print(f"  Archive table: {archive_table}")

    print("Registering dynamic monitor...")
    register_dynamic_monitor(layout_id, LAYOUT_NAME, live_table, archive_table, get_db_connection)

    # Verify
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT layout_id, layout_name, is_active FROM dynamic_monitor_registry WHERE layout_id = %s;", (layout_id,))
    reg = cur.fetchone()
    if reg:
        print(f"\nRegistry entry: layout_id={reg[0]}, name='{reg[1]}', is_active={reg[2]}")
    else:
        print("\nWARNING: No registry entry found!")

    cur.execute("SELECT is_published, monitoring_enabled, is_active FROM live_monitor_layouts WHERE id = %s;", (layout_id,))
    layout = cur.fetchone()
    if layout:
        print(f"Layout flags: is_published={layout[0]}, monitoring_enabled={layout[1]}, is_active={layout[2]}")

    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()
