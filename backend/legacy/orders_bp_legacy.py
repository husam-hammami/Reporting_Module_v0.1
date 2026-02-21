import os
import logging
import threading
import json
import struct
import psycopg2
import psycopg2.extras
import snap7
from snap7.util import set_bool, get_bool
from flask import Blueprint, jsonify, request, render_template
from contextlib import closing
from flask_login import current_user
from flask import request, redirect, url_for
from datetime import datetime
from psycopg2.extras import RealDictCursor
from contextlib import closing

# =============================================================================
# Logging Configuration
# =============================================================================
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
import sys

handler = logging.StreamHandler(sys.stdout)  # ✅ Send logs to stdout
handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)
# =============================================================================
# Blueprint Initialization
# =============================================================================
orders_bp = Blueprint('orders_bp', __name__)

# ✅ OPTIMIZATION: Persistent PLC Connection for API endpoints
_PLC_CONNECT_TIMEOUT_MS = 2000   # snap7 connect timeout (2s instead of default ~20s)
_PLC_RECV_TIMEOUT_MS = 1500      # snap7 recv timeout
_PLC_SEND_TIMEOUT_MS = 1500      # snap7 send timeout
_PLC_RECONNECT_COOLDOWN = 10     # seconds to wait before retrying after a failed connection

class SharedPLCConnection:
    """Shared persistent PLC connection with reconnection logic and cooldown"""

    def __init__(self, ip=None, rack=None, slot=None):
        from plc_config import get_plc_config
        cfg = get_plc_config()
        self.ip = ip if ip is not None else cfg['ip']
        self.rack = rack if rack is not None else cfg['rack']
        self.slot = slot if slot is not None else cfg['slot']
        self.client = None
        self.connected = False
        self._lock = threading.Lock()  # Thread-safe
        self._last_fail_time = 0       # timestamp of last connection failure

    def get_client(self):
        """Get connected PLC client, reconnecting if needed.
        Uses a cooldown period after failures to avoid blocking eventlet."""
        with self._lock:
            # Check if connection exists and is healthy
            if self.client and self.connected:
                try:
                    # Quick health check
                    self.client.get_cpu_state()
                    return self.client
                except:
                    logger.warning("⚠️ PLC connection lost, reconnecting...")
                    self.connected = False

            # Cooldown: skip reconnect attempts if we failed recently
            import time as _time
            now = _time.time()
            if now - self._last_fail_time < _PLC_RECONNECT_COOLDOWN:
                raise ConnectionError(
                    f"PLC unreachable (cooldown {_PLC_RECONNECT_COOLDOWN}s, "
                    f"retry in {int(_PLC_RECONNECT_COOLDOWN - (now - self._last_fail_time))}s)"
                )

            # Need to (re)connect
            try:
                if self.client:
                    try:
                        self.client.disconnect()
                        self.client.destroy()
                    except:
                        pass

                self.client = snap7.client.Client()
                # Set short timeouts BEFORE connect to avoid long blocks
                try:
                    self.client.set_param(snap7.types.PingTimeout, _PLC_CONNECT_TIMEOUT_MS)
                    self.client.set_param(snap7.types.RecvTimeout, _PLC_RECV_TIMEOUT_MS)
                    self.client.set_param(snap7.types.SendTimeout, _PLC_SEND_TIMEOUT_MS)
                except Exception:
                    pass  # older snap7 versions may not support set_param
                self.client.connect(self.ip, self.rack, self.slot)
                self.connected = True
                self._last_fail_time = 0  # reset cooldown on success
                logger.info(f"✅ PLC connected (persistent): {self.ip}")
                return self.client
            except Exception as e:
                logger.error(f"❌ PLC connection failed: {e}")
                self.connected = False
                self._last_fail_time = now  # start cooldown
                raise

# Create shared PLC connection instance
shared_plc = SharedPLCConnection()

def reconnect_shared_plc(ip, rack, slot):
    """Reconnect the shared PLC connection with new config. Called when PLC settings change via API."""
    global shared_plc
    try:
        if shared_plc.client:
            try:
                shared_plc.client.disconnect()
                shared_plc.client.destroy()
            except Exception:
                pass
        shared_plc = SharedPLCConnection(ip=ip, rack=rack, slot=slot)
        logger.info(f"✅ SharedPLCConnection reconfigured: {ip} rack={rack} slot={slot}")
    except Exception as e:
        logger.error(f"❌ Failed to reconfigure SharedPLCConnection: {e}")

def connect_to_plc_fast():
    """Get persistent PLC connection (fast, no reconnect overhead). In demo mode returns emulator (same offsets)."""
    from demo_mode import get_demo_mode
    if get_demo_mode():
        from plc_data_source import get_emulator_client
        return get_emulator_client()
    return shared_plc.get_client()

@orders_bp.before_request
def skip_auth_for_power_monitor():
    from flask import request, jsonify, redirect, url_for  # ✅ Import at top
    from flask_login import current_user
    
    open_endpoints = {
        'orders_bp.get_active_bin_order_data',
        'orders_bp.read_power_monitor_data',
        'orders_bp.get_db2099_report',
        'orders_bp.read_db199_monitor',
        'orders_bp.db299_monitor',
        'orders_bp.read_db499_and_db2099_monitor',
        'orders_bp.get_fcl_latest',
        'orders_bp.get_fcl_full',
        'orders_bp.get_scl_latest',
        'orders_bp.get_scl_full',
        'orders_bp.get_latest_mila_archive',
        'orders_bp.get_all_mila_archive',
        'orders_bp.get_mila_archive_summary',
        'orders_bp.get_scl_archive_summary',
        'orders_bp.get_fcl_summary',
        'orders_bp.get_latest_10_mila_archive',
        'orders_bp.store_energy_reading',           # ✅ Energy reading storage
        'orders_bp.store_energy_readings_batch',    # ✅ Batch energy reading storage
        'orders_bp.get_energy_history'              # ✅ Energy history retrieval
    }

    if request.endpoint in open_endpoints:
        return  # Allow unauthenticated access

    if not current_user.is_authenticated:
        # Return JSON for API requests instead of redirecting
        if request.is_json or request.accept_mimetypes.accept_json or request.path.startswith('/api/'):
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Authentication required',
                'authenticated': False
            }), 401
        # Only redirect for non-API requests
        return redirect(url_for('login'))

# =============================================================================
# Database Connection & Helper Functions
# =============================================================================
def get_db_connection():
    """Same DB config as app.py and run_users_migration.py."""
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST', '127.0.0.1'),
        database=os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'Hercules'),
        port=int(os.getenv('DB_PORT', 5432))
    )
    return conn


def get_db_number_for_job_type(job_type_id):
    """Returns the dynamic DB number for a given job type id."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("SELECT db_number FROM job_types WHERE id = %s", (job_type_id,))
            result = cursor.fetchone()
            if result and "db_number" in result:
                return result['db_number']
    return None

def handle_db_errors(f):
    """Decorator to handle database and general exceptions."""
    def wrapper_func(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except psycopg2.Error as e:
            logger.error(f"Database error: {e}")
            return jsonify({'error': 'A database error occurred.'}), 500
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return jsonify({'error': 'An unexpected error occurred.'}), 500

    wrapper_func.__name__ = f.__name__
    return wrapper_func


# =============================================================================
# Energy Table Creation
# =============================================================================

def create_energy_table():
    """Create energy_readings table if it doesn't exist"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS energy_readings (
                        id SERIAL PRIMARY KEY,
                        block_name VARCHAR(10) NOT NULL,
                        total_active_energy REAL NOT NULL,
                        total_reactive_energy REAL NOT NULL,
                        total_apparent_energy REAL NOT NULL,
                        voltage_l1_l2 REAL NOT NULL,
                        effective_power REAL NOT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        CONSTRAINT check_block_name CHECK (block_name IN ('C2', 'M20', 'M21', 'M22', 'M23', 'M24'))
                    );

                    CREATE INDEX IF NOT EXISTS idx_energy_timestamp ON energy_readings(timestamp DESC);
                    CREATE INDEX IF NOT EXISTS idx_energy_block_name ON energy_readings(block_name);
                    CREATE INDEX IF NOT EXISTS idx_energy_block_timestamp ON energy_readings(block_name, timestamp DESC);
                """)
                conn.commit()

        logger.info("✅ Energy readings table created/verified successfully")

    except Exception as e:
        logger.error(f"❌ Error creating energy_readings table: {e}")


# Call this function when the blueprint is loaded
create_energy_table()


# =============================================================================
# PLC Communication – Helper Functions & Structures
# =============================================================================

# Map of allowed commands (bit positions) for the “AllowControl” structure
allow_bits_map = {
    "Start":         (0, 0),
    "Stop":          (0, 1),
    "Abort":         (0, 2),
    "Hold":          (0, 3),
    "Resume":        (0, 4),
    "Reset":         (0, 5),
    "UpdateLine":    (0, 6),
    "EnableFeeding": (0, 7),
    "NextReceiver":  (1, 0),
    "E-Stop":        (1, 1),
}

def connect_to_plc(ip_address=None, rack=None, slot=None):
    """Connect to the PLC using snap7 and return the client. In demo mode returns emulator (same offsets)."""
    from demo_mode import get_demo_mode
    if get_demo_mode():
        from plc_data_source import get_emulator_client
        return get_emulator_client()
    from plc_config import get_plc_config
    cfg = get_plc_config()
    ip_address = ip_address or cfg['ip']
    rack = rack if rack is not None else cfg['rack']
    slot = slot if slot is not None else cfg['slot']
    plc = snap7.client.Client()
    try:
        plc.connect(ip_address, rack, slot)
        if not plc.get_connected():
            raise Exception("Failed to connect to the PLC.")
    except Exception as e:
        logger.error(f"Error connecting to PLC: {e}")
        plc.destroy()
        raise
    return plc

def safe_int(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def read_allow_control_bits(db_number):
    """Reads the Hercules_AllowControl bits from the specified DB."""
    start_offset = 524 # was 552 to 524
    plc = connect_to_plc_fast()  # ✅ Use persistent connection (no disconnect needed)
    data = plc.db_read(db_number, start_offset, 2)
    result = {}
    for cmd, (byte_i, bit_i) in allow_bits_map.items():
        result[cmd] = get_bool(data, byte_i, bit_i)
    return result

def send_command_to_plc(command_name, value, db_number):
    """
    Writes the specified command bit to the PLC.
    The db_number is passed dynamically.
    """
    plc = connect_to_plc_fast()  # ✅ Use persistent connection
    command_offsets = {
        'Start':         (0, 0),
        'Stop':          (0, 1),
        'Abort':         (0, 2),
        'Hold':          (0, 3),
        'Resume':        (0, 4),
        'Reset':         (0, 5),
        'UpdateLine':    (0, 6),
        'EnableFeeding': (0, 7),
        'NextReceiver':  (1, 0),
        'E-Stop':        (1, 1),
    }
    if command_name not in command_offsets:
        raise ValueError(f"Unknown command: {command_name}")
    start_address, bit_offset = command_offsets[command_name]
    data = plc.db_read(db_number, start_address, 1)
    set_bool(data, 0, bit_offset, value)
    plc.db_write(db_number, start_address, data)
    # plc.disconnect()  # ✅ No disconnect - keeping persistent connection

def write_active_order_to_plc(order, db):
    logger.info(f"Writing ACTIVE ORDER to DB{db}")
    logger.debug(json.dumps(order, indent=2, default=str))
    plc = connect_to_plc_fast()  # ✅ Persistent connection

    if 'feeders' in order:
        # Handle feeder orders
        for i, feeder in enumerate(order.get('feeders', [])):
            offset = 2 + i * 42  # Customize offset base as needed
            write_feeder_struct(plc, db, offset, feeder)
        
        # Write KPI values if defined
        kpis = order.get('kpis', {})
        defs = order.get('kpi_definitions', [])
        if isinstance(kpis, list):
            kpis = {item['kpi_name']: item.get('value') for item in kpis}

        for k in defs:
            name = k['kpi_name']
            val = kpis.get(name, k.get('default_value', 0))
            offset = k['db_offset']
            bit_offset = k.get('bit_value', 0)
            write_kpi_to_plc(plc, db, offset, val, k['data_type'], name, bit_offset)

        # Write product and stop options
        write_product_struct(plc, db, 484, order)
        write_stop_options_struct(plc, db, 684, order.get('stop_options', {}))

    else:
        # Existing flow for normal orders
        for i in range(1, 7):
            offset = 22 + (i - 1) * 42
            dest = next((d for d in order.get('order_destinations', []) if d.get('destination_number') == i), None)
            if dest:
                write_destination_struct(plc, db, offset, dest)
            else:
                clear_destination_struct(plc, db, offset)

        for i in range(1, 6):
            offset = 254 + (i - 1) * 46
            src = next((s for s in order.get('order_sources', []) if s.get('source_number') == i), None)
            if src:
                write_source_struct(plc, db, offset, src)
            else:
                clear_source_struct(plc, db, offset)

        write_product_struct(plc, db, 484, order)
        write_stop_options_struct(plc, db, 684, order.get('stop_options', {}))

        kpis = order.get('kpis', {})
        defs = order.get('kpi_definitions', [])
        if isinstance(kpis, list):
            kpis = {item['kpi_name']: item.get('value') for item in kpis}

        for k in defs:
            name = k['kpi_name']
            val = kpis.get(name, k.get('default_value', 0))
            offset = k['db_offset']
            bit_offset = k.get('bit_value', 0)
            write_kpi_to_plc(plc, db, offset, val, k['data_type'], name, bit_offset)

    # plc.disconnect()  # ✅ No disconnect - keeping persistent connection
    logger.info(f"Finished writing ACTIVE ORDER to DB{db}")


# --- PLC Data Structure Helpers ---

def write_feeder_struct(plc, db, offset, feeder):
    logger.debug(f"Writing FEEDER at DB{db} OFFSET {offset}: {feeder}")
    
    # Activate the struct
    first_byte = plc.db_read(db, offset, 1)
    set_bool(first_byte, 0, 0, True)
    plc.db_write(db, offset, first_byte)

    # Write bin_id (INT), prd_code (INT), and prd_name (STRING)
    bin_id = safe_int(feeder.get('bin_id'))
    prd_code = safe_int(feeder.get('prd_code'))
    prd_name = feeder.get('prd_name', '')

    plc.db_write(db, offset + 2, struct.pack('<h', bin_id))         # 2 bytes
    plc.db_write(db, offset + 4, struct.pack('<i', prd_code))       # 4 bytes
    write_string_s7(plc, db, offset + 8, prd_name, 32)              # STRING[32]


def write_destination_struct(plc, db, offset, dest):
    logger.debug(f"Writing DEST at DB{db} OFFSET {offset}: {dest}")
    
    # MatCode (DInt = 4 bytes) at offset +0
    prd_code = safe_int(dest.get('prd_code'))
    plc.db_write(db, offset + 0, struct.pack('<i', prd_code))  # ✅ Correct

    # MatName (STRING[25]) at offset +4
    prd_name = dest.get('prd_name', '')
    write_string_s7(plc, db, offset + 4, prd_name, 25)         # ✅ Correct



def clear_destination_struct(plc, db, offset):
    logger.debug(f"Clearing DEST at DB{db} OFFSET {offset}")
    plc.db_write(db, offset + 0, struct.pack('<i', 0))   # Clear MatCode
    write_string_s7(plc, db, offset + 4, '', 25)          # Clear MatName
    first_byte = plc.db_read(db, offset, 1)
    set_bool(first_byte, 0, 0, False)
    plc.db_write(db, offset, first_byte)
    plc.db_write(db, offset + 2, struct.pack('>h', 0))
    plc.db_write(db, offset + 4, struct.pack('>i', 0))
    write_string_s7(plc, db, offset + 8, '', 32)

def write_source_struct(plc, db, offset, src):
    logger.debug(f"Writing SOURCE at DB{db} OFFSET {offset}: {src}")
    
    # Activate source at offset bit 0
    first_byte = plc.db_read(db, offset, 1)
    set_bool(first_byte, 0, 0, True)
    plc.db_write(db, offset, first_byte)

    # Write bin_id (2 bytes at offset +2) — little-endian
    bin_id = safe_int(src.get('bin_id'))
    plc.db_write(db, offset + 2, struct.pack('<h', bin_id))

    # Write qty_percent (float, 4 bytes at offset +4) — little-endian
    qty = float(src.get('qty_percent', 100.0))
    plc.db_write(db, offset + 4, struct.pack('<f', qty))

    # Write prd_name (STRING[25]) at offset +12
    prd_name = src.get('prd_name', '')
    write_string_s7(plc, db, offset + 12, prd_name, 32)



def clear_source_struct(plc, db, offset):
    logger.debug(f"Clearing SOURCE at DB{db} OFFSET {offset}")
    
    # Deactivate source
    first_byte = plc.db_read(db, offset, 1)
    set_bool(first_byte, 0, 0, False)
    plc.db_write(db, offset, first_byte)

    # Clear bin_id (2 bytes), qty_percent (4 bytes), prd_code (4 bytes)
    plc.db_write(db, offset + 2, struct.pack('<h', 0))     # bin_id
    plc.db_write(db, offset + 4, struct.pack('<f', 0.0))   # qty_percent
    plc.db_write(db, offset + 8, struct.pack('<i', 0))     # prd_code (if needed)

    # Clear product name
    write_string_s7(plc, db, offset + 12, '', 32)


def write_product_struct(plc, db, offset, order):
    logger.debug(f"Writing PRODUCT at DB{db} OFFSET {offset}: FinalProduct={order.get('final_product')}, RecipeName={order.get('recipe_name')}")
    plc.db_write(db, offset, struct.pack('>i', safe_int(order.get('final_product'))))
    write_string_s7(plc, db, offset + 4, order.get('recipe_name', ''), 32)
    byte = plc.db_read(db, offset + 38, 1)
    set_bool(byte, 0, 0, True)
    plc.db_write(db, offset + 38, byte)

def write_stop_options_struct(plc, db, offset, opts):
    logger.debug(f"Writing STOP OPTIONS at DB{db} OFFSET {offset}: {opts}")
    b = plc.db_read(db, offset, 1)
    set_bool(b, 0, 0, opts.get('job_qty', False))
    set_bool(b, 0, 1, opts.get('full_dest', False))
    set_bool(b, 0, 2, opts.get('empty_source', False))
    set_bool(b, 0, 3, opts.get('held_status', False))
    plc.db_write(db, offset, b)
    plc.db_write(db, offset + 2, struct.pack('>i', safe_int(opts.get('held_status_delay'))))
    plc.db_write(db, offset + 6, struct.pack('>i', safe_int(opts.get('auto_stop_delay'))))

def write_kpi_to_plc(plc, db, offset, value, dtype, name, bit_offset=0):
    try:
        logger.debug(f"Writing KPI '{name}' to DB{db} OFFSET {offset} BIT {bit_offset}: {value} ({dtype})")
        if dtype == 'integer':
            plc.db_write(db, offset, struct.pack('>i', int(value)))
        elif dtype == 'float':
            plc.db_write(db, offset, struct.pack('>f', float(value)))
        elif dtype == 'boolean':
            b = plc.db_read(db, offset, 1)
            set_bool(b, 0, bit_offset, bool(value))
            plc.db_write(db, offset, b)
        elif dtype == 'string':
            write_string_s7(plc, db, offset, str(value), 32)
        else:
            logger.error(f"Unsupported KPI data type: {dtype} for {name}")
    except Exception as e:
        logger.error(f"KPI write error for {name} at offset {offset}: {e}")

def write_string_s7(plc, db, offset, value, max_len):
    total_len = max_len + 2
    data = bytearray(total_len)
    data[0] = max_len
    encoded = value.encode('ascii', 'ignore')[:max_len]
    data[1] = len(encoded)
    data[2:2+len(encoded)] = encoded
    logger.debug(f"Writing STRING to DB{db} OFFSET {offset}: '{value}'")
    plc.db_write(db, offset, data)

def read_kpi_from_plc(plc, db_number, offset, data_type, kpi_name):
    try:
        if data_type == 'integer':
            data_bytes = plc.db_read(db_number, offset, 4)
            value = struct.unpack('>i', data_bytes)[0]
            return value
        elif data_type == 'float':
            data_bytes = plc.db_read(db_number, offset, 4)
            value = struct.unpack('>f', data_bytes)[0]
            return value
        elif data_type == 'boolean':
            data_bytes = plc.db_read(db_number, offset, 1)
            return data_bytes[0] != 0
        elif data_type == 'string':
            max_length = 32
            total_length = max_length + 2
            data_bytes = plc.db_read(db_number, offset, total_length)
            actual_length = data_bytes[1]
            return data_bytes[2:2+actual_length].decode('ascii', errors='ignore')
        else:
            logger.error(f"Unsupported data type for reading KPI: {data_type}")
            return None
    except Exception as e:
        logger.error(f"Error reading KPI '{kpi_name}' from PLC: {e}")
        return None
    
def generate_power_tags():
    base_tags = [
        {"block": "C2", "tag": "L1_Current", "offset": 20, "type": "REAL"},
        {"block": "C2", "tag": "L1_Voltage", "offset": 32, "type": "REAL"},
        {"block": "C2", "tag": "L2_Current", "offset": 148, "type": "REAL"},
        {"block": "C2", "tag": "L2_Voltage", "offset": 160, "type": "REAL"},
        {"block": "C2", "tag": "L3_Current", "offset": 276, "type": "REAL"},
        {"block": "C2", "tag": "L3_Voltage", "offset": 288, "type": "REAL"},
        {"block": "C2", "tag": "EffectivePower", "offset": 392, "type": "REAL"},
        {"block": "C2", "tag": "ApparentPower", "offset": 396, "type": "REAL"},
        {"block": "C2", "tag": "ReactivePower", "offset": 400, "type": "REAL"},
        {"block": "C2", "tag": "OutCosPhi", "offset": 404, "type": "REAL"},
        {"block": "C2", "tag": "Total_Active_Energy", "offset": 408, "type": "DINT", "scale": 0.01},
        {"block": "C2", "tag": "Total_Reactive_Energy", "offset": 412, "type": "DINT", "scale": 0.01},
        {"block": "C2", "tag": "Total_Apparent_Energy", "offset": 416, "type": "DINT", "scale": 0.01}
    ]

    # Correct base offsets for M-blocks
    m_blocks = {"M20": 564, "M21": 1108, "M22": 1652, "M23": 2196, "M24": 2740}

    # Adjusted relative offsets
    step_offsets = {
        "L1_Current": 0,
        "L1_Voltage": 12,
        "L2_Current": 128,
        "L2_Voltage": 140,
        "L3_Current": 256,
        "L3_Voltage": 268,
        "EffectivePower": 372,
        "ApparentPower": 376,
        "ReactivePower": 380,
        "OutCosPhi": 384,
        "Total_Active_Energy": 388,
        "Total_Reactive_Energy": 392,
        "Total_Apparent_Energy": 396
    }

    for block, base in m_blocks.items():
        for tag, offset in step_offsets.items():
            base_tags.append({
                "block": block,
                "tag": tag,
                "offset": base + offset,
                "type": "DINT" if "Energy" in tag else "REAL",
                "scale": 0.01 if "Energy" in tag else 1.0
            })

    return base_tags



# =============================================================================
# REST API Endpoints
# =============================================================================
@orders_bp.route('/read-power-monitor', methods=['GET'])
def read_power_monitor_data():
    def unpack_value(raw, dtype):
        if dtype == 'REAL':
            return struct.unpack('>f', raw)[0]
        elif dtype == 'DINT':
            return struct.unpack('>i', raw)[0]
        else:
            raise ValueError(f"Unsupported type: {dtype}")

    try:
        plc = connect_to_plc_fast()  # ✅ Persistent connection
        db_number = 1603  # Fixed DB number for power monitor
        tag_map = generate_power_tags()
        result = {}

        for tag in tag_map:
            tag_name = tag['tag']
            block = tag['block']
            full_tag = f"{block}.LGEN_{tag_name}" if any(x in tag_name for x in ["Power", "Energy", "CosPhi"]) else f"{block}.{tag_name}"

            try:
                raw = plc.db_read(db_number, tag['offset'], 4)
                value = unpack_value(raw, tag['type'])
                scale = tag.get('scale', 1.0)
                value = round(value * scale, 3)
            except Exception as e:
                value = f"Error: {e}"

            result[full_tag] = value

        # plc.disconnect()  # ✅ No disconnect - keeping persistent connection
        return jsonify({"status": "success", "data": result}), 200

    except Exception as e:
        logger.error(f"Error in read-power-monitor: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@orders_bp.route('/order-management', methods=['GET'])
def order_management():
    return render_template('test_blueprint.html')

@orders_bp.route('/get-job-types', methods=['GET'])
@handle_db_errors
def get_job_types():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("SELECT id, name FROM job_types")
            job_types = cursor.fetchall()
            return jsonify(job_types)

@orders_bp.route('/job-types/<int:job_type_id>/recipes', methods=['GET'])
@handle_db_errors
def get_recipes(job_type_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("SELECT id, name FROM recipes WHERE job_type_id = %s", (job_type_id,))
            recipes = cursor.fetchall()
            return jsonify(recipes)

@orders_bp.route('/get-recipe-details/<int:recipe_id>', methods=['GET'])
@handle_db_errors
def get_recipe_details(recipe_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                SELECT r.*, jt.name AS job_type_name, jt.id AS job_type_id
                FROM recipes r
                JOIN job_types jt ON r.job_type_id = jt.id
                WHERE r.id = %s
            """, (recipe_id,))
            recipe = cursor.fetchone()
            if not recipe:
                return jsonify({'error': 'Recipe not found'}), 404
            for key in ['kpis', 'sources', 'destinations', 'stop_options']:
                if isinstance(recipe.get(key), str):
                    try:
                        recipe[key] = json.loads(recipe[key])
                    except Exception:
                        recipe[key] = {}
            return jsonify({
                'kpi_definitions': recipe.get('kpi_definitions', []),
                'kpis': recipe.get('kpis', {}),
                'sources': recipe.get('sources', []),
                'destinations': recipe.get('destinations', []),
                'stop_options': recipe.get('stop_options', {}),
                'finalProduct': recipe.get('final_product_id'),
                'job_type_id': recipe.get('job_type_id'),
                'job_type_name': recipe.get('job_type_name')
            })

