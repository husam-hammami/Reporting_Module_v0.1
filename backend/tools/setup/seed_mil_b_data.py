"""
Seed Mil B production data: tags, mappings, and report templates.
Idempotent — safe to run multiple times.
Called by setup_local_db.py on first-run DB initialisation.

Can also run standalone:
  python tools/setup/seed_mil_b_data.py
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import psycopg2
from seed_mil_b_tags import TAGS_DATA, UPSERT_SQL as TAG_UPSERT_SQL

DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5434'),
}

# ── Mappings ─────────────────────────────────────────────────────────────

MAPPINGS = [
    {
        "name": "WPK1_running_Status",
        "input_tag": "mil_b_order_active",
        "output_tag_name": "mil_b_order_active_Mapped",
        "lookup": {"0": "stopped", "1": "Running"},
    },
    {
        "name": "MIL_B_Status",
        "input_tag": "mil_b_order_active_499",
        "output_tag_name": "mil_b_order_active_499_Mapped",
        "lookup": {"0": "Stopped", "1": "Running"},
    },
]

# ── WPK1 Report Template ───────────────────────────────────────────────

WPK1_LAYOUT_CONFIG = {
    "grid": {"cols": 12, "pageMode": "a4", "rowHeight": 40},
    "widgets": [],
    "reportType": "paginated",
    "paginatedSections": [
        {
            "id": "ps-1774423414525-8zdb",
            "type": "header",
            "align": "center",
            "title": "WPK1",
            "logoUrl": "",
            "showLogo": False,
            "subtitle": "",
            "statusLabel": "Status",
            "statusValue": "",
            "showDateRange": True,
            "statusFormula": "",
            "statusTagName": "",
            "statusGroupTags": [],
            "statusSourceType": "mapping",
            "statusAggregation": "avg",
            "statusMappingName": "WPK1_running_Status",
        },
        {
            "id": "ps-1774423414526-gwhf",
            "rows": [
                {"id": "ps-1774423414530-d7cd", "cells": [{"value": "", "tagName": "mil_b_sender_id_1", "sourceType": "tag"}, {"unit": "%", "value": "", "tagName": "mil_b_sender_qty_pct_1", "sourceType": "tag"}], "hideWhenInactive": True},
                {"id": "ps-1774423414531-ro4n", "cells": [{"value": "", "tagName": "mil_b_sender_id_2", "sourceType": "tag"}, {"unit": "%", "value": "", "tagName": "mil_b_sender_qty_pct_2", "sourceType": "tag"}], "hideWhenInactive": True},
                {"id": "ps-1774423414532-ie25", "cells": [{"value": "", "tagName": "mil_b_sender_id_3", "sourceType": "tag"}, {"unit": "%", "value": "", "tagName": "mil_b_sender_qty_pct_3", "sourceType": "tag"}], "hideWhenInactive": True},
            ],
            "type": "table",
            "label": "Table Section",
            "columns": [
                {"id": "ps-1774423414527-eat1", "align": "left", "width": "auto", "header": "ID"},
                {"id": "ps-1774423414528-6w59", "align": "left", "width": "auto", "header": "Sender QTY%"},
            ],
            "summaryUnit": "", "summaryLabel": "Total", "showSummaryRow": False, "summaryFormula": "",
        },
    ],
}

# ── MIL-B Report Template ──────────────────────────────────────────────

MILB_LAYOUT_CONFIG = {
    "grid": {"cols": 12, "pageMode": "a4", "rowHeight": 40},
    "widgets": [],
    "reportType": "paginated",
    "paginatedSections": [
        {
            "id": "ps-1774433617757-pkgf",
            "type": "header",
            "align": "center",
            "title": "MIL-B",
            "logoUrl": "",
            "showLogo": False,
            "subtitle": "",
            "statusLabel": "Status",
            "statusValue": "",
            "showDateRange": True,
            "statusFormula": "",
            "statusTagName": "",
            "statusGroupTags": [],
            "statusSourceType": "mapping",
            "statusAggregation": "avg",
            "statusMappingName": "MIL_B_Status",
        },
        {
            "id": "ps-1774433617758-4ih9",
            "rows": [
                {"id": "ps-1774433617762-acvp", "cells": [{"value": "B1 FlowRate", "sourceType": "static"}, {"unit": "t/h", "formula": "", "tagName": "mil_b_b1_flowrate", "decimals": 1, "sourceType": "tag"}]},
                {"id": "ps-1774433617763-d9r2", "cells": [{"value": "B1 Percentage", "sourceType": "static"}, {"unit": "%", "value": "", "tagName": "mil_b_b1_percentage", "sourceType": "tag"}]},
                {"id": "ps-1774433617764-bplm", "cells": [{"value": "B1 Totalizer", "sourceType": "static"}, {"unit": "kg", "value": "", "tagName": "mil_b_b1_totalizer", "sourceType": "tag"}]},
                {"id": "ps-1774433617765-o0my", "cells": [{"value": "Bran FlowRate", "sourceType": "static"}, {"unit": "t/h", "value": "", "tagName": "mil_b_bran_flowrate", "sourceType": "tag"}]},
                {"id": "ps-1774433617766-xv1p", "cells": [{"value": "Bran Totalizer", "sourceType": "static"}, {"unit": "kg", "value": "", "tagName": "mil_b_bran_totalizer", "sourceType": "tag"}]},
                {"id": "ps-1774433617767-3pzq", "cells": [{"value": "Flour FlowRate", "sourceType": "static"}, {"unit": "t/h", "value": "", "tagName": "mil_b_flour_flowrate", "sourceType": "tag"}]},
                {"id": "ps-1774433617768-7viw", "cells": [{"value": "Flour Percentage", "sourceType": "static"}, {"unit": "%", "value": "", "tagName": "mil_b_flour_percentage", "sourceType": "tag"}]},
                {"id": "ps-1774433617769-vg6m", "cells": [{"value": "Flour Totalizer", "sourceType": "static"}, {"unit": "kg", "value": "", "tagName": "mil_b_flour_totalizer", "sourceType": "tag"}]},
                {"id": "ps-1774433617770-0h6i", "cells": [{"value": "Dest_1_ID", "sourceType": "static"}, {"unit": "", "value": "", "tagName": "mil_b_dest_id_1", "sourceType": "tag"}]},
                {"id": "ps-1774433617771-vj7k", "cells": [{"value": "Dest_2_ID", "sourceType": "static"}, {"unit": "", "value": "", "tagName": "mil_b_dest_id_2", "sourceType": "tag"}]},
            ],
            "type": "table",
            "label": "Order Info",
            "columns": [
                {"id": "ps-1774433617759-znhf", "align": "left", "width": "auto", "header": "ID"},
                {"id": "ps-1774433617761-9gti", "align": "right", "width": "auto", "header": "Weight"},
            ],
            "summaryUnit": "", "summaryLabel": "Total", "showSummaryRow": False, "summaryFormula": "",
        },
        {
            "id": "ps-1774433617772-431k",
            "rows": [
                {"id": "ps-1774433617776-d3j0", "cells": [{"value": "B1_Scale", "sourceType": "static"}, {"unit": "__checkbox__", "formula": "", "tagName": "mil_b_b1_scale", "decimals": 1, "sourceType": "tag"}]},
                {"id": "ps-1774433617778-528e", "cells": [{"value": "Filter_Flour_Feeder", "sourceType": "static"}, {"unit": "__checkbox__", "value": "", "tagName": "mil_b_filter_flour_feeder", "sourceType": "tag"}]},
                {"id": "ps-1774433617779-1dxj", "cells": [{"value": "B1_Deopt_Emptying", "sourceType": "static"}, {"unit": "__checkbox__", "value": "", "tagName": "mil_b_b1_deopt_emptying", "sourceType": "tag"}]},
                {"id": "ps-1774433617780-ysod", "cells": [{"value": "Mill_Emptying", "sourceType": "static"}, {"unit": "__checkbox__", "value": "", "tagName": "mil_b_mill_emptying", "sourceType": "tag"}]},
                {"id": "ps-1774433617781-2pgf", "cells": [{"value": "Dampening_On", "sourceType": "static"}, {"unit": "__checkbox__", "value": "", "tagName": "mil_b_dampening_on", "sourceType": "tag"}]},
                {"id": "ps-1774433617782-nito", "cells": [{"value": "Vitamin_Feeder_On", "sourceType": "static"}, {"unit": "__checkbox__", "value": "", "tagName": "mil_b_vitamin_feeder_on", "sourceType": "tag"}]},
                {"id": "ps-1774433617783-yrgp", "cells": [{"value": "Vitamin_Feeder_Percentage", "sourceType": "static"}, {"unit": "%", "value": "", "tagName": "mil_b_vitamin_feeder_percentage", "sourceType": "tag"}]},
                {"id": "ps-1774433617784-n6ou", "cells": [{"value": "JobFlowRate", "sourceType": "static"}, {"unit": "t/h", "value": "", "tagName": "mil_b_job_flowrate", "sourceType": "tag"}]},
            ],
            "type": "table",
            "label": "Setpoint",
            "columns": [
                {"id": "ps-1774433617773-6wa6", "align": "left", "width": "auto", "header": "ID"},
                {"id": "ps-1774433617775-ehqc", "align": "right", "width": "auto", "header": "Weight"},
            ],
            "summaryUnit": "", "summaryLabel": "Total", "showSummaryRow": False, "summaryFormula": "",
        },
    ],
}

# ── Pasta Report Template ───────────────────────────────────────────────

PASTA_LAYOUT_CONFIG = {
    "grid": {"cols": 12, "pageMode": "a4", "rowHeight": 40},
    "widgets": [],
    "reportType": "paginated",
    "paginatedSections": [
        {
            "id": "ps-1774433617785-7eny",
            "type": "header",
            "align": "center",
            "title": "Pasta",
            "logoUrl": "",
            "showLogo": False,
            "subtitle": "",
            "statusLabel": "Status",
            "statusValue": "",
            "showDateRange": True,
            "statusFormula": "",
            "statusTagName": "",
            "statusGroupTags": [],
            "statusSourceType": "static",
            "statusAggregation": "avg",
            "statusMappingName": "",
        },
        {
            "id": "ps-1774433617786-1ilj",
            "rows": [
                {"id": "ps-1774433617790-7900", "cells": [{"value": "1_521WE_Totalizer", "sourceType": "static"}, {"unit": "kg", "formula": "", "tagName": "pasta_1_521we_totalizer", "decimals": 1, "sourceType": "tag"}]},
                {"id": "ps-1774433617791-v4v3", "cells": [{"value": "4_830WE_Totalizer", "sourceType": "static"}, {"unit": "kg", "value": "", "tagName": "pasta_4_830we_totalizer", "sourceType": "tag"}]},
                {"id": "ps-1774433617792-sxte", "cells": [{"value": "E_1010_Totalizer", "sourceType": "static"}, {"unit": "kg", "value": "", "tagName": "pasta_e_1010_totalizer", "sourceType": "tag"}]},
            ],
            "type": "table",
            "label": "Table Section",
            "columns": [
                {"id": "ps-1774433617787-i26h", "align": "left", "width": "auto", "header": "ID"},
                {"id": "ps-1774433617789-0fwn", "align": "right", "width": "auto", "header": "Weight"},
            ],
            "summaryUnit": "", "summaryLabel": "Total", "showSummaryRow": False, "summaryFormula": "",
        },
    ],
}

REPORT_TEMPLATES = [
    {"name": "WPK1",  "layout_config": WPK1_LAYOUT_CONFIG},
    {"name": "MIL-B", "layout_config": MILB_LAYOUT_CONFIG},
    {"name": "Pasta", "layout_config": PASTA_LAYOUT_CONFIG},
]


def _upsert_mapping(cur, m):
    cur.execute("SELECT id FROM mappings WHERE name = %s", (m["name"],))
    if cur.fetchone():
        cur.execute(
            "UPDATE mappings SET input_tag = %s, output_tag_name = %s, lookup = %s, is_active = true, updated_at = NOW() WHERE name = %s",
            (m["input_tag"], m["output_tag_name"], json.dumps(m["lookup"]), m["name"]),
        )
        print(f"  Updated mapping \"{m['name']}\".")
    else:
        cur.execute(
            "INSERT INTO mappings (name, input_tag, output_tag_name, lookup, is_active) VALUES (%s, %s, %s, %s, true)",
            (m["name"], m["input_tag"], m["output_tag_name"], json.dumps(m["lookup"])),
        )
        print(f"  Inserted mapping \"{m['name']}\".")


def _upsert_template(cur, t):
    layout_json = json.dumps(t["layout_config"])
    cur.execute("SELECT id FROM report_builder_templates WHERE name = %s", (t["name"],))
    if cur.fetchone():
        cur.execute(
            "UPDATE report_builder_templates SET layout_config = %s, status = 'released', is_active = true, updated_at = NOW() WHERE name = %s",
            (layout_json, t["name"]),
        )
        print(f"  Updated report template \"{t['name']}\".")
    else:
        cur.execute(
            "INSERT INTO report_builder_templates (name, is_active, is_default, status, layout_config) VALUES (%s, true, false, 'released', %s)",
            (t["name"], layout_json),
        )
        print(f"  Inserted report template \"{t['name']}\".")


def seed(conn):
    """Seed Mil B tags, mappings, and report templates into an open connection."""
    cur = conn.cursor()

    cur.execute("""
        DO $$ BEGIN
            ALTER TABLE report_builder_templates
                ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
    """)

    cur.execute("DELETE FROM tags")
    for tag in TAGS_DATA:
        cur.execute(TAG_UPSERT_SQL, tag)
    print(f"  Inserted {len(TAGS_DATA)} Mil B tags (old tags removed).")

    for m in MAPPINGS:
        _upsert_mapping(cur, m)

    for t in REPORT_TEMPLATES:
        _upsert_template(cur, t)

    conn.commit()
    cur.close()


def main():
    """Standalone entry point — connects using env vars."""
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    print("Seeding Mil B production data...")
    seed(conn)
    conn.close()
    print("Done!")


if __name__ == '__main__':
    main()
