"""
Seed demo tags into the tags table.
Part A: PLC tags from INTEGRATED_OFFSETS in plc_data_source.py
Part B: Manual (emulator) tags from EmulatorContext.jsx TAG_PROFILES
Idempotent: uses ON CONFLICT (tag_name) DO UPDATE SET ...
"""

import psycopg2
import os
import re
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5432'),
}

# --- Part A: PLC tags from INTEGRATED_OFFSETS ---
# Copied from plc_data_source.py lines 304-399
INTEGRATED_OFFSETS = [
    # DB199 (FCL)
    (199, 524, 2, "Int", "Allow control bits"),
    (199, 526, 1, "Bool", "Run/Idle"),
    (199, 528, 2, "Int", "DestNo"),
    (199, 530, 2, "Int", "DestBinId"),
    (199, 532, 4, "DInt", "PrdCode"),
    (199, 564, 4, "Real", "Water consumed"),
    (199, 568, 4, "Real", "Produced weight"),
    (199, 702, 4, "Real", "Moisture setpoint"),
    (199, 706, 4, "Real", "Moisture offset"),
    (199, 710, 1, "Bool", "Cleaning scale bypass"),
    (199, 682, 2, "Int", "Job status code"),
    (199, 563, 1, "Bool", "Source1 active"),
    (199, 565, 2, "Int", "Source1 bin_id"),
    (199, 567, 4, "Real", "Source1 qty%"),
    (199, 571, 4, "Real", "Source1 produced_qty"),
    (199, 575, 4, "DInt", "Source1 prd_code"),
    (199, 525, 1, "Bool", "Source2 active"),
    (199, 568, 16, "Source", "Source3 base"),
    (199, 584, 16, "Source", "Source4 base"),
    (199, 600, 16, "Source", "Source5 base"),
    # DB2099 (report + FCL/SCL flows + MIL-A)
    (2099, 0, 4, "Real", "FlowRate_2_521WE"),
    (2099, 4, 4, "Real", "FlowRate_3_523WE"),
    (2099, 8, 4, "Real", "FlowRate_3_522WE"),
    (2099, 12, 4, "Real", "FlowRate_3_520WE"),
    (2099, 16, 4, "Real", "FlowRate_3_524WE"),
    (2099, 20, 4, "Real", "Bran_Coarse"),
    (2099, 24, 4, "Real", "Flour_1"),
    (2099, 28, 4, "Real", "B1"),
    (2099, 32, 4, "Real", "Bran_Fine"),
    (2099, 36, 4, "Real", "Semolina"),
    (2099, 40, 4, "Real", "031_2_710WE"),
    (2099, 44, 4, "Real", "032_2_711WE"),
    (2099, 48, 4, "Real", "FCL1_2_520WE"),
    (2099, 52, 4, "Real", "021A_2_522WE"),
    (2099, 56, 4, "Real", "021B_2_523WE"),
    (2099, 60, 4, "Real", "021C_2_524WE"),
    (2099, 64, 4, "Real", "021_2_782WE"),
    (2099, 68, 4, "Real", "022_2_783WE"),
    (2099, 72, 4, "Real", "023_2_784WE"),
    (2099, 76, 4, "Real", "025_2_785WE"),
    (2099, 80, 4, "Real", "Water_Flow"),
    (2099, 84, 4, "Real", "027_2_786WE"),
    (2099, 88, 4, "Real", "028_2_787WE"),
    (2099, 92, 4, "Real", "029_2_708WE"),
    (2099, 96, 4, "Real", "mila_2_b789we"),
    (2099, 108, 4, "DInt", "Receiver 2 cumulative"),
    (2099, 112, 4, "DInt", "bran_coarse"),
    (2099, 116, 4, "DInt", "flour_1"),
    (2099, 120, 4, "DInt", "b1"),
    (2099, 124, 4, "DInt", "bran_fine"),
    (2099, 128, 4, "DInt", "semolina"),
    # DB299 (SCL)
    (299, 528, 2, "Int", "DestNo"),
    (299, 530, 2, "Int", "DestBinId"),
    (299, 532, 4, "DInt", "PrdCode"),
    (299, 682, 2, "Int", "JobStatusCode"),
    (299, 694, 4, "Real", "Flowrate"),
    (299, 698, 4, "Real", "JobQty"),
    (299, 702, 4, "Real", "MoistureSetpoint"),
    (299, 706, 4, "Real", "MoistureOffset"),
    (299, 710, 1, "Bool", "Dumping"),
    (299, 536, 16, "Source", "SCL Source1"),
    (299, 552, 16, "Source", "SCL Source2"),
    # DB499 (MIL-A)
    (499, 0, 4, "Real", "scale_weight"),
    (499, 478, 4, "Real", "feeder_1_target"),
    (499, 482, 1, "Bool", "feeder_1_selected"),
    (499, 484, 4, "Real", "feeder_2_target"),
    (499, 488, 1, "Bool", "feeder_2_selected"),
    (499, 536, 2, "Int", "receiver_bin_id_1"),
    (499, 544, 2, "Int", "receiver_bin_id_2"),
    (499, 532, 1, "Bool", "linning_running"),
    # DB1603 (Energy / Power monitor)
    (1603, 20, 4, "Real", "C2.L1_Current"),
    (1603, 32, 4, "Real", "C2.L1_Voltage"),
    (1603, 148, 4, "Real", "C2.L2_Current"),
    (1603, 160, 4, "Real", "C2.L2_Voltage"),
    (1603, 276, 4, "Real", "C2.L3_Current"),
    (1603, 288, 4, "Real", "C2.L3_Voltage"),
    (1603, 392, 4, "Real", "C2.EffectivePower"),
    (1603, 396, 4, "Real", "C2.ApparentPower"),
    (1603, 400, 4, "Real", "C2.ReactivePower"),
    (1603, 404, 4, "Real", "C2.OutCosPhi"),
    (1603, 408, 4, "DInt", "C2.Total_Active_Energy"),
    (1603, 412, 4, "DInt", "C2.Total_Reactive_Energy"),
    (1603, 416, 4, "DInt", "C2.Total_Apparent_Energy"),
    (1603, 564, 4, "Real", "M20.L1_Current"),
    (1603, 576, 4, "Real", "M20.L1_Voltage"),
    (1603, 936, 4, "Real", "M20.EffectivePower"),
    (1603, 952, 4, "DInt", "M20.Total_Active_Energy"),
    (1603, 956, 4, "DInt", "M20.Total_Reactive_Energy"),
    (1603, 960, 4, "DInt", "M20.Total_Apparent_Energy"),
]

