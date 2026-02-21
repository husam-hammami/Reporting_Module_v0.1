#!/usr/bin/env python3
"""
Test multiple offsets around 8 to find the correct value
"""

import struct
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

try:
    from plc_utils import connect_to_plc_fast
    
    print("\n" + "="*70)
    print("Testing offsets around 8 (DB2099)")
    print("="*70)
    
    plc = connect_to_plc_fast()
    if not plc:
        print("[ERROR] Failed to connect to PLC")
        sys.exit(1)
    
    print("[OK] Connected to PLC\n")
    
    db_number = 2099
    offsets_to_test = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108]
    
    print(f"Testing {len(offsets_to_test)} offsets...\n")
    print(f"{'Offset':<8} {'Big-Endian':<15} {'Little-Endian':<15} {'Bytes':<12} {'Status'}")
    print("-" * 70)
    
    for offset in offsets_to_test:
        try:
            data = plc.db_read(db_number, offset, 4)
            bytes_hex = data.hex()
            
            # Big-endian
            value_big = struct.unpack('>f', data)[0]
            
            # Little-endian (reversed)
            value_little = struct.unpack('<f', data[::-1])[0]
            
            # Determine which value to show
            if value_big != 0.0 and abs(value_big) < 1e10 and value_big == value_big:
                status = "BIG-ENDIAN"
                value = value_big
            elif value_little != 0.0 and abs(value_little) < 1e10 and value_little == value_little:
                status = "LITTLE-ENDIAN"
                value = value_little
            else:
                status = "ZERO/INVALID"
                value = 0.0
            
            # Highlight offset 8
            marker = " <-- YOUR TAG" if offset == 8 else ""
            print(f"{offset:<8} {value_big:>14.3f} {value_little:>14.3f} {bytes_hex:<12} {status}{marker}")
            
        except Exception as e:
            print(f"{offset:<8} ERROR: {e}")
    
    print("\n" + "="*70)
    print("Summary:")
    print("="*70)
    print("If offset 8 shows 0.0, check if your tag should use a different offset.")
    print("Common offsets with values: 0, 4, 20, 24, 32, 36, 48, 64, 76, 108")
    print("="*70 + "\n")
    
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

