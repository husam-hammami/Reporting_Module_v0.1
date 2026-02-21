#!/usr/bin/env python3
"""
Test script to verify FCL flow rate reading from DB2099
"""
import struct
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from plc_utils import connect_to_plc_fast as connect_to_plc

# FCL bin mapping (using PLC bin codes, not database IDs!)
FCL_FEEDER_FLOW_MAP = {
    21: 64,   # Bin 21
    22: 68,   # Bin 22
    23: 72,   # Bin 23
    24: 778,  # Bin 24
    25: 76,   # Bin 25
    26: 1030, # Bin 26
    27: 84,   # Bin 27
    28: 88,   # Bin 28
    29: 92,   # Bin 29
    30: 1534, # Bin 30
    31: 40,   # Bin 31
    32: 44,   # Bin 32
    '21A': 52,  # Bin 21A
    '21B': 56,  # Bin 21B
    '21C': 60,  # Bin 21C
}

def read_flow_rate(plc, db_num, offset):
    """Read flow rate from DB2099"""
    try:
        raw = plc.db_read(db_num, offset, 4)
        # Reverse bytes for little-endian
        raw_reversed = raw[::-1]
        value = struct.unpack('<f', raw_reversed)[0]
        return round(value, 6), raw.hex()
    except Exception as e:
        return None, str(e)

def main():
    print("=" * 80)
    print("FCL FLOW RATE READING TEST")
    print("=" * 80)
    
    try:
        print("\n1. Connecting to PLC...")
        plc = connect_to_plc()
        print("   ✅ Connected successfully")
        
        print("\n2. Testing DB2099 flow rate readings:")
        print("-" * 80)
        print(f"{'Bin ID':<10} {'Offset':<10} {'Raw Bytes':<20} {'Value (t/h)':<15} {'Status'}")
        print("-" * 80)
        
        for bin_id, offset in sorted(FCL_FEEDER_FLOW_MAP.items()):
            value, raw_or_error = read_flow_rate(plc, 2099, offset)
            if value is not None:
                status = "✅ OK" if value > 0 else "⚠️  Zero"
                print(f"{bin_id:<10} {offset:<10} {raw_or_error:<20} {value:<15} {status}")
            else:
                print(f"{bin_id:<10} {offset:<10} {'ERROR':<20} {'-':<15} ❌ {raw_or_error}")
        
        print("\n3. Reading active sources from DB199...")
        active_sources = []
        for i in range(5):
            offset = 536 + i * 16
            data = plc.db_read(199, offset, 16)
            bin_id = struct.unpack('>h', data[2:4])[0]
            if bin_id == 0:
                continue
            active_sources.append(bin_id)
            print(f"   Source {i+1}: Bin ID {bin_id}")
        
        if not active_sources:
            print("   ⚠️  No active sources found in DB199")
        else:
            print(f"\n4. Checking if active bins have flow mappings:")
            for bin_id in active_sources:
                if bin_id in FCL_FEEDER_FLOW_MAP:
                    offset = FCL_FEEDER_FLOW_MAP[bin_id]
                    value, raw = read_flow_rate(plc, 2099, offset)
                    status = "✅" if value and value > 0 else "⚠️"
                    print(f"   {status} Bin {bin_id} → Offset {offset} = {value} t/h")
                else:
                    print(f"   ❌ Bin {bin_id} NOT in FCL_FEEDER_FLOW_MAP!")
        
        plc.disconnect()
        print("\n✅ Test completed successfully")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())

