"""
Tag Reader Utility

Reads tag values from PLC dynamically based on tag configurations stored in database.
"""

import struct
import logging
import math
import re
import time
from contextlib import closing
from snap7.util import get_bool
import psycopg2
from psycopg2.extras import RealDictCursor
from asteval import Interpreter

_tag_interp = Interpreter()

logger = logging.getLogger(__name__)

# Log once when bins/materials tables are missing to avoid console spam
_bins_table_missing_logged = False


def evaluate_value_formula(formula, raw_value):
    """
    Evaluate a formula for transforming PLC tag values.
    Uses 'value' as the variable name for the raw PLC value.
    
    Example formulas:
    - "value * 0.277778" (t/h to kg/s)
    - "value / 1000" (grams to kilograms)
    - "value * 1.8 + 32" (Celsius to Fahrenheit)
    - "value * 0.01" (percentage conversion)
    
    Args:
        formula: String formula expression
        raw_value: Raw value from PLC
    
    Returns:
        Transformed value or raw_value if formula is invalid/empty
    """
    if not formula or not formula.strip():
        return raw_value
    
    try:
        # Replace 'value' with the actual value
        expression = formula.strip()
        
        # Replace 'value' variable with the actual value (case-insensitive)
        expression = re.sub(r'\bvalue\b', str(raw_value), expression, flags=re.IGNORECASE)
        
        # Evaluate the expression safely via asteval (has all math functions built in)
        result = _tag_interp(expression)
        
        # Ensure result is a number
        if isinstance(result, (int, float)):
            return float(result)
        else:
            logger.warning(f"Formula '{formula}' returned non-numeric result: {result}")
            return raw_value
            
    except Exception as e:
        logger.error(f"Error evaluating formula '{formula}': {e}")
        return raw_value  # Fallback to raw value on error


def read_tag_value(plc, tag_config):
    """
    Read a single tag value from PLC based on tag configuration.
    
    Args:
        plc: Connected PLC client (snap7 client)
        tag_config: dict with tag configuration fields:
            - db_number: int
            - offset: int
            - data_type: str ('BOOL', 'INT', 'DINT', 'REAL', 'STRING')
            - bit_position: int (for BOOL, 0-7)
            - string_length: int (for STRING, default 40)
            - byte_swap: bool (for REAL, default True)
    
    Returns:
        Tag value (int, float, bool, str) or None on error
    """
    try:
        db_number = tag_config['db_number']
        offset = tag_config['offset']
        data_type = tag_config['data_type']
        tag_name = tag_config.get('tag_name', 'Unknown')
        
        if data_type == 'BOOL':
            bit_pos = tag_config.get('bit_position', 0)
            if bit_pos is None:
                bit_pos = 0
            data = plc.db_read(db_number, offset, 1)
            value = get_bool(data, 0, bit_pos)
            logger.debug(f"Read BOOL tag '{tag_name}' from DB{db_number}.{offset}.{bit_pos} = {value}")
            return value
        
        elif data_type == 'INT':
            data = plc.db_read(db_number, offset, 2)
            value = struct.unpack('>h', data)[0]
            logger.debug(f"Read INT tag '{tag_name}' from DB{db_number}.{offset} = {value}")
            return value
        
        elif data_type == 'DINT':
            data = plc.db_read(db_number, offset, 4)
            value = struct.unpack('>i', data)[0]
            logger.debug(f"Read DINT tag '{tag_name}' from DB{db_number}.{offset} = {value}")
            return value
        
        elif data_type == 'REAL':
            data = plc.db_read(db_number, offset, 4)
            byte_swap = tag_config.get('byte_swap', False)  # Default to False (big-endian) to match orders_bp.py
            if byte_swap:
                # Little-endian (reverse bytes for Siemens PLC)
                data = data[::-1]
                value = struct.unpack('<f', data)[0]
            else:
                # Big-endian (standard for Siemens PLC REAL type)
                value = struct.unpack('>f', data)[0]
            
            decimal_places = tag_config.get('decimal_places', 2)
            value = round(value, decimal_places)
            logger.debug(f"Read REAL tag '{tag_name}' from DB{db_number}.{offset} = {value} (byte_swap={byte_swap})")
            return value
        
        elif data_type == 'STRING':
            max_len = tag_config.get('string_length', 40)
            data = plc.db_read(db_number, offset, max_len + 2)
            actual_len = data[1]
            if actual_len > max_len:
                actual_len = max_len
            value = data[2:2+actual_len].decode('ascii', errors='ignore')
            logger.debug(f"Read STRING tag '{tag_name}' from DB{db_number}.{offset} = '{value}'")
            return value
        
        else:
            logger.error(f"Unsupported data type '{data_type}' for tag '{tag_name}'")
            return None
    
    except Exception as e:
        error_message = str(e)
        # Suppress full traceback for common PLC address errors to reduce log noise
        if "Address out of range" in error_message or "ISO" in error_message:
             logger.warning(f"⚠️ PLC Read Error for tag '{tag_config.get('tag_name', 'Unknown')}' (DB{tag_config.get('db_number')}.{tag_config.get('offset')}): {error_message}")
        else:
             logger.error(f"❌ Error reading tag '{tag_config.get('tag_name', 'Unknown')}' from DB{tag_config.get('db_number')}.{tag_config.get('offset')}: {error_message}", exc_info=True)
        return None


