# DATABASE CALCULATION AND STORAGE REPORT
## Hercules-v2 Production Monitoring System

**Generated Date:** December 10, 2025  
**Document Version:** 1.0  
**System:** Salalah Mills - Production Line Monitoring

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Data Sources and PLC Integration](#2-data-sources-and-plc-integration)
3. [FCL (Flour Cleaning Line) Data Flow](#3-fcl-flour-cleaning-line-data-flow)
4. [SCL (Semolina Cleaning Line) Data Flow](#4-scl-semolina-cleaning-line-data-flow)
5. [MIL-A (Mill A) Data Flow](#5-mil-a-mill-a-data-flow)
6. [Archive Process](#6-archive-process)
7. [Summary Calculations](#7-summary-calculations)
8. [Database Schema Details](#8-database-schema-details)

---

## 1. SYSTEM OVERVIEW

The Hercules-v2 system monitors three production lines at Salalah Mills:
- **FCL (Flour Cleaning Line)** - Job Type ID: 9
- **SCL/SDLA (Semolina Cleaning Line)** - Job Type ID: 10
- **MIL-A (Mill A)** - Job Type ID: 15

### Data Flow Architecture

```
PLC System (Siemens S7-1200/1500)
    ↓
Backend Monitor Services (Python/Gevent)
    ↓
PostgreSQL Database (Normal Tables - 1-second interval)
    ↓
Archive Service (Hourly aggregation)
    ↓
PostgreSQL Database (Archive Tables)
    ↓
Frontend Reports (React)
```

---

## 2. DATA SOURCES AND PLC INTEGRATION

### PLC Data Blocks

The system reads data from multiple Siemens PLC Data Blocks (DB):

| Data Block | Description | Usage |
|------------|-------------|-------|
| **DB199** | FCL Control and Monitoring | Flow rate, moisture, receiver weights |
| **DB299** | SCL/SDLA Control and Monitoring | Flow rate, moisture, bin statuses |
| **DB499** | MILA Configuration and Status | Feeder targets, flap positions, receiver bin IDs, scale weight |
| **DB2099** | MILA Yield and Flow Data | Yield percentages, flow rates, product weights |

### Connection Details

- **PLC IP:** 192.168.2.10
- **Rack:** 0
- **Slot:** 1
- **Communication Protocol:** Snap7 (Python library)
- **Reading Interval:** Every 1 second

### Data Reading Process

```python
# Example: Reading DB499 Real value at offset 0
plc.db_read(DB_NUMBER, START_OFFSET, DATA_LENGTH)

# Data Type Conversions:
# - Real (4 bytes) → Float
# - Bool (1 bit) → Boolean
# - Int (2 bytes) → Integer
```

---

## 3. FCL (FLOUR CLEANING LINE) DATA FLOW

### 3.1 Real-Time Monitoring Table: `fcl_monitor_logs`

**Monitoring Service:** `fcl_realtime_monitor()` (runs every 1 second)  
**Source API:** `/orders/plc/db199-monitor`

#### Table Schema

```sql
CREATE TABLE fcl_monitor_logs (
    id SERIAL PRIMARY KEY,
    job_status INT,
    line_running BOOLEAN,
    receiver NUMERIC,                  -- kg
    flow_rate NUMERIC,                 -- kg/h or t/h
    produced_weight NUMERIC,           -- kg (calculated)
    water_consumed NUMERIC,            -- liters
    moisture_offset NUMERIC,           -- %
    moisture_setpoint NUMERIC,         -- %
    active_sources JSONB,              -- Array of source bins
    active_destination JSONB,          -- Destination bin info
    order_name TEXT,                   -- e.g., "FCL1", "FCL2"
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 3.2 Data Calculations

##### Produced Weight Formula

```javascript
// Frontend calculation (Report.jsx line 1838-1839)
produced_weight = total_sender_weight + receiver_weight

// Where:
// - total_sender_weight = sum of all active source bin weights
// - receiver_weight = value from PLC DB199 "receiver" field
```

**Backend Storage:**
```python
# app.py line 1838-1839
receiver_weight = float(data.get("receiver", 0))
produced_weight = round(total_sender_weight + receiver_weight, 6)
```

##### Active Sources Data Structure

```json
{
  "active_sources": [
    {
      "bin_id": 211,
      "prd_name": "Wheat",
      "material": {
        "material_code": "1001",
        "material_name": "Soft Wheat",
        "material_type": "Raw Material"
      },
      "weight": 15.234,        // t/h
      "produced_qty": 15.234,  // t/h
      "qty_percent": 100.0     // %
    }
  ]
}
```

##### Consumed Weight Calculation

```javascript
// Frontend: NewReport.jsx line 1319-1326
const senderActualWeight = senderRows.reduce(
  (sum, row) => sum + (row.weight || 0), 
  0
);

// For FCL:
consumedWeight = senderActualWeight  // Sum of all sender bin weights
```

### 3.3 Archive Table: `fcl_monitor_logs_archive`

**Archive Service:** `archive_old_fcl_logs()` (runs every hour)  
**Data Aggregation:** Last full hour of data

#### Archive Process

1. **Selection:** All records from `fcl_monitor_logs` where `created_at < date_trunc('hour', NOW())`
2. **Aggregation:**
   - Orders grouped by `order_name`
   - Per-bin weights summed
   - Setpoints averaged
3. **Storage:** Aggregated data inserted into archive table
4. **Cleanup:** Original records deleted from normal table

#### Archive Table Schema

```sql
CREATE TABLE fcl_monitor_logs_archive (
    id SERIAL PRIMARY KEY,
    job_status INT,
    line_running BOOLEAN,
    receiver NUMERIC,
    flow_rate NUMERIC,
    produced_weight NUMERIC,
    water_consumed NUMERIC,
    moisture_offset NUMERIC,
    moisture_setpoint NUMERIC,
    active_sources JSONB,
    active_destination JSONB,
    per_bin_weights JSONB,        -- NEW: Aggregated bin weights
    order_name TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. SCL (SEMOLINA CLEANING LINE) DATA FLOW

### 4.1 Real-Time Monitoring Table: `scl_monitor_logs`

**Monitoring Service:** `scl_realtime_monitor()` (runs every 1 second)  
**Source API:** `/orders/plc/db299-monitor`

#### Table Schema

```sql
CREATE TABLE scl_monitor_logs (
    id SERIAL PRIMARY KEY,
    job_status INT,
    line_running BOOLEAN,
    receiver NUMERIC,
    flow_rate NUMERIC,
    produced_weight NUMERIC,
    water_consumed NUMERIC,
    moisture_offset NUMERIC,
    moisture_setpoint NUMERIC,
    active_sources JSONB,
    active_destination JSONB,
    order_name TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Data Calculations

##### Produced Weight Formula

```python
# app.py line 1965-1966
receiver_weight = float(data.get("receiver", 0.0))
produced_weight = round(total_sender_weight + receiver_weight, 6)

# Where:
# - total_sender_weight = sum of all ActiveSources flowrate_tph
# - receiver_weight = destination bin weight
```

##### Active Sources Example (SCL)

```json
{
  "ActiveSources": [
    {
      "bin_id": 25,
      "material": {
        "material_name": "Durum Wheat"
      },
      "flowrate_tph": 8.5,      // t/h (direct from PLC)
      "qty_percent": 100.0,
      "produced_qty": 8.5
    }
  ]
}
```

### 4.3 Archive Table: `scl_monitor_logs_archive`

**Archive Service:** `archive_old_scl_logs()` (runs every hour)

Same schema as normal table with additional aggregation:
- Per-bin weights summed per hour
- Material summaries calculated
- Average setpoints computed

---

## 5. MIL-A (MILL A) DATA FLOW

### 5.1 Real-Time Monitoring Table: `mila_monitor_logs`

**Monitoring Service:** `mila_realtime_monitor()` (runs every 1 second)  
**Source APIs:** 
- `/orders/plc/db499-db2099-monitor`
- Material lookup from database

#### Table Schema

```sql
CREATE TABLE mila_monitor_logs (
    id SERIAL PRIMARY KEY,
    order_name TEXT,
    status TEXT,
    receiver JSONB,              -- Array of receiver bins with flow rates
    bran_receiver JSONB,         -- Cumulative weights (kg) - NON-ERASABLE counters
    yield_log JSONB,             -- Yield percentages and flow rates
    setpoints_produced JSONB,    -- Feeder targets, flap positions
    produced_weight NUMERIC,     -- kg (calculated from flows)
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### 5.2 CRITICAL: Bran Receiver Data (Non-Erasable Counters)

**Important:** The `bran_receiver` field contains **CUMULATIVE COUNTERS** that are never reset by the PLC. These represent total production since system installation.

#### Bran Receiver Structure

```json
{
  "bran_receiver": {
    "bran_coarse": 1234567.5,     // kg - CUMULATIVE
    "bran_fine": 987654.3,        // kg - CUMULATIVE
    "flour_1": 2345678.9,         // kg - CUMULATIVE
    "b1": 3456789.1,              // kg - CUMULATIVE (input/consumed)
    "semolina": 4567890.2         // kg - CUMULATIVE
  }
}
```

**⚠️ WARNING:** These values are cumulative totals, NOT flow rates!

### 5.3 Receiver Data (Flow Rates)

The `receiver` field contains real-time flow rates from bins receiving product:

```json
{
  "receiver": [
    {
      "material_code": "0051",
      "material_name": "Wheat Flour Type 1",
      "bin_id": 51,
      "weight_kg": 15.5         // t/h or kg/s (flow rate)
    },
    {
      "material_code": "0055",
      "material_name": "Wheat Flour Type 2",
      "bin_id": 55,
      "weight_kg": 8.3          // t/h or kg/s (flow rate)
    }
  ]
}
```

### 5.4 Yield Log Data

Contains percentages and flow measurements:

```json
{
  "yield_log": {
    "Yield Max Flow (kg/s)": 12.5,
    "Yield Min Flow (kg/s)": 8.3,
    "MILA_B1 (%)": 85.2,
    "MILA_Flour1 (%)": 72.5,
    "MILA_BranCoarse (%)": 12.3,
    "MILA_Semolina (%)": 68.5,
    "MILA_BranFine (%)": 8.7
  }
}
```

### 5.5 Produced Weight Calculation (MILA)

**CRITICAL FORMULA:**

```javascript
// Frontend: Report.jsx line 140
weightProduced = receiverTotal + branReceiverTotal

// Where:
// receiverTotal = sum of receiver flow rates (t/h)
// branReceiverTotal = sum of bran_receiver weights (kg) - BUT THIS IS WRONG!
//                     bran_receiver contains CUMULATIVE counters, not flow rates
```

**⚠️ ISSUE IDENTIFIED:** The frontend is mixing flow rates (t/h) with cumulative counters (kg)!

**CORRECT CALCULATION:**
```javascript
// For real-time display: use only receiver flow rates
weightProduced = receiverTotal  // t/h

// For period reports: use DELTA of bran_receiver
deltaProduced = (bran_receiver_end - bran_receiver_start)  // kg
```

### 5.6 Archive Table: `mila_monitor_logs_archive`

**Archive Service:** `archive_mila_logs()` (runs every hour)

#### Archive Schema

```sql
CREATE TABLE mila_monitor_logs_archive (
    id SERIAL PRIMARY KEY,
    order_name TEXT,
    status TEXT,
    receiver JSONB,              -- Aggregated receiver totals
    bran_receiver JSONB,         -- SUMMED bran weights per hour
    yield_log JSONB,             -- Averaged yield percentages + max/min flows
    setpoints_produced JSONB,    -- Averaged setpoints
    produced_weight NUMERIC,     -- SUMMED produced weight
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### Archive Aggregation Logic

```python
# app.py lines 1439-1485
# For bran_receiver: SUM all flow rates from the hour
for r in rows:
    for k, v in r['bran_receiver'].items():
        if isinstance(v, (int, float)):
            clean_k = k.replace("(kg/s)", "(kg)")
            bran_sum[clean_k] += v  # SUMMING cumulative values - INCORRECT!

# ⚠️ PROBLEM: This sums cumulative counters instead of calculating deltas
```

**CORRECT LOGIC SHOULD BE:**
```python
# Calculate delta between first and last record
first_record_bran = rows[0]['bran_receiver']
last_record_bran = rows[-1]['bran_receiver']

for key in last_record_bran.keys():
    delta = last_record_bran[key] - first_record_bran[key]
    bran_sum[key] = delta  # Store the difference
```

---

## 6. ARCHIVE PROCESS

### 6.1 Archive Timing

All archive services run **every 1 hour** and process data from the **last complete hour**.

```python
# Selection criteria (app.py line 1380-1383)
SELECT * FROM mila_monitor_logs
WHERE created_at < date_trunc('hour', NOW())

# Example: If current time is 14:35:22
# This selects all records before 14:00:00
```

### 6.2 Order Name Management

Orders are auto-named with incrementing counters:
- FCL orders: `FCL1`, `FCL2`, `FCL3`, ...
- SCL orders: `SCL1`, `SCL2`, `SCL3`, ...
- MILA orders: `MILA1`, `MILA2`, `MILA3`, ...

```python
# app.py lines 1553-1585
def get_next_order_number(prefix, live_table, archive_table):
    """
    Determines next order number by checking both 
    live and archive tables for highest existing number
    """
    # Example: If FCL15 exists in archive, next will be FCL16
```

### 6.3 Archive Data Retention

- **Normal Tables:** Rolling 1-hour window (data older than 1 hour is archived)
- **Archive Tables:** Permanent storage (no automatic deletion)

### 6.4 Archive Aggregation Methods

| Data Type | Aggregation Method |
|-----------|-------------------|
| Produced Weight | **SUM** of all records |
| Flow Rate | **AVERAGE** of all records |
| Moisture Setpoint | **AVERAGE** of all records |
| Moisture Offset | **AVERAGE** of all records |
| Yield Percentages | **AVERAGE** of all records |
| Yield Max Flow | **MAX** value |
| Yield Min Flow | **MIN** value |
| Per-Bin Weights | **SUM** per bin ID |
| Bran Receiver | **SUM** (⚠️ should be DELTA) |

---

## 7. SUMMARY CALCULATIONS

### 7.1 FCL Archive Summary

**API Endpoint:** `GET /orders/fcl/archive/summary?start_date=...&end_date=...`  
**Source Code:** `backend/orders_bp.py` lines 2571-2667

#### Calculation Logic

```python
# For all records in date range:
for row in rows:
    # Accumulate totals
    total_produced_weight += row['produced_weight']
    total_receiver_weight += row['receiver']
    total_flow_rate += row['flow_rate']
    
    # Per-bin aggregation
    for bin_entry in row['per_bin_weights']:
        bin_id = bin_entry['bin_id']
        weight = bin_entry['total_weight']
        per_bin_weight_totals[bin_id] += weight
    
    # Material tracking
    for source in row['active_sources']:
        material_name = source['material']['material_name']
        material_summary[material_name]['total_produced_qty'] += source['produced_qty']

# Final averages
average_flow_rate = total_flow_rate / record_count
average_moisture_setpoint = total_moisture_setpoint / record_count
```

#### Summary Response Structure

```json
{
  "status": "success",
  "summary": {
    "record_count": 60,
    "total_produced_weight": 1234.5,
    "total_receiver_weight": 567.8,
    "average_flow_rate": 20.5,
    "average_moisture_offset": 2.3,
    "average_moisture_setpoint": 14.5,
    "per_bin_weight_totals": {
      "bin_211": 450.2,
      "bin_212": 387.6
    },
    "material_summary": {
      "Soft Wheat": {
        "total_produced_qty": 837.8,
        "total_qty_percent": 100.0
      }
    }
  }
}
```

### 7.2 SCL Archive Summary

**API Endpoint:** `GET /orders/scl/archive/summary?start_date=...&end_date=...`  
**Source Code:** `backend/orders_bp.py` lines 2466-2569

Similar to FCL but includes:
- Receiver weight totals by material name
- Destination bin tracking

### 7.3 MILA Archive Summary

**API Endpoint:** `GET /orders/mila/archive/summary?start_date=...&end_date=...`  
**Source Code:** `backend/orders_bp.py` lines 2277-2464

#### Current Implementation (⚠️ HAS ISSUES)

```python
# orders_bp.py lines 2338-2413
for row in all_rows:
    # Accumulate produced weight (INCORRECT - sums flow rates)
    total_weight += float(row.get("produced_weight", 0))
    
    # Sum yield percentages for averaging
    for k, v in yield_log.items():
        if "%" in k:
            yield_log_sum[k] += v
    
    # Sum bran_receiver (INCORRECT - sums cumulative counters)
    for k, v in bran.items():
        bran_receiver_sum[k] += v
    
    # Sum receiver weights (INCORRECT - sums flow rates)
    for r in receivers:
        receiver_weights[mat_name] += weight

# Calculate averages
yield_log_avg = {k: v / yield_log_count for k, v in yield_log_sum.items()}
```

**⚠️ CRITICAL ISSUES:**

1. **Bran Receiver Summation:** Summing cumulative counters instead of calculating deltas
2. **Mixed Units:** Combining flow rates (t/h) with total weights (kg)
3. **Time Period Confusion:** Not clear if weights represent hourly production or total accumulation

#### CORRECT IMPLEMENTATION SHOULD BE:

```python
# For MILA summary over a time period, use DELTA calculation:
if len(all_rows) >= 2:
    first_record = all_rows[0]
    last_record = all_rows[-1]
    
    # Calculate deltas for cumulative counters
    bran_receiver_delta = {}
    for key in last_record['bran_receiver'].keys():
        first_val = first_record['bran_receiver'].get(key, 0)
        last_val = last_record['bran_receiver'].get(key, 0)
        bran_receiver_delta[key] = last_val - first_val  # kg produced in period
    
    # Use last record for flow rates (current state)
    receiver_flows = last_record['receiver']  # t/h
    
    # Use last record for yield percentages (current state)
    yield_percentages = last_record['yield_log']  # %
    
    # Calculate period totals
    time_diff_hours = (last_record['timestamp'] - first_record['timestamp']).total_seconds() / 3600
    
    # Total produced = sum of bran receiver deltas
    total_produced_kg = sum(bran_receiver_delta.values())
```

#### Summary Response Structure

```json
{
  "status": "success",
  "summary": {
    "record_count": 60,
    "total_produced_weight": 2345.6,
    "average_yield_log": {
      "MILA_B1 (%)": 85.3,
      "MILA_Flour1 (%)": 72.8,
      "MILA_BranCoarse (%)": 12.5,
      "MILA_Semolina (%)": 68.2,
      "MILA_BranFine (%)": 8.9
    },
    "average_setpoints_percentages": {
      "Feeder 1 target (%)": 75.0,
      "Feeder 2 target (%)": 60.0
    },
    "average_yield_flows": {
      "Yield Max Flow (kg/s)": 12.8,
      "Yield Min Flow (kg/s)": 8.5
    },
    "bran_receiver_totals": {
      "Semolina (kg)": 856.3,
      "MILA_Flour1 (kg)": 723.4,
      "9105 Bran fine (kg)": 145.6,
      "9106 Bran coarse (kg)": 234.8,
      "B1Scale (kg)": 1289.5
    },
    "receiver_weight_totals": {
      "Wheat Flour Type 1": 450.2,
      "Wheat Flour Type 2": 387.9
    },
    "b1_scale_weight": 1289.5,
    "semolina_weight": 856.3
  }
}
```

### 7.4 Frontend Display Formulas

#### Consumed Weight

```javascript
// FCL & SCL: Sum of sender bin weights
consumedWeight = senderRows.reduce((sum, row) => sum + row.weight, 0)

// MILA: B1Scale weight (input to process)
consumedWeight = b1ScaleWeight  // kg
```

#### Produced Weight

```javascript
// FCL: Sum of receiver weights
producedWeight = receiverActualWeight

// SCL: Total produced weight from archive
producedWeight = total_produced_weight

// MILA: Sum of bran receiver outputs (excluding B1Scale)
producedWeight = semolinaWeight + milaFlour1Weight + branFineWeight + branCoarseWeight
```

---

## 8. DATABASE SCHEMA DETAILS

### 8.1 Primary Keys and Indexes

All tables use:
- `id SERIAL PRIMARY KEY` for unique row identification
- Index on `created_at` for efficient time-based queries
- Index on `order_name` for order-based filtering

```sql
-- Recommended indexes
CREATE INDEX idx_fcl_logs_created_at ON fcl_monitor_logs(created_at);
CREATE INDEX idx_fcl_logs_order_name ON fcl_monitor_logs(order_name);
CREATE INDEX idx_fcl_archive_created_at ON fcl_monitor_logs_archive(created_at);
CREATE INDEX idx_fcl_archive_order_name ON fcl_monitor_logs_archive(order_name);

-- Similar indexes for SCL and MILA tables
```

### 8.2 JSONB Column Details

All JSONB columns allow efficient querying with PostgreSQL operators:

```sql
-- Query example: Find all records with bin_id 211
SELECT * FROM fcl_monitor_logs
WHERE active_sources @> '[{"bin_id": 211}]';

-- Query example: Extract specific yield percentage
SELECT 
    order_name,
    yield_log->>'MILA_B1 (%)' as b1_yield
FROM mila_monitor_logs_archive;
```

### 8.3 Data Types and Precision

| Field Type | PostgreSQL Type | Precision | Range |
|------------|-----------------|-----------|-------|
| Weights | NUMERIC | Up to 6 decimals | Unlimited |
| Percentages | NUMERIC | Up to 3 decimals | 0-100 |
| Flow Rates | NUMERIC | Up to 3 decimals | 0-9999 |
| Timestamps | TIMESTAMP | Microseconds | Standard |
| Boolean Flags | BOOLEAN | True/False | - |

### 8.4 Database Backup Recommendations

```sql
-- Daily backup of archive tables
pg_dump -h localhost -U postgres -t fcl_monitor_logs_archive hercules_db > fcl_archive_backup.sql
pg_dump -h localhost -U postgres -t scl_monitor_logs_archive hercules_db > scl_archive_backup.sql
pg_dump -h localhost -U postgres -t mila_monitor_logs_archive hercules_db > mila_archive_backup.sql

-- Full database backup (weekly)
pg_dump -h localhost -U postgres hercules_db > full_backup_$(date +%Y%m%d).sql
```

---

## 9. SUMMARY OF KEY FORMULAS

### FCL Formulas

```
1. Produced Weight (Real-time):
   produced_weight = Σ(sender_bin_weights) + receiver_weight

2. Consumed Weight:
   consumed_weight = Σ(sender_bin_weights)

3. Per-Bin Weight (Archive):
   per_bin_total = Σ(bin_weight_per_record) for all records in hour
```

### SCL Formulas

```
1. Produced Weight (Real-time):
   produced_weight = Σ(active_source_flowrates) + receiver_weight

2. Consumed Weight:
   consumed_weight = Σ(active_source_flowrates)

3. Average Flow Rate (Archive):
   avg_flow_rate = Σ(flow_rate) / record_count
```

### MILA Formulas

```
1. Produced Weight (Real-time) - CURRENT (INCORRECT):
   produced_weight = receiverTotal + branReceiverTotal
   [⚠️ Mixes flow rates with cumulative counters]

2. Produced Weight (Real-time) - CORRECT:
   produced_weight = Σ(receiver_flow_rates)  // t/h

3. Produced Weight (Period Report) - CORRECT DELTA METHOD:
   produced_weight = Δ(bran_receiver_values) = last - first
   
   Example:
   - First record: bran_coarse = 1234567.5 kg
   - Last record:  bran_coarse = 1234890.8 kg
   - Delta:        323.3 kg produced in period

4. Consumed Weight:
   consumed_weight = B1Scale_weight  // kg (input to mill)

5. Yield Percentages (Archive):
   avg_yield% = Σ(yield%) / record_count

6. Bran Receiver Totals (Archive) - CURRENT (INCORRECT):
   bran_total = Σ(bran_receiver_values)  // Sums cumulative counters
   
7. Bran Receiver Totals (Archive) - CORRECT:
   bran_total = last_record_value - first_record_value  // Delta
```

---

## 10. IDENTIFIED ISSUES AND RECOMMENDATIONS

### 10.1 Critical Issues

#### Issue 1: MILA Bran Receiver Delta Calculation

**Problem:** System sums cumulative counter values instead of calculating deltas  
**Impact:** Archive reports show incorrect production totals  
**Location:** 
- `backend/app.py` lines 1439-1485 (archive service)
- `backend/orders_bp.py` lines 2379-2390 (summary API)

**Recommendation:**
```python
# BEFORE (Incorrect):
for r in rows:
    for k, v in r['bran_receiver'].items():
        bran_sum[k] += v  # Summing cumulative values

# AFTER (Correct):
first_bran = rows[0]['bran_receiver']
last_bran = rows[-1]['bran_receiver']
for k in last_bran.keys():
    bran_delta[k] = last_bran[k] - first_bran[k]  # Calculate delta
```

#### Issue 2: Mixed Units in MILA Calculations

**Problem:** Mixing flow rates (t/h) with cumulative totals (kg)  
**Impact:** Confusion in real-time displays and reports  
**Location:** `Frontend/src/Pages/Report.jsx` line 140

**Recommendation:**
- Clearly separate real-time flow rates from period totals
- Use consistent units throughout (convert t/h to kg for period calculations)
- Add unit labels to all displayed values

#### Issue 3: Receiver Weight Summation vs Flow Rate

**Problem:** Archive summaries sum receiver weights (flow rates) instead of time-integrating  
**Impact:** Period totals may not represent actual production  
**Location:** All archive summary endpoints

**Recommendation:**
- For flow rates: Average them, don't sum
- For total production: Calculate time-weighted integral or use delta of cumulative counters

### 10.2 Enhancement Recommendations

1. **Add Unit Tests for Calculations**
   - Test delta calculations with sample data
   - Verify unit conversions
   - Test edge cases (zero values, single records, etc.)

2. **Implement Data Validation**
   - Check for negative deltas (counter rollover)
   - Validate timestamp sequences
   - Alert on missing data

3. **Add Calculation Audit Trail**
   - Log input values used in calculations
   - Store calculation metadata in archive
   - Enable traceability for production reports

4. **Improve Error Handling**
   - Handle PLC communication failures gracefully
   - Implement retry logic for failed reads
   - Alert on data inconsistencies

5. **Performance Optimization**
   - Add database indexes on frequently queried fields
   - Implement caching for summary calculations
   - Optimize JSONB queries with GIN indexes

---

## 11. APPENDIX: PLC DATA FIELD MAPPINGS

### DB199 (FCL) Field Map

| Offset | Type | Field Name | Unit | Description |
|--------|------|------------|------|-------------|
| 0 | Real | flow_rate | t/h | Target flow rate |
| 4 | Real | moisture_setpoint | % | Target moisture |
| 8 | Real | moisture_offset | % | Moisture adjustment |
| 12 | Real | receiver | kg | Receiver bin weight |
| 16 | Int | job_status | - | Job status code (0-5) |
| 18 | Bool | line_running | - | Line running flag |

### DB299 (SCL) Field Map

| Offset | Type | Field Name | Unit | Description |
|--------|------|------------|------|-------------|
| 0 | Real | Flowrate | t/h | Target flow rate |
| 4 | Real | MoistureSetpoint | % | Target moisture |
| 8 | Real | MoistureOffset | % | Moisture adjustment |
| 12 | Real | ProducedWeight | t/h | Current production rate |
| 16 | Int | JobStatusCode | - | Job status (0-5) |

### DB499 (MILA Configuration) Field Map

| Offset | Type | Field Name | Unit | Description |
|--------|------|------------|------|-------------|
| 0 | Real | scale_weight | kg | B1 Scale weight (cumulative) |
| 478 | Real | feeder_1_target | % | Feeder 1 target percentage |
| 482 | Bool | feeder_1_selected | - | Feeder 1 enabled |
| 484 | Real | feeder_2_target | % | Feeder 2 target percentage |
| 488 | Bool | feeder_2_selected | - | Feeder 2 enabled |
| 490.5 | Bool | depot_selected | - | B1 depot emptying active |
| 514 | Bool | flap_1_selected | - | Flap 1 position |
| 514.1 | Bool | flap_2_selected | - | Flap 2 position |
| 532 | Bool | linning_running | - | Mill line running |
| 536 | Int | receiver_bin_id_1 | - | First receiver bin ID |
| 544 | Int | receiver_bin_id_2 | - | Second receiver bin ID |

### DB2099 (MILA Yield Data) Field Map

| Offset | Type | Field Name | Unit | Description |
|--------|------|------------|------|-------------|
| 0 | Real | mila_B1_scale | kg/s | B1 Scale flow rate |
| 4 | Real | bran_coarse | kg/s | Bran coarse flow rate |
| 8 | Real | bran_fine | kg/s | Bran fine flow rate |
| 12 | Real | yield_max_flow | kg/s | Maximum yield flow |
| 12 | Real | yield_min_flow | kg/s | Minimum yield flow |
| 20 | Real | mila_bran_coarse | % | Bran coarse yield % |
| 24 | Real | mila_flour_1 | % | Flour 1 yield % |
| 28 | Real | mila_b1 | % | B1 yield % |
| 32 | Real | mila_bran_fine | % | Bran fine yield % |
| 36 | Real | mila_semolina | % | Semolina yield % |

**Note:** Flow rate values from DB2099 are read in t/h and converted to kg/s by dividing by 3.6.

---

## 12. VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-10 | System Analysis | Initial comprehensive report |

---

## 13. GLOSSARY

| Term | Definition |
|------|------------|
| **PLC** | Programmable Logic Controller - Industrial control system |
| **DB** | Data Block - Memory area in Siemens PLC |
| **FCL** | Flour Cleaning Line |
| **SCL/SDLA** | Semolina Cleaning Line / Semolina Dust Aspiration |
| **MIL-A** | Mill A - Milling line |
| **JSONB** | JSON Binary - PostgreSQL binary JSON data type |
| **Delta** | Difference between two values (final - initial) |
| **Cumulative Counter** | Value that only increases, never resets |
| **Flow Rate** | Rate of material flow (t/h or kg/s) |
| **Yield** | Percentage of input converted to specific output |
| **Setpoint** | Target value for control system |
| **t/h** | Tons per hour |
| **kg/s** | Kilograms per second |

---

**END OF REPORT**

For questions or clarifications, please contact the system development team.


