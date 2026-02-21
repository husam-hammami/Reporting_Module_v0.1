#!/usr/bin/env python3
"""
Test Script: Read Tag Value from PLC
Description: Directly reads a value from PLC to verify the actual data
"""

import sys
import struct
import logging
from contextlib import closing

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def read_plc_value(db_number, offset, data_type='REAL', bit_position=None, byte_swap=True):
    """
    Read a value directly from PLC
    
    Args:
        db_number: Database number (e.g., 2099)
        offset: Byte offset (e.g., 8)
        data_type: Data type ('BOOL', 'INT', 'DINT', 'REAL', 'STRING')
        bit_position: Bit position for BOOL (0-7)
        byte_swap: Whether to swap bytes for REAL type
    """
    try:
        # Import PLC connection function
        from plc_utils import connect_to_plc_fast
        
        logger.info(f"Connecting to PLC...")
        plc = connect_to_plc_fast()
        
        if not plc:
            logger.error("Failed to connect to PLC")
            return None
        
        logger.info(f"✅ Connected to PLC")
        logger.info(f"Reading from DB{db_number} at offset {offset}, type: {data_type}")
        
        # Read based on data type
        if data_type == 'BOOL':
            if bit_position is None:
                logger.error("bit_position is required for BOOL type")
                return None
            
            # Read 1 byte
            data = plc.db_read(db_number, offset, 1)
            from snap7.util import get_bool
            value = get_bool(data, 0, bit_position)
            logger.info(f"Raw bytes: {data.hex()}")
            logger.info(f"Bit position: {bit_position}")
            logger.info(f"✅ BOOL value: {value}")
            return value
            
        elif data_type == 'INT':
            # Read 2 bytes
            data = plc.db_read(db_number, offset, 2)
            value = struct.unpack('>h', data)[0]  # Big-endian signed short
            logger.info(f"Raw bytes: {data.hex()}")
            logger.info(f"✅ INT value: {value}")
            return value
            
        elif data_type == 'DINT':
            # Read 4 bytes
            data = plc.db_read(db_number, offset, 4)
            value = struct.unpack('>i', data)[0]  # Big-endian signed int
            logger.info(f"Raw bytes: {data.hex()}")
            logger.info(f"✅ DINT value: {value}")
            return value
            
        elif data_type == 'REAL':
            # Read 4 bytes
            data = plc.db_read(db_number, offset, 4)
            logger.info(f"Raw bytes: {data.hex()}")
            
            if byte_swap:
                # Little-endian (byte swap)
                value = struct.unpack('<f', data)[0]
                logger.info(f"Byte order: Little-endian (byte swapped)")
            else:
                # Big-endian
                value = struct.unpack('>f', data)[0]
                logger.info(f"Byte order: Big-endian")
            
            logger.info(f"✅ REAL value: {value}")
            return value
            
        elif data_type == 'STRING':
            # Read string (first byte is length)
            data = plc.db_read(db_number, offset, 256)  # Max string length
            length = data[0]
            value = data[1:1+length].decode('utf-8', errors='ignore')
            logger.info(f"Raw bytes: {data[:20].hex()}...")
            logger.info(f"String length: {length}")
            logger.info(f"✅ STRING value: '{value}'")
            return value
            
        else:
            logger.error(f"Unsupported data type: {data_type}")
            return None
            
    except Exception as e:
        logger.error(f"Error reading from PLC: {e}", exc_info=True)
        return None