DATA_TYPE_MAP = {
    "Real": "REAL",
    "Int": "INT",
    "DInt": "DINT",
    "Bool": "BOOL",
}

# DInt counter tags (cumulative values)
COUNTER_LABELS = {
    "Receiver 2 cumulative", "bran_coarse", "flour_1", "b1", "bran_fine", "semolina",
    "C2.Total_Active_Energy", "C2.Total_Reactive_Energy", "C2.Total_Apparent_Energy",
    "M20.Total_Active_Energy", "M20.Total_Reactive_Energy", "M20.Total_Apparent_Energy",
}


def sanitize_tag_name(label):
    """Convert label to tag_name: spaces/dashes/slashes/% → underscore."""
    name = re.sub(r'[^a-zA-Z0-9._]', '_', label)
    name = re.sub(r'_+', '_', name)
    return name.strip('_')


def get_plc_tags():
    """Build list of PLC tag dicts from INTEGRATED_OFFSETS, skipping Source types."""
    tags = []
    # Track (db_number, tag_name) to handle duplicates across DB blocks
    seen = set()
    for db_number, offset, size, data_type, label in INTEGRATED_OFFSETS:
        if data_type == "Source":
            continue
        mapped_type = DATA_TYPE_MAP.get(data_type)
        if not mapped_type:
            continue
        tag_name = sanitize_tag_name(label)
        # For tags from different DBs with same label (e.g. DestNo in DB199 vs DB299),
        # prefix with DB number to make unique
        key = tag_name
        if key in seen:
            tag_name = f"DB{db_number}_{tag_name}"
        seen.add(tag_name)
        tags.append({
            'tag_name': tag_name,
            'display_name': label,
            'source_type': 'PLC',
            'db_number': db_number,
            'offset': offset,
            'data_type': mapped_type,
            'unit': '',
            'decimal_places': 2,
            'is_active': True,
            'is_counter': label in COUNTER_LABELS,
        })
    return tags


# --- Part B: Manual (emulator) tags from EmulatorContext.jsx TAG_PROFILES ---
SILO_LEVEL_BASES = [52, 78, 34, 91, 45, 67, 23, 88]

