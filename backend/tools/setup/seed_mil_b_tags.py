"""
Seed the tags table with Mil B Order Info tags.
Idempotent: ON CONFLICT (tag_name) DO UPDATE.
Run from repo root with Docker:
  docker compose exec backend python tools/setup/seed_mil_b_tags.py
"""

import os
import psycopg2

DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5433'),
}

# Mil B Order Info tags — offsets from the PLC data block
TAGS_DATA = [
    {"tag_name": "mil_b_sender_id_1",      "display_name": "Mil B Sender ID 1",      "source_type": "PLC", "db_number": 199, "offset": 0,  "data_type": "INT",  "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Active Sender 1 ID",  "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_sender_qty_pct_1", "display_name": "Mil B Sender Qty % 1",   "source_type": "PLC", "db_number": 199, "offset": 2,  "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "% Sender 1",           "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_sender_id_2",      "display_name": "Mil B Sender ID 2",      "source_type": "PLC", "db_number": 199, "offset": 6,  "data_type": "INT",  "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Active Sender 2 ID",  "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_sender_qty_pct_2", "display_name": "Mil B Sender Qty % 2",   "source_type": "PLC", "db_number": 199, "offset": 8,  "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "% Sender 2",           "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_sender_id_3",      "display_name": "Mil B Sender ID 3",      "source_type": "PLC", "db_number": 199, "offset": 12, "data_type": "INT",  "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Active Sender 3 ID",  "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_sender_qty_pct_3", "display_name": "Mil B Sender Qty % 3",   "source_type": "PLC", "db_number": 199, "offset": 14, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "% Sender 3",           "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_order_active",     "display_name": "Mil B Order Active",      "source_type": "PLC", "db_number": 199, "offset": 18, "data_type": "BOOL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Order Active",         "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},

    # ── Order Info (db_number 499) ──
    {"tag_name": "mil_b_b1_flowrate",          "display_name": "Mil B B1 FlowRate",          "source_type": "PLC", "db_number": 499, "offset": 0,  "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "t/h", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "B1 FlowRate",              "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_b1_percentage",        "display_name": "Mil B B1 Percentage",        "source_type": "PLC", "db_number": 499, "offset": 4,  "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%",   "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "B1 Percentage",            "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_b1_totalizer",         "display_name": "Mil B B1 Totalizer",         "source_type": "PLC", "db_number": 499, "offset": 8,  "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "Kg",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "B1 Totalizer",             "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "mil_b_bran_flowrate",        "display_name": "Mil B Bran FlowRate",        "source_type": "PLC", "db_number": 499, "offset": 12, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "t/h", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Bran FlowRate",            "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_bran_percentage",      "display_name": "Mil B Bran Percentage",      "source_type": "PLC", "db_number": 499, "offset": 16, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%",   "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Bran Percentage",          "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_bran_totalizer",       "display_name": "Mil B Bran Totalizer",       "source_type": "PLC", "db_number": 499, "offset": 20, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "Kg",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Bran Totalizer",           "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "mil_b_flour_flowrate",       "display_name": "Mil B Flour FlowRate",       "source_type": "PLC", "db_number": 499, "offset": 24, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "t/h", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Flour FlowRate",           "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_flour_percentage",     "display_name": "Mil B Flour Percentage",     "source_type": "PLC", "db_number": 499, "offset": 28, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%",   "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Flour Percentage",         "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_flour_totalizer",      "display_name": "Mil B Flour Totalizer",      "source_type": "PLC", "db_number": 499, "offset": 32, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "Kg",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Flour Totalizer",          "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "mil_b_dest_id_1",            "display_name": "Mil B Dest ID 1",            "source_type": "PLC", "db_number": 499, "offset": 36, "data_type": "INT",  "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",    "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Active Destination 1 ID",  "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_dest_id_2",            "display_name": "Mil B Dest ID 2",            "source_type": "PLC", "db_number": 499, "offset": 38, "data_type": "INT",  "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",    "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Active Destination 2 ID",  "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_order_active_499",     "display_name": "Mil B Order Active 499",     "source_type": "PLC", "db_number": 499, "offset": 50, "data_type": "BOOL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "",    "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Order Active",             "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},

    # ── SetPoints (db_number 499) ──
    {"tag_name": "mil_b_b1_scale",                 "display_name": "Mil B B1 Scale",                 "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 0, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_filter_flour_feeder",      "display_name": "Mil B Filter Flour Feeder",      "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 1, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_enable_small_sifters",     "display_name": "Mil B Enable Small Sifters",     "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 2, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_b1_deopt_emptying",        "display_name": "Mil B B1 Deopt Emptying",        "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 3, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_mill_emptying",            "display_name": "Mil B Mill Emptying",            "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 4, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_dampening_on",             "display_name": "Mil B Dampening On",             "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 5, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_vitamin_feeder_on",        "display_name": "Mil B Vitamin Feeder On",        "source_type": "PLC", "db_number": 499, "offset": 40, "data_type": "BOOL", "bit_position": 6, "string_length": 40, "byte_swap": True, "unit": "",  "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Check Box", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_vitamin_feeder_percentage","display_name": "Mil B Vitamin Feeder Percentage","source_type": "PLC", "db_number": 499, "offset": 42, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "%",   "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Vitamin Feeder %", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mil_b_job_flowrate",             "display_name": "Mil B Job FlowRate",             "source_type": "PLC", "db_number": 499, "offset": 46, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "t/h", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Job FlowRate",  "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},

    # ── Pasta totalizers (db_number 899) ──
    {"tag_name": "pasta_1_521we_totalizer",  "display_name": "Pasta 1 521WE Totalizer",  "source_type": "PLC", "db_number": 899, "offset": 0, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "Kg", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Wheat transfer scale",          "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "pasta_4_830we_totalizer",  "display_name": "Pasta 4 830WE Totalizer",  "source_type": "PLC", "db_number": 899, "offset": 4, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "Kg", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Pasta transfer scale",          "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "pasta_e_1010_totalizer",   "display_name": "Pasta E 1010 Totalizer",   "source_type": "PLC", "db_number": 899, "offset": 8, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "Kg", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": "Wheat intake & transfer scale", "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
]

UPSERT_SQL = """
INSERT INTO tags (
    tag_name, display_name, source_type, db_number, "offset", data_type,
    bit_position, string_length, byte_swap, unit, scaling, decimal_places,
    formula, mapping_name, description, is_active,
    is_bin_tag, activation_tag_name, activation_condition, activation_value, value_formula, is_counter
) VALUES (
    %(tag_name)s, %(display_name)s, %(source_type)s, %(db_number)s, %(offset)s, %(data_type)s,
    %(bit_position)s, %(string_length)s, %(byte_swap)s, %(unit)s, %(scaling)s, %(decimal_places)s,
    %(formula)s, %(mapping_name)s, %(description)s, %(is_active)s,
    %(is_bin_tag)s, %(activation_tag_name)s, %(activation_condition)s, %(activation_value)s, %(value_formula)s, %(is_counter)s
)
ON CONFLICT (tag_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    source_type = EXCLUDED.source_type,
    db_number = EXCLUDED.db_number,
    "offset" = EXCLUDED."offset",
    data_type = EXCLUDED.data_type,
    bit_position = EXCLUDED.bit_position,
    string_length = EXCLUDED.string_length,
    byte_swap = EXCLUDED.byte_swap,
    unit = EXCLUDED.unit,
    scaling = EXCLUDED.scaling,
    decimal_places = EXCLUDED.decimal_places,
    formula = EXCLUDED.formula,
    mapping_name = EXCLUDED.mapping_name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    is_bin_tag = EXCLUDED.is_bin_tag,
    activation_tag_name = EXCLUDED.activation_tag_name,
    activation_condition = EXCLUDED.activation_condition,
    activation_value = EXCLUDED.activation_value,
    value_formula = EXCLUDED.value_formula,
    is_counter = EXCLUDED.is_counter,
    updated_at = NOW();
"""


def main():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    print(f"Seeding {len(TAGS_DATA)} Mil B tags...")
    for tag in TAGS_DATA:
        cur.execute(UPSERT_SQL, tag)

    conn.commit()

    cur.execute("SELECT source_type, COUNT(*) FROM tags GROUP BY source_type ORDER BY source_type;")
    print("\nTag counts by source_type:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")

    cur.execute("SELECT COUNT(*) FROM tags WHERE is_active = true;")
    total = cur.fetchone()[0]
    print(f"\nTotal active tags: {total}")

    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()
