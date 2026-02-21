# QUICK REFERENCE: DATA CALCULATION FORMULAS

## FCL (Flour Cleaning Line)

### Real-Time Calculations
```
Produced Weight = Σ(Sender Bin Weights) + Receiver Weight
Consumed Weight = Σ(Sender Bin Weights)
```

### Archive Summaries (Per Hour/Period)
```
Total Produced = Σ(produced_weight for all records)
Average Flow Rate = Σ(flow_rate) / record_count
Average Moisture = Σ(moisture_setpoint) / record_count
Per-Bin Total = Σ(bin_weight for all records where bin_id = X)
```

---

## SCL (Semolina Cleaning Line)

### Real-Time Calculations
```
Produced Weight = Σ(Active Source Flowrates) + Receiver Weight
Consumed Weight = Σ(Active Source Flowrates)
```

### Archive Summaries (Per Hour/Period)
```
Total Produced = Σ(produced_weight for all records)
Average Flow Rate = Σ(flow_rate) / record_count
Material Total = Σ(material_produced_qty for all records)
```

---

## MIL-A (Mill A)

### ⚠️ CRITICAL: MILA uses CUMULATIVE COUNTERS

**Bran Receiver Data = NON-ERASABLE COUNTERS**
- These values continuously increase and never reset
- For period reports, calculate DELTA (end value - start value)

### Real-Time Display (CURRENT - Has Issues)
```
❌ INCORRECT FORMULA (Currently Used):
Produced Weight = Σ(Receiver Flow Rates) + Σ(Bran Receiver Cumulative Values)
Problem: Mixes flow rates (t/h) with cumulative totals (kg)

✅ CORRECT FORMULA (Should Be Used):
Produced Weight = Σ(Receiver Flow Rates)  // t/h only
```

### Period Reports (Daily/Weekly/Monthly)

#### ✅ CORRECT METHOD: Delta Calculation
```python
# For any time period (start_time to end_time):

# 1. Get first and last records
first_record = get_record_at(start_time)
last_record = get_record_at(end_time)

# 2. Calculate deltas for each product
bran_coarse_produced = last_record.bran_coarse - first_record.bran_coarse
bran_fine_produced = last_record.bran_fine - first_record.bran_fine
flour_1_produced = last_record.flour_1 - first_record.flour_1
semolina_produced = last_record.semolina - first_record.semolina
b1_consumed = last_record.b1 - first_record.b1

# 3. Total Produced
total_produced = bran_coarse_produced + bran_fine_produced + 
                 flour_1_produced + semolina_produced

# 4. Total Consumed
total_consumed = b1_consumed
```

#### ❌ INCORRECT METHOD (Currently Implemented)
```python
# DO NOT USE THIS:
for record in all_records:
    total_produced += record.produced_weight  # Sums flow rates
    bran_total += record.bran_receiver  # Sums cumulative values
    
# This gives wrong results!
```

### Example Calculation

```
Scenario: Daily Report from 2025-12-10 05:00 to 2025-12-11 05:00

First Record (2025-12-10 05:00:00):
- bran_coarse: 1,234,567.5 kg (cumulative)
- bran_fine:   987,654.3 kg (cumulative)
- flour_1:     2,345,678.9 kg (cumulative)
- semolina:    4,567,890.2 kg (cumulative)
- b1:          3,456,789.1 kg (cumulative - input)

Last Record (2025-12-11 05:00:00):
- bran_coarse: 1,234,890.8 kg (cumulative)
- bran_fine:   987,798.9 kg (cumulative)
- flour_1:     2,346,402.3 kg (cumulative)
- semolina:    4,568,746.5 kg (cumulative)
- b1:          3,458,078.6 kg (cumulative - input)

DELTA CALCULATION:
✅ Bran Coarse Produced = 1,234,890.8 - 1,234,567.5 = 323.3 kg
✅ Bran Fine Produced = 987,798.9 - 987,654.3 = 144.6 kg
✅ Flour 1 Produced = 2,346,402.3 - 2,345,678.9 = 723.4 kg
✅ Semolina Produced = 4,568,746.5 - 4,567,890.2 = 856.3 kg
✅ B1 Consumed = 3,458,078.6 - 3,456,789.1 = 1,289.5 kg

✅ Total Produced = 323.3 + 144.6 + 723.4 + 856.3 = 2,047.6 kg
✅ Total Consumed = 1,289.5 kg

YIELD CALCULATION:
Yield = (Total Produced / Total Consumed) × 100%
Yield = (2,047.6 / 1,289.5) × 100% = 158.8%

Individual Product Yields:
- Bran Coarse % = (323.3 / 1,289.5) × 100 = 25.1%
- Bran Fine % = (144.6 / 1,289.5) × 100 = 11.2%
- Flour 1 % = (723.4 / 1,289.5) × 100 = 56.1%
- Semolina % = (856.3 / 1,289.5) × 100 = 66.4%
```

---

## Database Tables

### Normal Tables (1-second polling)
- `fcl_monitor_logs` - Real-time FCL data
- `scl_monitor_logs` - Real-time SCL data
- `mila_monitor_logs` - Real-time MILA data

**Data Retention:** Last 1 hour only (older data moved to archive)

### Archive Tables (hourly aggregation)
- `fcl_monitor_logs_archive` - Historical FCL data
- `scl_monitor_logs_archive` - Historical SCL data
- `mila_monitor_logs_archive` - Historical MILA data

**Data Retention:** Permanent (never deleted)

---

## API Endpoints for Summaries

