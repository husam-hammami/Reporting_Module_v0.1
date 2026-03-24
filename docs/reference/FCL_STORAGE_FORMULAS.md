# FCL & SCL Storage Formulas & Data Flow

## 📊 **Live Monitor Storage** (fcl_monitor_logs table)

### Data Source
- **PLC DB199**: Active sources, destination, flow rates
- **PLC DB2099**: Flow measurements and cumulative counters
- **Frequency**: Every 1 second (gevent.sleep(1))

### Storage Logic (app.py lines 1838-1925)

#### 1. **Sender Bins** (active_sources)
```python
# Stored as-is from PLC (t/h)
active_sources = [
    {"bin_id": 21, "weight": 2.401, "material": {...}, ...},
    {"bin_id": 25, "weight": 7.115, "material": {...}, ...},
    ...
]
```
- **Unit**: t/h (flow rate)
- **Type**: Instantaneous measurement

#### 2. **Receiver Field** (`receiver` column)
```python
# Sum ONLY flow rates (exclude cumulative counters)
total_receiver_weight = 0.0
for receiver in fcl_receivers:
    if receiver_id != "FCL_2_520WE":  # Skip cumulative counter
        total_receiver_weight += weight  # t/h
```
- **Unit**: t/h (flow rate)
- **Example**: 23.9 t/h (bin 29 flow rate)

#### 3. **FCL Receivers JSONB** (`fcl_receivers` column)
```json
[
  {
    "id": "0029",
    "name": "H.BAKING",
    "weight": 23.876,           // ✅ Flow rate (t/h)
    "location": "Bin 29",
    "material_code": "5003"
  },
  {
    "id": "FCL_2_520WE",
    "name": "FCL 2_520WE",
    "weight": 671165733.0,      // ✅ Cumulative counter (kg)
    "location": "FCL 2_520WE"
  }
]
```
- **Receiver 1**: Flow rate in t/h
- **Receiver 2**: Cumulative counter in kg

#### 4. **Produced Weight** (`produced_weight` column)
```python
# Sum of all flow rates (t/h)
produced_weight = total_sender_weight + total_receiver_weight
# Example: (2.4 + 7.1 + 3.6 + 3.7 + 7.2) + 23.9 = 47.9 t/h
```
- **Unit**: t/h (total flow rate)
- **Note**: Does NOT include cumulative counters

---

## 📦 **Hourly Archive** (fcl_monitor_logs_archive table)

### Archive Logic (app.py lines 1176-1243)

#### Purpose
Convert instantaneous flow rates to **cumulative kg** for delta calculations.

#### 1. **Conversion Formula**
```python
# Each record = 1 second of operation
kg_per_second = (t/h × 1000) ÷ 3600
# Example: 2.4 t/h → (2.4 × 1000) ÷ 3600 = 0.667 kg/s
```

#### 2. **Sender Bins** (per_bin_weights)
```python
# Accumulate kg for each bin across all records in the hour
for each record (60 records in 1 hour):
    for each bin:
        kg_per_second = weight_tph * 1000 / 3600
        bin_cumulative[bin_id] += kg_per_second

# Result stored in per_bin_weights:
# [{"bin_id": 21, "total_weight": 40.0}, ...]  // kg
```
- **Input**: 2.4 t/h (per record)
- **Per Second**: 0.667 kg/s
- **Per Hour**: 0.667 × 3600 = 2,400 kg ✅

#### 3. **Receiver** (receiver column)
```python
# Accumulate kg from flow rate (not from cumulative counter)
for each record:
    receiver_tph = row['receiver']  # e.g., 23.9 t/h
    receiver_kg_per_second = receiver_tph * 1000 / 3600
    receiver_cumulative_kg += receiver_kg_per_second

# Stored: 23.9 t/h × 1000 ÷ 3600 × 3600s = 23,900 kg
```
- **Input**: 23.9 t/h
- **Output**: ~23,900 kg (for 1 hour)

#### 4. **FCL_2_520WE Counter** (fcl_receivers JSONB)
```python
# Store the LAST cumulative value (already in kg)
fcl_2_520we_last = 671165733  # kg (from last record)
```
- **No conversion needed** - already cumulative kg

