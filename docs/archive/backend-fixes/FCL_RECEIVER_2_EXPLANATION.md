# FCL Receiver 2 (FCL 2_520WE) - Data Type Issue Explanation

## 🔍 Problem Identified

**Offset 108 in DB2099 contains a DInt (integer) cumulative counter, NOT a REAL (float) flow rate!**

### Screenshot Evidence:
- **Field Name**: `2_520WE_Non_Erasable_Weight`
- **Data Type**: `DInt` (32-bit signed integer)
- **Offset**: 108.0
- **Current Value**: 670,488,321 (this is cumulative kilograms, not t/h)

### Why We Were Getting 0.0:
Our code was trying to read this as a REAL (float) using `struct.unpack('<f', ...)`, which interprets the bytes incorrectly. When you read an integer as a float, you get garbage values or 0.0.

---

## ✅ Changes Made

### 1. **Updated Diagnostic Script** (`check_db2099_offsets.py`)
- Added `read_dint()` function to read DInt values
- Now checks offset 108 as both REAL and DInt
- Will correctly show the cumulative counter value

### 2. **Updated Production Code** (`orders_bp.py`)
- Added `read_dint_counter()` function
- Changed offset 108 reading from REAL to DInt
- Currently sets `receiver_2_weight = 0.0` (see solution below)

---

## 🎯 Two Possible Solutions

### **Option 1: Find the Actual Flow Rate Offset** (RECOMMENDED)
Look in the PLC program for a REAL value that represents the **instantaneous flow rate** for FCL 2_520WE.

**Search for:**
- `2_520WE_Flow` or `2_520WE_Flowrate` (REAL type)
- Offset near 108, possibly 104, 112, 116, etc.
- A value in the range of 0-50 t/h (reasonable flow rate)

**Why this is better:**
- ✅ Instantaneous flow rate (no delta calculation needed)
- ✅ Simpler code
- ✅ Works immediately

---

### **Option 2: Calculate Flow Rate from Cumulative Counter**
Use the DInt counter and calculate delta between readings.

**How it works:**
```python
# Store previous reading and timestamp
flow_rate = (current_counter - previous_counter) / time_interval_seconds * 3600

# Example:
# Reading 1: 670,488,321 kg at 10:00:00
# Reading 2: 670,502,321 kg at 10:00:05 (5 seconds later)
# Delta: 14,000 kg in 5 seconds
# Flow rate: 14,000 / 5 * 3600 = 10,080 kg/h = 10.08 t/h
```

**Why this is more complex:**
- ⚠️ Need to store previous values in memory or database
- ⚠️ First reading will always show 0 (no previous value)
- ⚠️ Need to handle counter rollovers (if counter resets)
- ⚠️ Need to handle system restarts (previous value lost)

---

## 🔧 Next Steps

### **Immediate Action:**
1. **Run the updated diagnostic script**:
   ```bash
   cd backend
   python check_db2099_offsets.py
   ```
   This will now correctly show the DInt value at offset 108.

2. **Check PLC documentation** for the actual flow rate offset for FCL 2_520WE
   - Look for a REAL value (not DInt) that shows instantaneous t/h
   - Check offsets near 108 (e.g., 104, 112, 116, 120)

3. **Verify with the screenshot tool** or PLC program:
   - Look for fields named like `2_520WE_Flow`, `2_520WE_Flowrate`, `2_520WE_ActualFlow`
   - These should be REAL data type

### **If Option 1 (Recommended):**
Update `orders_bp.py` line ~1885:
```python
# Replace this:
receiver_2_counter = read_dint_counter(plc, DB2099, 108)
receiver_2_weight = 0.0

# With this (use correct offset):
receiver_2_weight = read_flow_rate(plc, DB2099, CORRECT_OFFSET)
```

### **If Option 2 (Complex):**
Implement delta tracking:
```python
# Store in global dict or cache
previous_counters = {}

def calculate_flow_from_counter(current_counter, previous_data, time_delta_seconds):
    if previous_data is None:
        return 0.0
    
    delta_kg = current_counter - previous_data['counter']
    if delta_kg < 0:  # Counter rollover
        delta_kg = current_counter  # Use current value
    
    flow_rate_kg_per_sec = delta_kg / time_delta_seconds
    flow_rate_t_per_hour = (flow_rate_kg_per_sec * 3600) / 1000
    return round(flow_rate_t_per_hour, 6)
```

---

## 📊 Current Status

✅ **Fixed**: Diagnostic script now correctly reads DInt values  
✅ **Fixed**: Production code reads offset 108 as DInt  
⚠️  **Pending**: Find correct flow rate offset OR implement delta tracking  
📝 **Temporary**: Receiver 2 weight shows as 0.0 in live monitor/reports

---

## 🔍 How to Find the Correct Offset

### Method 1: Run the diagnostic script
```bash
python check_db2099_offsets.py
```
Look for non-zero REAL values in reasonable flow range (0-50 t/h)

### Method 2: Check PLC program
1. Open TIA Portal / Step 7
2. Navigate to DB2099
3. Search for fields containing "520" or "2_520WE"
4. Look for REAL data type (not DInt)
5. Note the offset

### Method 3: Live monitoring
1. Run FCL line with material going through 2_520WE
2. Use diagnostic script to scan offsets 100-120
3. Look for value changing with material flow (should be 5-30 t/h range)

---

## ❓ Questions?

If you're unsure which offset to use, provide:
1. Screenshot of DB2099 showing fields near offset 108
2. Expected flow rate range for FCL 2_520WE
3. Is this a separate receiver or part of the main 081 output?




