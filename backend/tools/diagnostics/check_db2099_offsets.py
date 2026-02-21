#!/usr/bin/env python3
"""
Diagnostic script to check DB2099 offsets for FCL receivers
This helps identify the correct offset for FCL 2_520WE
"""

import snap7
from snap7.util import *
import struct
import sys

# PLC connection parameters (read from config)
from plc_config import get_plc_config
_cfg = get_plc_config()
PLC_IP = _cfg['ip']
PLC_RACK = _cfg['rack']
PLC_SLOT = _cfg['slot']
DB2099 = 2099

def read_flow_rate(plc, offset):
    """Read REAL value (4 bytes) from DB2099 at given offset"""
    try:
        raw = plc.db_read(DB2099, offset, 4)
        # Reverse bytes for little-endian
        raw_reversed = raw[::-1]
        value = struct.unpack('<f', raw_reversed)[0]
        return value, raw.hex(), 'REAL'
    except Exception as e:
        return None, str(e), 'ERROR'

def read_dint(plc, offset):
    """Read DInt value (4 bytes) from DB2099 at given offset"""
    try:
        raw = plc.db_read(DB2099, offset, 4)
        # Reverse bytes for little-endian
        raw_reversed = raw[::-1]
        value = struct.unpack('<i', raw_reversed)[0]
        return value, raw.hex(), 'DInt'
    except Exception as e:
        return None, str(e), 'ERROR'

def main():
    print("\n" + "="*80)
    print("DB2099 OFFSET DIAGNOSTIC TOOL")
    print("="*80)
    print(f"\nConnecting to PLC at {PLC_IP}...\n")
    
    try:
        plc = snap7.client.Client()
        plc.connect(PLC_IP, PLC_RACK, PLC_SLOT)
        
        if not plc.get_connected():
            print("❌ Failed to connect to PLC!")
            return False
        
        print("✅ Connected to PLC!\n")
        
        # Check known working offset first
        print("-" * 80)
        print("KNOWN WORKING OFFSETS:")
        print("-" * 80)
        
        offsets_to_check = [
            (48, "081 Output Bin (KNOWN WORKING)"),
            (52, "Possible receiver 2"),
            (56, "Possible receiver 2"),
            (60, "Possible receiver 2"),
            (64, "Bin 21 sender flow"),
            (68, "Bin 22 sender flow"),
            (72, "Bin 23 sender flow"),
            (76, "Bin 25 sender flow"),
            (80, "Possible receiver 2"),
            (84, "Bin 27 sender flow"),
            (88, "Bin 28 sender flow"),
            (92, "Bin 29 sender flow"),
            (96, "Possible flow rate (REAL)"),
            (100, "Possible receiver 2"),
            (104, "Possible receiver 2"),
            (108, "FCL 2_520WE CUMULATIVE WEIGHT (DInt) ✅ IN USE"),
            (112, "Possible receiver 2"),
            (116, "Possible receiver 2"),
            (120, "Possible receiver 2"),
        ]
        
        print(f"\n{'Offset':<8} {'Type':<8} {'Value':<20} {'Raw Hex':<20} {'Description'}")
        print("-" * 80)
        
        non_zero_offsets = []
        
        for offset, description in offsets_to_check:
            # Try REAL first
            value_real, raw_hex, data_type = read_flow_rate(plc, offset)
            
            # Special check for offset 108 - also try as DInt
            if offset == 108:
                value_dint, raw_hex_dint, _ = read_dint(plc, offset)
                print(f"{offset:<8} {'REAL':<8} {value_real if value_real is not None else 'ERROR':<20.6f} {raw_hex:<20} {description}")
                if value_dint is not None:
                    print(f"{offset:<8} {'DInt':<8} {value_dint:<20} {raw_hex_dint:<20} {description} ✅ (Counter)")
                    non_zero_offsets.append((offset, value_dint, f"{description} (as DInt counter)"))
                continue
            
            if value_real is None:
                print(f"{offset:<8} {'REAL':<8} {'ERROR':<20} {raw_hex:<20} {description}")
            else:
                status = ""
                if value_real != 0.0 and -1000 < value_real < 1000:  # Reasonable range
                    status = "✅"
                    non_zero_offsets.append((offset, value_real, description))
                elif offset == 48:
                    status = "✅"
                    
                print(f"{offset:<8} {'REAL':<8} {value_real:<20.6f} {raw_hex:<20} {description} {status}")
        
        # Summary
        print("\n" + "="*80)
        print("SUMMARY: Non-zero values found:")
        print("="*80)
        
        if non_zero_offsets:
            print(f"\n{'Offset':<8} {'Value':<25} {'Description'}")
            print("-" * 80)
            for offset, value, desc in non_zero_offsets:
                if offset != 48:  # Exclude the known working offset
                    if isinstance(value, float):
                        print(f"{offset:<8} {value:<25.3f} {desc}")
                    else:
                        print(f"{offset:<8} {value:<25} {desc}")
        else:
            print("\n⚠️  No non-zero values found! FCL 2_520WE might be at a different offset.")
        
        print("\n" + "="*80)
        print("RECOMMENDATIONS:")
        print("="*80)
        print("\n1. ⚠️  IMPORTANT: Offset 108 contains a DInt (integer counter), NOT a REAL (float)!")
        print("   - This is a cumulative weight counter, not a flow rate")
        print("   - You need to read it as DInt and calculate delta (difference) between readings")
        print("\n2. If offset 108 shows a large DInt value:")
        print("   - This is the cumulative weight counter for FCL 2_520WE")
        print("   - Use struct.unpack('<i', ...) instead of struct.unpack('<f', ...)")
        print("   - Calculate flow rate from delta: (current_value - previous_value) / time_interval")
        print("\n3. Check PLC program documentation for actual flow rate offset if you need t/h directly")
        print("   - Look for a REAL value that represents instantaneous flow rate")
        print("   - Counters (DInt) are more accurate for total weight but need delta calculation")
        print()
        
        plc.disconnect()
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