#### 5. **Produced Weight** (produced_weight column)
```python
produced_weight = sum(all_sender_bins_kg) + receiver_cumulative_kg
# Example: 40 + 50 + 30 + 30 + 50 + 23,900 = 24,100 kg
```
- **Unit**: kg (cumulative for the hour)

---

## 📊 **SCL (SDLA) Storage & Archive**

### SCL Live Monitor Storage (scl_monitor_logs table)

#### Data Source
- **PLC DB299**: Active sources, destination, flow rates
- **Frequency**: Every 1 second (gevent.sleep(1))

#### Storage Logic (app.py lines 2034-2090)

```python
# Sender bins (ActiveSources) - stored in t/h
total_sender_weight = 0.0
for src in ActiveSources:
    total_sender_weight += src['flowrate_tph']  # t/h

# Receiver - stored in t/h
receiver_weight = data['receiver']  # t/h

# Produced weight - sum of flow rates (t/h)
produced_weight = total_sender_weight + receiver_weight
```

- **All values stored in t/h** (flow rates)
- **No cumulative counters** in SCL

### SCL Hourly Archive (scl_monitor_logs_archive table)

#### Archive Logic (app.py lines 1334-1380)

**Same conversion as FCL:**

```python
# Convert t/h → kg/s for each record, then accumulate
for each record (60 in 1 hour):
    for each bin:
        kg_per_second = flowrate_tph * 1000 / 3600  # 5.0 t/h → 1.389 kg/s
        bin_cumulative[bin_id] += kg_per_second     # Total: 5,000 kg ✅
    
    # Receiver conversion
    receiver_kg_per_second = receiver_tph * 1000 / 3600
    receiver_cumulative_kg += receiver_kg_per_second
```

**Stored in Archive:**
- `per_bin_weights`: **5,000 kg** (not 300 t/h)
- `receiver`: **10,000 kg** (not 600 t/h)
- `produced_weight`: **15,000 kg** (cumulative for 1 hour)

---

## 🌾 **MILA Storage & Archive**

### MILA Storage Method

**MILA is DIFFERENT** - it uses **cumulative counters directly from PLC**:
- `bran_receiver`: DInt counters (kg) from PLC
- `receiver`: Flow measurements (kg)
- `produced_weight`: Cumulative counter (kg)

**Archive Logic (app.py lines 1497-1568):**
```python
# Store LAST VALUE (already cumulative from PLC)
final_bran_receiver = last_row['bran_receiver']  # Already kg
final_receiver = last_row['receiver']             # Already kg
total_produced_weight = last_row['produced_weight']  # Already kg
```

**✅ MILA is already correct** - no conversion needed!

---

## 🎯 **Report Summary Calculation** (orders_bp.py lines 2964-3097)

### Delta Calculation
```python
# Get FIRST and LAST archive records
first_record = rows[0]
last_record = rows[-1]

# Calculate delta (Last - First)
total_produced = last_produced - first_produced

# Per-bin weights
delta_bin_21 = last_bins['bin_21'] - first_bins['bin_21']
# Example: 50,000 kg - 2,400 kg = 47,600 kg

# FCL_2_520WE cumulative counter
fcl_delta = last_fcl_2_520we - first_fcl_2_520we
# Example: 671,200,000 - 671,165,733 = 34,267 kg
```

### Why This Works
1. **Monitor logs** store instantaneous rates (t/h)
2. **Archive** converts to cumulative kg per hour
3. **Summary** calculates delta across multiple hours
4. **Result**: Total kg produced in the time range

---

## ✅ **Unit Summary - All Systems**

### FCL Units

| Location | Field | Unit | Type |
|----------|-------|------|------|
| Monitor Logs | active_sources[].weight | t/h | Flow rate |
| Monitor Logs | receiver | t/h | Flow rate |
| Monitor Logs | fcl_receivers[0].weight | t/h | Flow rate |
| Monitor Logs | fcl_receivers[1].weight | kg | Cumulative |
| Monitor Logs | produced_weight | t/h | Flow rate |
| Archive | per_bin_weights[].total_weight | kg | Cumulative |
| Archive | receiver | kg | Cumulative |
| Archive | fcl_receivers[1].weight | kg | Cumulative |
| Archive | produced_weight | kg | Cumulative |
| Report Summary | All weights | kg | Delta |