###############################################################################
# Demo-mode simulation for Manual / Formula tags
# (These tags have no PLC address, so the PLC reader skips them.  When the
# backend runs in demo mode the historian still needs varying values to record.)
#
# Fully DB-driven: simulation defaults are derived from each tag's unit/data_type.
###############################################################################

# Unit-based simulation defaults: (base, amplitude)
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


def _sim_manual(tag_name, t, unit='', data_type='REAL'):
    """
    Return a simulated value for a Manual/Formula tag.
    Uses unit/data_type to pick sensible defaults. Works for any tag name.
    """
    # Silo tags: Silo1_Level .. Silo8_Tons (derived Tons logic)
    for i in range(1, 9):
        prefix = f"Silo{i}_"
        if tag_name.startswith(prefix):
            suffix = tag_name[len(prefix):]
            if suffix == "Tons":
                lv = _sim_manual(f"Silo{i}_Level", t, unit='%')
                cap = _sim_manual(f"Silo{i}_Capacity", t, unit='t')
                if lv is not None and cap is not None:
                    return round((lv / 100.0) * cap, 1)
                return None
            # Phase offset per silo index so they don't overlap
            phase = i * 17
            if suffix == "Capacity":
                return 500.0
            elif suffix == "Level":
                base, amp = 65.0, 15.0
            elif suffix == "Temp":
                base, amp = 26.0, 2.0
            else:
                base, amp = _UNIT_SIM_DEFAULTS.get((unit or '').strip(), _DTYPE_SIM_DEFAULTS.get((data_type or 'REAL').upper(), (50.0, 10.0)))
            period = 240 + i * 15
            val = base + amp * math.sin(2 * math.pi * t / period + phase)
            drift = amp * 0.08 * math.sin(2 * math.pi * t / (period * 2.3 + 47) + phase)
            return round(val + drift, 1)

    # All other tags: use unit-based defaults
    unit_str = (unit or '').strip()
    dtype_str = (data_type or 'REAL').strip().upper()
    base, amp = _UNIT_SIM_DEFAULTS.get(unit_str, _DTYPE_SIM_DEFAULTS.get(dtype_str, (50.0, 10.0)))
    if amp == 0:
        return base
    # Deterministic period and phase from tag name
    phase = hash(tag_name) % 100
    period = 200 + (hash(tag_name) % 200)  # 200-400s
    val = base + amp * math.sin(2 * math.pi * t / period + phase)
    drift = amp * 0.08 * math.sin(2 * math.pi * t / (period * 2.3 + 47) + phase)
    dec = 0 if dtype_str in ('INT', 'DINT', 'BOOL') else 2
    return round(val + drift, dec)


