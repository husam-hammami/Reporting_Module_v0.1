# ✅ FCL 2_520WE - Displaying Cumulative Weight Counter

## 🎯 **What You Requested:**

Display the **large cumulative counter value** from offset 108 (like 670,498,424 kg), not the small flow rate from offset 96 (0.6 t/h).

---

## ✅ **What Was Changed:**

### **In `orders_bp.py` (line ~1886):**

**BEFORE:**
```python
# Was using offset 96 (instantaneous flow rate)
receiver_2_weight = read_flow_rate(plc, DB2099, 96)  # Shows 0.6 t/h
```

**AFTER:**
```python
# Now using offset 108 (cumulative weight counter)
receiver_2_counter = read_dint_counter(plc, DB2099, 108)  # Reads DInt
receiver_2_weight = float(receiver_2_counter)  # Shows 670,498,424 kg
```

---

## 📊 **What You'll See:**

### **In Live Monitor:**
| Receiver | Before | After |
|----------|--------|-------|
| **081 (Output Bin)** | 24.1 kg | 24.1 kg ✅ |
| **FCL_2_520WE** | 0.6 kg ❌ | **670,498,424 kg** ✅ |

### **Data Type:**
- **Offset 108**: `DInt` (32-bit signed integer)
- **Field Name**: `2_520WE_Non_Erasable_Weight`
- **Value Type**: Cumulative total production (kg)
- **Display**: Large numbers like 670,498,424 (670 million kg)

---

## 🔄 **To Apply Changes:**

**Restart your backend:**
```bash
# Stop current backend (Ctrl+C)
# Start again
cd backend
python app.py
```

After restart, the live monitor will show:
- ✅ **FCL_2_520WE**: Large cumulative weight (e.g., 670,498,424 kg)
- ✅ This value will increment as production continues
- ✅ Shows total cumulative production from PLC counter

---

## 📝 **Technical Details:**

### **Offset 108 Structure:**
```
Field: 2_520WE_Non_Erasable_Weight
Type: DInt (4 bytes)
Offset: 108.0
Current Value: 670,488,321 (increases over time)
Purpose: Non-erasable cumulative weight counter
```

### **Reading Method:**
```python
def read_dint_counter(plc, db_num, offset):
    raw = plc.db_read(db_num, offset, 4)
    raw_reversed = raw[::-1]  # Little-endian
    value = struct.unpack('<i', raw_reversed)[0]  # Signed 32-bit int
    return value
```

### **Display Conversion:**
- Read as: DInt (integer)
- Display as: Float (for consistency with other weights)
- Units: kg (kilograms)
- Range: -2,147,483,648 to 2,147,483,647 (32-bit signed)

---

## ✅ **Benefits of Using Cumulative Counter:**

1. **Accurate Total Production**: Shows exact cumulative weight from PLC
2. **No Data Loss**: Counter persists across system restarts
3. **Non-Erasable**: Value only increases (unless manually reset in PLC)
4. **Simple Display**: Direct value, no delta calculation needed
5. **Audit Trail**: Can track total production over equipment lifetime

---

## ⚠️ **Notes:**

### **Display Format:**
- Value shown in kg (not t/h)
- Large numbers: 670,498,424 kg = ~670,498 tons
- No decimal conversion (shows full counter value)

### **Counter Behavior:**
- ✅ **Increments**: As material flows through FCL 2_520WE
- ✅ **Persists**: Across system restarts
- ✅ **Resets**: Only when PLC counter is manually reset
- ⚠️ **Rollover**: At 2,147,483,647 (max 32-bit int), wraps to negative

### **If Counter Resets:**
If the PLC counter resets to 0, the display will show 0 and start counting up again.

---

## 🔍 **Verification:**

To verify it's working:
1. Check live monitor shows large value (not 0.6)
2. Value should match PLC display for offset 108
3. Number should slowly increase as production runs
4. Check backend logs for:
   ```
   [FCL] Receiver 2 (FCL_2_520WE) cumulative weight: 670498424 kg
   ```

---

## 📊 **Summary:**

| Aspect | Value |
|--------|-------|
| **Offset** | 108 |
| **Data Type** | DInt (32-bit signed integer) |
| **Field Name** | 2_520WE_Non_Erasable_Weight |
| **Display** | Large cumulative value (e.g., 670,498,424 kg) |
| **Purpose** | Show total cumulative production |
| **Updates** | Continuously as material flows |

**✅ Ready to use!** Restart backend to see cumulative weight values in live monitor.