def test_tag_from_database(tag_name):
    """
    Test reading a tag that's stored in the database
    """
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        import os
        
        # Database connection
        conn = psycopg2.connect(
            dbname=os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
            host=os.getenv('DB_HOST', '127.0.0.1'),
            port=os.getenv('DB_PORT', 5433)
        )
        
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get tag from database
            cursor.execute("""
                SELECT tag_name, display_name, db_number, "offset", data_type, 
                       bit_position, byte_swap, unit, scaling, decimal_places
                FROM tags 
                WHERE tag_name = %s AND is_active = true
            """, (tag_name,))
            
            tag = cursor.fetchone()
            
            if not tag:
                logger.error(f"Tag '{tag_name}' not found in database")
                return None
            
            logger.info(f"\n{'='*70}")
            logger.info(f"Tag Configuration from Database:")
            logger.info(f"{'='*70}")
            logger.info(f"Tag Name: {tag['tag_name']}")
            logger.info(f"Display Name: {tag['display_name']}")
            logger.info(f"DB Number: {tag['db_number']}")
            logger.info(f"Offset: {tag['offset']}")
            logger.info(f"Data Type: {tag['data_type']}")
            logger.info(f"Bit Position: {tag['bit_position']}")
            logger.info(f"Byte Swap: {tag['byte_swap']}")
            logger.info(f"Unit: {tag['unit']}")
            logger.info(f"Scaling: {tag['scaling']}")
            logger.info(f"Decimal Places: {tag['decimal_places']}")
            logger.info(f"{'='*70}\n")
            
            # Read from PLC
            value = read_plc_value(
                db_number=tag['db_number'],
                offset=tag['offset'],
                data_type=tag['data_type'],
                bit_position=tag['bit_position'],
                byte_swap=tag['byte_swap'] if tag['data_type'] == 'REAL' else None
            )
            
            if value is not None:
                # Apply scaling
                scaled_value = float(value) * float(tag['scaling'] or 1.0)
                logger.info(f"\n{'='*70}")
                logger.info(f"Results:")
                logger.info(f"{'='*70}")
                logger.info(f"Raw Value: {value}")
                logger.info(f"Scaled Value: {scaled_value}")
                logger.info(f"Formatted: {scaled_value:.{tag['decimal_places'] or 2}f} {tag['unit'] or ''}")
                logger.info(f"{'='*70}\n")
                
                return {
                    'raw_value': value,
                    'scaled_value': scaled_value,
                    'formatted': f"{scaled_value:.{tag['decimal_places'] or 2}f} {tag['unit'] or ''}"
                }
            
    except Exception as e:
        logger.error(f"Error testing tag from database: {e}", exc_info=True)
        return None

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Test PLC tag reading')
    parser.add_argument('--tag', type=str, help='Tag name from database')
    parser.add_argument('--db', type=int, help='Database number (e.g., 2099)')
    parser.add_argument('--offset', type=int, help='Byte offset (e.g., 8)')
    parser.add_argument('--type', type=str, default='REAL', choices=['BOOL', 'INT', 'DINT', 'REAL', 'STRING'],
                       help='Data type')
    parser.add_argument('--bit', type=int, help='Bit position for BOOL type')
    parser.add_argument('--no-byte-swap', action='store_true', help='Disable byte swap for REAL type')
    
    args = parser.parse_args()
    
    if args.tag:
        # Test tag from database
        logger.info(f"Testing tag from database: {args.tag}")
        result = test_tag_from_database(args.tag)
        if result:
            print(f"\n✅ Success! Value: {result['formatted']}")
        else:
            print("\n❌ Failed to read tag")
            sys.exit(1)
            
    elif args.db and args.offset is not None:
        # Direct PLC read
        logger.info(f"Reading directly from PLC: DB{args.db}.{args.offset}")
        value = read_plc_value(
            db_number=args.db,
            offset=args.offset,
            data_type=args.type,
            bit_position=args.bit,
            byte_swap=not args.no_byte_swap
        )
        if value is not None:
            print(f"\n✅ Success! Value: {value}")
        else:
            print("\n❌ Failed to read from PLC")
            sys.exit(1)
    else:
        parser.print_help()
        print("\nExamples:")
        print("  python test_tag_reading.py --tag WE")
        print("  python test_tag_reading.py --db 2099 --offset 8 --type REAL")
        sys.exit(1)

if __name__ == '__main__':
    main()