@orders_bp.route('/get-orders', methods=['GET'])
@handle_db_errors
def get_orders():
    job_type_id = request.args.get('job_type')
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            if job_type_id:
                cursor.execute("""
                    SELECT o.id, jt.name as job_type, r.name as recipe_name, o.status, o.created_at
                    FROM orders o
                    JOIN recipes r ON o.recipe_id = r.id
                    JOIN job_types jt ON o.job_type_id = jt.id
                    WHERE o.job_type_id = %s
                """, (job_type_id,))
            else:
                cursor.execute("""
                    SELECT o.id, jt.name as job_type, r.name as recipe_name, o.status, o.created_at
                    FROM orders o
                    JOIN recipes r ON o.recipe_id = r.id
                    JOIN job_types jt ON o.job_type_id = jt.id
                """)
            orders = cursor.fetchall()
            for order in orders:
                if order.get('created_at'):
                    order['created_at'] = order['created_at'].isoformat()
            return jsonify(orders)

@orders_bp.route('/get-order-details/<int:order_id>', methods=['GET'])
@handle_db_errors
def get_order_details(order_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                SELECT o.*, r.name AS recipe_name, r.final_product_id,
                       jt.id AS job_type_id, jt.name AS job_type_name
                FROM orders o
                JOIN recipes r ON o.recipe_id = r.id
                JOIN job_types jt ON r.job_type_id = jt.id
                WHERE o.id = %s
            """, (order_id,))
            order = cursor.fetchone()
            if not order:
                return jsonify({'error': 'Order not found'}), 404

            for key in ['kpis', 'order_sources', 'order_destinations', 'stop_options']:
                if isinstance(order.get(key), str):
                    try:
                        order[key] = json.loads(order[key])
                    except Exception:
                        order[key] = {}

            return jsonify({
                'id': order.get('id'),
                'recipe_name': order.get('recipe_name'),
                'kpi_definitions': order.get('kpi_definitions', []),
                'kpis': order.get('kpis', {}),
                'sources': order.get('order_sources', []),
                'destinations': order.get('order_destinations', []),
                'finalProduct': order.get('final_product_id'),
                'stop_options': order.get('stop_options', {}),
                'job_type_id': order.get('job_type_id'),
                'job_type_name': order.get('job_type_name')  # ✅ Included here
            })

@orders_bp.route('/submit-order', methods=['POST'])
@handle_db_errors
def submit_order():
    data = request.get_json()
    job_type_id = data.get('job_type_id')
    recipe_id = data.get('recipe_id')
    order_name = data.get('order_name', 'Order')
    kpis = data.get('kpis', {})
    sources = data.get('sources', [])
    destinations = data.get('destinations', [])
    stop_options = data.get('stop_options', {})
    if not recipe_id or not job_type_id:
        return jsonify({'error': 'Invalid order data'}), 400
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            for s in sources:
                bin_id = s.get('bin_id')
                if bin_id:
                    cursor.execute("""
                        SELECT m.material_name, m.material_code
                        FROM bins b
                        JOIN materials m ON b.material_id = m.id
                        WHERE b.id = %s
                    """, (bin_id,))
                    row = cursor.fetchone()
                    if row:
                        s['prd_name'] = row.get('material_name')
                        try:
                            s['prd_code'] = int(row.get('material_code', 0))
                        except Exception:
                            s['prd_code'] = 0
                    else:
                        s['prd_name'] = 'UNKNOWN'
                        s['prd_code'] = 0
            for d in destinations:
                bin_id = d.get('bin_id')
                if bin_id:
                    cursor.execute("""
                        SELECT m.material_name, m.material_code
                        FROM bins b
                        JOIN materials m ON b.material_id = m.id
                        WHERE b.id = %s
                    """, (bin_id,))
                    row = cursor.fetchone()
                    if row:
                        d['prd_name'] = row.get('material_name')
                        try:
                            d['prd_code'] = int(row.get('material_code', 0))
                        except Exception:
                            d['prd_code'] = 0
                    else:
                        d['prd_name'] = 'UNKNOWN'
                        d['prd_code'] = 0
            cursor.execute("""
                INSERT INTO orders (
                    job_type_id, recipe_id, order_name,
                    kpis, order_sources, order_destinations,
                    stop_options, status
                )
                VALUES (
                    %s, %s, %s,
                    %s::jsonb, %s::jsonb, %s::jsonb,
                    %s::jsonb, 'idle'
                )
                RETURNING id
            """, (
                job_type_id,
                recipe_id,
                order_name,
                json.dumps(kpis),
                json.dumps(sources),
                json.dumps(destinations),
                json.dumps(stop_options)
            ))
            order_id = cursor.fetchone()['id']
            conn.commit()
    return jsonify({'message': 'Order submitted successfully', 'order_id': order_id}), 200

@orders_bp.route('/update-order/<int:order_id>', methods=['POST'])
@handle_db_errors
def update_order(order_id):
    data = request.get_json()
    kpis = data.get('kpis', {})
    sources = data.get('sources', [])
    destinations = data.get('destinations', [])
    stop_options = data.get('stop_options', {})
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                UPDATE orders
                SET kpis = %s::jsonb, order_sources = %s::jsonb, order_destinations = %s::jsonb, stop_options = %s::jsonb
                WHERE id = %s
            """, (
                json.dumps(kpis),
                json.dumps(sources),
                json.dumps(destinations),
                json.dumps(stop_options),
                order_id
            ))
            conn.commit()
    return jsonify({'message': 'Order updated successfully'}), 200

