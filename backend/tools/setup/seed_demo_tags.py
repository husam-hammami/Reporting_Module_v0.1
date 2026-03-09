"""
Seed the tags table with embedded tag data (no CSV).
Idempotent: ON CONFLICT (tag_name) DO UPDATE.
Run from repo root with Docker:
  docker compose exec backend python tools/setup/seed_demo_tags.py
"""

import os
import psycopg2

# Use environment variables (set by Docker or shell); no .env file needed
DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Hercules'),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5432'),
}

# Embedded tag data (from tags.csv) — all columns required by the tags table
TAGS_DATA = [
    {"tag_name": "scale_weight", "display_name": "Scale Weight", "source_type": "PLC", "db_number": 499, "offset": 0, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "e11_selected", "display_name": "E11 Selected", "source_type": "PLC", "db_number": 499, "offset": 1, "data_type": "BOOL", "bit_position": 2, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "e10_selected", "display_name": "E10 Selected", "source_type": "PLC", "db_number": 499, "offset": 1, "data_type": "BOOL", "bit_position": 3, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "b1_deopt_emptying", "display_name": "B1 Deopt Emptying", "source_type": "PLC", "db_number": 499, "offset": 1, "data_type": "BOOL", "bit_position": 4, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mill_emptying", "display_name": "Mill Emptying", "source_type": "PLC", "db_number": 499, "offset": 1, "data_type": "BOOL", "bit_position": 5, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "semolina_selected", "display_name": "Semolina Selected", "source_type": "PLC", "db_number": 499, "offset": 254, "data_type": "BOOL", "bit_position": 0, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_2_b789we_selected", "display_name": "Mila 2 B789We Selected", "source_type": "PLC", "db_number": 499, "offset": 296, "data_type": "BOOL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "flour2_receiver_bin_id_1", "display_name": "Flour2 Receiver Bin Id 1", "source_type": "PLC", "db_number": 499, "offset": 172, "data_type": "INT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "flour2_receiver_bin_id_2", "display_name": "Flour2 Receiver Bin Id 2", "source_type": "PLC", "db_number": 499, "offset": 214, "data_type": "INT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "order_scale_flowrate", "display_name": "Order Scale Flowrate", "source_type": "PLC", "db_number": 499, "offset": 470, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "feeder_1_target", "display_name": "Feeder 1 Target", "source_type": "PLC", "db_number": 499, "offset": 478, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "feeder_1_selected", "display_name": "Feeder 1 Selected", "source_type": "PLC", "db_number": 499, "offset": 482, "data_type": "BOOL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "feeder_2_target", "display_name": "Feeder 2 Target", "source_type": "PLC", "db_number": 499, "offset": 484, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "feeder_2_selected", "display_name": "Feeder 2 Selected", "source_type": "PLC", "db_number": 499, "offset": 488, "data_type": "BOOL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "b1_scale1", "display_name": "B1 Scale1", "source_type": "PLC", "db_number": 499, "offset": 490, "data_type": "BOOL", "bit_position": 0, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "b3_chocke_feeder", "display_name": "B3 Chocke Feeder", "source_type": "PLC", "db_number": 499, "offset": 490, "data_type": "BOOL", "bit_position": 1, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "filter_flour_feeder", "display_name": "Filter Flour Feeder", "source_type": "PLC", "db_number": 499, "offset": 490, "data_type": "BOOL", "bit_position": 2, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "depot_selected", "display_name": "Depot Selected", "source_type": "PLC", "db_number": 499, "offset": 490, "data_type": "BOOL", "bit_position": 5, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "flap_1_selected", "display_name": "Flap 1 Selected", "source_type": "PLC", "db_number": 499, "offset": 514, "data_type": "BOOL", "bit_position": 0, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "flap_2_selected", "display_name": "Flap 2 Selected", "source_type": "PLC", "db_number": 499, "offset": 514, "data_type": "BOOL", "bit_position": 1, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "linning_running", "display_name": "Linning Running", "source_type": "PLC", "db_number": 499, "offset": 532, "data_type": "BOOL", "bit_position": 0, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "linning_stopped", "display_name": "Linning Stopped", "source_type": "PLC", "db_number": 499, "offset": 532, "data_type": "BOOL", "bit_position": 1, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "receiver_bin_id_1", "display_name": "Receiver Bin Id 1", "source_type": "PLC", "db_number": 499, "offset": 536, "data_type": "INT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "receiver_bin_id_2", "display_name": "Receiver Bin Id 2", "source_type": "PLC", "db_number": 499, "offset": 544, "data_type": "INT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "yield_max_flow", "display_name": "Yield Max Flow", "source_type": "PLC", "db_number": 2099, "offset": 0, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "yield_min_flow", "display_name": "Yield Min Flow", "source_type": "PLC", "db_number": 2099, "offset": 0, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_B1_scale", "display_name": "Mila B1 Scale", "source_type": "PLC", "db_number": 2099, "offset": 0, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_unknown", "display_name": "Mila Unknown", "source_type": "PLC", "db_number": 2099, "offset": 16, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_bran_coarse", "display_name": "Mila Bran Coarse", "source_type": "PLC", "db_number": 2099, "offset": 20, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_flour_1", "display_name": "Mila Flour 1", "source_type": "PLC", "db_number": 2099, "offset": 24, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_b1", "display_name": "Mila B1", "source_type": "PLC", "db_number": 2099, "offset": 28, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_bran_fine", "display_name": "Mila Bran Fine", "source_type": "PLC", "db_number": 2099, "offset": 32, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_semolina", "display_name": "Mila Semolina", "source_type": "PLC", "db_number": 2099, "offset": 36, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "mila_2_b789we", "display_name": "Mila 2 B789We", "source_type": "PLC", "db_number": 2099, "offset": 96, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "job_status", "display_name": "Job Status", "source_type": "PLC", "db_number": 2099, "offset": 104, "data_type": "BOOL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "bran_coarse", "display_name": "Bran Coarse", "source_type": "PLC", "db_number": 2099, "offset": 112, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "flour_1", "display_name": "Flour 1", "source_type": "PLC", "db_number": 2099, "offset": 116, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "b1", "display_name": "B1", "source_type": "PLC", "db_number": 2099, "offset": 120, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "bran_fine", "display_name": "Bran Fine", "source_type": "PLC", "db_number": 2099, "offset": 124, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "semolina", "display_name": "Semolina", "source_type": "PLC", "db_number": 2099, "offset": 128, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
    {"tag_name": "flow_rate_tph", "display_name": "Flow Rate Tph", "source_type": "PLC", "db_number": 2099, "offset": 176, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "flow_percentage", "display_name": "Flow Percentage", "source_type": "PLC", "db_number": 2099, "offset": 180, "data_type": "REAL", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": False},
    {"tag_name": "totalizer_kg", "display_name": "Totalizer Kg", "source_type": "PLC", "db_number": 2099, "offset": 184, "data_type": "DINT", "bit_position": None, "string_length": 40, "byte_swap": True, "unit": "", "scaling": 1.0, "decimal_places": 2, "formula": None, "mapping_name": None, "description": None, "is_active": True, "is_bin_tag": False, "activation_tag_name": None, "activation_condition": None, "activation_value": None, "value_formula": None, "is_counter": True},
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

    print(f"Seeding {len(TAGS_DATA)} tags...")
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