def _generate_demo_manual_values(db_connection_func):
    """
    In demo mode, generate simulated values for Manual/Formula tags
    so the historian records them alongside PLC tags.
    Returns dict {tag_name: value}.
    """
    result = {}
    t = time.time()
    try:
        with closing(db_connection_func()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT tag_name, source_type, data_type, unit
                FROM tags
                WHERE is_active = true
                  AND source_type IN ('Manual', 'Formula')
            """)
            manual_tags = cur.fetchall()

        for tag in manual_tags:
            name = tag["tag_name"]
            result[name] = _sim_manual(name, t, unit=tag.get("unit", ""), data_type=tag.get("data_type", "REAL"))
    except Exception as e:
        logger.warning("_generate_demo_manual_values error: %s", e)

    return result


def read_all_tags(tag_names=None, db_connection_func=None):
    """
    Read all active tags from database and fetch their values from PLC.
    
    Args:
        tag_names: Optional list of tag names to read (if None, reads all active PLC tags)
        db_connection_func: Function to get database connection (defaults to importing from app)
    
    Returns:
        dict: {tag_name: value, ...}
    """
    # Import here to avoid circular imports
    if db_connection_func is None:
        # Lazy import to avoid circular dependency
        import sys
        if 'app' in sys.modules:
            from app import get_db_connection
            db_connection_func = get_db_connection
        else:
            # Fallback: import directly (will work if app is already loaded)
            from app import get_db_connection
            db_connection_func = get_db_connection
    
    # Import PLC connection
    from plc_utils import connect_to_plc_fast
    
    plc = None
    result = {}
    
    try:
        plc = connect_to_plc_fast()
    except Exception as e:
        logger.error(f"Failed to connect to PLC: {e}", exc_info=True)
        return result
    
    with closing(db_connection_func()) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if tag_names:
            expanded_tag_names = list(tag_names)

            placeholders = ','.join(['%s'] * len(expanded_tag_names))
            query = f"""
                SELECT id, tag_name, display_name, source_type, 
                       db_number, "offset", data_type, bit_position, 
                       string_length, byte_swap, unit, scaling, 
                       decimal_places, description, is_active, value_formula
                FROM tags 
                WHERE is_active = true 
                AND source_type = 'PLC'
                AND tag_name IN ({placeholders})
            """
            cursor.execute(query, expanded_tag_names)
        else:
            cursor.execute("""
                SELECT id, tag_name, display_name, source_type, 
                       db_number, "offset", data_type, bit_position, 
                       string_length, byte_swap, unit, scaling, 
                       decimal_places, description, is_active, value_formula
                FROM tags 
                WHERE is_active = true 
                AND source_type = 'PLC'
            """)
        
        tags = cursor.fetchall()
        
        if not tags:
            logger.debug("No active PLC tags found to read")
            return result
        
        logger.debug(f"Reading {len(tags)} tags from PLC")
        
        # Read each tag
        for tag in tags:
            value = read_tag_value(plc, tag)
            if value is not None:
                # ✅ NEW: Apply value formula if provided, otherwise use scaling (backward compatibility)
                value_formula = tag.get('value_formula')
                if value_formula and value_formula.strip():
                    # Use formula transformation
                    final_value = evaluate_value_formula(value_formula, value)
                else:
                    # Fallback to scaling for backward compatibility
                    scaling = float(tag.get('scaling', 1.0))
                    final_value = value * scaling
                
                result[tag['tag_name']] = final_value
            else:
                # Store None to indicate read failure
                result[tag['tag_name']] = None
        
        logger.debug(f"Successfully read {len([v for v in result.values() if v is not None])} tag values")
    
    # NOTE: bin enrichment removed — legacy bins/materials system no longer active
    # result = enrich_bin_tags_with_materials(result, db_connection_func)

    # ✅ Demo mode: also generate values for Manual/Formula tags so historian records them
    try:
        from demo_mode import get_demo_mode
        if get_demo_mode():
            # Generate simulated values for Manual/Formula tags
            manual_values = _generate_demo_manual_values(db_connection_func)
            if manual_values:
                result.update(manual_values)
                logger.debug("Demo mode: added %d simulated Manual/Formula tag values", len(manual_values))

            # If still no PLC tags at all, use emulator fallback
            if not any(k for k in result if k not in manual_values):
                from plc_data_source import get_demo_fallback_tag_values
                fallback = get_demo_fallback_tag_values()
                if fallback:
                    result.update(fallback)
                    logger.info("Demo mode: using emulator fallback tag values for live monitor (%d values)", len(fallback))
    except Exception as e:
        logger.debug("Demo fallback check skipped: %s", e)

    return result


# ── Tag config cache (avoids querying DB every second) ────────────────────────
_tag_config_cache = None
_tag_config_cache_ts = 0
_TAG_CONFIG_CACHE_TTL = 30  # seconds


def _get_cached_tag_configs(db_connection_func, tag_names=None):
    """Get active PLC tag configurations, cached for 30 seconds.

    Avoids hitting the database every second for tag metadata that rarely changes.
    """
    global _tag_config_cache, _tag_config_cache_ts

    now = time.time()
    # Only use cache for full reads (tag_names=None) — filtered reads bypass cache
    if tag_names is None and _tag_config_cache is not None and (now - _tag_config_cache_ts) < _TAG_CONFIG_CACHE_TTL:
        return _tag_config_cache

    with closing(db_connection_func()) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        if tag_names:
            placeholders = ','.join(['%s'] * len(tag_names))
            cursor.execute(f"""
                SELECT id, tag_name, display_name, source_type,
                       db_number, "offset", data_type, bit_position,
                       string_length, byte_swap, unit, scaling,
                       decimal_places, description, is_active, value_formula
                FROM tags
                WHERE is_active = true AND source_type = 'PLC'
                AND tag_name IN ({placeholders})
            """, list(tag_names))
        else:
            cursor.execute("""
                SELECT id, tag_name, display_name, source_type,
                       db_number, "offset", data_type, bit_position,
                       string_length, byte_swap, unit, scaling,
                       decimal_places, description, is_active, value_formula
                FROM tags
                WHERE is_active = true AND source_type = 'PLC'
            """)
        tags = cursor.fetchall()

    if tag_names is None:
        _tag_config_cache = tags
        _tag_config_cache_ts = now

    return tags


def invalidate_tag_config_cache():
    """Call when tag configuration changes (e.g., from Settings API)."""
    global _tag_config_cache, _tag_config_cache_ts
    _tag_config_cache = None
    _tag_config_cache_ts = 0


# ── Batched PLC reads ─────────────────────────────────────────────────────────

def _compute_tag_byte_size(tag_config):
    """Return the number of bytes a tag occupies in the PLC DB block."""
    dtype = tag_config.get('data_type', 'REAL').upper()
    if dtype == 'BOOL':
        return 1
    elif dtype == 'INT':
        return 2
    elif dtype in ('DINT', 'REAL'):
        return 4
    elif dtype == 'STRING':
        return (tag_config.get('string_length') or 40) + 2
    return 4  # default


def _extract_value_from_buffer(buf, base_offset, tag_config):
    """Extract a single tag value from a pre-read byte buffer.

    Args:
        buf: bytes read from PLC (contiguous block)
        base_offset: the starting offset of the buffer within the DB
        tag_config: tag configuration dict

    Returns:
        Parsed value (int, float, bool, str) or None on error
    """
    try:
        tag_offset = tag_config['offset']
        local_offset = tag_offset - base_offset
        dtype = tag_config.get('data_type', 'REAL').upper()
        tag_name = tag_config.get('tag_name', 'Unknown')

        if local_offset < 0 or local_offset >= len(buf):
            logger.warning("[BatchRead] Offset out of range for tag '%s': local=%d, buf_len=%d",
                           tag_name, local_offset, len(buf))
            return None

        if dtype == 'BOOL':
            bit_pos = tag_config.get('bit_position', 0) or 0
            byte_val = buf[local_offset]
            return bool(byte_val & (1 << bit_pos))

        elif dtype == 'INT':
            data = buf[local_offset:local_offset + 2]
            if len(data) < 2:
                return None
            return struct.unpack('>h', data)[0]

        elif dtype == 'DINT':
            data = buf[local_offset:local_offset + 4]
            if len(data) < 4:
                return None
            return struct.unpack('>i', data)[0]

        elif dtype == 'REAL':
            data = buf[local_offset:local_offset + 4]
            if len(data) < 4:
                return None
            byte_swap = tag_config.get('byte_swap', False)
            if byte_swap:
                data = data[::-1]
                value = struct.unpack('<f', data)[0]
            else:
                value = struct.unpack('>f', data)[0]
            decimal_places = tag_config.get('decimal_places', 2)
            return round(value, decimal_places)

        elif dtype == 'STRING':
            max_len = tag_config.get('string_length') or 40
            data = buf[local_offset:local_offset + max_len + 2]
            if len(data) < 2:
                return None
            actual_len = min(data[1], max_len)
            return data[2:2 + actual_len].decode('ascii', errors='ignore')

        else:
            logger.warning("[BatchRead] Unsupported data type '%s' for tag '%s'", dtype, tag_name)
            return None

    except Exception as e:
        logger.warning("[BatchRead] Error extracting tag '%s': %s",
                       tag_config.get('tag_name', '?'), e)
        return None


def _read_tags_batched(plc, tags):
    """Read tags from PLC using batched reads grouped by DB number.

    Instead of N individual plc.db_read() calls (one per tag),
    groups tags by db_number and reads each DB block in a single call.

    Args:
        plc: Connected PLC client (snap7 or emulator)
        tags: List of tag config dicts

    Returns:
        dict: {tag_name: raw_value, ...}
    """
    result = {}

    # Group tags by db_number
    db_groups = {}
    for tag in tags:
        db_num = tag.get('db_number')
        if db_num is None:
            continue
        db_groups.setdefault(db_num, []).append(tag)

    for db_num, group_tags in db_groups.items():
        # Calculate the byte range to read for this DB
        min_offset = float('inf')
        max_end = 0

        for tag in group_tags:
            offset = tag['offset']
            size = _compute_tag_byte_size(tag)
            min_offset = min(min_offset, offset)
            max_end = max(max_end, offset + size)

        min_offset = int(min_offset)
        total_size = int(max_end - min_offset)

        if total_size <= 0 or total_size > 65536:
            logger.warning("[BatchRead] Skipping DB%d: invalid range %d-%d",
                           db_num, min_offset, max_end)
            for tag in group_tags:
                result[tag['tag_name']] = None
            continue

        # Single PLC read for the entire DB range
        try:
            buf = plc.db_read(db_num, min_offset, total_size)
        except Exception as e:
            logger.error("[BatchRead] Failed to read DB%d (offset=%d, size=%d): %s",
                         db_num, min_offset, total_size, e)
            # Fallback: try individual reads for this group
            for tag in group_tags:
                try:
                    value = read_tag_value(plc, tag)
                    result[tag['tag_name']] = value
                except Exception:
                    result[tag['tag_name']] = None
            continue

        # Extract individual tag values from the buffer
        for tag in group_tags:
            value = _extract_value_from_buffer(buf, min_offset, tag)
            result[tag['tag_name']] = value

    return result


def read_all_tags_batched(tag_names=None, db_connection_func=None):
    """Read all active PLC tags using batched reads — optimized version.

    Key improvements over read_all_tags():
    1. Caches tag configs (avoids DB query every second)
    2. Batches PLC reads by DB number (M reads instead of N)
    3. Applies formulas/scaling in the same loop

    Args:
        tag_names: Optional list of tag names to read
        db_connection_func: Function to get database connection

    Returns:
        dict: {tag_name: value, ...}
    """
    if db_connection_func is None:
        import sys
        if 'app' in sys.modules:
            from app import get_db_connection
            db_connection_func = get_db_connection
        else:
            from app import get_db_connection
            db_connection_func = get_db_connection

    from plc_utils import connect_to_plc_fast

    result = {}

    try:
        plc = connect_to_plc_fast()
    except Exception as e:
        logger.error("[BatchRead] Failed to connect to PLC: %s", e)
        return result

    # Get tag configs (cached for 30s)
    tags = _get_cached_tag_configs(db_connection_func, tag_names)
    if not tags:
        logger.debug("[BatchRead] No active PLC tags found")
        return result

    # Batched PLC read
    raw_values = _read_tags_batched(plc, tags)

    # Apply formulas and scaling
    for tag in tags:
        tag_name = tag['tag_name']
        value = raw_values.get(tag_name)
        if value is not None:
            value_formula = tag.get('value_formula')
            if value_formula and value_formula.strip():
                final_value = evaluate_value_formula(value_formula, value)
            else:
                scaling = float(tag.get('scaling', 1.0))
                final_value = value * scaling if isinstance(value, (int, float)) else value
            result[tag_name] = final_value
        else:
            result[tag_name] = None

    # Demo mode: also generate Manual/Formula tag values
    try:
        from demo_mode import get_demo_mode
        if get_demo_mode():
            manual_values = _generate_demo_manual_values(db_connection_func)
            if manual_values:
                result.update(manual_values)

            if not any(k for k in result if k not in (manual_values or {})):
                from plc_data_source import get_demo_fallback_tag_values
                fallback = get_demo_fallback_tag_values()
                if fallback:
                    result.update(fallback)
    except Exception as e:
        logger.debug("[BatchRead] Demo fallback check skipped: %s", e)

    return result


def enrich_bin_tags_with_materials(tag_values, db_connection_func=None):
    """
    Enrich tag values that represent bin_ids with material names.
    
    This function:
    1. Identifies tags that represent bin_ids (by naming convention or metadata)
    2. Looks up material names from bins -> materials mapping
    3. Adds material_name tags automatically
    
    Args:
        tag_values: dict of {tag_name: value} from PLC
        db_connection_func: Function to get database connection
    
    Returns:
        dict: Enriched tag_values with material_name tags added
    """
    if db_connection_func is None:
        import sys
        if 'app' in sys.modules:
            from app import get_db_connection
            db_connection_func = get_db_connection
        else:
            from app import get_db_connection
            db_connection_func = get_db_connection
    
    # Identify bin_id tags (tags ending with "BinId", "bin_id", or containing "bin" and "id")
    # Also check if tag value is a valid bin ID (numeric and > 0)
    bin_id_tags = {}
    for tag_name, value in tag_values.items():
        # Skip None values, but allow 0 (zero is a valid bin ID)
        if value is None:
            continue
        
        # Only process numeric values
        if not isinstance(value, (int, float)):
            continue
        
        # Check if tag name suggests it's a bin_id
        tag_lower = tag_name.lower()
        is_bin_id_by_name = ('binid' in tag_lower or 
            'bin_id' in tag_lower or 
            'bin_code' in tag_lower or  # ✅ ADD THIS LINE
            'bincode' in tag_lower or   # ✅ ADD THIS LINE
            (tag_lower.endswith('bin') and 'id' in tag_lower) or
            (tag_lower.startswith('bin') and 'id' in tag_lower))
        
        # Also check if value is a valid bin ID (numeric, > 0, reasonable range)
        # Bin IDs are typically 1-999, but we'll be more lenient (1-10000)
        is_valid_bin_id_value = value > 0 and value < 10000 and value == int(value)
        
        if is_bin_id_by_name:
            # Tag name suggests it's a bin ID
            bin_id_tags[tag_name] = value
            logger.debug(f"Identified bin_id tag by name: {tag_name} = {value} (type: {type(value).__name__})")
        elif is_valid_bin_id_value:
            # Tag value looks like a bin ID (integer, > 0, reasonable range)
            # This handles cases where tags are named like "Sender_1", "Sender_2", "Receiver" but contain bin IDs
            # We'll verify it's actually a bin ID by checking the database
            logger.debug(f"Potential bin_id tag by value: {tag_name} = {int(value)} (will verify in database)")
            bin_id_tags[tag_name] = int(value)  # Store as int for consistent lookup
    
    if not bin_id_tags:
        logger.info(f"⚠️ No bin_id tags found in tag_values. Available tags: {list(tag_values.keys())}")
        return tag_values  # No bin_id tags found, return as-is
    
    logger.info(f"✅ Found {len(bin_id_tags)} bin_id tags to enrich: {list(bin_id_tags.keys())} with values: {list(bin_id_tags.values())}")
    
    # Build bin lookup map from database
    try:
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Query bins with material info
            cursor.execute("""
                SELECT b.id, b.bin_name, b.bin_code, b.material_id,
                       m.material_name, m.material_code
                FROM bins b
                LEFT JOIN materials m ON b.material_id = m.id
            """)
            all_bins = cursor.fetchall()
            
            # Create lookup map: supports bin_code (string/int) and bin id
            bin_lookup = {}
            for b in all_bins:
                # Store by database id
                bin_lookup[b["id"]] = b
                # Store by bin_code (string)
                if b["bin_code"]:
                    bin_lookup[b["bin_code"]] = b
                    # Also store by bin_code (integer) if numeric
                    try:
                        int_key = int(b["bin_code"])
                        bin_lookup[int_key] = b
                    except (ValueError, TypeError):
                        pass
            
            # Get unique material IDs
            material_ids = set()
            for b in all_bins:
                if b.get("material_id"):
                    material_ids.add(b["material_id"])
            
            # Build material map
            material_map = {}
            if material_ids:
                cursor.execute("""
                    SELECT id, material_name, material_code
                    FROM materials
                    WHERE id IN %s
                """, (tuple(material_ids),))
                for row in cursor.fetchall():
                    material_map[row["id"]] = row
            
            def convert_plc_bin_to_db_code(plc_bin_id):
                """
                Convert PLC bin ID to database bin_code format
                211 -> 21A, 212 -> 21B, 213 -> 21C
                21 -> 21 (unchanged)
                """
                if isinstance(plc_bin_id, str):
                    try:
                        plc_bin_id = int(plc_bin_id)
                    except (ValueError, TypeError):
                        return plc_bin_id
                
                if isinstance(plc_bin_id, (int, float)):
                    plc_bin_id = int(plc_bin_id)
                    # Handle 211->21A, 212->21B, 213->21C pattern
                    if plc_bin_id >= 210 and plc_bin_id <= 219:
                        base = plc_bin_id // 10  # 211 // 10 = 21
                        suffix_num = plc_bin_id % 10  # 211 % 10 = 1
                        if suffix_num >= 1 and suffix_num <= 3:
                            # Convert 1->A, 2->B, 3->C
                            suffix_letter = chr(ord('A') + suffix_num - 1)
                            return f"{base}{suffix_letter}"
                
                # No conversion needed, return as-is
                return plc_bin_id
            
            # Enrich tag values with material names
            enriched = tag_values.copy()
            enrichment_count = 0
            
            for bin_tag_name, bin_id_value in bin_id_tags.items():
                # Try to find bin info (handle int/string conversion)
                bin_info = None
                
                # Convert PLC bin ID to DB bin_code if it's a numeric value
                if isinstance(bin_id_value, (int, float)) and int(bin_id_value) > 0:
                    try:
                        db_bin_code = convert_plc_bin_to_db_code(int(bin_id_value))
                        # Try lookup with converted code first
                        bin_info = bin_lookup.get(db_bin_code) or bin_lookup.get(str(db_bin_code))
                        if bin_info:
                            logger.debug(f"Found bin using conversion: PLC {bin_id_value} -> DB {db_bin_code}")
                    except Exception as e:
                        logger.debug(f"Conversion failed for {bin_id_value}: {e}, trying direct lookup")
                
                # If conversion didn't work, try direct lookup strategies
                if not bin_info:
                    # Normalize bin_id_value to int for consistent lookup
                    normalized_value = None
                    if isinstance(bin_id_value, (int, float)):
                        normalized_value = int(bin_id_value)
                    elif isinstance(bin_id_value, str) and bin_id_value.replace('.', '').isdigit():
                        try:
                            normalized_value = int(float(bin_id_value))
                        except:
                            pass
                    
                    # Try multiple lookup strategies with normalized value
                    if normalized_value is not None:
                        # Try as integer
                        if normalized_value in bin_lookup:
                            bin_info = bin_lookup[normalized_value]
                            logger.debug(f"Found bin using integer lookup: {normalized_value}")
                        # Try as string
                        elif str(normalized_value) in bin_lookup:
                            bin_info = bin_lookup[str(normalized_value)]
                            logger.debug(f"Found bin using string lookup: {str(normalized_value)}")
                        # Try original float value (if it was a float)
                        elif isinstance(bin_id_value, float) and bin_id_value in bin_lookup:
                            bin_info = bin_lookup[bin_id_value]
                            logger.debug(f"Found bin using float lookup: {bin_id_value}")
                        # Try original string value
                        elif str(bin_id_value) in bin_lookup:
                            bin_info = bin_lookup[str(bin_id_value)]
                            logger.debug(f"Found bin using original string lookup: {str(bin_id_value)}")
                    
                    # Fallback: try original value as-is
                    if not bin_info:
                        if bin_id_value in bin_lookup:
                            bin_info = bin_lookup[bin_id_value]
                        elif str(bin_id_value) in bin_lookup:
                            bin_info = bin_lookup[str(bin_id_value)]
                
                if bin_info:
                    logger.debug(f"Found bin info for {bin_id_value}: bin_code={bin_info.get('bin_code')}, material_id={bin_info.get('material_id')}")
                    if bin_info.get("material_id"):
                        mat_id = bin_info["material_id"]
                        if mat_id in material_map:
                            material = material_map[mat_id]
                            # Generate material_name tag name
                            # e.g., "Sender1BinId" -> "Sender1MaterialName"
                            # e.g., "Sender_1" -> "Sender_1_MaterialName"
                            # e.g., "Receiver" -> "Receiver_MaterialName"
                            material_tag_name = bin_tag_name.replace("BinId", "MaterialName")
                            material_tag_name = material_tag_name.replace("bin_id", "material_name")
                            material_tag_name = material_tag_name.replace("BinCode", "MaterialName")  # ✅ ADD THIS LINE
                            material_tag_name = material_tag_name.replace("bin_code", "material_name")  # ✅ ADD THIS LINE
                            material_tag_name = material_tag_name.replace("bincode", "materialname")  # ✅ ADD THIS LINE
                            material_tag_name = material_tag_name.replace("Bin", "Material")
                            if not material_tag_name.endswith("MaterialName") and not material_tag_name.endswith("material_name"):
                                # Fallback: append _MaterialName
                                material_tag_name = f"{bin_tag_name}_MaterialName"
                            
                            logger.debug(f"Generated material tag name: {bin_tag_name} -> {material_tag_name}")
                            
                            # Add material name and code
                            enriched[material_tag_name] = material["material_name"]
                            enriched[f"{material_tag_name}_Code"] = material["material_code"]
                            enrichment_count += 1
                            logger.info(f"✅ Enriched {bin_tag_name} (bin_id={bin_id_value}) -> {material_tag_name} = {material['material_name']}")
                        else:
                            logger.warning(f"⚠️ Material ID {mat_id} not found in material_map for bin {bin_id_value}")
                    else:
                        logger.debug(f"⚠️ Bin {bin_id_value} found but has no material_id assigned")
                else:
                    logger.warning(f"⚠️ Bin {bin_id_value} (type: {type(bin_id_value).__name__}) not found in database. Available bin codes: {list(bin_lookup.keys())[:10]}")
            
            if enrichment_count > 0:
                logger.info(f"✅ Enriched {enrichment_count} bin_id tags with material names")
            
            return enriched
    
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedObject, psycopg2.ProgrammingError) as e:
        global _bins_table_missing_logged
        if not _bins_table_missing_logged:
            _bins_table_missing_logged = True
            logger.warning(
                "bins or materials table missing - skipping bin enrichment. "
                "Create the schema (run migrations) if you need material names for bin_id tags. Error: %s",
                e,
            )
        return tag_values  # Return original on error
    except Exception as e:
        logger.error(f"Error enriching bin tags with materials: {e}", exc_info=True)
        return tag_values  # Return original on error