MANUAL_TAGS = [
    # Static tags
    {'tag_name': 'Temperature_1', 'unit': '\u00b0C', 'decimals': 1},
    {'tag_name': 'Pressure_1', 'unit': 'bar', 'decimals': 2},
    {'tag_name': 'Flow_Rate_1', 'unit': 'm\u00b3/h', 'decimals': 1},
    {'tag_name': 'Motor_Speed_1', 'unit': 'RPM', 'decimals': 0},
    {'tag_name': 'Level_Tank_1', 'unit': '%', 'decimals': 1},
    {'tag_name': 'Power_Consumption', 'unit': 'kW', 'decimals': 2},
    {'tag_name': 'Vibration_1', 'unit': 'mm/s', 'decimals': 2},
    {'tag_name': 'Weight_Scale_1', 'unit': 'kg', 'decimals': 1},
    {'tag_name': 'Mill_Throughput', 'unit': 't/h', 'decimals': 2},
    {'tag_name': 'Flour_Extraction', 'unit': '%', 'decimals': 2},
    {'tag_name': 'Bran_Extraction', 'unit': '%', 'decimals': 2},
    {'tag_name': 'Water_Used', 'unit': 'L', 'decimals': 1},
    {'tag_name': 'Intake_Today', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Intake_Week', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Intake_Month', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Outload_Ship', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Outload_Truck', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Outload_Rail', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Balance_Tons', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Queue_Status', 'unit': '', 'decimals': 0},
    {'tag_name': 'Moisture_Avg', 'unit': '%', 'decimals': 2},
    {'tag_name': 'Aeration_Status', 'unit': '', 'decimals': 0},
    {'tag_name': 'Quality_Deviation', 'unit': '', 'decimals': 0},
    {'tag_name': 'Conveyor1_Status', 'unit': '', 'decimals': 0},
    {'tag_name': 'Conveyor1_Throughput', 'unit': 't/h', 'decimals': 1},
    {'tag_name': 'Elevator1_Running', 'unit': '', 'decimals': 0},
    {'tag_name': 'Equipment_Downtime_Pct', 'unit': '%', 'decimals': 1},
    {'tag_name': 'Equipment_Utilization_Pct', 'unit': '%', 'decimals': 1},
    {'tag_name': 'Power_Intake_Area', 'unit': 'kW', 'decimals': 1},
    {'tag_name': 'Power_Storage_Area', 'unit': 'kW', 'decimals': 1},
    {'tag_name': 'Energy_Per_Ton', 'unit': 'kWh/t', 'decimals': 2},
    {'tag_name': 'Peak_Power_kW', 'unit': 'kW', 'decimals': 1},
    {'tag_name': 'Alarm_Active_Count', 'unit': '', 'decimals': 0},
    {'tag_name': 'Alarm_Critical_Count', 'unit': '', 'decimals': 0},
    {'tag_name': 'Alarm_Response_Time_Avg', 'unit': 'min', 'decimals': 1},
    {'tag_name': 'Tons_Per_Day', 'unit': 't', 'decimals': 1},
    {'tag_name': 'Terminal_Availability_Pct', 'unit': '%', 'decimals': 1},
    {'tag_name': 'Downtime_Pct', 'unit': '%', 'decimals': 1},
    {'tag_name': 'Losses_Pct', 'unit': '%', 'decimals': 2},
    {'tag_name': 'OEE_Style', 'unit': '%', 'decimals': 1},
    {'tag_name': 'Running_Hours_Main', 'unit': 'h', 'decimals': 1},
    {'tag_name': 'StartStop_Cycles', 'unit': '', 'decimals': 0},
    {'tag_name': 'Abnormal_Load_Count', 'unit': '', 'decimals': 0},
    {'tag_name': 'Early_Warning_Count', 'unit': '', 'decimals': 0},
]

# Generate Silo 1-8 tags
for i in range(8):
    n = i + 1
    MANUAL_TAGS.extend([
        {'tag_name': f'Silo{n}_Level', 'unit': '%', 'decimals': 1},
        {'tag_name': f'Silo{n}_Capacity', 'unit': 't', 'decimals': 0},
        {'tag_name': f'Silo{n}_Tons', 'unit': 't', 'decimals': 1},
        {'tag_name': f'Silo{n}_Temp', 'unit': '\u00b0C', 'decimals': 1},
    ])


def get_manual_tags():
    """Build list of Manual tag dicts."""
    tags = []
    for t in MANUAL_TAGS:
        tags.append({
            'tag_name': t['tag_name'],
            'display_name': t['tag_name'].replace('_', ' '),
            'source_type': 'Manual',
            'db_number': None,
            'offset': None,
            'data_type': 'REAL',
            'unit': t['unit'],
            'decimal_places': t['decimals'],
            'is_active': True,
            'is_counter': False,
        })
    return tags


UPSERT_SQL = """
INSERT INTO tags (tag_name, display_name, source_type, db_number, "offset", data_type, unit, decimal_places, is_active, is_counter)
VALUES (%(tag_name)s, %(display_name)s, %(source_type)s, %(db_number)s, %(offset)s, %(data_type)s, %(unit)s, %(decimal_places)s, %(is_active)s, %(is_counter)s)
ON CONFLICT (tag_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    source_type = EXCLUDED.source_type,
    db_number = EXCLUDED.db_number,
    "offset" = EXCLUDED."offset",
    data_type = EXCLUDED.data_type,
    unit = EXCLUDED.unit,
    decimal_places = EXCLUDED.decimal_places,
    is_active = EXCLUDED.is_active,
    is_counter = EXCLUDED.is_counter;
"""


def main():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    plc_tags = get_plc_tags()
    manual_tags = get_manual_tags()

    print(f"Seeding {len(plc_tags)} PLC tags...")
    for tag in plc_tags:
        cur.execute(UPSERT_SQL, tag)

    print(f"Seeding {len(manual_tags)} Manual tags...")
    for tag in manual_tags:
        cur.execute(UPSERT_SQL, tag)

    conn.commit()

    # Verify
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