@orders_bp.route('/duplicate-order/<int:order_id>', methods=['POST'])
@handle_db_errors
def duplicate_order(order_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cursor:
            cursor.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
            order = cursor.fetchone()
            if not order:
                return jsonify({'error': 'Order not found'}), 404
            cursor.execute("""
                INSERT INTO orders (job_type_id, recipe_id, order_name, kpis, order_sources, order_destinations, stop_options, status)
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, 'idle')
                RETURNING id
            """, (
                order['job_type_id'],
                order['recipe_id'],
                order['order_name'] + ' Copy',
                json.dumps(order['kpis']),
                json.dumps(order['order_sources']),
                json.dumps(order['order_destinations']),
                json.dumps(order['stop_options'])
            ))
            new_order_id = cursor.fetchone()[0]
            conn.commit()
    return jsonify({'message': 'Order duplicated successfully', 'new_order_id': new_order_id}), 200

@orders_bp.route('/delete-order/<int:order_id>', methods=['DELETE'])
@handle_db_errors
def delete_order(order_id):
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM orders WHERE id = %s", (order_id,))
            conn.commit()
    return jsonify({'message': 'Order deleted successfully'}), 200

@orders_bp.route('/bins/material/<int:material_id>', methods=['GET'])
@handle_db_errors
def get_bins_for_material(material_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                SELECT id AS bin_id, bin_name
                FROM bins
                WHERE material_id = %s
            """, (material_id,))
            bins = cursor.fetchall()
            if bins:
                return jsonify(bins)
            else:
                return jsonify({'error': 'No bins found for the selected material'}), 404
@orders_bp.route('/release-order/<int:order_id>', methods=['POST'])
@handle_db_errors
def release_order(order_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            # Fetch clicked order's current status and job type
            cursor.execute("SELECT job_type_id, status FROM orders WHERE id = %s", (order_id,))
            order_data = cursor.fetchone()
            if not order_data:
                return jsonify({'error': 'Order not found'}), 404

            job_type_id = order_data['job_type_id']
            current_status = order_data['status']
            db_number = get_db_number_for_job_type(job_type_id)

            if db_number is None:
                return jsonify({'error': 'Invalid job type DB mapping'}), 500

            # Case 1: If it's currently active → make it idle
            if current_status == 'active':
                cursor.execute("""
                    UPDATE orders
                    SET status = 'idle', released_at = NULL
                    WHERE id = %s
                """, (order_id,))
                conn.commit()
                return jsonify({'message': 'Order set to idle', 'status': 'idle'}), 200

            # Case 2: If it's queued → make it idle
            if current_status == 'queued':
                cursor.execute("""
                    UPDATE orders
                    SET status = 'idle', released_at = NULL
                    WHERE id = %s
                """, (order_id,))
                conn.commit()
                return jsonify({'message': 'Queued order cancelled and set to idle', 'status': 'idle'}), 200

            # Case 3: If it's idle → make it active, and demote any active one to queued
            if current_status == 'idle':
                # Demote any currently active order for this job type to queued
                cursor.execute("""
                    UPDATE orders
                    SET status = 'queued', released_at = NOW()
                    WHERE status = 'active' AND job_type_id = %s
                """, (job_type_id,))

                # Promote this order to active
                cursor.execute("""
                    UPDATE orders
                    SET status = 'active', released_at = NOW()
                    WHERE id = %s
                """, (order_id,))
                conn.commit()

                # Optionally: Push this order to PLC (same as before)
                # Fetch order & write logic (unchanged)
                # ...
                
                return jsonify({'message': 'Order activated', 'status': 'active'}), 200

            return jsonify({'message': 'No action taken'}), 200


@orders_bp.route('/cancel-active-order', methods=['POST'])
@handle_db_errors
def cancel_active_order():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("""
                UPDATE orders
                SET status = %s, released_at = NULL
                WHERE status = %s
            """, ('idle', 'active'))
            cursor.execute("""
                SELECT id FROM orders
                WHERE status = %s
                ORDER BY released_at ASC
                LIMIT 1
            """, ('queued',))
            next_queued_order = cursor.fetchone()
            if next_queued_order:
                next_order_id = next_queued_order['id']
                cursor.execute("""
                    UPDATE orders
                    SET status = %s, released_at = NOW()
                    WHERE id = %s
                """, ('active', next_order_id))
                conn.commit()
                cursor.execute("""
                    SELECT o.*, r.name AS recipe_name, r.final_product_id, jt.id AS job_type_id
                    FROM orders o
                    JOIN recipes r ON o.recipe_id = r.id
                    JOIN job_types jt ON r.job_type_id = jt.id
                    WHERE o.id = %s
                """, (next_order_id,))
                active_order = cursor.fetchone()
                if active_order:
                    cursor.execute("""
                        SELECT kpi_name, data_type, default_value, db_offset
                        FROM kpi_definitions
                        WHERE job_type_id = %s
                    """, (active_order['job_type_id'],))
                    kpi_definitions = cursor.fetchall()
                    active_order['kpi_definitions'] = kpi_definitions
                    db_number = get_db_number_for_job_type(active_order['job_type_id']) 
                    write_active_order_to_plc(active_order, db_number)
                else:
                    logger.error(f"Active order with ID {next_order_id} not found after activation.")
            else:
                logger.info("No queued order to activate.")
            conn.commit()
    return jsonify({'message': 'Active order canceled, and next queued order (if any) is now active'}), 200
@orders_bp.route('/get-active-order', methods=['GET'])
@handle_db_errors
def get_active_order():
    job_type_id = request.args.get('job_type_id', type=int)
    if job_type_id is None:
        return jsonify({'error': 'job_type_id parameter is required'}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:

                # 1) Fetch the active order from the orders table
                cursor.execute("""
                    SELECT o.*, r.name AS recipe_name, r.final_product_id,
                           jt.id AS job_type_id, jt.name AS job_type_name
                    FROM orders o
                    JOIN recipes r ON o.recipe_id = r.id
                    JOIN job_types jt ON r.job_type_id = jt.id
                    WHERE o.status = %s
                      AND jt.id = %s
                """, ('active', job_type_id))
                active_order = cursor.fetchone()

                if not active_order:
                    return jsonify({'error': 'No active order found for this job type'}), 404

                # 2) Fetch KPI definitions (including read_write)
                cursor.execute("""
                    SELECT kpi_name, data_type, default_value, db_offset, read_write
                    FROM kpi_definitions
                    WHERE job_type_id = %s
                """, (active_order['job_type_id'],))
                kpi_definitions = cursor.fetchall()

                # Strip whitespace from each KPI name
                for kd in kpi_definitions:
                    if kd['kpi_name']:
                        kd['kpi_name'] = kd['kpi_name'].strip()

                # 3) Fetch all bin names in a dictionary for quick lookup
                cursor.execute("SELECT id, bin_name FROM bins")
                bin_name_map = {bin['id']: bin['bin_name'] for bin in cursor.fetchall()}

                # 4) Extract Sources from Active Order JSON
                sources = active_order.get('order_sources', [])
                formatted_sources = []
                for src in sources:
                    bin_id = src.get('bin_id', 'N/A')
                    bin_name = bin_name_map.get(bin_id, 'Unknown')  # Get bin name using bin_id
                    formatted_sources.append({
                        'bin_id': bin_id,
                        'source_number': src.get('source_number', 'N/A'),
                        'prd_code': src.get('prd_code', 'N/A'),
                        'prd_name': src.get('prd_name', 'Unknown'),
                        'bin_name': bin_name  # Include bin name for sources
                    })

                # 5) Extract Destinations from Active Order JSON
                destinations = active_order.get('order_destinations', [])
                formatted_destinations = []
                for dest in destinations:
                    bin_id = dest.get('bin_id', 'N/A')
                    bin_name = bin_name_map.get(bin_id, 'Unknown')  # Get bin name using bin_id
                    formatted_destinations.append({
                        'bin_id': bin_id,
                        'destination_number': dest.get('destination_number', 'N/A'),
                        'prd_code': dest.get('prd_code', 'N/A'),
                        'prd_name': dest.get('prd_name', 'Unknown'),
                        'bin_name': bin_name  # Include bin name for destinations
                    })

                # 6) Parse JSON fields (kpis, stop_options)
                for key in ['kpis', 'stop_options']:
                    if isinstance(active_order.get(key), str):
                        try:
                            active_order[key] = json.loads(active_order[key])
                        except Exception:
                            active_order[key] = {}

                # 7) Convert KPIs to dictionary format
                if isinstance(active_order.get('kpis'), list):
                    active_order['kpis'] = {
                        item.get('kpi_name', '').strip(): item
                        for item in active_order['kpis']
                        if item.get('kpi_name')
                    }

                # 8) Build final response
                response_data = {
                    'id': active_order.get('id'),
                    'recipe_name': active_order.get('recipe_name'),
                    'kpi_definitions': kpi_definitions,
                    'kpis': active_order.get('kpis', {}),
                    'sources': formatted_sources,
                    'destinations': formatted_destinations,
                    'finalProduct': active_order.get('final_product_id'),
                    'stop_options': active_order.get('stop_options', {}),
                    'status': active_order.get('status'),
                    'created_at': (
                        active_order['created_at'].isoformat()
                        if active_order.get('created_at') else None
                    ),
                    'job_type': active_order.get('job_type_name')
                }

                return jsonify(response_data), 200

    except Exception as e:
        print(f"Unhandled error in get_active_order: {e}")
        return jsonify({'error': 'Internal Server Error', 'message': str(e)}), 500


@orders_bp.route('/send-command', methods=['POST'])
def send_command():
    try:
        data = request.json
        command_name = data.get('command')
        job_type_id = data.get('job_type_id')

        if not command_name:
            return jsonify({'success': False, 'error': 'No command provided'}), 400
        if job_type_id is None:
            return jsonify({'success': False, 'error': 'No job_type_id provided'}), 400

        # ✅ Fetch correct DB number for job_type
        db_number = get_db_number_for_job_type(job_type_id)
        if db_number is None:
            return jsonify({'success': False, 'error': 'Invalid job_type_id or missing DB mapping'}), 400

        allow_bits = read_allow_control_bits(db_number)
        if command_name not in allow_bits:
            return jsonify({'success': False, 'error': f'Unknown command: {command_name}'}), 400
        if not allow_bits[command_name]:
            return jsonify({'success': False, 'error': f'{command_name} not currently allowed by PLC.'}), 403

        send_command_to_plc(command_name, True, db_number)
        threading.Timer(1.0, send_command_to_plc, args=(command_name, False, db_number)).start()

        return jsonify({'success': True, 'message': f'{command_name} command sent to PLC'}), 200

    except Exception as e:
        logger.error(f"Error sending command to PLC: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500




@orders_bp.route('/plc-monitor', methods=['GET'])
def read_plc_monitor():
    try:
        # Optionally, a job_type_id may be provided to get the dynamic DB number
        job_type_id = request.args.get('job_type_id', type=int)
        db_number = get_db_number_for_job_type(job_type_id) 
        plc = connect_to_plc_fast()  # ✅ Persistent connection
        # 1) Read AllowControl bits
        allow_data = plc.db_read(db_number, 524, 2) # from 552 to 524
        allow_bits = {}
        for cmd, (byte_i, bit_i) in allow_bits_map.items():
            allow_bits[cmd] = get_bool(allow_data, byte_i, bit_i)
        # 2) Read Run/Idle bits at DBX554
        run_idle_data = plc.db_read(db_number, 526, 1) # from 554 to 526
        run_bit = get_bool(run_idle_data, 0, 0)
        idle_bit = get_bool(run_idle_data, 0, 1)
        # 3) Read Active Destination struct
        dest_no_bytes = plc.db_read(db_number, 528, 2) # from 556 to 528
        dest_no = struct.unpack('>h', dest_no_bytes)[0]
        dest_bin_id_bytes = plc.db_read(db_number, 530, 2) # from 558 to 530
        dest_bin_id = struct.unpack('>h', dest_bin_id_bytes)[0]
        prd_code_bytes = plc.db_read(db_number, 532, 4) # from 560 to 532
        active_dest_prd_code = struct.unpack('>i', prd_code_bytes)[0]
        # 4) Read WaterConsumed & ProducedWeight
        
        wc_bytes = plc.db_read(db_number, 564, 4)
        water_consumed = struct.unpack('>f', wc_bytes)[0]

        pw_bytes = plc.db_read(db_number, 568, 4)
        produced_weight = struct.unpack('>f', pw_bytes)[0]
        ## Note KPI to be fixed Dynamic not Static, @Imroz
        
        ##

        # 5) Read Active Sources (assumed 5 sources with known offsets)
        sources_data = []
        base_offsets = [563, 525, 568, 584, 600]  # was 572, 588, 604, 620, 636
        for i, base in enumerate(base_offsets, start=1):
            active_byte = plc.db_read(db_number, base, 1)
            source_active = get_bool(active_byte, 0, 0)
            bin_id_bytes = plc.db_read(db_number, base+2, 2)
            bin_id_val = struct.unpack('>h', bin_id_bytes)[0]
            qty_percent_bytes = plc.db_read(db_number, base+4, 4)
            qty_percent_val = struct.unpack('>f', qty_percent_bytes)[0]
            produced_qty_bytes = plc.db_read(db_number, base+8, 4)
            produced_qty_val = struct.unpack('>f', produced_qty_bytes)[0]
            prd_code_bytes = plc.db_read(db_number, base+12, 4)
            prd_code_val = struct.unpack('>i', prd_code_bytes)[0]
            sources_data.append({
                'source_index': i,
                'active': source_active,
                'bin_id': bin_id_val,
                'qty_percent': qty_percent_val,
                'produced_qty': produced_qty_val,
                'prd_code': prd_code_val
            })
        # 6) Read OS_Comment (Siemens string)
        comment_data = plc.db_read(db_number, 616, 66) # 652 to 616
        max_len = comment_data[0]
        actual_len = comment_data[1]
        os_comment = comment_data[2:2+actual_len].decode('ascii', errors='ignore') if actual_len <= max_len else ''
        # 7) Read JobStatus.Code (INT)
        job_code_bytes = plc.db_read(db_number, 682, 2) #from 718 to 682
        job_code = struct.unpack('>h', job_code_bytes)[0]
        # plc.disconnect()  # ✅ No disconnect - keeping persistent connection
        response = {
            "allowControl": allow_bits,
            "Run": run_bit,
            "Idle": idle_bit,
            "ActiveDest": {
                "dest_no": dest_no,
                "dest_bin_id": dest_bin_id,
                "prd_code": active_dest_prd_code,
            },
            "WaterConsumed": water_consumed,
            "ProducedWeight": produced_weight,
            "ActiveSources": sources_data,
            "OS_Comment": os_comment,
            "JobStatusCode": job_code,
        }
        logger.info(f"... read_plc_monitor => {json.dumps(response, indent=2)}")
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error reading PLC monitor data: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@orders_bp.route('/read-active-kpis', methods=['GET'])
def read_active_kpis():
    try:
        job_type_id = request.args.get('job_type_id', type=int)
        if not job_type_id:
            return jsonify({'error': 'job_type_id is required'}), 400
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT id
                    FROM orders
                    WHERE job_type_id = %s
                      AND status = 'active'
                    LIMIT 1
                """, (job_type_id,))
                active_order = cursor.fetchone()
                if not active_order:
                    return jsonify({'error': 'No active order found for this job type'}), 404
                order_id = active_order['id']
                cursor.execute("""
                    SELECT kpi_name, data_type, db_offset
                    FROM kpi_definitions
                    WHERE job_type_id = %s
                      AND read_write = 'R'
                """, (job_type_id,))
                kpi_defs = cursor.fetchall()
                logger.info(f"Found R-type KPI defs: {kpi_defs}")
        plc = connect_to_plc_fast()  # ✅ Persistent connection
        db_number = get_db_number_for_job_type(job_type_id)
        kpi_results = []
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                for kd in kpi_defs:
                    kpi_name  = kd['kpi_name']
                    data_type = kd['data_type']
                    offset    = kd.get('db_offset')
                    if offset is None:
                        continue
                    value = read_kpi_from_plc(plc, db_number, offset, data_type, kpi_name)
                    cursor.execute("""
                        INSERT INTO kpi_readings (order_id, kpi_name, kpi_value, data_type, db_offset)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (order_id, kpi_name, str(value), data_type, offset))
                    kpi_results.append({
                        'kpi_name':  kpi_name,
                        'value':     value,
                        'data_type': data_type,
                        'offset':    offset
                    })
                conn.commit()
        # plc.disconnect()  # ✅ No disconnect - keeping persistent connection
        return jsonify({'order_id': order_id, 'kpis': kpi_results}), 200
    except Exception as e:
        logger.error(f"Error in read_active_kpis: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


# ----------------------------------------------------Feeder Order APIs--------------------------------------------------

@orders_bp.route('/feeder-orders/create', methods=['POST'])
@handle_db_errors
def create_feeder_order():
    data = request.get_json()
    job_type_id = data['jobTypeId']
    recipe_id = data['recipeId']
    order_name = data['orderName']
    kpis = data.get('kpis', [])
    feeders = data.get('feeders', [])
    stop_options = data.get('stopOptions', {})

    # Enrich feeders with material_name from DB
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Build material map from DB
        cursor.execute("SELECT id, material_name FROM materials")
        material_map = {row['id']: row['material_name'] for row in cursor.fetchall()}

        enriched_feeders = []
        for feeder in feeders:
            material_id = feeder.get('material_id')
            material_name = feeder.get('material_name') or material_map.get(material_id, 'Unnamed')
            enriched_feeders.append({
                **feeder,
                'material_id': material_id,
                'material_name': material_name
            })

        # Insert enriched order
        cursor.execute('''
            INSERT INTO feeder_orders (
                job_type_id, recipe_id, order_name, kpis, feeders, stop_options
            ) VALUES (
                %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb
            )
            RETURNING id
        ''', (
            job_type_id, recipe_id, order_name,
            json.dumps(kpis), json.dumps(enriched_feeders), json.dumps(stop_options)
        ))
        order_id = cursor.fetchone()['id']
        conn.commit()

    return jsonify({'status': 'success', 'orderId': order_id}), 201



@orders_bp.route('/feeder-orders/details/<int:order_id>', methods=['GET'])
@handle_db_errors
def get_feeder_order_details(order_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute('''
            SELECT fo.*, fr.name AS recipe_name
            FROM feeder_orders fo
            JOIN feeder_recipes fr ON fo.recipe_id = fr.id
            WHERE fo.id = %s
        ''', (order_id,))
        order = cursor.fetchone()
        if order:
            return jsonify(order)
        return jsonify({'error': 'Order not found'}), 404


@orders_bp.route('/feeder-orders/release/<int:order_id>', methods=['POST'])
@handle_db_errors
def release_feeder_order(order_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # 1. Fetch the order
        cursor.execute('''
            SELECT fo.*, fr.name AS recipe_name
            FROM feeder_orders fo
            JOIN feeder_recipes fr ON fo.recipe_id = fr.id
            WHERE fo.id = %s
        ''', (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        job_type_id = order['job_type_id']
        current_status = order['status']

        # 2. Get DB number
        cursor.execute('SELECT db_number FROM job_types WHERE id = %s', (job_type_id,))
        db_info = cursor.fetchone()
        if not db_info:
            return jsonify({'error': 'DB number not found'}), 500
        db_number = db_info['db_number']

        # 3. Toggle logic
        if current_status == 'active':
            # Deactivate (set to idle)
            cursor.execute('''
                UPDATE feeder_orders
                SET status = 'idle', released_at = NULL
                WHERE id = %s
            ''', (order_id,))
            conn.commit()
            return jsonify({'message': 'Order set to idle', 'status': 'idle'}), 200

        elif current_status == 'queued':
            # Cancel queued order
            cursor.execute('''
                UPDATE feeder_orders
                SET status = 'idle', released_at = NULL
                WHERE id = %s
            ''', (order_id,))
            conn.commit()
            return jsonify({'message': 'Queued order cancelled', 'status': 'idle'}), 200

        elif current_status == 'idle':
            # Demote any active order of same job type to queued
            cursor.execute('''
                UPDATE feeder_orders
                SET status = 'queued', released_at = NOW()
                WHERE status = 'active' AND job_type_id = %s
            ''', (job_type_id,))

            # Activate selected order
            cursor.execute('''
                UPDATE feeder_orders
                SET status = 'active', released_at = NOW()
                WHERE id = %s
            ''', (order_id,))
            conn.commit()

            # Write to PLC only after activation
            write_active_order_to_plc({
                'feeders': order['feeders'],
                'kpi_definitions': [],  # You may update this
                'kpis': order['kpis'],
                'final_product': order['recipe_id'],
                'recipe_name': order['recipe_name'],
                'stop_options': order['stop_options']
            }, db_number)

            return jsonify({'message': 'Order activated', 'status': 'active'}), 200

        return jsonify({'message': 'No action taken'}), 200


@orders_bp.route('/feeder-orders', methods=['GET'])
@handle_db_errors
def list_feeder_orders():
    job_type_id = request.args.get('job_type', type=int)
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        if job_type_id:
            cursor.execute('''
                SELECT fo.id, fo.order_name, fr.name as recipe_name, fr.job_type_id, fo.status, fo.created_at
                FROM feeder_orders fo
                JOIN feeder_recipes fr ON fo.recipe_id = fr.id
                WHERE fr.job_type_id = %s
            ''', (job_type_id,))
        else:
            cursor.execute('''
                SELECT fo.id, fo.order_name, fr.name as recipe_name, fr.job_type_id, fo.status, fo.created_at
                FROM feeder_orders fo
                JOIN feeder_recipes fr ON fo.recipe_id = fr.id
            ''')

        orders = cursor.fetchall()
        for order in orders:
            if order.get('created_at'):
                order['created_at'] = order['created_at'].isoformat()

        return jsonify(orders)



@orders_bp.route('/feeder-orders/update/<int:order_id>', methods=['POST'])
@handle_db_errors
def update_feeder_order(order_id):
    data = request.get_json()
    kpis = data.get('kpis', [])
    feeders = data.get('feeders', [])
    stop_options = data.get('stopOptions', {})

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE feeder_orders
            SET kpis = %s::jsonb,
                feeders = %s::jsonb,
                stop_options = %s::jsonb
            WHERE id = %s
        ''', (
            json.dumps(kpis),
            json.dumps(feeders),
            json.dumps(stop_options),
            order_id
        ))
        conn.commit()

    return jsonify({'status': 'updated'}), 200


@orders_bp.route('/feeder-orders/duplicate/<int:order_id>', methods=['POST'])
@handle_db_errors
def duplicate_feeder_order(order_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("SELECT * FROM feeder_orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        cursor.execute('''
            INSERT INTO feeder_orders (job_type_id, recipe_id, order_name, kpis, feeders, stop_options, status)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, 'idle')
            RETURNING id
        ''', (
            order['job_type_id'],
            order['recipe_id'],
            order['order_name'] + ' Copy',
            json.dumps(order['kpis']),
            json.dumps(order['feeders']),
            json.dumps(order['stop_options'])
        ))
        new_order_id = cursor.fetchone()['id']
        conn.commit()

    return jsonify({'message': 'Feeder order duplicated', 'new_order_id': new_order_id}), 200


@orders_bp.route('/feeder-orders/delete/<int:order_id>', methods=['DELETE'])
@handle_db_errors
def delete_feeder_order(order_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM feeder_orders WHERE id = %s", (order_id,))
        conn.commit()

    return jsonify({'message': 'Feeder order deleted'}), 200

@orders_bp.route('/get-feeder-active-order', methods=['GET'])
@handle_db_errors
def get_feeder_active_order():
    job_type_id = request.args.get('job_type_id', type=int)
    if job_type_id is None:
        return jsonify({'error': 'job_type_id parameter is required'}), 400

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # 1. Fetch active feeder order
        cursor.execute("""
            SELECT f.*, r.name AS recipe_name, r.job_type_id, jt.name AS job_type_name
            FROM feeder_orders f
            JOIN feeder_recipes r ON f.recipe_id = r.id
            JOIN job_types jt ON r.job_type_id = jt.id
            WHERE f.status = 'active' AND r.job_type_id = %s
        """, (job_type_id,))
        feeder_order = cursor.fetchone()

        if not feeder_order:
            return jsonify({'error': 'No active feeder order found for this job type'}), 404

        # 2. Parse JSON fields (kpis, feeders, stop_options)
        for key in ['kpis', 'feeders', 'stop_options']:
            if isinstance(feeder_order.get(key), str):
                try:
                    feeder_order[key] = json.loads(feeder_order[key])
                except Exception:
                    feeder_order[key] = [] if key in ['kpis', 'feeders'] else {}

        # 3. Load bin and material maps
        cursor.execute("SELECT id, bin_name FROM bins")
        bin_map = {row['id']: row['bin_name'] for row in cursor.fetchall()}

        cursor.execute("SELECT id, material_name FROM materials")
        material_map = {row['id']: row['material_name'] for row in cursor.fetchall()}

        # 4. Enrich feeders
        feeders = feeder_order.get('feeders', [])
        enriched_feed = []
        for idx, f in enumerate(feeders):
            enriched_feed.append({
                'feeder_number': idx + 1,
                'bin_id': f.get('bin_id'),
                'bin_name': bin_map.get(f.get('bin_id'), 'Unknown'),
                'material_name': (
                    f.get('material_name') or
                    material_map.get(f.get('material_id')) or
                    'Unnamed'
                ),
                'percentage': f.get('percentage', 0)
            })

        # 5. Format KPIs into dictionary
        kpis = {}
        for item in feeder_order.get('kpis', []):
            name = item.get('kpi_name', '').strip()
            if name:
                kpis[name] = item

        # 6. Build final response
        response = {
            'id': feeder_order.get('id'),
            'recipe_name': feeder_order.get('recipe_name'),
            'kpis': kpis,
            'feeders': enriched_feed,
            'stop_options': feeder_order.get('stop_options', {}),
            'created_at': feeder_order['created_at'].isoformat() if feeder_order.get('created_at') else None,
            'job_type': feeder_order.get('job_type_name'),
            'job_type_id': feeder_order.get('job_type_id'),
            'status': feeder_order.get('status')
        }

        return jsonify(response), 200

@orders_bp.route('/reporting/db2099', methods=['GET'])
def get_db2099_report():
    import struct
    from flask import jsonify
    from psycopg2.extras import RealDictCursor

    # Demo vs production: same logic; connect_to_plc_fast() returns emulator in demo (same offsets).
    DB_NUMBER = 2099
    DB_SIZE = 96

    try:
        # Step 1: Load bins from database
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT id, bin_name, bin_code FROM bins")
                all_bins = cursor.fetchall()

        # Step 2: Prepare bin_code → bin_info mapping
        bin_lookup = {}
        for b in all_bins:
            code = (b['bin_code'] or '').strip().lstrip('0')  # normalize like '021A'
            if code:
                bin_lookup[code] = {
                    'bin_id': b['id'],
                    'bin_name': b['bin_name']
                }

        # Step 3: Connect to PLC and read DB block
        plc = connect_to_plc_fast()  # ✅ Persistent connection
        raw_block = plc.db_read(DB_NUMBER, 0, DB_SIZE)

        def read_real(offset):
            raw = raw_block[offset:offset+4][::-1]
            return round(struct.unpack('<f', raw)[0], 6)

        result = {}

        def add(tag, offset, unit='', conv=None):
            val = read_real(offset)
            if conv:
                val = round(conv(val), 6)

            bin_code = None
            if '_' in tag:
                bin_code = tag.split('_')[0].replace('-', '').lstrip('0')  # e.g., '021A'

            bin_info = bin_lookup.get(bin_code) if bin_code else None

            result[tag] = {
                'value': val,
                'unit': unit,
                'bin_code': bin_code,
                'bin_id': bin_info['bin_id'] if bin_info else None,
                'bin_name': bin_info['bin_name'] if bin_info else None
            }

        # ---- FlowRate Ton/hr (NO CONVERSION - Direct PLC values) ----
        add('FlowRate_2_521WE', 0, 't/h')
        add('FlowRate_3_523WE', 4, 't/h')
        add('FlowRate_3_522WE', 8, 't/h')
        add('FlowRate_3_520WE', 12, 't/h')
        add('FlowRate_3_524WE', 16, 't/h')

        # ---- Percentages ----
        add('Bran_Coarse', 20)
        add('Flour_1', 24)
        add('B1', 28)
        add('Bran_Fine', 32)
        add('Semolina', 36)

        # ---- Flow Balancers (NO CONVERSION - Direct PLC values) ----
        add('031_2_710WE', 40, 't/h')
        add('032_2_711WE', 44, 't/h')
        add('FCL1_2_520WE', 48, 't/h')
        add('021A_2_522WE', 52, 't/h')
        add('021B_2_523WE', 56, 't/h')
        add('021C_2_524WE', 60, 't/h')
        add('021_2_782WE', 64, 't/h')
        add('022_2_783WE', 68, 't/h')
        add('023_2_784WE', 72, 't/h')
        add('025_2_785WE', 76, 't/h')

        # ---- Water Flow (NO CONVERSION - Direct PLC value) ----
        add('2-500LC_Water_Flow', 80, 'L/h')

        # ---- Final Flow Balancers (NO CONVERSION - Direct PLC values) ----
        add('027_2_786WE', 84, 't/h')
        add('028_2_787WE', 88, 't/h')
        add('029_2_708WE', 92, 't/h')

        # plc.disconnect()  # ✅ No disconnect - keeping persistent connection

        return jsonify({'status': 'success', 'data': result}), 200

    except Exception as e:
        logger.error(f"Error in get_db2099_report: {e}", exc_info=True)
        # Demo mode: return data from emulator so Report page doesn't show 500
        try:
            from demo_mode import get_demo_mode
            if get_demo_mode():
                from plc_data_source import get_emulator_offsets
                offsets = get_emulator_offsets()
                result = {}
                for item in (offsets.get('DB2099') or []):
                    tag = (item.get('label') or '').replace(' ', '_').replace('-', '_')
                    if tag:
                        result[tag] = {'value': item.get('value', 0), 'unit': '', 'bin_code': None, 'bin_id': None, 'bin_name': None}
                return jsonify({'status': 'success', 'data': result}), 200
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': str(e)}), 500

#----------------------------------------------FCL----------------------------------------------------

#
@orders_bp.route('/plc/active-bin-order-data', methods=['GET'])
def get_active_bin_order_data():
    import struct
    import logging
    import snap7

    logger = logging.getLogger(__name__)
    job_type_id = request.args.get('job_type_id', type=int)

    if not job_type_id:
        return jsonify({'error': 'Missing job_type_id'}), 400

    try:
        db_number = get_db_number_for_job_type(job_type_id)
        if not db_number:
            # Demo mode: return empty structure so Report page doesn't show 500
            try:
                from demo_mode import get_demo_mode
                if get_demo_mode():
                    return jsonify({
                        "job_type_id": job_type_id,
                        "active_destination": {},
                        "active_sources": [],
                        "kpi_definitions": [],
                        "line_running": False,
                        "os_comment": "Demo – no order"
                    }), 200
            except Exception:
                pass
            return jsonify({'error': 'No DB number mapped for this job_type_id'}), 500

        plc = connect_to_plc_fast()  # ✅ Use persistent connection

        # --- Read Run Status (DBX526.0) ---
        run_data = plc.db_read(db_number, 526, 1)
        line_running = bool(run_data[0] & 0x01)
        logger.info(f"Line running: {line_running}")

        # --- Read Active Destination ---
        dest_data = plc.db_read(db_number, 528, 8)
        active_dest = {
            "dest_no": struct.unpack('>h', dest_data[0:2])[0],
            "bin_id": struct.unpack('>h', dest_data[2:4])[0],
            "prd_code": struct.unpack('>i', dest_data[4:8])[0]
        }
        logger.info(f"Active Destination: {active_dest}")

        # --- Read All Sources (bin_id != 0) ---
        plc_sources = []
        active_bin_ids = []
        for i in range(5):
            offset = 536 + i * 16
            raw = plc.db_read(db_number, offset, 16)
            bin_id = struct.unpack('>h', raw[2:4])[0]

            if bin_id != 0:
                source = {
                    "source_index": i + 1,
                    "is_active": bool(raw[0] & 0x01),
                    "bin_id": bin_id,
                    "qty_percent": round(struct.unpack('>f', raw[4:8])[0], 3),
                    "produced_qty": round(struct.unpack('>f', raw[8:12])[0], 3),
                    "prd_code": struct.unpack('>i', raw[12:16])[0]
                }
                plc_sources.append(source)
                active_bin_ids.append(bin_id)

        logger.info(f"PLC Source BIN IDs: {active_bin_ids}")

        # --- Read OS Comment ---
        os_data = plc.db_read(db_number, 616, 66)
        os_comment = os_data[2:2 + os_data[1]].decode('ascii', errors='ignore')
        logger.info(f"OS Comment: {os_comment}")

        # plc.disconnect()  # ✅ No disconnect - keeping persistent connection

        # --- Fetch Active Order ---
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT o.kpis, o.order_sources, o.order_destinations
                    FROM orders o
                    WHERE o.job_type_id = %s AND o.status = 'active'
                    ORDER BY o.created_at DESC
                    LIMIT 1
                """, (job_type_id,))
                order = cursor.fetchone()

                if not order:
                    return jsonify({'error': 'No active order found'}), 404

                order_sources = order['order_sources']
                order_destinations = order['order_destinations']
                kpis = order['kpis']

                logger.info(f"DB Order Source BINs: {[s['bin_id'] for s in order_sources]}")

                # Match all PLC sources to DB order_sources by bin_id
                matched_sources = []
                for src in plc_sources:
                    match = next((s for s in order_sources if s['bin_id'] == src['bin_id']), None)
                    if match:
                        matched = match.copy()
                        matched['source_index'] = src['source_index']
                        matched['qty_percent'] = src['qty_percent']
                        matched['produced_qty'] = src['produced_qty']
                        matched['is_active'] = src['is_active']
                        matched['prd_code'] = src['prd_code']
                        matched_sources.append(matched)

                # Match destination by bin_id
                matched_dest = next(
                    (d for d in order_destinations if d['bin_id'] == active_dest['bin_id']),
                    active_dest
                )

                # Compose KPI definitions
                kpi_defs = []
                for idx, kpi in enumerate(kpis):
                    kpi_defs.append({
                        "kpi_name": kpi["kpi_name"],
                        "data_type": kpi["data_type"],
                        "default_value": kpi["value"],
                        "unit": kpi["unit"],
                        "read_write": "R" if kpi["kpi_name"] in ["Dynamic", "Parameters", "Tempering"] else "W",
                        "bit_value": 0,
                        "db_offset": 694 + idx * 4
                    })

        return jsonify({
            "job_type_id": job_type_id,
            "active_destination": matched_dest,
            "active_sources": matched_sources,
            "kpi_definitions": kpi_defs,
            "line_running": line_running,
            "os_comment": os_comment
        }), 200

    except Exception as e:
        logger.exception("Error in /plc/active-bin-order-data")
        # Demo mode: return empty structure so Report page doesn't show 500
        try:
            from demo_mode import get_demo_mode
            if get_demo_mode():
                return jsonify({
                    "job_type_id": job_type_id or 0,
                    "active_destination": {},
                    "active_sources": [],
                    "kpi_definitions": [],
                    "line_running": False,
                    "os_comment": "Demo – no order"
                }), 200
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500

# Feeder flow map for FCL: bin_code → (offset in DB2099)
# Must be defined BEFORE db199-monitor function that uses it
# IMPORTANT: PLC uses bin CODES (21, 22, 23) not database IDs (7, 8, 9)!
FCL_FEEDER_FLOW_MAP = {
    # Main bins (from PLC bin codes)
    21: 64,   # Bin 21  → offset 64 (021_2_782WE)
    22: 68,   # Bin 22  → offset 68 (022_2_783WE)
    23: 72,   # Bin 23  → offset 72 (023_2_784WE)
    24: 778,  # Bin 24  → offset from original map
    25: 76,   # Bin 25  → offset 76 (025_2_785WE)
    26: 1030, # Bin 26  → offset from original map
    27: 84,   # Bin 27  → offset 84 (027_2_786WE)
    28: 88,   # Bin 28  → offset 88 (028_2_787WE)
    29: 92,   # Bin 29  → offset 92 (029_2_708WE)
    30: 1534, # Bin 30  → offset from original map
    31: 40,   # Bin 31  → offset 40 (031_2_710WE)
    32: 44,   # Bin 32  → offset 44 (032_2_711WE)
    # Lettered bins (string keys for database lookup)
    '21A': 52,  # Bin 21A → offset 52 (021A_2_522WE)
    '21B': 56,  # Bin 21B → offset 56 (021B_2_523WE)
    '21C': 60,  # Bin 21C → offset 60 (021C_2_524WE)
    # PLC encoded bins (211->21A, 212->21B, 213->21C)
    211: 52,   # PLC 211 → Bin 21A → offset 52 (021A_2_522WE)
    212: 56,   # PLC 212 → Bin 21B → offset 56 (021B_2_523WE)
    213: 60,   # PLC 213 → Bin 21C → offset 60 (021C_2_524WE)
    '21B': 56,  # Bin 21B → offset 56 (021B_2_523WE)
    '21C': 60,  # Bin 21C → offset 60 (021C_2_524WE)
}

@orders_bp.route('/plc/db199-monitor', methods=['GET'])
def read_db199_monitor():
    import struct
    from flask import jsonify
    from snap7.util import get_bool
    # from . import connect_to_plc

    # Demo vs production: same logic; connect_to_plc_fast() returns emulator in demo (same offsets).
    DB_NUMBER = 199
    DB2099 = 2099

    def read_real(plc, offset):
        raw = plc.db_read(DB_NUMBER, offset, 4)
        return round(struct.unpack('>f', raw)[0], 3)

    def read_int(plc, offset):
        raw = plc.db_read(DB_NUMBER, offset, 2)
        return struct.unpack('>h', raw)[0]

    def read_string(plc, offset, max_len=64):
        raw = plc.db_read(DB_NUMBER, offset, max_len + 2)
        length = raw[1]
        return raw[2:2 + length].decode('ascii', errors='ignore')

    def read_flow_rate(plc, db_num, offset):
        """Read flow rate (REAL) from DB2099"""
        try:
            raw = plc.db_read(db_num, offset, 4)
            # Reverse bytes for little-endian
            raw_reversed = raw[::-1]
            value = struct.unpack('<f', raw_reversed)[0]
            
            # Enhanced logging
            if value == 0.0:
                logger.warning(f"[FCL] ⚠️ Read 0.0 from DB{db_num} offset {offset}: raw={raw.hex()}, reversed={raw_reversed.hex()}")
                if raw.hex() == '00000000':
                    logger.warning(f"[FCL] ⚠️ Offset {offset} contains all zeros - PLC might not be writing to this address!")
            else:
                logger.debug(f"[FCL] Read flow from DB{db_num} offset {offset}: raw={raw.hex()}, value={value}")
            
            return round(value, 6)
        except Exception as e:
            logger.error(f"[FCL] Failed to read flow at DB{db_num} offset {offset}: {e}", exc_info=True)
            return 0.0
    
    def read_dint_counter(plc, db_num, offset):
        """Read DInt cumulative counter from DB2099"""
        try:
            raw = plc.db_read(db_num, offset, 4)
            # Reverse bytes for little-endian
            raw_reversed = raw[::-1]
            value = struct.unpack('<i', raw_reversed)[0]
            
            logger.debug(f"[FCL] Read DInt counter from DB{db_num} offset {offset}: raw={raw.hex()}, value={value} kg")
            return value
        except Exception as e:
            logger.error(f"[FCL] Failed to read DInt at DB{db_num} offset {offset}: {e}", exc_info=True)
            return 0

    def read_active_destination(plc):
        data = plc.db_read(DB_NUMBER, 528, 8)
        return {
            'dest_no': struct.unpack('>h', data[0:2])[0],
            'bin_id': struct.unpack('>h', data[2:4])[0],
            'prd_code': struct.unpack('>i', data[4:8])[0]
        }

    def convert_plc_bin_to_db_code(plc_bin_id):
        """
        Convert PLC bin ID to database bin_code format
        211 -> 21A
        212 -> 21B
        213 -> 21C
        21 -> 21 (unchanged)
        """
        if plc_bin_id >= 210 and plc_bin_id <= 219:
            # Extract base number and suffix
            base = plc_bin_id // 10  # 211 // 10 = 21
            suffix_num = plc_bin_id % 10  # 211 % 10 = 1
            
            if suffix_num >= 1 and suffix_num <= 3:
                # Convert 1->A, 2->B, 3->C
                suffix_letter = chr(ord('A') + suffix_num - 1)
                db_code = f"{base}{suffix_letter}"
                logger.debug(f"[FCL] Converted PLC bin {plc_bin_id} -> DB bin_code '{db_code}'")
                return db_code
        
        # No conversion needed
        return plc_bin_id

    def read_active_sources(plc):
        sources = []
        active_bin_ids = []
        for i in range(5):
            offset = 536 + i * 16
            data = plc.db_read(DB_NUMBER, offset, 16)
            bin_id = struct.unpack('>h', data[2:4])[0]
            
            logger.info(f"[FCL] Reading source slot {i+1}: bin_id={bin_id}")
            
            if bin_id == 0:
                logger.debug(f"[FCL] Slot {i+1}: bin_id is 0, skipping")
                continue
            
            active_bin_ids.append(bin_id)
            source = {
                'source_index': i + 1,
                'is_active': bool(data[0] & 0x01),
                'bin_id': bin_id,
                'qty_percent': round(struct.unpack('>f', data[4:8])[0], 3),
                'produced_qty': round(struct.unpack('>f', data[8:12])[0], 3),
                'prd_code': struct.unpack('>i', data[12:16])[0]
            }
            
            # ✅ Convert PLC bin ID for flow map lookup (211->21A, 212->21B, 213->21C)
            db_bin_code = convert_plc_bin_to_db_code(bin_id)
            
            # Add flow rate from DB2099 if mapping exists (check both PLC ID and converted code)
            if bin_id in FCL_FEEDER_FLOW_MAP:
                flow_offset = FCL_FEEDER_FLOW_MAP[bin_id]
                logger.debug(f"[FCL] Bin {bin_id} found in map, reading from offset {flow_offset}")
                source['weight'] = read_flow_rate(plc, DB2099, flow_offset)
            elif db_bin_code in FCL_FEEDER_FLOW_MAP:
                flow_offset = FCL_FEEDER_FLOW_MAP[db_bin_code]
                logger.debug(f"[FCL] Converted bin {db_bin_code} (PLC: {bin_id}) found in map, reading from offset {flow_offset}")
                source['weight'] = read_flow_rate(plc, DB2099, flow_offset)
            else:
                logger.warning(f"[FCL] Bin {bin_id} (converted: {db_bin_code}) NOT in FCL_FEEDER_FLOW_MAP, setting weight to 0")
                source['weight'] = 0.0
            
            sources.append(source)
            
        logger.info(f"[FCL] Total bins read from PLC: {len(sources)}, bin_ids: {active_bin_ids}")
        return sources, active_bin_ids

    def read_line_running(plc):
        data = plc.db_read(DB_NUMBER, 526, 1)  # DBX526.0
        return get_bool(data, 0, 0)

    try:
        plc = connect_to_plc_fast()  # ✅ Persistent connection

        active_sources, active_bin_ids = read_active_sources(plc)
        active_destination = read_active_destination(plc)
        dest_bin_id = active_destination.get('bin_id')
        if dest_bin_id and dest_bin_id > 0:
            active_bin_ids.append(dest_bin_id)

        # ✅ Read "Cleaning Scale bypass" (offset 710, Bool)
        cleaning_scale_bypass_data = plc.db_read(DB_NUMBER, 710, 1)
        cleaning_scale_bypass = get_bool(cleaning_scale_bypass_data, 0, 0) # Assumes first bit, user said "710 | Check Box"

        # ✅ Read FCL receivers from DB2099 (multiple receivers)
        # Read receiver 1 - Use ACTUAL destination bin ID from PLC (not hardcoded 081)
        receiver_1_weight = read_flow_rate(plc, DB2099, 48)
        logger.debug(f"[FCL] Receiver 1 (bin {dest_bin_id}) weight: {receiver_1_weight} t/h")
        
        # Read receiver 2 (FCL 2_520WE) - Cumulative counter from offset 108 (DInt)
        # Offset 108 contains "2_520WE_Non_Erasable_Weight" - cumulative weight in kg
        receiver_2_counter = read_dint_counter(plc, DB2099, 108)
        logger.debug(f"[FCL] Receiver 2 (FCL_2_520WE) cumulative weight: {receiver_2_counter} kg (from offset 108)")
        
        # Convert cumulative counter to display value (kg)
        # Display as large cumulative value, not flow rate
        receiver_2_weight = float(receiver_2_counter)  # Keep full cumulative value in kg
        logger.debug(f"[FCL] Receiver 2 (FCL_2_520WE) display weight: {receiver_2_weight} kg")
        
        # ✅ Use actual destination bin ID from PLC (will be enriched with material name later)
        fcl_receivers = [
            {
                'id': str(dest_bin_id).zfill(4) if dest_bin_id else '0000',  # ✅ Dynamic from PLC
                'name': 'Output Bin',  # ✅ Will be enriched with material name from database
                'location': 'Output Bin',
                'weight': receiver_1_weight,
                'bin_id': dest_bin_id  # ✅ Store raw bin ID for enrichment
            },
            {
                'id': 'FCL_2_520WE',
                'name': 'FCL 2_520WE',
                'location': 'FCL 2_520WE',
                'weight': receiver_2_weight
            }
        ]
        
        logger.info(f"[FCL] Total receivers: bin_{dest_bin_id}={receiver_1_weight} t/h, FCL_2_520WE={receiver_2_weight} t/h, SUM={receiver_1_weight + receiver_2_weight} t/h")
        
        result = {
            'line_running': read_line_running(plc),
            'produced_weight': read_real(plc, 564),
            'water_consumed': read_real(plc, 568),
            'flow_rate': read_real(plc, 694),
            'moisture_setpoint': read_real(plc, 702),
            'moisture_offset': read_real(plc, 706),
            'cleaning_scale_bypass': cleaning_scale_bypass, # ✅ New field
            'receiver': fcl_receivers[0]['weight'],  # Keep single value for backwards compatibility
            'fcl_receivers': fcl_receivers,  # New array with all receivers
            'job_status': read_int(plc, 682),
            'os_comment': read_string(plc, 616, 64),
            'active_destination': active_destination,
            'active_sources': active_sources
        }

        # plc.disconnect()  # ✅ No disconnect - keeping persistent connection
        
        # ✅ Enrich with material information from database
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            # ✅ Query bins with bin_code to match PLC bin IDs
            cursor.execute("SELECT id, bin_name, bin_code, material_id FROM bins")
            all_bins = cursor.fetchall()
            
            # ✅ Create dual lookup: both int and string keys (PLC sends int, DB has string)
            bin_lookup = {}
            for b in all_bins:
                if b["bin_code"]:
                    # Store with string key
                    bin_lookup[b["bin_code"]] = b
                    # Also store with integer key if it's numeric
                    try:
                        int_key = int(b["bin_code"])
                        bin_lookup[int_key] = b
                    except (ValueError, TypeError):
                        # bin_code like "21A" can't be converted to int, that's fine
                        pass

            # Get material IDs for active bins (convert to int for comparison)
            active_bin_ids_int = []
            for bid in active_bin_ids:
                try:
                    active_bin_ids_int.append(int(bid))
                except:
                    active_bin_ids_int.append(bid)
            
            material_ids = []
            for b in all_bins:
                if b["bin_code"] and b["material_id"]:
                    try:
                        if int(b["bin_code"]) in active_bin_ids_int or b["bin_code"] in active_bin_ids:
                            material_ids.append(b["material_id"])
                    except:
                        if b["bin_code"] in active_bin_ids:
                            material_ids.append(b["material_id"])
            
            material_map = {}
            if material_ids:
                cursor.execute("""
                    SELECT id, material_name, material_code
                    FROM materials
                    WHERE id IN %s
                """, (tuple(set(material_ids)),))
                for row in cursor.fetchall():
                    material_map[row["id"]] = row

        # ✅ Enrich active_sources with material info and filter out invalid bins
        original_count = len(result['active_sources'])
        logger.info(f"[FCL] Starting enrichment for {original_count} sources from PLC")
        
        valid_sources = []
        for idx, source in enumerate(result['active_sources']):
            plc_bin_id = source['bin_id']  # PLC sends this as integer (21, 211, 212, etc.)
            logger.info(f"[FCL] Processing source {idx+1}: PLC bin_id={plc_bin_id}, weight={source.get('weight', 'N/A')}")
            
            # ✅ Convert PLC bin ID to database bin_code (211->21A, 212->21B, 213->21C)
            db_bin_code = convert_plc_bin_to_db_code(plc_bin_id)
            logger.info(f"[FCL] Converted bin {plc_bin_id} -> {db_bin_code} for database lookup")
            
            # Try to find bin info using converted code
            bin_info = bin_lookup.get(db_bin_code) or bin_lookup.get(str(db_bin_code))
            
            if not bin_info:
                logger.warning(f"[FCL] ⚠️ Bin {db_bin_code} (PLC: {plc_bin_id}) not found in database - SHOWING WITH WARNING")
                logger.warning(f"[FCL] Available bins in lookup: {list(bin_lookup.keys())[:20]}")  # Show first 20 keys
                # Show bin with warning message instead of filtering out
                source['prd_name'] = f"⚠️ Invalid Bin ({plc_bin_id})"
                source['prd_code'] = 0
                valid_sources.append(source)
                continue
            
            mat_id = bin_info.get("material_id")
            logger.debug(f"[FCL] Bin {db_bin_code} (PLC: {plc_bin_id}) found in DB: bin_name={bin_info['bin_name']}, material_id={mat_id}")
            
            if mat_id and mat_id in material_map:
                source['material'] = {
                    "id": mat_id,
                    "material_name": material_map[mat_id]["material_name"],
                    "material_code": material_map[mat_id]["material_code"]
                }
                # Update prd_code with actual material code
                source['prd_code'] = int(material_map[mat_id]["material_code"])
                # Add prd_name for frontend compatibility
                source['prd_name'] = material_map[mat_id]["material_name"]
                logger.info(f"[FCL] ✅ Enriched PLC bin {plc_bin_id} (DB: {db_bin_code}): {source['prd_name']} (Material Code: {source['prd_code']}, Weight: {source.get('weight', 'N/A')})")
            else:
                logger.warning(f"[FCL] ⚠️ No material assigned to bin {db_bin_code} (PLC: {plc_bin_id})")
                source['prd_name'] = f"{bin_info['bin_name']} (No Material)"
            
            # Add to valid sources list
            valid_sources.append(source)
        
        # Replace active_sources with filtered list
        result['active_sources'] = valid_sources
        logger.info(f"[FCL] ✅ Final result: {len(valid_sources)} valid bins out of {original_count} sources from PLC")

        # ✅ Enrich active_destination with material info
        if dest_bin_id:
            # ✅ Convert PLC bin ID to database bin_code
            dest_db_bin_code = convert_plc_bin_to_db_code(dest_bin_id)
            logger.info(f"[FCL] Converted destination bin {dest_bin_id} -> {dest_db_bin_code} for database lookup")
            logger.info(f"[FCL] Available bin_codes in database: {list(bin_lookup.keys())[:20]}")  # Show first 20
            
            bin_info = bin_lookup.get(dest_db_bin_code) or bin_lookup.get(str(dest_db_bin_code))
            logger.info(f"[FCL] Bin lookup result for {dest_db_bin_code}: {bin_info}")
            if bin_info:
                mat_id = bin_info.get("material_id")
                if mat_id and mat_id in material_map:
                    result['active_destination']['material'] = {
                        "id": mat_id,
                        "material_name": material_map[mat_id]["material_name"],
                        "material_code": material_map[mat_id]["material_code"]
                    }
                    result['active_destination']['prd_code'] = int(material_map[mat_id]["material_code"])
                    logger.info(f"[FCL] ✅ Enriched destination PLC bin {dest_bin_id} (DB: {dest_db_bin_code}): {material_map[mat_id]['material_name']}")
                    
                    # ✅ Also enrich fcl_receivers[0] with the same material info
                    if result.get('fcl_receivers') and len(result['fcl_receivers']) > 0:
                        result['fcl_receivers'][0]['id'] = str(dest_bin_id).zfill(4)
                        result['fcl_receivers'][0]['name'] = material_map[mat_id]["material_name"]
                        result['fcl_receivers'][0]['location'] = f"Bin {dest_db_bin_code}"
                        result['fcl_receivers'][0]['material_code'] = material_map[mat_id]["material_code"]
                        logger.info(f"[FCL] ✅ Enriched receiver 1 with material: {material_map[mat_id]['material_name']} (Bin {dest_bin_id})")
                else:
                    logger.warning(f"[FCL] ⚠️ No material found for destination bin {dest_db_bin_code} (PLC: {dest_bin_id})")
            else:
                logger.warning(f"[FCL] ⚠️ Destination bin {dest_db_bin_code} (PLC: {dest_bin_id}) not found in database")

        return jsonify({'status': 'success', 'data': result, 'fcl_receivers': result.get('fcl_receivers', [])}), 200

    except Exception as e:
        logger.exception("Error in /plc/db199-monitor")
        # Demo mode: return minimal payload so Report page doesn't show 500
        try:
            from demo_mode import get_demo_mode
            if get_demo_mode():
                fallback = {
                    'line_running': False, 'produced_weight': 0, 'water_consumed': 0,
                    'flow_rate': 0, 'moisture_setpoint': 0, 'moisture_offset': 0,
                    'cleaning_scale_bypass': False, 'receiver': 0,
                    'fcl_receivers': [{'id': '0000', 'name': 'Output Bin', 'location': 'Output Bin', 'weight': 0, 'bin_id': 0}],
                    'job_status': 0, 'os_comment': 'Demo', 'active_destination': {},
                    'active_sources': []
                }
                return jsonify({'status': 'success', 'data': fallback, 'fcl_receivers': fallback.get('fcl_receivers', [])}), 200
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': str(e)}), 500

#-----------------------------------------DB299-------------------------------------------------------------
DB299 = 299
DB2099 = 2099

# Static fields from DB299
DB299_FIELDS = [
    ("DestNo", "Int", 528),
    ("DestBinId", "Int", 530),
    ("PrdCode", "DInt", 532),
    ("OS_Comment", "String[64]", 616),
    ("JobStatusCode", "Int", 682),
    ("Flowrate", "Real", 694),
    ("JobQty", "Real", 698),
    ("MoistureSetpoint", "Real", 702),
    ("MoistureOffset", "Real", 706),
    ("Dumping", "Bool", 710),
]

# Feeder flow map for SCL: bin_id → (offset in DB2099)
FEEDER_FLOW_MAP = {
    "027_2_786WE": (27, 84),
    "028_2_787WE": (28, 88),
    "029_2_708WE": (29, 92),
    "032_2_711WE": (32, 44)  # ✅ New: DestBinId bin 32 with offset 44
}

def parse_field(client, db_number, dtype, offset):
    try:
        if dtype == "Bool":
            byte_offset = int(offset)
            bit_offset = int(round((offset - byte_offset) * 10))
            data = client.db_read(db_number, byte_offset, 1)
            return get_bool(data, 0, bit_offset)
        elif dtype == "Int":
            data = client.db_read(db_number, int(offset), 2)
            return struct.unpack('>h', data)[0]
        elif dtype == "DInt":
            data = client.db_read(db_number, int(offset), 4)
            return struct.unpack('>i', data)[0]
        elif dtype == "Real":
            data = client.db_read(db_number, int(offset), 4)
            return round(struct.unpack('>f', data)[0], 3)
        elif dtype.startswith("String"):
            max_len = int(dtype[dtype.find('[')+1:dtype.find(']')])
            raw = client.db_read(db_number, int(offset), max_len + 2)
            length = raw[1]
            return raw[2:2 + length].decode('ascii', errors='ignore')
        else:
            return f"❌ Unsupported type: {dtype}"
    except Exception as e:
        return f"❌ Error: {e}"

def read_flow(client, db_number, offset):
    """Read raw flow value from PLC (t/h) - NO CONVERSION for live monitor"""
    try:
        data = client.db_read(db_number, offset, 4)
        raw = struct.unpack('>f', data)[0]
        return round(raw, 3)  # ✅ Return raw t/h value without conversion
    except Exception as e:
        return 0  # fallback to 0 on error

@orders_bp.route('/plc/db299-monitor', methods=['GET'])
def db299_monitor():
    # Demo vs production: same logic; connect_to_plc() returns emulator in demo (same offsets).
    try:
        client = connect_to_plc()
        result = {}

        # Read static fields
        for name, dtype, offset in DB299_FIELDS:
            result[name] = parse_field(client, DB299, dtype, offset)

        # Read Active Sources
        result["ActiveSources"] = []
        active_bin_ids = []

        for i in range(1, 6):
            offset = 536 + (i - 1) * 16
            data = client.db_read(DB299, offset, 16)
            bin_id = struct.unpack('>h', data[2:4])[0]
            if bin_id == 0:
                continue

            active_bin_ids.append(bin_id)

            source = {
                "source_index": i,
                "is_active": bool(data[0] & 0x01),
                "bin_id": bin_id,
                "qty_percent": round(struct.unpack('>f', data[4:8])[0], 3),
                "produced_qty": round(struct.unpack('>f', data[8:12])[0], 3),
                "prd_code": struct.unpack('>i', data[12:16])[0]
            }

            # Get flowrate (raw t/h from PLC)
            for tag, (flow_bin_id, offset) in FEEDER_FLOW_MAP.items():
                if flow_bin_id == bin_id:
                    source["flowrate_tph"] = read_flow(client, DB2099, offset)  # ✅ Changed from flowrate_kgps to flowrate_tph
                    break

            result["ActiveSources"].append(source)

        # Read all feeder flows (raw t/h values)
        result["FeederFlows"] = {
            tag: {
                "bin_id": bin_id,
                "unit": "t/h",  # ✅ Changed from kg/s to t/h (raw PLC value)
                "value": read_flow(client, DB2099, offset)
            } for tag, (bin_id, offset) in FEEDER_FLOW_MAP.items()
        }

        # Collect DestBinId
        dest_bin_id = result.get("DestBinId")
        if isinstance(dest_bin_id, int) and dest_bin_id > 0:
            active_bin_ids.append(dest_bin_id)

        # Disconnect PLC before DB queries
        client.disconnect()

        # ✅ DB lookup for bin and material enrichment
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            # ✅ Query bins with bin_code to match PLC bin IDs
            cursor.execute("SELECT id, bin_name, bin_code, material_id FROM bins")
            all_bins = cursor.fetchall()
            
            # ✅ Create dual lookup: both int and string keys (PLC sends int, DB has string)
            bin_lookup = {}
            for b in all_bins:
                if b["bin_code"]:
                    # Store with string key
                    bin_lookup[b["bin_code"]] = b
                    # Also store with integer key if it's numeric
                    try:
                        int_key = int(b["bin_code"])
                        bin_lookup[int_key] = b
                    except (ValueError, TypeError):
                        pass

            # Get material IDs for active bins (handle type conversion)
            active_bin_ids_int = []
            for bid in active_bin_ids:
                try:
                    active_bin_ids_int.append(int(bid))
                except:
                    active_bin_ids_int.append(bid)
            
            material_ids = []
            for b in all_bins:
                if b["bin_code"] and b["material_id"]:
                    try:
                        if int(b["bin_code"]) in active_bin_ids_int or b["bin_code"] in active_bin_ids:
                            material_ids.append(b["material_id"])
                    except:
                        if b["bin_code"] in active_bin_ids:
                            material_ids.append(b["material_id"])
            
            material_map = {}
            if material_ids:
                cursor.execute("""
                    SELECT id, material_name, material_code
                    FROM materials
                    WHERE id IN %s
                """, (tuple(set(material_ids)),))
                for row in cursor.fetchall():
                    material_map[row["id"]] = row

        # ✅ Enrich ActiveSources and filter out invalid bins
        valid_sources = []
        for source in result["ActiveSources"]:
            bin_code = source["bin_id"]  # PLC sends this as integer
            
            # Try to find bin info (works with both int and string keys)
            bin_info = bin_lookup.get(bin_code) or bin_lookup.get(str(bin_code))
            
            if not bin_info:
                logger.warning(f"[DB299] ⚠️ Bin {bin_code} not found in database - SHOWING WITH WARNING")
                # Show bin with warning message instead of filtering out
                source["prd_name"] = f"⚠️ Invalid Bin ({bin_code})"
                source["prd_code"] = 0
                valid_sources.append(source)
                continue
            
            mat_id = bin_info.get("material_id")
            
            if mat_id and mat_id in material_map:
                source["material"] = {
                    "id": mat_id,
                    "material_name": material_map[mat_id]["material_name"],
                    "material_code": material_map[mat_id]["material_code"]
                }
                logger.debug(f"[DB299] ✅ Enriched bin {bin_code}: {material_map[mat_id]['material_name']}")
            
            # Add to valid sources list
            valid_sources.append(source)
        
        # Replace ActiveSources with filtered list
        result["ActiveSources"] = valid_sources
        logger.debug(f"[DB299] Filtered sources: {len(valid_sources)} valid bins")

        # ✅ Enrich DestBinId
        if isinstance(dest_bin_id, int):
            bin_info = bin_lookup.get(dest_bin_id) or bin_lookup.get(str(dest_bin_id))
            if bin_info:
                mat_id = bin_info.get("material_id")
                if mat_id and mat_id in material_map:
                    result["DestMaterial"] = {
                        "id": mat_id,
                        "material_name": material_map[mat_id]["material_name"],
                        "material_code": material_map[mat_id]["material_code"]
                    }
                    logger.debug(f"[DB299] ✅ Enriched destination bin {dest_bin_id}: {material_map[mat_id]['material_name']}")

        # ========= PRODUCED WEIGHT CALCULATION =========
        # Step 1: bin_id → flowrate map
        flow_bin_weights = {
            v["bin_id"]: v["value"]
            for v in result["FeederFlows"].values()
        }

        # Step 2: total active source flow weights (regardless of is_active)
        total_source_weight = 0
        for source in result["ActiveSources"]:
            bin_id = source.get("bin_id")
            total_source_weight += flow_bin_weights.get(bin_id, 0)

        # Step 3: dest bin weight
        dest_weight = flow_bin_weights.get(dest_bin_id, 0)

        # Step 4: combine for total
        result["ProducedWeight"] = round(total_source_weight + dest_weight, 3)
        result["ProducedWeightBreakdown"] = {
            "source_total": round(total_source_weight, 3),
            "dest_weight": round(dest_weight, 3)
        }

        return jsonify({
            "status": "success",
            "timestamp": datetime.utcnow().isoformat(),
            "data": result
        })

    except Exception as e:
        logger.exception("Error in /plc/db299-monitor")
        # Demo mode: return minimal payload so Report page doesn't show 500
        try:
            from demo_mode import get_demo_mode
            if get_demo_mode():
                fallback = {
                    "DestNo": 0, "DestBinId": 0, "PrdCode": 0, "Flowrate": 0, "JobQty": 0,
                    "MoistureSetpoint": 0, "MoistureOffset": 0, "Dumping": False, "JobStatusCode": 0,
                    "ActiveSources": [], "FeederFlows": {},
                    "ProducedWeight": 0, "ProducedWeightBreakdown": {"source_total": 0, "dest_weight": 0}
                }
                return jsonify({
                    "status": "success",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": fallback
                }), 200
        except Exception:
            pass
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

#----------------------------------------MIL-A----------------------------------------
@orders_bp.route('/plc/db499-db2099-monitor', methods=['GET'])
def read_db499_and_db2099_monitor():
    import struct
    from snap7.util import get_bool
    from flask import jsonify
    from psycopg2.extras import RealDictCursor

    # Same logic for PLC and emulator: connect_to_plc_fast() returns emulator client in demo (same db/offset reads).
    DB499 = 499
    DB2099 = 2099

    def parse_field(plc, db_number, dtype, offset):
        try:
            if dtype == "Bool":
                byte_offset = int(offset)
                bit_offset = int(round((offset - byte_offset) * 10))
                data = plc.db_read(db_number, byte_offset, 1)
                return get_bool(data, 0, bit_offset)
            elif dtype == "Int":
                data = plc.db_read(db_number, int(offset), 2)
                return struct.unpack('>h', data)[0]
            elif dtype == "DInt":
                data = plc.db_read(db_number, int(offset), 4)
                return struct.unpack('>i', data)[0]
            elif dtype == "Real":
                data = plc.db_read(db_number, int(offset), 4)
                return round(struct.unpack('>f', data)[0], 3)
            else:
                return f"❌ Unsupported type: {dtype}"
        except Exception as e:
            return f"❌ Error: {e}"

    try:
        plc = connect_to_plc_fast()  # ✅ Persistent connection

        db499_fields = [
            ("scale_weight", "Real", 0),
            ("feeder_1_target", "Real", 478),
            ("feeder_1_selected", "Bool", 482),
            ("feeder_2_target", "Real", 484),
            ("feeder_2_selected", "Bool", 488),
            ("depot_selected", "Bool", 490.5),
            ("flap_1_selected", "Bool", 514),
            ("flap_2_selected", "Bool", 514.1),
            ("receiver_bin_id_1", "Int", 536),
            ("receiver_bin_id_2", "Int", 544),
            ("semolina_selected", "Bool", 254.0),
            ("mila_2_b789we_selected", "Bool", 296),
            ("linning_running", "Bool", 532),
            ("linning_stopped", "Bool", 532.1),
        ]

        db2099_fields = [
            ("mila_2_b789we", "Real", 96),
            ("yield_max_flow", "Real", 0),
            ("yield_min_flow", "Real", 0),  # same offset - correct offset is 0
            ("mila_unknown", "Real", 16),
            ("mila_bran_coarse", "Real", 20),  # % percentage value
            ("mila_flour_1", "Real", 24),  # % percentage value
            ("mila_b1", "Real", 28),  # % percentage value
            ("mila_bran_fine", "Real", 32),  # % percentage value
            ("mila_semolina", "Real", 36),  # % percentage value
            ("mila_B1_scale", "Real", 0),
        ]
        
        # ✅ Bran Receiver Non-Erasable Weights (DInt from DB2099)
        db2099_bran_fields = [
            ("bran_coarse", "DInt", 112),
            ("bran_fine", "DInt", 124),
            ("flour_1", "DInt", 116),
            ("b1", "DInt", 120),
            ("semolina", "DInt", 128),
        ]

        data_499 = {name: parse_field(plc, DB499, dtype, offset)
                    for name, dtype, offset in db499_fields}
        data_2099 = {name: parse_field(plc, DB2099, dtype, offset)
                     for name, dtype, offset in db2099_fields}

        # ✅ Read Bran Receiver Non-Erasable Weights from DB2099 (DInt values in kg)
        bran_receiver = {}
        for name, dtype, offset in db2099_bran_fields:
            value = parse_field(plc, DB2099, dtype, offset)  # ✅ Changed from DB499 to DB2099
            # Ensure we have a valid numeric value, default to 0 if error
            if isinstance(value, (int, float)):
                bran_receiver[name] = value
            else:
                logger.warning(f"Invalid bran_receiver value for {name}: {value}")
                bran_receiver[name] = 0
        
        # ✅ NO CONVERSION - Return raw PLC values in t/h for live monitor
        # All flow values remain in their original unit (t/h)
        # Bran Receiver values are in kg (DInt from DB2099)

        receiver_ids = [
            data_499.get("receiver_bin_id_1"),
            data_499.get("receiver_bin_id_2")
        ]

        # ✅ Enrich receiver_bins from DB (same for PLC or emulator). If DB fails, still return data with material=None.
        enriched_receivers = []
        try:
            from contextlib import closing
            with closing(get_db_connection()) as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("SELECT id, bin_name, bin_code, material_id FROM bins")
                all_bins = cursor.fetchall()

                bin_lookup = {}
                for b in all_bins:
                    bin_lookup[b["id"]] = b
                    if b.get("bin_code") is not None:
                        bin_lookup[b["bin_code"]] = b
                        try:
                            bin_lookup[int(b["bin_code"])] = b
                        except (ValueError, TypeError):
                            pass

                material_ids = []
                for receiver_id in receiver_ids:
                    if receiver_id is None:
                        continue
                    bin_info = (bin_lookup.get(receiver_id) or
                                bin_lookup.get(str(receiver_id)) or
                                bin_lookup.get(int(receiver_id) if isinstance(receiver_id, str) and receiver_id.isdigit() else None))
                    if bin_info and bin_info.get("material_id"):
                        material_ids.append(bin_info["material_id"])

                material_map = {}
                if material_ids:
                    cursor.execute(
                        "SELECT id, material_name, material_code FROM materials WHERE id IN %s",
                        (tuple(set(material_ids)),))
                    for row in cursor.fetchall():
                        material_map[row["id"]] = row

                for bin_id in receiver_ids:
                    entry = {"bin_id": bin_id, "material": None}
                    bin_info = (bin_lookup.get(bin_id) or
                                bin_lookup.get(str(bin_id)) or
                                bin_lookup.get(int(bin_id) if isinstance(bin_id, str) and bin_id.isdigit() else None))
                    if bin_info:
                        mat_id = bin_info.get("material_id")
                        if mat_id and mat_id in material_map:
                            entry["material"] = material_map[mat_id]
                    enriched_receivers.append(entry)
        except Exception as db_err:
            logger.warning("DB enrichment for receiver_bins failed (using emulator/PLC data only): %s", db_err)
            if not enriched_receivers:
                for bin_id in receiver_ids:
                    enriched_receivers.append({"bin_id": bin_id, "material": None})

        return jsonify({
            "status": "success",
            "DB499": data_499,
            "DB2099": data_2099,
            "bran_receiver": bran_receiver,  # ✅ Bran Receiver Non-Erasable Weights in kg
            "receiver_bins": enriched_receivers
        }), 200

    except Exception as e:
        logger.exception("Error in /plc/db499-db2099-monitor")
        return jsonify({"status": "error", "message": str(e)}), 500


# ARCHIVE APIs (Hourly & Full)
# ================================
from flask import jsonify
from psycopg2.extras import RealDictCursor

# --- FCL APIs ---

@orders_bp.route('/archive/fcl/latest', methods=['GET'])
@handle_db_errors
def get_fcl_latest():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT * FROM fcl_monitor_logs_archive
                ORDER BY created_at DESC
                LIMIT 1
            """)
            row = cursor.fetchone()
            return jsonify({'status': 'success', 'data': row}), 200


@orders_bp.route('/archive/fcl/full', methods=['GET'])
@handle_db_errors
def get_fcl_full():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT * FROM fcl_monitor_logs_archive
                ORDER BY created_at ASC
            """)
            rows = cursor.fetchall()
            return jsonify({'status': 'success', 'data': rows}), 200