### FCL Summary
```
GET /orders/fcl/archive/summary?start_date=YYYY-MM-DDTHH:MM:SS&end_date=YYYY-MM-DDTHH:MM:SS

Returns:
- total_produced_weight (kg)
- total_receiver_weight (kg)
- average_flow_rate (t/h)
- average_moisture_setpoint (%)
- per_bin_weight_totals (kg per bin)
- material_summary (by material name)
```

### SCL Summary
```
GET /orders/scl/archive/summary?start_date=YYYY-MM-DDTHH:MM:SS&end_date=YYYY-MM-DDTHH:MM:SS

Returns:
- total_produced_weight (kg)
- average_flow_rate (t/h)
- average_moisture_setpoint (%)
- per_bin_weight_totals (kg per bin)
- material_summary (by material name)
- receiver_weight_totals (kg per material)
```

### MILA Summary
```
GET /orders/mila/archive/summary?start_date=YYYY-MM-DDTHH:MM:SS&end_date=YYYY-MM-DDTHH:MM:SS

Returns:
- total_produced_weight (kg) ⚠️ Currently incorrect - needs delta fix
- average_yield_log (% per product)
- average_setpoints_percentages (% per feeder)
- average_yield_flows (kg/s max and min)
- bran_receiver_totals (kg per product) ⚠️ Currently sums instead of delta
- receiver_weight_totals (kg per material)
- b1_scale_weight (kg - consumed)
- semolina_weight (kg)
```

---

## Unit Conversions

```
1 t/h = 1000 kg/h
1 kg/h = 0.000278 kg/s
1 kg/s = 3600 kg/h = 3.6 t/h

PLC Data Conversions:
- DB2099 Real values (except %) are converted: value / 3.6 = kg/s
- Display conversion: kg/s × 3600 = kg/h
```

---

## Key Findings & Issues

### ✅ Working Correctly
1. FCL real-time monitoring and archive
2. SCL real-time monitoring and archive
3. Order naming and auto-increment
4. Database archiving process (timing)
5. PLC data reading and storage

### ❌ Needs Fixing (Priority Issues)

#### 1. MILA Delta Calculation (CRITICAL)
**Problem:** Archive service sums cumulative counter values instead of calculating deltas  
**Files Affected:**
- `backend/app.py` lines 1439-1485
- `backend/orders_bp.py` lines 2379-2390

**Fix Required:**
```python
# Change from SUM to DELTA
first_bran = rows[0]['bran_receiver']
last_bran = rows[-1]['bran_receiver']
bran_delta = {k: last_bran[k] - first_bran[k] for k in last_bran.keys()}
```

#### 2. Mixed Units in MILA Display (HIGH)
**Problem:** Real-time display mixes flow rates (t/h) with cumulative totals (kg)  
**File:** `Frontend/src/Pages/Report.jsx` line 140

**Fix Required:**
```javascript
// Separate flow rates from cumulative totals
const weightProduced_flow = receiverTotal;  // t/h (real-time flow)
const weightProduced_delta = branReceiverDelta;  // kg (period total)
```

#### 3. Archive Summary Calculations (MEDIUM)
**Problem:** Summaries sum flow rates instead of time-integrating  
**Files:** All `*_archive_summary` endpoints

**Fix Required:**
- For flow rates: Calculate time-weighted average, not sum
- For totals: Use delta of cumulative counters where available

---

## Testing Recommendations

### Test Case 1: MILA Delta Calculation
```sql
-- Insert test data with known deltas
INSERT INTO mila_monitor_logs (bran_receiver, timestamp) VALUES
  ('{"bran_coarse": 1000.0, "bran_fine": 500.0}'::jsonb, '2025-12-10 05:00:00'),
  ('{"bran_coarse": 1100.0, "bran_fine": 550.0}'::jsonb, '2025-12-10 06:00:00');

-- Expected Result:
-- Bran Coarse Delta = 100.0 kg
-- Bran Fine Delta = 50.0 kg
```

### Test Case 2: Period Report Accuracy
```python
# Test daily report calculation
start_date = "2025-12-10 05:00:00"
end_date = "2025-12-11 05:00:00"

# Verify:
# 1. Deltas are calculated correctly
# 2. Units are consistent (all kg)
# 3. Totals match manual calculation
```

---

## Production Yield Formulas (MILA)

```
B1 Yield % = (B1 Weight / Total Consumed) × 100
Flour1 Yield % = (Flour1 Weight / Total Consumed) × 100
Bran Coarse Yield % = (Bran Coarse Weight / Total Consumed) × 100
Bran Fine Yield % = (Bran Fine Weight / Total Consumed) × 100
Semolina Yield % = (Semolina Weight / Total Consumed) × 100

Total Yield % = (Total Produced / Total Consumed) × 100

Where:
- Total Produced = Sum of all output products
- Total Consumed = B1 Scale input weight
```

---

## Monitoring Service Timing

| Service | Interval | Archive Timing | Data Retention |
|---------|----------|----------------|----------------|
| FCL Monitor | 1 second | Every hour | Last hour only |
| SCL Monitor | 1 second | Every hour | Last hour only |
| MILA Monitor | 1 second | Every hour | Last hour only |

**Archive Trigger:**
```python
# Runs at: 01:00, 02:00, 03:00, ... 23:00, 00:00
# Archives: Data from previous complete hour
# Example: At 14:00, archives data from 13:00:00 to 13:59:59
```

---

**Last Updated:** December 10, 2025  
**For detailed information, see:** `DATABASE_CALCULATION_AND_STORAGE_REPORT.md`


