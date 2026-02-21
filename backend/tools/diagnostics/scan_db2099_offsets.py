#!/usr/bin/env python3
"""
Scan DB2099 offsets to find non-zero REAL values
"""

import struct
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

try:
    from plc_utils import connect_to_plc_fast
    
    print("\n" + "="*70)
    print("Scanning DB2099 for non-zero REAL values")
    print("="*70)
    
    plc = connect_to_plc_fast()
    if not plc:
        print("[ERROR] Failed to connect to PLC")
        sys.exit(1)
    
    print("[OK] Connected to PLC\n")
    
    db_number = 2099
    start_offset = 0
    end_offset = 200  # Scan first 200 bytes
    step = 4  # REAL is 4 bytes, so check every 4 bytes
    
    print(f"Scanning offsets {start_offset} to {end_offset} (step: {step})...")
    print(f"Looking for non-zero REAL values...\n")
    
    found_values = []
    
    for offset in range(start_offset, end_offset, step):
        try:
            data = plc.db_read(db_number, offset, 4)
            
            # Try big-endian
            value_big = struct.unpack('>f', data)[0]
            
            # Try little-endian (reversed)
            value_little = struct.unpack('<f', data[::-1])[0]
            
            # Check if either value is non-zero and reasonable
            if value_big != 0.0 and abs(value_big) < 1e10 and value_big == value_big:  # Not NaN
                found_values.append({
                    'offset': offset,
                    'value': value_big,
                    'byte_order': 'big-endian',
                    'bytes': data.hex()
                })
            elif value_little != 0.0 and abs(value_little) < 1e10 and value_little == value_little:  # Not NaN
                found_values.append({
                    'offset': offset,
                    'value': value_little,
                    'byte_order': 'little-endian',
                    'bytes': data.hex()
                })
        except:
            pass
    
    if found_values:
        print(f"Found {len(found_values)} non-zero REAL values:\n")
        for item in found_values[:20]:  # Show first 20
            print(f"  Offset {item['offset']:3d}: {item['value']:12.3f} ({item['byte_order']}) - bytes: {item['bytes']}")
        if len(found_values) > 20:
            print(f"  ... and {len(found_values) - 20} more")
        
        print(f"\n{'='*70}")
        print("Recommendation:")
        print(f"{'='*70}")
        print("Check if your tag should use one of these offsets instead of 8")
        print("="*70 + "\n")
    else:
        print("No non-zero REAL values found in the scanned range.")
        print("The PLC might not be writing to DB2099, or values are all zero.\n")
    
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

