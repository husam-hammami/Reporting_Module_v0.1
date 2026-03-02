"""
PLC emulator: same (db, offset) as production. Demo mode reads from this store; production from PLC via IP.
No totalizer/WG – only integrated read offsets used by backend when connected to PLC.
Supports dynamic custom offsets (stored in config/emulator_custom_offsets.json) merged into _store for use by tags.
"""

import os
import json
import math
import random
import struct
import time
import logging
from threading import Lock

logger = logging.getLogger(__name__)

# (db_number, offset) -> (value, struct_fmt)
# fmt: '>f' big-endian float, '<f' little-endian float, '>i'/'<i' int32, '>h' int16, 'b' bool (1 byte)
_store = {}
_store_lock = Lock()
# (db_number, offset) -> (base, amplitude, fmt, kind) — definitions for live-varying values
# kind: 'sim' (sinusoidal float), 'counter' (accumulating int), 'static' (fixed value)
_sim_defs = {}

_BASE_DIR = os.path.abspath(os.path.dirname(__file__))
_CONFIG_DIR = os.path.join(_BASE_DIR, "config")
_CUSTOM_OFFSETS_FILE = os.path.join(_CONFIG_DIR, "emulator_custom_offsets.json")
# (db_number, offset) -> entry dict; values computed on read so they stay live
_custom_entries = {}


def _sim(offset_key, base=0.0, amplitude=1.0, period=60.0):
    t = time.time()
    return round(base + amplitude * math.sin(2 * math.pi * t / period), 6)


def _sim_int(offset_key, low=0, high=100):
    return (int(time.time()) + hash(offset_key) % 1000) % (high - low + 1) + low


# ── Unit/data-type simulation defaults for DB-driven emulator ────────────────
# Used by register_tag_in_emulator() to pick sensible (base, amplitude) for new tags.
_UNIT_SIM_DEFAULTS = {
    '°C':    (40.0, 5.0),
    '°F':    (104.0, 9.0),
    'bar':   (4.0, 0.5),
    'psi':   (58.0, 7.0),
    '%':     (50.0, 10.0),
    'RPM':   (1450.0, 20.0),
    'mm/s':  (2.0, 0.3),
    'kW':    (100.0, 15.0),
    'kWh':   (500.0, 50.0),
    'kWh/t': (3.0, 0.3),
    't/h':   (10.0, 3.0),
    'm³/h':  (12.0, 2.0),
    'kg':    (250.0, 20.0),
    't':     (400.0, 40.0),
    'L':     (450.0, 35.0),
    'h':     (1200.0, 0.0),
    'min':   (8.0, 1.5),
    'A':     (100.0, 30.0),
    'V':     (400.0, 10.0),
}
_DTYPE_SIM_DEFAULTS = {
    'REAL':  (50.0, 10.0),
    'INT':   (50, 10),
    'DINT':  (10000, 1000),
    'BOOL':  (1, 0),
}


def register_tag_in_emulator(tag_name, source_type, db_number, offset, data_type, unit=''):
    """
    Register a tag in the emulator so it produces simulated values in demo mode.
    For PLC tags: adds (db_number, offset) to _store/_sim_defs if not already present.
    For Manual/Formula tags: no-op (handled by tag_reader._generate_demo_manual_values).
    """
    if source_type != 'PLC' or db_number is None or offset is None:
        return
    key = (int(db_number), int(offset))
    with _store_lock:
        # Don't overwrite existing entries (integrated offsets take priority)
        if key in _store or key in _sim_defs:
            return
        # Pick simulation defaults from unit, fallback to data_type
        unit_str = (unit or '').strip()
        dtype_str = (data_type or 'REAL').strip().upper()
        base, amp = _UNIT_SIM_DEFAULTS.get(unit_str, _DTYPE_SIM_DEFAULTS.get(dtype_str, (50.0, 10.0)))
        fmt, _ = _data_type_to_fmt(dtype_str)
        kind = 'counter' if dtype_str == 'DINT' else 'sim'
        _register_sim(key, base, amp, fmt, kind)
        logger.info("Emulator: registered tag '%s' at DB%d.%d (%s, %s)", tag_name, key[0], key[1], dtype_str, kind)


