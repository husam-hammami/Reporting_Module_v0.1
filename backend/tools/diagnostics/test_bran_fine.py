#!/usr/bin/env python3
"""
Test Script: Verify MILA Bran Fine values from DB2099
"""

import struct
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

try:
    from plc_utils import connect_to_plc_fast
    
    print("\n" + "="*70)
    print("MILA Bran Fine - DB2099 Values")
    print("="*70)
    
    plc = connect_to_plc_fast()
    if not plc:
        print("[ERROR] Failed to connect to PLC")
        sys.exit(1)
    
    print("[OK] Connected to PLC\n")
    
    db_number = 2099
    
    # Test 1: Percentage value (mila_bran_fine)
    print("1. Percentage Value (mila_bran_fine):")
    print("-" * 70)
    offset_percent = 32
    data_percent = plc.db_read(db_number, offset_percent, 4)
    value_percent = struct.unpack('>f', data_percent)[0]
    print(f"   DB: {db_number}")
    print(f"   Offset: {offset_percent}")
    print(f"   Data Type: REAL")
    print(f"   Raw bytes: {data_percent.hex()}")
    print(f"   Value: {value_percent:.3f} %")
    print()
    
    # Test 2: Weight value (bran_fine) - This is what shows in live monitor
    print("2. Weight Value (bran_fine) - Live Monitor Display:")
    print("-" * 70)
    offset_weight = 124
    data_weight = plc.db_read(db_number, offset_weight, 4)
    value_weight = struct.unpack('>i', data_weight)[0]  # DINT = signed 32-bit integer
    print(f"   DB: {db_number}")
    print(f"   Offset: {offset_weight}")
    print(f"   Data Type: DINT (signed 32-bit integer)")
    print(f"   Raw bytes: {data_weight.hex()}")
    print(f"   Value: {value_weight:,} kg")
    print()
    
    # Test 3: Also check nearby offsets to see the pattern
    print("3. Nearby Offsets (for reference):")
    print("-" * 70)
    bran_offsets = {
        "bran_coarse": 112,
        "flour_1": 116,
        "b1": 120,
        "bran_fine": 124,
        "semolina": 128
    }
    
    for name, offset in bran_offsets.items():
        try:
            data = plc.db_read(db_number, offset, 4)
            value = struct.unpack('>i', data)[0]
            print(f"   {name:15s} @ offset {offset:3d}: {value:>15,} kg")
        except Exception as e:
            print(f"   {name:15s} @ offset {offset:3d}: ERROR - {e}")
    
    print("\n" + "="*70)
    print("Summary:")
    print("="*70)
    print("For 'Bran fine' weight in live monitor:")
    print(f"  - DB Number: {db_number}")
    print(f"  - Offset: {offset_weight}")
    print(f"  - Data Type: DINT")
    print(f"  - Current Value: {value_weight:,} kg")
    print("="*70 + "\n")
    
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

