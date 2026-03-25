"""
PLC Address Parser Utility

Parses PLC address strings into components (DB number, offset, bit).
Supports formats:
- "DB2099.0" -> {db_number: 2099, offset: 0, bit: None}
- "DB499.100" -> {db_number: 499, offset: 100, bit: None}
- "DB104.552.0" -> {db_number: 104, offset: 552, bit: 0} (BOOL)
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