# --- SCL APIs ---

@orders_bp.route('/archive/scl/latest', methods=['GET'])
@handle_db_errors
def get_scl_latest():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT * FROM scl_monitor_logs_archive
                ORDER BY created_at DESC
                LIMIT 1
            """)
            row = cursor.fetchone()
            return jsonify({'status': 'success', 'data': row}), 200


@orders_bp.route('/archive/scl/full', methods=['GET'])
@handle_db_errors
def get_scl_full():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT * FROM scl_monitor_logs_archive
                ORDER BY created_at ASC
            """)
            rows = cursor.fetchall()
            return jsonify({'status': 'success', 'data': rows}), 200

# --- MILA APIs ---

@orders_bp.route('/mila/archive/latest', methods=['GET'])
def get_latest_mila_archive():
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT *
                    FROM mila_monitor_logs_archive
                    ORDER BY created_at DESC
                    LIMIT 1
                """)
                row = cur.fetchone()
                if not row:
                    return jsonify({"status": "error", "message": "No archive data found"}), 404
                return jsonify({"status": "success", "data": row}), 200
    except Exception as e:
        logger.error("❌ Error fetching latest MILA archive", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@orders_bp.route('/mila/archive/all', methods=['GET'])
def get_all_mila_archive():
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT *
                    FROM mila_monitor_logs_archive
                    ORDER BY created_at ASC
                """)
                rows = cur.fetchall()
                return jsonify({"status": "success", "data": rows}), 200
    except Exception as e:
        logger.error("❌ Error fetching MILA archive", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500
    
@orders_bp.route('/mila/archive/latest-10', methods=['GET'])
def get_latest_10_mila_archive():
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Step 1: Count total rows
                cur.execute("SELECT COUNT(*) FROM mila_monitor_logs_archive")
                total_count = cur.fetchone()['count']

                # Step 2: Compute offset (total - 10, but not less than 0)
                offset = max(total_count - 10, 0)

                # Step 3: Fetch last 10 records in correct order
                cur.execute("""
                    SELECT *
                    FROM mila_monitor_logs_archive
                    ORDER BY created_at
                    OFFSET %s LIMIT 10
                """, (offset,))

                rows = cur.fetchall()
                return jsonify({"status": "success", "data": rows}), 200
    except Exception as e:
        logger.error("❌ Error fetching latest 10 MILA archive records", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@orders_bp.route('/mila/archive/summary', methods=['GET'])
def get_mila_archive_summary():
    """
    ✅ DELTA-BASED MILA Summary Calculation
    Calculates difference between LAST and FIRST records in the time range
    """
    from flask import request, jsonify
    import json
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if not start_date or not end_date:
            return jsonify({"status": "error", "message": "start_date and end_date are required"}), 400

        # ✅ Parse and log the incoming timestamps
        from datetime import datetime, timedelta
        start_parsed = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_parsed = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        # ✅ Add small buffer (5 mins) to catch records that are slightly off the hour mark
        # Archive records are stored at exact hour marks (e.g., 15:00:00, 16:00:00)
        # We need to catch these records even if they are slightly delayed
        start_with_buffer = start_parsed - timedelta(minutes=5)
        end_with_buffer = end_parsed + timedelta(minutes=5)
        
        logger.info(f"📊 [MIL-A Summary] Received request:")
        logger.info(f"  - start_date: {start_date} -> parsed: {start_parsed}")
        logger.info(f"  - end_date: {end_date} -> parsed: {end_parsed}")
        logger.info(f"  - start_with_buffer (UTC): {start_with_buffer}")
        logger.info(f"  - end_with_buffer (UTC): {end_with_buffer}")
        logger.info(f"  - Time difference: {(end_parsed - start_parsed).total_seconds() / 3600:.2f} hours")

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # First, check what records exist in the table
                cur.execute("""
                    SELECT 
                        MIN(created_at) as earliest,
                        MAX(created_at) as latest,
                        COUNT(*) as total
                    FROM mila_monitor_logs_archive
                """)
                table_stats = cur.fetchone()
                logger.info(f"📊 [MIL-A Summary] Table has {table_stats['total']} total records from {table_stats['earliest']} to {table_stats['latest']}")
                
                # Query archived data (ordered by created_at ASC)
                # ✅ Convert UTC timestamps to Dubai time in Python, then compare as naive timestamps
                # Database stores timestamps as naive timestamps (already in Dubai time)
                # ✅ Use buffered times to catch records slightly before/after selected range
                import pytz
                dubai_tz = pytz.timezone('Asia/Dubai')
                
                # Convert UTC to Dubai time with 5-minute buffer
                start_dubai = start_with_buffer.astimezone(dubai_tz).replace(tzinfo=None)
                end_dubai = end_with_buffer.astimezone(dubai_tz).replace(tzinfo=None)
                
                logger.info(f"🕐 [MIL-A Summary] Converted to Dubai time (with buffer):")
                logger.info(f"  - start_dubai: {start_dubai} (original: {start_parsed.astimezone(dubai_tz).replace(tzinfo=None)})")
                logger.info(f"  - end_dubai: {end_dubai} (original: {end_parsed.astimezone(dubai_tz).replace(tzinfo=None)})")
                
                # ✅ Execute query with detailed logging
                query = """
                    SELECT *
                    FROM mila_monitor_logs_archive
                    WHERE created_at >= %s
                      AND created_at <= %s
                    ORDER BY created_at ASC
                """
                logger.info(f"🔍 [MIL-A Summary] Executing query:")
                logger.info(f"  SQL: {query}")
                logger.info(f"  Params: start={start_dubai}, end={end_dubai}")
                
                cur.execute(query, (start_dubai, end_dubai))
                rows = cur.fetchall()
                
                logger.info(f"📊 [MIL-A Summary] Found {len(rows)} rows in range {start_dubai} to {end_dubai}")
                
                # Always show what we found
                if rows:
                    logger.info(f"📊 [MIL-A Summary] ✅ Found {len(rows)} matching record(s):")
                    for idx, r in enumerate(rows):
                        logger.info(f"  {idx+1}. ID {r.get('id')}: {r.get('order_name')} at {r.get('created_at')}")
                else:
                    logger.warning(f"📊 [MIL-A Summary] ⚠️ No records found in database for this range!")
                
                # Always show nearby records for comparison
                cur.execute("""
                    SELECT id, order_name, created_at 
                    FROM mila_monitor_logs_archive 
                    WHERE created_at >= %s - INTERVAL '2 hours'
                      AND created_at <= %s + INTERVAL '2 hours'
                    ORDER BY created_at ASC
                """, (start_dubai, end_dubai))
                nearby = cur.fetchall()
                logger.info(f"📊 [MIL-A Summary] Records within ±2 hours of range:")
                for r in nearby:
                    in_range = start_dubai <= r['created_at'] <= end_dubai
                    marker = "✅" if in_range else "  "
                    logger.info(f"  {marker} ID {r['id']}: {r['order_name']} at {r['created_at']}")

        all_rows = rows

        record_count = len(all_rows)
        
        if record_count < 1:
            logger.warning(f"📊 [MIL-A Summary] No records found in range")
            return jsonify({
                "status": "error",
                "message": "No records found in selected time range",
                "records_found": 0
            }), 400

        # Get FIRST and LAST records for delta calculation
        # If only 1 record, first = last
        first_record = all_rows[0]
        last_record = all_rows[-1]

        logger.info(f"📊 [MIL-A Delta] First: {first_record.get('created_at')}, Last: {last_record.get('created_at')}")

        # ✅ Calculate DELTA for produced weight
        first_produced = float(first_record.get("produced_weight") or 0)
        last_produced = float(last_record.get("produced_weight") or 0)
        total_produced_weight = last_produced - first_produced

        # ✅ Calculate DELTA for bran_receiver (cumulative counters)
        first_bran = first_record.get("bran_receiver")
        last_bran = last_record.get("bran_receiver")
        
        if isinstance(first_bran, str):
            first_bran = json.loads(first_bran or "{}")
        if isinstance(last_bran, str):
            last_bran = json.loads(last_bran or "{}")
        
        bran_receiver_totals = {}
        for key in last_bran.keys():
            last_val = float(last_bran.get(key) or 0)
            first_val = float(first_bran.get(key) or 0)
            delta = last_val - first_val
            bran_receiver_totals[key] = round(delta, 3)
            logger.info(f"📊 [MIL-A Bran] {key}: {first_val:,.1f} -> {last_val:,.1f} = {delta:,.1f} kg")

        # ✅ Calculate DELTA for receiver weights
        first_receivers = first_record.get("receiver")
        last_receivers = last_record.get("receiver")
        
        if isinstance(first_receivers, str):
            first_receivers = json.loads(first_receivers or "[]")
        if isinstance(last_receivers, str):
            last_receivers = json.loads(last_receivers or "[]")
        
        receiver_weight_totals = {}
        for last_rec in last_receivers:
            bin_id = last_rec.get("bin_id")  # ✅ Get bin_id from archive
            mat_code = last_rec.get("material_code")
            mat_name = last_rec.get("material_name")
            last_weight = float(last_rec.get("weight_kg") or 0)
            
            # Find matching receiver in first record
            first_rec = next((r for r in first_receivers if r.get("material_code") == mat_code and r.get("material_name") == mat_name), None)
            first_weight = float(first_rec.get("weight_kg") or 0) if first_rec else 0
            
            delta = last_weight - first_weight
            
            # ✅ Store as dict with bin_id, material_code and material_name for frontend display
            name = mat_name or f"Receiver {mat_code}" if mat_code else "Unknown"
            receiver_weight_totals[name] = {
                "bin_id": bin_id,  # ✅ Include bin_id for frontend
                "material_code": mat_code,
                "material_name": mat_name or name,
                "weight_kg": round(delta, 3)
            }

        # Get yield_log and setpoints from last record (current values)
        last_yield_log = last_record.get("yield_log")
        last_setpoints = last_record.get("setpoints_produced")
        
        if isinstance(last_yield_log, str):
            last_yield_log = json.loads(last_yield_log or "{}")
        if isinstance(last_setpoints, str):
            last_setpoints = json.loads(last_setpoints or "{}")
        
        # Extract flow values and percentages
        average_yield_flows = {}
        average_yield_log = {}
        for k, v in last_yield_log.items():
            if isinstance(v, (int, float)):
                if "Flow" in k:
                    average_yield_flows[k] = round(v, 3)
                else:
                    average_yield_log[k] = round(v, 3)
        
        average_setpoints_percentages = {k: round(v, 3) for k, v in last_setpoints.items() if isinstance(v, (int, float))}

        summary_response = {
            "record_count": record_count,
            "total_produced_weight": round(total_produced_weight, 3),
            "average_yield_log": average_yield_log,
            "average_setpoints_percentages": average_setpoints_percentages,
            "average_yield_flows": average_yield_flows,
                "bran_receiver_totals": bran_receiver_totals,
                "receiver_weight_totals": receiver_weight_totals,
            "start_time": first_record.get("created_at"),
            "end_time": last_record.get("created_at")
        }
        
        logger.info(f"📊 [MIL-A Summary] Sending bran_receiver_totals: {bran_receiver_totals}")
        logger.info(f"📊 [MIL-A Summary] Total bran: {sum(bran_receiver_totals.values()):,.1f} kg")
        
        return jsonify({
            "status": "success",
            "summary": summary_response
        }), 200

    except Exception as e:
        logger.error("❌ Error summarizing MILA archive", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@orders_bp.route('/scl/archive/summary', methods=['GET'])
@handle_db_errors
def get_scl_archive_summary():
    """
    ✅ SUMMATION-BASED SCL Summary Calculation (like FCL)
    Sums hourly totals across all records in the time range
    """
    from flask import request, jsonify
    from datetime import datetime, timedelta
    import json

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        return jsonify({"status": "error", "message": "start_date and end_date are required"}), 400

    # ✅ Parse timestamps
    start_parsed = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    end_parsed = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    
    # ✅ Convert UTC to Dubai time (database stores naive timestamps in Dubai time)
    import pytz
    dubai_tz = pytz.timezone('Asia/Dubai')
    
    # Add small buffer (5 mins) to catch records that are slightly off the hour mark
    # e.g. 15:00 request -> 14:55 to 15:05 range -> catches 15:00:00.xx
    start_dubai = start_parsed.astimezone(dubai_tz).replace(tzinfo=None) - timedelta(minutes=5)
    end_dubai = end_parsed.astimezone(dubai_tz).replace(tzinfo=None) + timedelta(minutes=5)
    
    logger.info(f"🕐 [SCL Summary] Querying range (Dubai time + buffer): {start_dubai} to {end_dubai}")

    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Query using naive timestamps (database is already in Dubai time)
            # ✅ Use >= start and <= end to include both boundaries (e.g. 3 PM and 4 PM)
            cur.execute("""
                SELECT *
                FROM scl_monitor_logs_archive
                WHERE created_at >= %s
                  AND created_at <= %s
                ORDER BY created_at ASC
            """, (start_dubai, end_dubai))
            rows = cur.fetchall()

    record_count = len(rows)
    
    if record_count < 1:
        return jsonify({
            "status": "error", 
            "message": "No records found in selected time range"
        }), 400

    # Get LAST record for current values (flow rate, setpoints, etc.)
    last_record = rows[-1]
    
    # ✅ Debug: Show all record timestamps and flow_rate values
    logger.info(f"📊 [SCL Summary] Found {record_count} records:")
    for i, r in enumerate(rows):
        flow_rate_debug = r.get('flow_rate') if 'flow_rate' in r else (r.get('Flowrate') if 'Flowrate' in r else 'N/A')
        logger.info(f"   Record {i+1}: created_at={r.get('created_at')}, receiver={r.get('receiver')}, flow_rate={flow_rate_debug}, per_bin_weights={r.get('per_bin_weights')}")
    
    # ✅ Debug: Show last record keys to diagnose field name issues
    if last_record:
        logger.info(f"🔍 [SCL Summary] Last record keys: {list(last_record.keys())}")
        logger.info(f"🔍 [SCL Summary] Last record flow_rate (direct): {last_record.get('flow_rate')}")
        logger.info(f"🔍 [SCL Summary] Last record flow_rate (dict access): {dict(last_record).get('flow_rate') if isinstance(last_record, dict) else 'N/A'}")

    # ✅ SUM produced_weight across all records (hourly totals - like FCL)
    total_produced_weight = sum(float(r.get('produced_weight') or 0) for r in rows)
    logger.info(f"📊 [SCL Summary] Produced weight (sum): {total_produced_weight} kg from {record_count} records")

    # ✅ SUM receiver across all records (hourly totals - like FCL)
    total_receiver_weight = sum(float(r.get('receiver') or 0) for r in rows)
    logger.info(f"📊 [SCL Summary] Receiver weight (sum): {total_receiver_weight} kg")

    # ✅ SUM per_bin_weights across all records (like FCL)
    from collections import defaultdict
    bin_weight_totals = defaultdict(float)
    for r in rows:
        current_bins = r.get("per_bin_weights")
        if isinstance(current_bins, str):
            current_bins = json.loads(current_bins or "[]")
        
        for b in current_bins:
            bin_id = b.get("bin_id")
            weight = float(b.get("total_weight") or 0)
            bin_weight_totals[f"bin_{bin_id}"] += weight
    
    # Convert to regular dict with rounded values
    bin_weight_totals = {k: round(v, 3) for k, v in bin_weight_totals.items()}
    logger.info(f"📊 [SCL Summary] Per-bin totals (sum): {bin_weight_totals}")

    # Get setpoints from last record (current values)
    # ✅ Find the most recent non-zero flow_rate value (for display in report)
    # This ensures we show the actual flow rate when the system was running, not 0.0 when stopped
    flow_rate_value = None
    
    # Search backwards through all records to find the most recent non-zero flow_rate
    # This handles cases where the last record has flow_rate=0.0 (system stopped)
    for record in reversed(rows):  # Search from last to first
        if isinstance(record, dict):
            # Try multiple field name variations
            candidate = record.get('flow_rate')
            if candidate is None:
                candidate = record.get('Flowrate')
            if candidate is None:
                candidate = record.get('FlowRate')
            if candidate is None:
                candidate = record.get('flowrate')
            
            # Use the first non-NULL, non-zero value we find (most recent)
            if candidate is not None:
                try:
                    candidate_float = float(candidate)
                    if candidate_float != 0.0:
                        flow_rate_value = candidate_float
                        logger.info(f"✅ [SCL Summary] Found flow_rate={flow_rate_value} in record at {record.get('created_at')}")
                        break
                    elif flow_rate_value is None:
                        # Store the first value we find (even if 0) as fallback
                        flow_rate_value = candidate_float
                except (ValueError, TypeError):
                    pass
    
    # If we still don't have a value, default to 0
    if flow_rate_value is None:
        flow_rate_value = 0.0
        logger.warning(f"⚠️ [SCL Summary] No valid flow_rate found in any record")
    
    average_flow_rate = float(flow_rate_value)
    logger.info(f"✅ [SCL Summary] Final flow_rate value: {average_flow_rate}")
    
    average_moisture_offset = float(last_record.get('moisture_offset') or 0)
    average_moisture_setpoint = float(last_record.get('moisture_setpoint') or 0)

    # ✅ Extract material names from active_sources for sender bins (aggregate from ALL records)
    material_summary = {}
    
    for record in rows:
        sources = record.get("active_sources")
        if isinstance(sources, str):
            sources = json.loads(sources or "[]")
        
        for source in sources:
            bin_id = source.get("bin_id")
            
            # Try multiple ways to get material name
            material_name = None
            
            # 1. Try nested material.material_name (Most reliable)
            material = source.get("material")
            if material and isinstance(material, dict):
                material_name = material.get("material_name")
            else:
                # 2. Fallback to prd_name
                material_name = source.get("prd_name")
            
            # Store material name for this bin
            if material_name and bin_id and material_name != "N/A":
                material_summary[f"bin_{bin_id}"] = material_name
    
    logger.info(f"[SCL Summary] Extracted {len(material_summary)} material names from ALL records")

    # ✅ Extract receiver material info from active_destination
    receiver_weight_totals = {}
    receiver_bin_id = None  # ✅ Store bin ID for frontend
    
    # Iterate all records to find valid receiver info
    for record in rows:
        dest = record.get("active_destination")
        if isinstance(dest, str):
            dest = json.loads(dest or "{}")
        
        if dest and isinstance(dest, dict):
            if dest.get("bin_id"):
                receiver_bin_id = dest.get("bin_id")
            
            # Try to get material name
            mat_name = None
            if dest.get("material") and isinstance(dest.get("material"), dict):
                mat_name = dest.get("material", {}).get("material_name")
            elif dest.get("prd_name"):
                mat_name = dest.get("prd_name")
            
            if mat_name and total_receiver_weight > 0:
                # Update/Overwrite with valid name
                receiver_weight_totals = {mat_name: round(total_receiver_weight, 3)}
                logger.debug(f"[SCL Summary] Receiver bin {receiver_bin_id} → {mat_name}: {total_receiver_weight} kg")
                
                # If we found a good DB name, break
                if dest.get("material"):
                    break

    # Response
    return jsonify({
        "status": "success",
        "summary": {
            "record_count": record_count,
            "total_produced_weight": round(total_produced_weight, 3),
            "total_receiver_weight": round(total_receiver_weight, 3),
            "average_flow_rate": round(average_flow_rate, 3),
            "average_moisture_offset": round(average_moisture_offset, 3),
            "average_moisture_setpoint": round(average_moisture_setpoint, 3),
            "per_bin_weight_totals": bin_weight_totals,
            "material_summary": material_summary,
            "receiver_weight": receiver_weight_totals,
            "receiver_bin_id": receiver_bin_id,  # ✅ Add bin ID for frontend display
            "start_time": rows[0].get("created_at"),  # ✅ First record in the range
            "end_time": last_record.get("created_at")  # Last record in the range
        }
    }), 200

@orders_bp.route('/fcl/archive/summary', methods=['GET'])
@handle_db_errors
def get_fcl_summary():
    """
    ✅ DELTA-BASED FCL Summary Calculation
    Calculates difference between LAST and FIRST records in the time range
    """
    from datetime import datetime, timedelta
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        return jsonify({'status': 'error', 'message': 'Missing start_date or end_date'}), 400

    # ✅ Parse timestamps and add 1-hour buffer to catch all archive records
    start_parsed = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    end_parsed = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    
    # ✅ Convert UTC to Dubai time (database stores naive timestamps in Dubai time)
    import pytz
    dubai_tz = pytz.timezone('Asia/Dubai')
    
    # Add small buffer (5 mins) to catch records that are slightly off the hour mark
    start_dubai = start_parsed.astimezone(dubai_tz).replace(tzinfo=None) - timedelta(minutes=5)
    end_dubai = end_parsed.astimezone(dubai_tz).replace(tzinfo=None) + timedelta(minutes=5)
    
    logger.info(f"🕐 [FCL Summary] Converted to Dubai time (with buffer): {start_dubai} to {end_dubai}")

    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Query using naive timestamps (database is already in Dubai time)
            cursor.execute("""
                SELECT * FROM fcl_monitor_logs_archive
                WHERE created_at >= %s
                  AND created_at <= %s
                ORDER BY created_at ASC
            """, (start_dubai, end_dubai))
            rows = cursor.fetchall()

    record_count = len(rows)
    
    if record_count < 1:
        return jsonify({
            'status': 'error', 
            'message': 'No records found in selected time range'
        }), 400

    # Get FIRST and LAST records for delta calculation
    # If only 1 record, first = last
    first_record = rows[0]
    last_record = rows[-1]

    # ✅ SUM produced weight from ALL archive records (each archive = hourly total)
    # Archive stores "how much was produced in that hour", so we SUM across multiple hours
    total_produced_weight = 0
    for record in rows:
        produced = float(record.get("produced_weight") or 0)
        total_produced_weight += produced
        logger.info(f"[FCL Summary] Adding produced_weight from record {record.get('id')}: {produced} kg")
    
    total_produced_weight = round(total_produced_weight, 3)
    logger.info(f"[FCL Summary] ✅ Total Produced Weight (summed): {total_produced_weight} kg")

    # ✅ SUM main receiver from ALL archive records (each archive = hourly total)
    # Archive stores "how much was received in that hour", so we SUM across multiple hours
    main_receiver_sum = 0
    for record in rows:
        receiver_val = float(record.get("receiver") or 0)
        main_receiver_sum += receiver_val
        logger.info(f"[FCL Summary] Adding receiver from record {record.get('id')}: {receiver_val} kg")
    
    main_receiver_sum = round(main_receiver_sum, 3)
    logger.info(f"[FCL Summary] ✅ Main Receiver Total (summed): {main_receiver_sum} kg")
    
    # ✅ Calculate DELTA for FCL_2_520WE (cumulative counter from fcl_receivers)
    first_fcl_receivers = first_record.get("fcl_receivers")
    last_fcl_receivers = last_record.get("fcl_receivers")
    
    if isinstance(first_fcl_receivers, str):
        first_fcl_receivers = json.loads(first_fcl_receivers or "[]")
    if isinstance(last_fcl_receivers, str):
        last_fcl_receivers = json.loads(last_fcl_receivers or "[]")
    
    # Calculate delta for FCL_2_520WE
    fcl_2_520we_delta = 0  # ✅ Store FCL_2_520WE separately
    fcl_2_520we_last_value = 0 # ✅ Store last absolute value
    
    for last_rec in last_fcl_receivers:
        receiver_id = last_rec.get("id")
        last_weight = float(last_rec.get("weight") or 0)
        
        # Find matching receiver in first record
        first_rec = next((r for r in first_fcl_receivers if r.get("id") == receiver_id), None)
        first_weight = float(first_rec.get("weight") or 0) if first_rec else 0
        
        delta = last_weight - first_weight
        
        # ✅ Store FCL_2_520WE delta separately for display
        if receiver_id == "FCL_2_520WE" or "520WE" in str(receiver_id):
            fcl_2_520we_delta = delta
            fcl_2_520we_last_value = last_weight
            logger.info(f"[FCL Summary] ✅ FCL_2_520WE: {first_weight} → {last_weight} = {delta} kg")
    
    # ✅ Total receiver weight = main receiver (summed) + FCL_2_520WE (delta)
    total_receiver_weight = main_receiver_sum + fcl_2_520we_delta

    # ✅ SUM per_bin_weights from ALL archive records (each archive = hourly total)
    # Archive stores "how much was sent in that hour", so we SUM across multiple hours
    per_bin_weight_totals = {}
    all_bin_ids = set()
    
    for record in rows:
        bins = record.get("per_bin_weights")
        
        if isinstance(bins, str):
            bins = json.loads(bins or "[]")
        
        for bin_entry in bins:
            bin_id = bin_entry.get("bin_id")
            weight = float(bin_entry.get("total_weight") or 0)
            
            all_bin_ids.add(bin_id)
            
            if f"bin_{bin_id}" not in per_bin_weight_totals:
                per_bin_weight_totals[f"bin_{bin_id}"] = 0
            
            per_bin_weight_totals[f"bin_{bin_id}"] += weight  # ✅ SUM all hours
    
    # Round all totals
    for bin_key in per_bin_weight_totals:
        per_bin_weight_totals[bin_key] = round(per_bin_weight_totals[bin_key], 3)
        logger.info(f"[FCL Summary] ✅ {bin_key} total (summed): {per_bin_weight_totals[bin_key]} kg")

    # Get setpoints from last record (current values)
    average_flow_rate = float(last_record.get("flow_rate") or 0)
    average_moisture_offset = float(last_record.get("moisture_offset") or 0)
    average_moisture_setpoint = float(last_record.get("moisture_setpoint") or 0)
    cleaning_scale_bypass = last_record.get("cleaning_scale_bypass") # ✅ New field

    # ✅ Extract material names from active_sources for sender bins (aggregate from ALL records)
    material_summary = {}
    
    for record in rows:
        sources = record.get("active_sources")
        if isinstance(sources, str):
            sources = json.loads(sources or "[]")
        
        for source in sources:
            bin_id = source.get("bin_id")
            
            # Try multiple ways to get material name
            material_name = None
            
            # 1. Try nested material.material_name (DB Enrichment - Priority)
            if source.get("material") and isinstance(source.get("material"), dict):
                material_name = source["material"].get("material_name")
            
            # 2. Fallback to prd_name field (PLC)
            if not material_name and source.get("prd_name"):
                material_name = source.get("prd_name")
            
            # 3. Fallback to material_name field directly
            if not material_name and source.get("material_name"):
                material_name = source.get("material_name")
            
            # Store material name for this bin (if found)
            if material_name and bin_id and material_name != "N/A":
                material_summary[f"bin_{bin_id}"] = material_name
    
    logger.info(f"[FCL Summary] ✅ Extracted {len(material_summary)} material names from ALL records: {material_summary}")

    # ✅ Extract receiver bin ID and material name from active_destination (Aggregate from ALL records)
    receiver_bin_id = None
    receiver_material_name = None
    
    for record in rows:
        dest = record.get("active_destination")
        if isinstance(dest, str):
            dest = json.loads(dest or "{}")
        
        if dest and isinstance(dest, dict):
            # Update bin ID if present
            if dest.get("bin_id"):
                receiver_bin_id = dest.get("bin_id")
            
            # Try to get material name
            mat_name = None
            if dest.get("material") and isinstance(dest.get("material"), dict):
                mat_name = dest["material"].get("material_name")
            elif dest.get("prd_name"):
                mat_name = dest.get("prd_name")
            
            if mat_name and mat_name != "N/A":
                receiver_material_name = mat_name
                # Keep searching in case there's a better one later, or break? 
                # Usually safe to keep the last non-N/A value found, or first.
                # Let's break once we find a valid DB-enriched name.
                if dest.get("material"): 
                    break
    
    logger.info(f"[FCL Summary] Receiver: bin {receiver_bin_id}, material: {receiver_material_name}")

    # Prepare summary output
    summary = {
        "record_count": record_count,
        "average_flow_rate": round(average_flow_rate, 3),
        "average_moisture_offset": round(average_moisture_offset, 3),
        "average_moisture_setpoint": round(average_moisture_setpoint, 3),
        "cleaning_scale_bypass": cleaning_scale_bypass, # ✅ New field
        "total_produced_weight": round(total_produced_weight, 3),
        "total_receiver_weight": round(total_receiver_weight, 3),  # Total (main + FCL_2_520WE delta)
        "main_receiver_weight": round(fcl_2_520we_last_value, 3),  # ✅ SWAPPED: Display 520WE value in first row
        "fcl_2_520we_weight": round(main_receiver_sum, 3),  # ✅ SWAPPED: Display bin value in second row
        "fcl_2_520we_last_value": round(fcl_2_520we_last_value, 3), 
        "per_bin_weight_totals": per_bin_weight_totals,
        "material_summary": material_summary,
        "receiver_bin_id": "FCL_2_520WE",  # ✅ SWAPPED: First row ID
        "receiver_material_name": "Cumulative Counter",  # ✅ SWAPPED: First row name
        "second_receiver_id": receiver_bin_id,  # ✅ New field for second row
        "second_receiver_material": receiver_material_name, # ✅ New field for second row
        "start_time": first_record.get("created_at"),
        "end_time": last_record.get("created_at")
    }
    
    # ✅ Log final summary for debugging
    logger.info(f"[FCL Summary] 📊 Returning summary:")
    logger.info(f"  - per_bin_weight_totals (SUMMED): {len(per_bin_weight_totals)} bins, total: {sum(per_bin_weight_totals.values()):.1f} kg")
    logger.info(f"  - material_summary: {len(material_summary)} materials")
    logger.info(f"  - total_produced_weight: {summary['total_produced_weight']} kg")
    logger.info(f"  - main_receiver_weight (SUMMED, bin {receiver_bin_id}): {summary['main_receiver_weight']} kg")
    logger.info(f"  - fcl_2_520we_weight (DELTA): {summary['fcl_2_520we_weight']} kg")
    logger.info(f"  - total_receiver_weight (main + FCL_2_520WE): {summary['total_receiver_weight']} kg")

    return jsonify({
        "status": "success",
        "summary": summary
    }), 200
# =============================================================================
# Energy Monitoring Routes
# =============================================================================

@orders_bp.route('/store-energy-reading', methods=['POST'])
@handle_db_errors
def store_energy_reading():
    """Store energy readings from frontend"""
    data = request.get_json()
    
    # Validate required fields
    required = ['block_name', 'total_active_energy', 'total_reactive_energy',
                'total_apparent_energy', 'voltage_l1_l2', 'effective_power']
    
    for field in required:
        if field not in data:
            logger.warning(f"Missing field in energy reading: {field}")
            return jsonify({'error': f'Missing field: {field}'}), 400
    
    # Validate block_name
    valid_blocks = ['C2', 'M20', 'M21', 'M22', 'M23', 'M24']
    block_name = data['block_name']
    if block_name not in valid_blocks:
        logger.warning(f"Invalid block_name: {block_name}")
        return jsonify({'error': f'Invalid block_name. Must be one of: {", ".join(valid_blocks)}'}), 400
    
    # Validate and convert numeric values
    try:
        total_active_energy = float(data['total_active_energy'])
        total_reactive_energy = float(data['total_reactive_energy'])
        total_apparent_energy = float(data['total_apparent_energy'])
        voltage_l1_l2 = float(data['voltage_l1_l2'])
        effective_power = float(data['effective_power'])
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid numeric value in energy reading: {e}")
        return jsonify({'error': 'Invalid numeric value in energy reading'}), 400
    
    # Store in database
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO energy_readings (
                        block_name, total_active_energy, total_reactive_energy,
                        total_apparent_energy, voltage_l1_l2, effective_power, timestamp
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                """, (
                    block_name,
                    total_active_energy,
                    total_reactive_energy,
                    total_apparent_energy,
                    voltage_l1_l2,
                    effective_power
                ))
                reading_id = cursor.fetchone()[0]
                conn.commit()
        
        logger.info(f"✅ Energy reading stored for {block_name} (ID: {reading_id})")
        return jsonify({'message': 'Stored successfully', 'id': reading_id}), 201
    
    except Exception as e:
        logger.error(f"❌ Error storing energy reading for {block_name}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to store energy reading'}), 500


@orders_bp.route('/store-energy-readings-batch', methods=['POST'])
@handle_db_errors
def store_energy_readings_batch():
    """Store multiple energy readings at once (optional batch endpoint)"""
    data = request.get_json()
    
    if not isinstance(data, dict) or 'readings' not in data:
        return jsonify({'error': 'Missing "readings" array in request body'}), 400
    
    readings = data['readings']
    if not isinstance(readings, list):
        return jsonify({'error': '"readings" must be an array'}), 400
    
    valid_blocks = ['C2', 'M20', 'M21', 'M22', 'M23', 'M24']
    required_fields = ['block_name', 'total_active_energy', 'total_reactive_energy',
                      'total_apparent_energy', 'voltage_l1_l2', 'effective_power']
    
    stored_count = 0
    errors = []
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                for idx, reading in enumerate(readings):
                    try:
                        # Validate required fields
                        for field in required_fields:
                            if field not in reading:
                                errors.append(f"Reading {idx}: Missing field '{field}'")
                                continue
                        
                        # Validate block_name
                        block_name = reading['block_name']
                        if block_name not in valid_blocks:
                            errors.append(f"Reading {idx}: Invalid block_name '{block_name}'")
                            continue
                        
                        # Convert numeric values
                        try:
                            total_active_energy = float(reading['total_active_energy'])
                            total_reactive_energy = float(reading['total_reactive_energy'])
                            total_apparent_energy = float(reading['total_apparent_energy'])
                            voltage_l1_l2 = float(reading['voltage_l1_l2'])
                            effective_power = float(reading['effective_power'])
                        except (ValueError, TypeError):
                            errors.append(f"Reading {idx}: Invalid numeric values")
                            continue
                        
                        # Insert reading
                        cursor.execute("""
                            INSERT INTO energy_readings (
                                block_name, total_active_energy, total_reactive_energy,
                                total_apparent_energy, voltage_l1_l2, effective_power, timestamp
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        """, (
                            block_name,
                            total_active_energy,
                            total_reactive_energy,
                            total_apparent_energy,
                            voltage_l1_l2,
                            effective_power
                        ))
                        stored_count += 1
                        
                    except Exception as e:
                        errors.append(f"Reading {idx}: {str(e)}")
                        logger.error(f"Error processing reading {idx}: {e}")
                
                conn.commit()
        
        logger.info(f"✅ Batch stored: {stored_count} readings, {len(errors)} errors")
        return jsonify({
            'message': f'Stored {stored_count} readings',
            'stored_count': stored_count,
            'error_count': len(errors),
            'errors': errors if errors else None
        }), 201
    
    except Exception as e:
        logger.error(f"❌ Error in batch store: {e}", exc_info=True)
        return jsonify({'error': 'Failed to store energy readings'}), 500


@orders_bp.route('/get-energy-history', methods=['GET'])
@handle_db_errors
def get_energy_history():
    """Get energy reading history"""
    block_name = request.args.get('block_name')
    limit = request.args.get('limit', 100, type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = "SELECT * FROM energy_readings WHERE 1=1"
    params = []
    
    if block_name:
        query += " AND block_name = %s"
        params.append(block_name)
    
    if start_date:
        query += " AND timestamp >= %s"
        params.append(start_date)
    
    if end_date:
        query += " AND timestamp <= %s"
        params.append(end_date)
    
    query += " ORDER BY timestamp DESC LIMIT %s"
    params.append(limit)
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(query, params)
            readings = cursor.fetchall()
            
            for reading in readings:
                if reading.get('timestamp'):
                    reading['timestamp'] = reading['timestamp'].isoformat()
    
    return jsonify({'status': 'success', 'count': len(readings), 'data': readings}), 200