def seed_tags_from_db(db_connection_func):
    """
    Read all active PLC tags from the database and register them in the emulator.
    Called at startup when demo mode is active so tags from previous sessions are available.
    """
    try:
        from contextlib import closing
        from psycopg2.extras import RealDictCursor
        with closing(db_connection_func()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT tag_name, source_type, db_number, "offset", data_type, unit
                FROM tags
                WHERE is_active = true
            """)
            tags = cur.fetchall()
        count = 0
        for tag in tags:
            register_tag_in_emulator(
                tag_name=tag['tag_name'],
                source_type=tag['source_type'],
                db_number=tag.get('db_number'),
                offset=tag.get('offset'),
                data_type=tag.get('data_type', 'REAL'),
                unit=tag.get('unit', ''),
            )
            count += 1
        logger.info("Emulator: seeded %d tags from database", count)
    except Exception as e:
        logger.warning("Emulator seed_tags_from_db failed: %s", e)


def _seed_db2099_report():
    """Same offsets as get_db2099_report: DB2099 0-92. Backend does [::-1] then <f, so we store >f."""
    DB = 2099
    tags_offsets = [
        (0, 10.0, 5.0), (4, 10.0, 5.0), (8, 10.0, 5.0), (12, 10.0, 5.0), (16, 10.0, 5.0),
        (20, 0.0, 1.0), (24, 0.0, 1.0), (28, 0.0, 1.0), (32, 0.0, 1.0), (36, 0.0, 1.0),
        (40, 10.0, 5.0), (44, 10.0, 5.0), (48, 10.0, 5.0), (52, 10.0, 5.0), (56, 10.0, 5.0),
        (60, 10.0, 5.0), (64, 10.0, 5.0), (68, 10.0, 5.0), (72, 10.0, 5.0), (76, 10.0, 5.0),
        (80, 100.0, 20.0), (84, 10.0, 5.0), (88, 10.0, 5.0), (92, 10.0, 5.0),
    ]
    for offset, base, amp in tags_offsets:
        _register_sim((DB, offset), base, amp, '>f', 'sim')


def _seed_db199_fcl():
    """DB199 and DB2099 offsets used by read_db199_monitor (FCL)."""
    DB199, DB2099 = 199, 2099
    # DB199 reals (big-endian) and others
    for offset in [564, 568]:  # water_consumed, produced_weight
        _register_sim((DB199, offset), 20.0, 5.0, '>f', 'sim')
    for offset in [706, 702]:  # moisture_offset, moisture_setpoint
        _register_sim((DB199, offset), 14.0, 0.5, '>f', 'sim')
    # Destination 528-535 (8 bytes): dest_no(2), bin_id(2), prd_code(4)
    _store[(DB199, 528)] = (1, '>h')
    _register_sim((DB199, 530), 21, 61, '>h', 'id_range')   # bin_id: random 21-61
    _register_sim((DB199, 532), 21, 61, '>i', 'id_range')   # prd_code: random 21-61
    # Run 526
    _store[(DB199, 526)] = (1, 'b')  # bool
    # Receiver 2 cumulative (DB2099 offset 108): read_dint_counter uses raw[::-1] then <i, so we store >i
    _register_sim((DB2099, 108), 100000, 5000, '>i', 'counter')
    # FCL feeder flow map offsets (DB2099): read_flow_rate does raw[::-1] then <f, so we store >f
    for off in [52, 56, 60, 64, 68, 72, 76, 84, 88, 92, 40, 44]:
        _register_sim((DB2099, off), 12.0, 4.0, '>f', 'sim')
    # Cleaning scale bypass 710
    _store[(DB199, 710)] = (0, 'b')
    # Active sources base 563, 525, 568, 584, 600 - 16 bytes each; bin_id and prd_code random 21-61
    for base in [563, 525, 568, 584, 600]:
        _store[(DB199, base)] = (1, 'b')
        _register_sim((DB199, base + 2), 21, 61, '>h', 'id_range')   # bin_id
        _store[(DB199, base + 4)] = (50.0, '>f')
        _store[(DB199, base + 8)] = (100.0, '>f')
        _register_sim((DB199, base + 12), 21, 61, '>i', 'id_range')   # prd_code
    # OS comment 616, 66 bytes - skip for now (zeros)
    # Job code 682
    _store[(DB199, 682)] = (1, '>h')


def _seed_db299_scl():
    """DB299 and DB2099 offsets for SCL monitor."""
    DB299, DB2099 = 299, 2099
    for name, dtype, offset in [
        ("DestNo", "Int", 528), ("DestBinId", "Int", 530), ("PrdCode", "DInt", 532),
        ("Flowrate", "Real", 694), ("JobQty", "Real", 698),
        ("MoistureSetpoint", "Real", 702), ("MoistureOffset", "Real", 706),
        ("Dumping", "Bool", 710), ("JobStatusCode", "Int", 682),
    ]:
        o = int(offset)
        if dtype == "Real":
            _register_sim((DB299, o), 15.0, 4.0, '>f', 'sim')
        elif dtype == "Int":
            _store[(DB299, o)] = (1 if "Dest" in name or "Bin" in name else 0, '>h')
        elif dtype == "DInt":
            _store[(DB299, o)] = (1, '>i')
        elif dtype == "Bool":
            _store[(DB299, o)] = (0, 'b')
    # Feeder flows DB2099 offsets 84, 88, 92, 44 (big-endian in read_flow for SCL)
    for off in [84, 88, 92, 44]:
        _register_sim((DB2099, off), 10.0, 4.0, '>f', 'sim')
    # Active sources 536 + i*16 (i=0..4)
    for i in range(5):
        base = 536 + i * 16
        _store[(DB299, base)] = (1 if i < 2 else 0, 'b')
        _store[(DB299, base + 2)] = (27 if i == 0 else (28 if i == 1 else 0), '>h')
        _store[(DB299, base + 4)] = (60.0, '>f')
        _store[(DB299, base + 8)] = (120.0, '>f')
        _store[(DB299, base + 12)] = (1, '>i')


def _seed_db499_db2099_mila():
    """DB499 and DB2099 for MIL-A monitor."""
    DB499, DB2099 = 499, 2099
    # DB499
    for offset, base, amp in [(0, 500.0, 50.0), (478, 25.0, 3.0), (484, 20.0, 2.0)]:
        _register_sim((DB499, offset), base, amp, '>f', 'sim')
    for bo in [482, 488, 490, 514]:  # bools (byte.0 and bit)
        _store[(DB499, int(bo))] = (1 if bo != 490 else 0, 'b')
    _store[(DB499, 514)] = (1, 'b')   # flap_1
    _store[(DB499, 536)] = (1, '>h')
    _store[(DB499, 544)] = (2, '>h')
    _store[(DB499, 532)] = (1, 'b')   # linning_running
    _store[(DB499, 254)] = (1, 'b')  # semolina_selected (byte 254)
    _store[(DB499, 296)] = (0, 'b')
    # DB2099 MIL-A fields
    for offset, base, amp in [(96, 0.5, 0.1), (0, 10.0, 3.0), (16, 1.0, 0.0), (20, 12.0, 1.0),
                              (24, 45.0, 3.0), (28, 25.0, 2.0), (32, 8.0, 0.5), (36, 10.0, 1.0)]:
        _register_sim((DB2099, offset), base, amp, '>f', 'sim')
    # Bran receiver DInt (112, 124, 116, 120, 128)
    for offset, base in [(112, 50000), (124, 30000), (116, 120000), (120, 80000), (128, 40000)]:
        _register_sim((DB2099, offset), base, 1000, '>i', 'counter')


def _seed_db1603_energy():
    """DB1603 power/energy monitor: same offsets as read_power_monitor_data (generate_power_tags)."""
    DB = 1603
    # C2 block: REALs at 20,32,148,160,276,288,392,396,400,404; DINTs at 408,412,416 (energy, scale 0.01 in backend)
    real_offsets_c2 = [20, 32, 148, 160, 276, 288, 392, 396, 400, 404]
    for offset in real_offsets_c2:
        _register_sim((DB, offset), 100.0, 30.0, '>f', 'sim')
    for offset in [408, 412, 416]:
        # Energy counters (DINT): accumulating style, backend applies scale 0.01
        _register_sim((DB, offset), 1000000, 50000, '>i', 'counter')
    # M-blocks: M20 base 564, M21 1108, M22 1652, M23 2196, M24 2740
    m_bases = [564, 1108, 1652, 2196, 2740]
    step_real = [0, 12, 128, 140, 256, 268, 372, 376, 380, 384]  # REAL
    step_dint = [388, 392, 396]  # DINT (energy)
    for base in m_bases:
        for off in step_real:
            _register_sim((DB, base + off), 80.0, 25.0, '>f', 'sim')
        for off in step_dint:
            _register_sim((DB, base + off), 500000, 20000, '>i', 'counter')


def _data_type_to_fmt(data_type):
    """Map tag data_type to struct format for emulator store. Returns (fmt, size_bytes)."""
    d = (data_type or "").strip().upper()
    if d == "REAL":
        return (">f", 4)
    if d in ("DINT", "DWORD"):
        return (">i", 4)
    if d == "INT":
        return (">h", 2)
    if d == "BOOL":
        return ("b", 1)
    return (">f", 4)


def _load_custom_offsets_json():
    """Load custom emulator offsets from JSON. Returns list of dicts."""
    try:
        if not os.path.isfile(_CUSTOM_OFFSETS_FILE):
            return []
        with open(_CUSTOM_OFFSETS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("offsets", [])
    except Exception as e:
        logger.warning("emulator custom offsets: load failed: %s", e)
        return []


def _save_custom_offsets_json(offsets_list):
    """Save custom emulator offsets to JSON."""
    try:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(_CUSTOM_OFFSETS_FILE, "w", encoding="utf-8") as f:
            json.dump({"offsets": offsets_list}, f, indent=2)
        return True
    except Exception as e:
        logger.error("emulator custom offsets: save failed: %s", e)
        return False


def _value_for_custom_entry(entry):
    """Compute current value for a custom offset entry (initial_value or simulated)."""
    initial = entry.get("initial_value")
    if initial is not None:
        try:
            return float(initial) if entry.get("data_type", "").upper() in ("REAL",) else int(initial)
        except (TypeError, ValueError):
            pass
    db_number = entry.get("db_number")
    offset = entry.get("offset")
    key = (db_number, offset)
    base = float(entry.get("sim_base", 0.0))
    amp = float(entry.get("sim_amplitude", 1.0))
    dtype = (entry.get("data_type") or "").strip().upper()
    if dtype in ("DINT", "INT", "DWORD"):
        t = time.time()
        return int(base + amp * (t % 100) / 10)
    return _sim(key, base, amp)


def _seed_custom_offsets():
    """Load custom offsets from JSON into _custom_entries (values computed on read in get_bytes). Caller must hold _store_lock if from _seed_all."""
    _custom_entries.clear()
    for entry in _load_custom_offsets_json():
        try:
            db_number = int(entry.get("db_number"))
            offset = int(entry.get("offset"))
            _custom_entries[(db_number, offset)] = dict(entry)
        except (TypeError, ValueError, KeyError) as e:
            logger.warning("emulator custom offset skipped %s: %s", entry, e)


def _register_sim(key, base, amplitude, fmt, kind='sim'):
    """Register a live-varying definition and store initial value."""
    _sim_defs[key] = (base, amplitude, fmt, kind)
    if kind == 'sim':
        _store[key] = (_sim(key, base, amplitude), fmt)
    elif kind == 'counter':
        t = time.time()
        _store[key] = (int(base + amplitude * (t % 3600) / 3600), fmt)
    elif kind == 'id_range':
        # base/min and amplitude/max for random int in [base, amplitude] (e.g. 21-61)
        _store[key] = (random.randint(int(base), int(amplitude)), fmt)
    else:
        _store[key] = (base, fmt)


def _refresh_sim_values():
    """Recompute all live-varying values. Called on each get_bytes read."""
    t = time.time()
    for key, (base, amplitude, fmt, kind) in _sim_defs.items():
        if kind == 'sim':
            _store[key] = (round(base + amplitude * math.sin(2 * math.pi * t / 60.0 + hash(key) % 100), 6), fmt)
        elif kind == 'counter':
            _store[key] = (int(base + amplitude * (t % 3600) / 3600), fmt)
        elif kind == 'id_range':
            _store[key] = (random.randint(int(base), int(amplitude)), fmt)


def _seed_all():
    with _store_lock:
        if _store:
            return
        _seed_db2099_report()
        _seed_db199_fcl()
        _seed_db299_scl()
        _seed_db499_db2099_mila()
        _seed_db1603_energy()
        _seed_custom_offsets()
        logger.info("PLC emulator offset store seeded (same offsets as production).")


def get_bytes(db_number, offset, size):
    """Return `size` bytes for (db_number, offset). Same layout as PLC (big/little-endian per offset)."""
    _seed_all()
    result = bytearray()
    pos = 0
    with _store_lock:
        _refresh_sim_values()
        while pos < size:
            o = offset + pos
            key = (db_number, o)
            if key in _custom_entries:
                entry = _custom_entries[key]
                fmt, sz = _data_type_to_fmt(entry.get("data_type"))
                val = _value_for_custom_entry(entry)
                if fmt == 'b':
                    result.append(1 if val else 0)
                    pos += 1
                elif fmt == '>h':
                    result.extend(struct.pack('>h', int(val)))
                    pos += 2
                elif fmt in ('>f', '<f'):
                    result.extend(struct.pack(fmt, float(val)))
                    pos += 4
                elif fmt in ('>i', '<i'):
                    result.extend(struct.pack(fmt, int(val)))
                    pos += 4
                else:
                    result.extend(b'\x00' * 4)
                    pos += 4
            elif key in _store:
                val, fmt = _store[key]
                if fmt == 'b':
                    result.append(1 if val else 0)
                    pos += 1
                elif fmt == '>h':
                    result.extend(struct.pack('>h', int(val)))
                    pos += 2
                elif fmt in ('>f', '<f'):
                    result.extend(struct.pack(fmt, float(val)))
                    pos += 4
                elif fmt in ('>i', '<i'):
                    result.extend(struct.pack(fmt, int(val)))
                    pos += 4
                else:
                    result.extend(b'\x00' * 4)
                    pos += 4
            else:
                result.extend(b'\x00' * 4)
                pos += 4
    return bytes(result[:size])


# Integrated read offsets: same (db, offset) backend uses when connected to PLC via IP.
# Each: (db_number, offset, size, type, label). Used for GET /api/settings/emulator-offsets.
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
    # DB1603 (Energy / Power monitor) - same offsets as read_power_monitor_data
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


def get_emulator_offsets():
    """Return current value for each integrated (db, offset) from emulator store (for Settings UI)."""
    _seed_all()
    result = {"DB199": [], "DB2099": [], "DB299": [], "DB499": [], "DB1603": [], "Custom": []}
    db_keys = {199: "DB199", 2099: "DB2099", 299: "DB299", 499: "DB499", 1603: "DB1603"}
    with _store_lock:
        for db_number, offset, size, typ, label in INTEGRATED_OFFSETS:
            key = (db_number, offset)
            if key in _store:
                val, fmt = _store[key]
                if fmt == 'b':
                    display = 1 if val else 0
                elif fmt in (">f", "<f"):
                    display = round(float(val), 4)
                elif fmt in (">i", "<i", ">h"):
                    display = int(val)
                else:
                    display = val
                result[db_keys[db_number]].append({
                    "offset": offset,
                    "size": size,
                    "type": typ,
                    "label": label,
                    "value": display,
                })
        # Append custom offsets with current values (computed on read)
        for entry in _load_custom_offsets_json():
            db_number = entry.get("db_number")
            offset = entry.get("offset")
            val = _value_for_custom_entry(entry)
            dtype = entry.get("data_type", "Real")
            fmt, size = _data_type_to_fmt(dtype)
            if fmt == 'b':
                display = 1 if val else 0
            elif fmt in (">f", "<f"):
                display = round(float(val), 4)
            elif fmt in (">i", "<i", ">h"):
                display = int(val)
            else:
                display = val
            result["Custom"].append({
                "db_number": db_number,
                "offset": offset,
                "size": size,
                "type": dtype,
                "label": entry.get("label", f"DB{db_number}.{offset}"),
                "value": display,
            })
    return result


def get_custom_offsets():
    """Return list of custom emulator offset definitions with current value (computed on read, for API)."""
    _seed_all()
    custom_list = _load_custom_offsets_json()
    out = []
    for entry in custom_list:
        row = dict(entry)
        row["value"] = _value_for_custom_entry(entry)
        out.append(row)
    return out


def add_custom_offset(db_number, offset, data_type, label, initial_value=None, sim_base=0.0, sim_amplitude=1.0):
    """
    Add a dynamic emulator offset. Persists to JSON and merges into _store so tags can read it.
    data_type: Real, DInt, Int, Bool. Returns (True, None) on success, (False, error_message) on failure.
    """
    try:
        db_number = int(db_number)
        offset = int(offset)
    except (TypeError, ValueError):
        return False, "db_number and offset must be integers"
    data_type = (data_type or "Real").strip()
    label = (label or f"DB{db_number}.{offset}").strip()
    custom_list = _load_custom_offsets_json()
    for e in custom_list:
        if e.get("db_number") == db_number and e.get("offset") == offset:
            return False, "This (db_number, offset) already exists in custom offsets"
    entry = {
        "db_number": db_number,
        "offset": offset,
        "data_type": data_type,
        "label": label,
        "initial_value": initial_value,
        "sim_base": float(sim_base) if sim_base is not None else 0.0,
        "sim_amplitude": float(sim_amplitude) if sim_amplitude is not None else 1.0,
    }
    custom_list.append(entry)
    if not _save_custom_offsets_json(custom_list):
        return False, "Failed to save custom offsets file"
    with _store_lock:
        _custom_entries[(db_number, offset)] = entry
    logger.info("Added custom emulator offset DB%d.%d %s", db_number, offset, label)
    return True, None


def remove_custom_offset(db_number, offset):
    """Remove a dynamic emulator offset. Returns (True, None) on success, (False, error_message) on failure."""
    try:
        db_number = int(db_number)
        offset = int(offset)
    except (TypeError, ValueError):
        return False, "db_number and offset must be integers"
    custom_list = _load_custom_offsets_json()
    new_list = [e for e in custom_list if e.get("db_number") != db_number or e.get("offset") != offset]
    if len(new_list) == len(custom_list):
        return False, "Custom offset not found"
    if not _save_custom_offsets_json(new_list):
        return False, "Failed to save custom offsets file"
    with _store_lock:
        _custom_entries.pop((db_number, offset), None)
    logger.info("Removed custom emulator offset DB%d.%d", db_number, offset)
    return True, None


def get_demo_fallback_tag_values():
    """
    Return { tag_name: value } for all integrated emulator offsets.
    Used when in demo mode and the tags table has no active PLC tags, so the live monitor
    still shows data. Tag names are derived from labels (e.g. "Water consumed" -> "Water_consumed").
    """
    _seed_all()
    out = {}
    with _store_lock:
        for db_number, offset, size, typ, label in INTEGRATED_OFFSETS:
            key = (db_number, offset)
            if key in _store:
                val, fmt = _store[key]
                if fmt == 'b':
                    display = 1 if val else 0
                elif fmt in (">f", "<f"):
                    display = round(float(val), 4)
                elif fmt in (">i", "<i", ">h"):
                    display = int(val)
                else:
                    display = val
                tag_name = label.replace(" ", "_").replace("-", "_").replace("/", "_")
                if not tag_name.replace("_", "").isalnum():
                    tag_name = "".join(c if c.isalnum() or c == "_" else "_" for c in tag_name)
                out[tag_name] = display
    return out


class EmulatorClient:
    """Drop-in for snap7 Client when in demo mode: same db_read(db, offset, size) interface."""
    def db_read(self, db_number, offset, size):
        return get_bytes(db_number, offset, size)

    def get_connected(self):
        return True

    def disconnect(self):
        pass

    def destroy(self):
        pass


_emulator_client = None


def get_emulator_client():
    global _emulator_client
    if _emulator_client is None:
        _emulator_client = EmulatorClient()
    return _emulator_client
