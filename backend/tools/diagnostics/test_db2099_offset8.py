#!/usr/bin/env python3
"""
Quick Test: Read DB2099.8 with different byte orders
"""

import struct
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

try:
    from plc_utils import connect_to_plc_fast
    
    print("\n" + "="*70)
    print("Testing DB2099.8 (REAL type)")
    print("="*70)
    
    plc = connect_to_plc_fast()
    if not plc:
        print("[ERROR] Failed to connect to PLC")
        sys.exit(1)
    
    print("[OK] Connected to PLC")
    
    db_number = 2099
    offset = 8
    
    # Read 4 bytes
    data = plc.db_read(db_number, offset, 4)
    
    print(f"\nRaw bytes from DB{db_number}.{offset}: {data.hex()}")
    print(f"Bytes as list: {list(data)}")
    
    # Test 1: Big-endian (no byte swap) - like orders_bp.py
    value_big = struct.unpack('>f', data)[0]
    print(f"\n1. Big-endian (>f): {value_big}")
    
    # Test 2: Little-endian (with byte swap) - like tag_reader.py with byte_swap=True
    data_reversed = data[::-1]
    value_little = struct.unpack('<f', data_reversed)[0]
    print(f"2. Little-endian (<f, bytes reversed): {value_little}")
    
    # Test 3: Little-endian without reversing
    value_little_direct = struct.unpack('<f', data)[0]
    print(f"3. Little-endian (<f, no reverse): {value_little_direct}")
    
    # Test 4: Try as INT/DINT to see if it's actually an integer
    value_int = struct.unpack('>i', data)[0]
    print(f"4. As DINT (>i): {value_int}")
    
    value_int_little = struct.unpack('<i', data[::-1])[0]
    print(f"5. As DINT (<i, reversed): {value_int_little}")
    
    print("\n" + "="*70)
    print("Recommendation:")
    print("="*70)
    
    # Check which value makes sense (not 0, not NaN, not Inf)
    if value_big != 0 and not (value_big != value_big) and abs(value_big) < 1e10:
        print(f"[OK] Use BIG-ENDIAN (>f) - Value: {value_big}")
        print("   -> Set byte_swap = False in tag configuration")
    elif value_little != 0 and not (value_little != value_little) and abs(value_little) < 1e10:
        print(f"[OK] Use LITTLE-ENDIAN (<f, reversed) - Value: {value_little}")
        print("   -> Set byte_swap = True in tag configuration (current setting)")
    else:
        print("[WARNING] Both values are 0, NaN, or invalid")
        print("   -> Check if offset is correct or if PLC is writing to this address")
    
    print("="*70 + "\n")
    
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