### SCL Units

| Location | Field | Unit | Type |
|----------|-------|------|------|
| Monitor Logs | active_sources[].flowrate_tph | t/h | Flow rate |
| Monitor Logs | receiver | t/h | Flow rate |
| Monitor Logs | produced_weight | t/h | Flow rate |
| Archive | per_bin_weights[].total_weight | kg | Cumulative |
| Archive | receiver | kg | Cumulative |
| Archive | produced_weight | kg | Cumulative |
| Report Summary | All weights | kg | Delta |

### MILA Units

| Location | Field | Unit | Type |
|----------|-------|------|------|
| Monitor Logs | bran_receiver | kg | Cumulative (PLC) |
| Monitor Logs | receiver[].weight_kg | kg | Cumulative (PLC) |
| Monitor Logs | produced_weight | kg | Cumulative (PLC) |
| Archive | bran_receiver | kg | Last value |
| Archive | receiver | kg | Last value |
| Archive | produced_weight | kg | Last value |
| Report Summary | All weights | kg | Delta |

---

## 🔬 **Verification Example**

### Scenario: 1 hour of operation (60 records)

**Monitor Log (per record):**
- Bin 21: 2.4 t/h
- Bin 25: 7.1 t/h
- Receiver (bin 29): 23.9 t/h
- FCL_2_520WE: 671,165,733 kg (growing)

**Archive (after 1 hour):**
```json
{
  "per_bin_weights": [
    {"bin_id": 21, "total_weight": 2400},    // 2.4 × 1000 = 2,400 kg
    {"bin_id": 25, "total_weight": 7100}     // 7.1 × 1000 = 7,100 kg
  ],
  "receiver": 23900,                          // 23.9 × 1000 = 23,900 kg
  "fcl_receivers": [
    {"id": "0029", "weight": 23.9},           // Still t/h (metadata)
    {"id": "FCL_2_520WE", "weight": 671200000} // Last cumulative value
  ],
  "produced_weight": 33400                    // 2400 + 7100 + 23900 = 33,400 kg
}
```

**Report (10 hours):**
```python
# First archive: produced_weight = 33,400 kg
# Last archive: produced_weight = 367,400 kg
# Delta: 367,400 - 33,400 = 334,000 kg ✅
```

---

## 🚨 **Previous Issues (Now Fixed)**

### ❌ **Issue 1**: Mixing Units in Monitor Logs
```python
# WRONG (before fix)
total_receiver_weight = 23.9 + 671165733  # Mixed t/h + kg!

# CORRECT (after fix)
total_receiver_weight = 23.9  # Only flow rate (t/h)
```

### ❌ **Issue 2**: Summing Flow Rates in Archive
```python
# WRONG (before fix)
bin_sums[21] = 2.4 + 2.4 + ... = 144 t/h  # Summed 60 records

# CORRECT (after fix)
bin_cumulative[21] = 0.667 + 0.667 + ... = 2,400 kg  # Converted to kg/s first
```

### ❌ **Issue 3**: Archive Receiver Sum
```python
# WRONG (before fix)
receiver_total = 23.9 + 23.9 + ... = 1,434 t/h  # Summed flow rates

# CORRECT (after fix)
receiver_cumulative_kg = (23.9 × 1000 ÷ 3600) × 3600 = 23,900 kg  # Converted properly
```

---

## 📝 **Testing Checklist**

- [ ] Live monitor shows correct t/h values (not mixed with kg)
- [ ] Database `receiver` field is ~24 t/h (not 671 million)
- [ ] Database `produced_weight` is ~48 t/h (not 671 million)
- [ ] Archive stores cumulative kg (not summed t/h)
- [ ] Report delta calculations show realistic values (e.g., 2,400 kg/hour, not 144 t/h)
- [ ] FCL_2_520WE counter increases correctly in archive

