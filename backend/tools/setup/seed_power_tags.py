"""
Seed the tags table with BMill Power Consumption tags (C32, M30, M31).
DB block 1603 — Wago power-monitoring modules.
Idempotent: ON CONFLICT (tag_name) DO UPDATE.

Run standalone:
  python backend/tools/setup/seed_power_tags.py
Or via Docker:
  docker compose exec backend python tools/setup/seed_power_tags.py
"""

import os
import sys
import psycopg2
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent.parent
for env_path in [BACKEND_DIR / '.env', BACKEND_DIR.parent / '.env']:
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass
        break

DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5433'),
}

DB_NUM = 1603


def _tag(tag_name, display_name, offset, data_type, unit, description,
         scaling=1.0, is_counter=False):
    return {
        "tag_name": tag_name,
        "display_name": display_name,
        "source_type": "PLC",
        "db_number": DB_NUM,
        "offset": offset,
        "data_type": data_type,
        "bit_position": None,
        "string_length": 40,
        "byte_swap": True,
        "unit": unit,
        "scaling": scaling,
        "decimal_places": 2,
        "formula": None,
        "mapping_name": None,
        "description": description,
        "is_active": True,
        "is_bin_tag": False,
        "activation_tag_name": None,
        "activation_condition": None,
        "activation_value": None,
        "value_formula": None,
        "is_counter": is_counter,
    }


def _module_tags(prefix, name, offsets):
    """Generate all 13 tags for one power-monitoring module."""
    return [
        # ── Per-phase readings ──
        _tag(f"{prefix}_l1_current",  f"{name} L1 Current",  offsets["l1_current"],  "REAL", "A", "Output Current Reading from Wago L1"),
        _tag(f"{prefix}_l1_voltage",  f"{name} L1 Voltage",  offsets["l1_voltage"],  "REAL", "V", "Output Voltage Reading from Wago L1"),
        _tag(f"{prefix}_l2_current",  f"{name} L2 Current",  offsets["l2_current"],  "REAL", "A", "Output Current Reading from Wago L2"),
        _tag(f"{prefix}_l2_voltage",  f"{name} L2 Voltage",  offsets["l2_voltage"],  "REAL", "V", "Output Voltage Reading from Wago L2"),
        _tag(f"{prefix}_l3_current",  f"{name} L3 Current",  offsets["l3_current"],  "REAL", "A", "Output Current Reading from Wago L3"),
        _tag(f"{prefix}_l3_voltage",  f"{name} L3 Voltage",  offsets["l3_voltage"],  "REAL", "V", "Output Voltage Reading from Wago L3"),
        # ── General / summary ──
        _tag(f"{prefix}_effective_power",       f"{name} Effective Power",       offsets["effective_power"],       "REAL", "kW",   "Effective Power Summary L1-L3"),
        _tag(f"{prefix}_apparent_power",        f"{name} Apparent Power",        offsets["apparent_power"],        "REAL", "kVA",  "Apparent Power Summary L1-L3"),
        _tag(f"{prefix}_reactive_power",        f"{name} Reactive Power",        offsets["reactive_power"],        "REAL", "kvar", "Reactive Power Summary L1-L3"),
        _tag(f"{prefix}_cos_phi",               f"{name} Cos Phi",              offsets["cos_phi"],               "REAL", "",     "Power Factor (0..1) Summary L1-L3"),
        # ── Energy totalizers (DInt, raw value in 0.01 units) ──
        _tag(f"{prefix}_total_active_energy",   f"{name} Total Active Energy",   offsets["total_active_energy"],   "DINT", "kWh",   "Total Active Energy (raw 0.01kWh)",    scaling=0.01, is_counter=True),
        _tag(f"{prefix}_total_reactive_energy", f"{name} Total Reactive Energy", offsets["total_reactive_energy"], "DINT", "kvarh", "Total Reactive Energy (raw 0.01kvarh)", scaling=0.01, is_counter=True),
        _tag(f"{prefix}_total_apparent_energy", f"{name} Total Apparent Energy", offsets["total_apparent_energy"], "DINT", "kVAh",  "Total Apparent Energy (raw 0.01kVAh)",  scaling=0.01, is_counter=True),
    ]


TAGS_DATA = [
    # ── C32 Power Consumption ──
    *_module_tags("c32", "C32", {
        "l1_current": 20,   "l1_voltage": 32,
        "l2_current": 148,  "l2_voltage": 160,
        "l3_current": 276,  "l3_voltage": 288,
        "effective_power": 392, "apparent_power": 396,
        "reactive_power": 400,  "cos_phi": 404,
        "total_active_energy": 408, "total_reactive_energy": 412,
        "total_apparent_energy": 416,
    }),
    # ── M30 Power Consumption ──
    *_module_tags("m30", "M30", {
        "l1_current": 564,  "l1_voltage": 576,
        "l2_current": 692,  "l2_voltage": 704,
        "l3_current": 820,  "l3_voltage": 832,
        "effective_power": 936, "apparent_power": 940,
        "reactive_power": 944,  "cos_phi": 948,
        "total_active_energy": 952, "total_reactive_energy": 956,
        "total_apparent_energy": 960,
    }),
    # ── M31 Power Consumption ──
    *_module_tags("m31", "M31", {
        "l1_current": 1108, "l1_voltage": 1120,
        "l2_current": 1236, "l2_voltage": 1248,
        "l3_current": 1364, "l3_voltage": 1376,
        "effective_power": 1480, "apparent_power": 1484,
        "reactive_power": 1488,  "cos_phi": 1492,
        "total_active_energy": 1496, "total_reactive_energy": 1500,
        "total_apparent_energy": 1504,
    }),
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


def seed(conn=None):
    """Callable from setup_local_db.py or as standalone script."""
    own_conn = conn is None
    if own_conn:
        conn = psycopg2.connect(**DB_CONFIG)

    cur = conn.cursor()
    print(f"  Seeding {len(TAGS_DATA)} Power Consumption tags (C32, M30, M31) ...")
    for tag in TAGS_DATA:
        cur.execute(UPSERT_SQL, tag)
    conn.commit()

    cur.execute(
        "SELECT COUNT(*) FROM tags "
        "WHERE tag_name LIKE 'c32_%%' OR tag_name LIKE 'm30_%%' OR tag_name LIKE 'm31_%%'"
    )
    total = cur.fetchone()[0]
    print(f"  Power tags in DB: {total}")

    cur.close()
    if own_conn:
        conn.close()
    print("  Done seeding power tags!")


def main():
    seed()


if __name__ == '__main__':
    main()
