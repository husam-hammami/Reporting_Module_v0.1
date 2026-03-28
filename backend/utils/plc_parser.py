"""
PLC Address Parser Utility

Parses PLC/Modbus/OPC UA address strings into components.

Siemens S7 formats:
- "DB2099.0" -> {db_number: 2099, offset: 0, bit: None}
- "DB104.552.0" -> {db_number: 104, offset: 552, bit: 0} (BOOL)

Modbus formats:
- "HR100" -> {register: 100, function: 'holding'}
- "IR200" -> {register: 200, function: 'input'}
- "CO50"  -> {register: 50, function: 'coil'}
- "DI75"  -> {register: 75, function: 'discrete'}

OPC UA: uses node_id strings directly (no parsing needed)
"""

import re
import logging

logger = logging.getLogger(__name__)


def parse_plc_address(plc_address):
    """
    Parse PLC address string into components.
    
    Args:
        plc_address (str): PLC address in format "DB<number>.<offset>" or "DB<number>.<offset>.<bit>"
    
    Returns:
        dict: {
            'db_number': int,
            'offset': int,
            'bit': int or None
        }
    
    Raises:
        ValueError: If PLC address format is invalid
    
    Examples:
        >>> parse_plc_address("DB2099.0")
        {'db_number': 2099, 'offset': 0, 'bit': None}
        
        >>> parse_plc_address("DB499.100")
        {'db_number': 499, 'offset': 100, 'bit': None}
        
        >>> parse_plc_address("DB104.552.0")
        {'db_number': 104, 'offset': 552, 'bit': 0}
    """
    if not plc_address or not isinstance(plc_address, str):
        raise ValueError(f"Invalid PLC address: {plc_address}. Must be a non-empty string.")
    
    # Pattern: DB<number>.<offset> or DB<number>.<offset>.<bit>
    pattern = r'^DB(\d+)\.(\d+)(?:\.(\d+))?$'
    match = re.match(pattern, plc_address.strip())
    
    if not match:
        raise ValueError(
            f"Invalid PLC address format: '{plc_address}'. "
            f"Expected format: 'DB<number>.<offset>' or 'DB<number>.<offset>.<bit>' "
            f"(e.g., 'DB2099.0' or 'DB104.552.0')"
        )
    
    db_number = int(match.group(1))
    offset = int(match.group(2))
    bit = int(match.group(3)) if match.group(3) else None
    
    # Validate bit position if provided
    if bit is not None and (bit < 0 or bit > 7):
        raise ValueError(f"Invalid bit position: {bit}. Must be between 0 and 7.")
    
    # Validate DB number and offset
    if db_number < 1:
        raise ValueError(f"Invalid DB number: {db_number}. Must be greater than 0.")
    
    if offset < 0:
        raise ValueError(f"Invalid offset: {offset}. Must be non-negative.")
    
    result = {
        'db_number': db_number,
        'offset': offset,
        'bit': bit
    }
    
    logger.debug(f"Parsed PLC address '{plc_address}' -> {result}")
    
    return result


def format_plc_address(db_number, offset, bit=None):
    """
    Format PLC address components into string format.
    
    Args:
        db_number (int): Database number
        offset (int): Byte offset
        bit (int, optional): Bit position (0-7) for BOOL type
    
    Returns:
        str: Formatted PLC address string
    
    Examples:
        >>> format_plc_address(2099, 0)
        'DB2099.0'
        
        >>> format_plc_address(104, 552, 0)
        'DB104.552.0'
    """
    if bit is not None:
        return f"DB{db_number}.{offset}.{bit}"
    else:
        return f"DB{db_number}.{offset}"


# ── Modbus Address Parser ────────────────────────────────────────────────────

_MODBUS_PREFIXES = {
    'HR': 'holding',
    'IR': 'input',
    'CO': 'coil',
    'DI': 'discrete',
}


def parse_modbus_address(address_str):
    """Parse Modbus address string into components.

    Args:
        address_str: Modbus address like "HR100", "IR200", "CO50", "DI75"

    Returns:
        dict: {'register': int, 'function': str}

    Raises:
        ValueError: If format is invalid

    Examples:
        >>> parse_modbus_address("HR100")
        {'register': 100, 'function': 'holding'}

        >>> parse_modbus_address("CO50")
        {'register': 50, 'function': 'coil'}
    """
    if not address_str or not isinstance(address_str, str):
        raise ValueError(f"Invalid Modbus address: {address_str}")

    address_str = address_str.strip().upper()

    # Try each prefix
    for prefix, func_name in _MODBUS_PREFIXES.items():
        if address_str.startswith(prefix):
            try:
                register = int(address_str[len(prefix):])
                if register < 0:
                    raise ValueError(f"Register must be non-negative: {register}")
                result = {'register': register, 'function': func_name}
                logger.debug(f"Parsed Modbus address '{address_str}' -> {result}")
                return result
            except ValueError as e:
                if "non-negative" in str(e):
                    raise
                raise ValueError(
                    f"Invalid register number in Modbus address: '{address_str}'. "
                    f"Expected format: '{prefix}<number>' (e.g., '{prefix}100')"
                )

    # Try plain number (default to holding register)
    try:
        register = int(address_str)
        return {'register': register, 'function': 'holding'}
    except ValueError:
        pass

    raise ValueError(
        f"Invalid Modbus address format: '{address_str}'. "
        f"Expected: HR<n> (Holding), IR<n> (Input), CO<n> (Coil), DI<n> (Discrete), or plain number."
    )


def format_modbus_address(register, function='holding'):
    """Format Modbus address components into string.

    Examples:
        >>> format_modbus_address(100, 'holding')
        'HR100'
        >>> format_modbus_address(50, 'coil')
        'CO50'
    """
    prefix_map = {v: k for k, v in _MODBUS_PREFIXES.items()}
    prefix = prefix_map.get(function, 'HR')
    return f"{prefix}{register}"

