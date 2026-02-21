# 🏭 Hercules Dynamic Report System
## Feature Specifications Document v2.0

---

# Table of Contents

1. [Overview](#overview)
2. [Feature 1: Dynamic Configuration Loading](#feature-1-dynamic-configuration-loading)
3. [Feature 2: Dynamic PLC Reading](#feature-2-dynamic-plc-reading)
4. [Feature 3: Dynamic Bin-to-Material Mapping](#feature-3-dynamic-bin-to-material-mapping)
5. [Feature 4: Dynamic Active Sources Building](#feature-4-dynamic-active-sources-building)
6. [Feature 5: Dynamic Calculation Engine](#feature-5-dynamic-calculation-engine)
7. [Feature 6: Dynamic Monitor Worker](#feature-6-dynamic-monitor-worker)
8. [Feature 7: Dynamic Order Tracking](#feature-7-dynamic-order-tracking)
9. [Feature 8: Dynamic Hourly Archive](#feature-8-dynamic-hourly-archive)
10. [Feature 9: Dynamic Live Monitor UI](#feature-9-dynamic-live-monitor-ui)
11. [Feature 10: Dynamic Report Generation](#feature-10-dynamic-report-generation)
12. [Feature 11: Dynamic Order Analytics](#feature-11-dynamic-order-analytics)
13. [Feature 12: Adding a New Report Type](#feature-12-adding-a-new-report-type)
14. [Feature 13: Modifying PLC Offsets](#feature-13-modifying-plc-offsets)
15. [Feature 14: Adding a New Calculation](#feature-14-adding-a-new-calculation)
16. [Feature 15: Handling Different Source/Destination Structures](#feature-15-handling-different-sourcedestination-structures)
17. [Feature 16: Flow Rate to Weight Conversion](#feature-16-flow-rate-to-weight-conversion)
18. [Feature 17: Order Analytics on Completion](#feature-17-order-analytics-on-completion)
19. [Feature 18: Handling Legacy Data Formats](#feature-18-handling-legacy-data-formats)
20. [Feature 19: Multi-Report-Type Dashboard](#feature-19-multi-report-type-dashboard)
21. [Feature 20: Configuration Export/Import](#feature-20-configuration-exportimport)
22. [Feature 21: Real-Time Alerts](#feature-21-real-time-alerts)
23. [Feature Summary](#feature-summary)

---

# Overview

The Hercules Dynamic Report System is a **configuration-driven platform** for production monitoring. Users can create, configure, and manage production reports dynamically through an Admin UI without code changes.

**Key Principle:** The entire system is configuration-driven. Zero code changes for new report types.

---

# Feature 1: Dynamic Configuration Loading

## Overview
The system loads ALL configuration from database at startup and reloads when changes are made. No hardcoded report types, tags, or calculations exist in code.

## What Gets Loaded

| Configuration | Database Table | When Loaded |
|---------------|----------------|-------------|
| Report Types | report_types | On startup, on change |
| PLC Tags | plc_tags | On startup, on change |
| Calculations | report_calculations | On startup, on change |
| UI Layouts | monitor_layouts | On startup, on change |
| Bin Mappings | bin_master | On startup, on change |

## Config Loader Behavior

**On System Startup:**
1. Query all active report_types (WHERE is_active = true)
2. For each report type, load:
   - All plc_tags for this report_type_id
   - All report_calculations for this report_type_id
   - All monitor_layouts for this report_type_id
   - All bin_master entries for this report_type_id + global (null)
3. Store in memory cache
4. Start Monitor Worker for each active report type

**On Configuration Change:**
1. Admin saves change via UI
2. Backend invalidates cache for affected report_type_id
3. Backend emits `config_updated` WebSocket event
4. Monitor Worker reloads config on next poll cycle
5. Frontend reloads layout if on affected page

## Special Cases

**Case: New Report Type Added**
- User creates report type in Admin
- On first activation, system loads config and starts worker
- No code changes, no restart needed

**Case: Report Type Deactivated**
- User sets is_active = false
- Monitor Worker stops for this type
- Data preserved, just not polling

**Case: Config Load Fails**
- Log error, continue with cached config
- Alert admin via WebSocket
- Retry on next poll cycle

---

# Feature 2: Dynamic PLC Reading

## Overview
The PLC Reader reads data based entirely on plc_tags configuration. Any tag the user adds is automatically read.

## How PLC Reading Works

**Step 1: Get Tags for Report Type**
```
tags = config_cache[report_type]["plc_tags"]
// Returns all tags configured for this report type
```

**Step 2: Group Tags by DB Number**
```
grouped = {
    2099: [tag1, tag2, tag3, ...],  // All tags in DB2099
    499: [tag4, tag5, ...],          // All tags in DB499
}
```

**Step 3: Read Each DB Block**
For each DB number:
1. Find min offset and max offset + size
2. Read entire range in single PLC call
3. Extract individual values from buffer

**Step 4: Parse Values by Type**
```
For each tag in tags:
    if tag.type == "BOOL":
        value = read_bool(buffer, tag.offset, tag.bit)
    elif tag.type == "INT":
        value = read_int(buffer, tag.offset)
    elif tag.type == "DINT":
        value = read_dint(buffer, tag.offset)
    elif tag.type == "REAL":
        value = read_real(buffer, tag.offset, tag.byte_swap)
    elif tag.type == "STRING":
        value = read_string(buffer, tag.offset, tag.length)
    
    result[tag.tag_name] = value
```

**Step 5: Return All Values**
```
{
    "FlowRate_2_521WE": 12.456,
    "ReceiverBinId": 203,
    "Sender1BinId": 101,
    "OrderActive": true,
    ...
}
```

## Data Type Handling

| Type | Size | How to Read | Byte Order |
|------|------|-------------|------------|
| BOOL | 1 bit | Read byte, mask bit position | N/A |
| INT | 2 bytes | struct.unpack('>h', bytes) | Big-endian |
| DINT | 4 bytes | struct.unpack('>i', bytes) | Big-endian |
| REAL | 4 bytes | Reverse bytes, struct.unpack('<f') | Little-endian (swapped) |
| STRING | 2+N bytes | First byte=max, second=actual, rest=chars | N/A |

## Special Cases

**Case: Tag Offset Invalid**
- Read fails for that tag
- Return null for that tag
- Log warning
- Continue with other tags

**Case: PLC Disconnected**
- Attempt reconnect 3 times
- Emit plc_status event to frontend
- Continue retrying indefinitely
- Don't crash

**Case: New Tag Added While Running**
- Config reloaded on next poll
- New tag included in next read
- No restart needed

---

# Feature 3: Dynamic Bin-to-Material Mapping

## Overview
Every Bin ID from PLC is automatically mapped to Material Name using bin_master table. Works for ANY report type.

## How Mapping Works

**Step 1: Load Mappings into Cache**
```
bin_cache = {
    // Report-specific mappings (priority)
    (1, 101): { material_name: "Wheat Grade A", material_code: "WGA" },
    (1, 102): { material_name: "Barley Premium", material_code: "BAR" },
    
    // Global mappings (fallback)
    (null, 301): { material_name: "Mixed Output", material_code: "MIX" },
}
```

**Step 2: Lookup Function**
```
def get_material_name(bin_id, report_type_id):
    # Try report-specific first
    key = (report_type_id, bin_id)
    if key in bin_cache:
        return bin_cache[key].material_name
    
    # Try global fallback
    key = (null, bin_id)
    if key in bin_cache:
        return bin_cache[key].material_name
    
    # Not found
    return f"Unknown Bin {bin_id}"
```

**Step 3: Apply to All Bin ID Tags**
After reading PLC data, for each tag where source_type = "sender" or "receiver":
```
if tag.tag_name ends with "BinId":
    bin_id = plc_data[tag.tag_name]
    material_name = get_material_name(bin_id, report_type_id)
    plc_data[tag.tag_name.replace("BinId", "MaterialName")] = material_name
```

**Result:**
```
// Before mapping
{ "Sender1BinId": 101, "ReceiverBinId": 203 }

// After mapping
{ 
    "Sender1BinId": 101, 
    "Sender1MaterialName": "Wheat Grade A",
    "ReceiverBinId": 203,
    "ReceiverMaterialName": "Mixed Output"
}
```

## Where Material Names Appear

| Location | How It Works |
|----------|--------------|
| Live Monitor | WebSocket data includes MaterialName fields |
| Active Sources Table | Column shows material_name from enriched data |
| Reports | Per-bin breakdown shows material names |
| Order Analytics | Source summary shows material names |

## Special Cases

**Case: Bin ID = 0 (Inactive)**
- Don't map, don't display
- Filter out from active_sources array

**Case: Bin ID Not in bin_master**
- Show "Unknown Bin {id}"
- Log warning for admin to add mapping
- Don't crash

**Case: Bin Mapping Changed**
- Cache invalidated on save
- Next poll uses new mapping
- Historical data keeps old mapping (stored in JSON)

---

# Feature 4: Dynamic Active Sources Building

## Overview
The system automatically builds the active_sources array from PLC data based on tag configuration.

## How It Works

**Step 1: Identify Source Tags**
Find all tags where tag_group = "sources" and tag_name matches pattern:
- Sender{N}BinId
- Sender{N}Weight (or Sender{N}FlowRate)
- Sender{N}PrdCode (optional)

**Step 2: Group by Source Number**
```
sources_grouped = {
    1: { bin_id_tag: "Sender1BinId", weight_tag: "Sender1Weight", ... },
    2: { bin_id_tag: "Sender2BinId", weight_tag: "Sender2Weight", ... },
    ...
}
```

**Step 3: Build Array from PLC Data**
```
active_sources = []
for source_num, tags in sources_grouped:
    bin_id = plc_data[tags.bin_id_tag]
    
    if bin_id > 0:  # Only include active sources
        source = {
            "bin_id": bin_id,
            "material_name": get_material_name(bin_id),
            "weight": plc_data[tags.weight_tag],
            "prd_code": plc_data.get(tags.prd_code_tag, None)
        }
        active_sources.append(source)
```

**Step 4: Add to Emitted Data**
```
websocket_data["active_sources"] = active_sources
```

## Tag Naming Convention

For system to auto-detect sources, use naming convention:

| Tag Name Pattern | What It Is |
|------------------|------------|
| Sender{N}BinId | Source bin ID |
| Sender{N}Weight | Source flow rate (t/h) |
| Sender{N}FlowRate | Alternative name for weight |
| Sender{N}PrdCode | Product code |
| ReceiverBinId | Destination bin ID |
| ReceiverWeight | Destination weight |

## Special Cases

**Case: Source Has bin_id = 0**
- Not included in active_sources
- Treated as inactive/unused slot

**Case: Weight is Negative**
- Include anyway (could be reverse flow)
- Log warning

**Case: More Than 5 Sources**
- System handles any number
- Just add more Sender{N} tags

---

# Feature 5: Dynamic Calculation Engine

## Overview
Calculations are evaluated dynamically based on report_calculations table. Any formula the user creates is automatically executed.

## Calculation Contexts

| Context | When Executed | Data Available |
|---------|---------------|----------------|
| LIVE_MONITOR | Every poll (1 second) | Current tag values |
| HOURLY_ARCHIVE | When creating archive | All records from hour |
| ORDER_ANALYTICS | When order completes | All records from order |
| REPORT_SUMMARY | When generating report | All archive records in range |

## How Calculations Execute

**Step 1: Get Calculations for Context**
```
calcs = config_cache[report_type]["calculations"]["LIVE_MONITOR"]
```

**Step 2: Build Variable Context**
```
variables = {
    # All PLC tag values
    "FlowRate_2_521WE": 12.456,
    "Sender1Weight": 5.2,
    "Sender2Weight": 3.8,
    # Previously computed values
    "total_sender_weight": 9.0,  # From earlier calc
}
```

**Step 3: Evaluate Each Formula**
```
for calc in calcs:
    result = evaluate_formula(calc.formula, variables)
    variables[calc.output_field_name] = result
```

**Step 4: Return Computed Values**
```
computed_values = {
    "total_sender_weight": 9.0,
    "produced_weight": 12.5,
    "efficiency_percent": 98.2
}
```

## Supported Functions

| Function | For Context | What It Does |
|----------|-------------|--------------|
| SUM(field) | ARCHIVE, ANALYTICS, REPORT | Sum field across all records |
| AVG(field) | ARCHIVE, ANALYTICS, REPORT | Average field across records |
| DELTA(field) | ARCHIVE, ANALYTICS | Last value - First value |
| MIN(field) | All | Minimum value |
| MAX(field) | All | Maximum value |
| COUNT() | ARCHIVE, ANALYTICS, REPORT | Number of records |
| IF(cond, true, false) | All | Conditional |
| ROUND(value, decimals) | All | Round to decimals |
| ABS(value) | All | Absolute value |

## Calculation Methods

| Method | Behavior |
|--------|----------|
| DIRECT | Use formula result directly |
| SUM | Sum all values (for multi-record contexts) |
| DELTA | Last - First (for cumulative counters) |
| AVERAGE | Average all values |
| CUSTOM | Evaluate formula as-is |

## Special Cases

**Case: Division by Zero**
- Return 0 or null
- Log warning
- Don't crash

**Case: Reference to Unknown Tag**
- Return null for that calculation
- Log error
- Continue with other calculations

**Case: Circular Reference (A uses B, B uses A)**
- Detect during save
- Reject with error message

**Case: Formula Syntax Error**
- Detect during save validation
- Show error to user
- Don't save until fixed

---

# Feature 6: Dynamic Monitor Worker

## Overview
One Monitor Worker runs for each active report type. It polls PLC, applies calculations, tracks orders, stores data, and emits to WebSocket.

## Monitor Worker Loop

```
def monitor_worker(report_type_id):
    # Load config
    config = load_config(report_type_id)
    order_tracker = OrderTracker(config)
    
    while True:
        loop_start = time.now()
        
        try:
            # 1. Read all PLC tags
            plc_data = plc_reader.read_all_tags(config.plc_tags)
            
            # 2. Apply bin-to-material mapping
            plc_data = apply_bin_mappings(plc_data, config.bin_mappings)
            
            # 3. Build active_sources array
            plc_data["active_sources"] = build_active_sources(plc_data, config)
            
            # 4. Apply LIVE_MONITOR calculations
            computed = calculation_engine.execute(
                config.calculations["LIVE_MONITOR"], 
                plc_data
            )
            
            # 5. Check order trigger (start/stop detection)
            order_event = order_tracker.check_trigger(plc_data)
            
            # 6. Handle order events
            if order_event == "START":
                order_tracker.start_new_order()
            elif order_event == "STOP":
                order_tracker.complete_order()
            
            # 7. Build WebSocket payload
            ws_data = {
                "report_type": config.name,
                "timestamp": time.now(),
                "line_running": order_tracker.is_running,
                "order_name": order_tracker.current_order,
                "plc_connected": True,
                "tag_values": plc_data,
                "computed_values": computed,
                "active_sources": plc_data["active_sources"]
            }
            
            # 8. Emit to WebSocket
            socketio.emit(f"{config.name.lower()}_data", ws_data)
            
            # 9. Store to database (if line running)
            if order_tracker.is_running:
                store_monitor_log(report_type_id, plc_data, computed, order_tracker.current_order)
        
        except PLCError as e:
            emit_plc_status(report_type_id, connected=False, error=str(e))
            reconnect_plc()
        
        except Exception as e:
            log_error(e)
        
        # Maintain polling interval
        elapsed = time.now() - loop_start
        sleep_time = max(0, config.polling_interval_ms / 1000 - elapsed)
        sleep(sleep_time)
```

## What Gets Stored (generic_monitor_logs)

| Column | Value | Source |
|--------|-------|--------|
| report_type_id | Report type ID | Config |
| order_name | Current order (FTRA15) | Order tracker |
| created_at | Current timestamp | System |
| tag_values | All PLC values as JSONB | PLC reader |
| computed_values | Calculated values as JSONB | Calculation engine |
| line_running | Is order active | Order tracker |

## Special Cases

**Case: PLC Disconnected**
- Emit plc_status event (connected: false)
- Continue trying to reconnect
- Don't store data (no valid readings)

**Case: Config Changed**
- Reload config on next loop iteration
- No restart needed

**Case: Very Slow PLC Read**
- Skip sleep if behind schedule
- Log warning if consistently slow

---

# Feature 7: Dynamic Order Tracking

## Overview
Order tracking is fully configurable via order_trigger_config. Works for any report type with any trigger mechanism.

## Order Trigger Configuration

**Stored in report_types.order_trigger_config:**
```json
{
    "trigger_type": "bit",
    "tag_name": "OrderActive",     // Which tag to watch
    "start_value": 1,               // Value that means "started"
    "stop_value": 0,                // Value that means "stopped"
    "order_prefix": "FTRA",         // Prefix for order names
    "debounce_ms": 500              // Ignore rapid changes
}
```

## How Order Tracking Works

**State Variables:**
```
current_order_name = null    // e.g., "FTRA15"
order_counter = 0            // Next order number
last_trigger_value = null    // Previous trigger reading
is_running = false           // Currently in an order?
```

**On Each Poll:**
```
def check_trigger(plc_data):
    current_value = plc_data[config.order_trigger.tag_name]
    
    # Detect START (transition to start_value)
    if last_trigger_value != start_value AND current_value == start_value:
        last_trigger_value = current_value
        return "START"
    
    # Detect STOP (transition to stop_value)
    if last_trigger_value != stop_value AND current_value == stop_value:
        last_trigger_value = current_value
        return "STOP"
    
    last_trigger_value = current_value
    return null
```

**On Order START:**
```
def start_new_order():
    order_counter = get_next_order_number_from_db()
    current_order_name = f"{order_prefix}{order_counter}"
    is_running = true
    
    # Create order record
    INSERT INTO generic_orders (
        report_type_id, order_name, order_number, 
        start_time, status
    ) VALUES (
        report_type_id, current_order_name, order_counter,
        NOW(), 'running'
    )
    
    # Emit event
    socketio.emit("order_started", { 
        report_type: name, 
        order_name: current_order_name 
    })
```

**On Order STOP:**
```
def complete_order():
    is_running = false
    
    # Calculate order analytics
    analytics = calculate_order_analytics(current_order_name)
    
    # Update order record
    UPDATE generic_orders SET
        end_time = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_time)),
        status = 'completed',
        analytics_data = analytics
    WHERE order_name = current_order_name
    
    # Emit event
    socketio.emit("order_completed", { 
        report_type: name, 
        order_name: current_order_name,
        analytics: analytics
    })
    
    current_order_name = null
```

## Order Number Persistence

**On System Startup:**
```
def get_next_order_number_from_db():
    # Check both live and archive tables for max order number
    max_live = SELECT MAX(order_number) FROM generic_orders 
               WHERE report_type_id = ? AND order_name LIKE '{prefix}%'
    
    max_archive = SELECT MAX(...) FROM generic_monitor_logs_archive ...
    
    return MAX(max_live, max_archive) + 1
```

**Result:**
- Order numbers never reset, even after restart
- FTRA15 → FTRA16 → FTRA17... continues forever

## Special Cases

**Case: System Restart While Order Running**
```
On startup:
    running_orders = SELECT * FROM generic_orders WHERE status = 'running'
    
    for order in running_orders:
        current_plc_value = read_trigger_from_plc()
        
        if current_plc_value == stop_value:
            # Order ended while offline
            mark_order_completed(order, end_time=last_log_timestamp)
        elif current_plc_value == start_value:
            # Order still running
            resume_tracking(order)
        else:
            # Unknown state
            mark_order_aborted(order)
```

**Case: Rapid Trigger Changes (Bouncing)**
- Use debounce_ms from config
- Ignore changes within debounce window
- Prevents false start/stop detection

**Case: Trigger Value Neither Start Nor Stop**
- Don't change state
- Log warning
- Continue monitoring

---

# Feature 8: Dynamic Hourly Archive

## Overview
Archive Worker runs for each active report type, aggregating live logs into hourly summaries. Aggregation rules come from configuration.

## Archive Worker Loop

```
def archive_worker(report_type_id):
    config = load_config(report_type_id)
    
    while True:
        # Wait until next hour boundary
        wait_until_next_hour()
        
        # Archive the previous hour
        archive_hour = previous_hour()
        
        try:
            # 1. Query live logs for this hour
            logs = SELECT * FROM generic_monitor_logs
                   WHERE report_type_id = ?
                   AND created_at >= archive_hour
                   AND created_at < archive_hour + 1 hour
            
            if len(logs) == 0:
                continue  # Nothing to archive
            
            # 2. Apply aggregation per tag based on config
            aggregated = {}
            for tag in config.plc_tags:
                values = [log.tag_values[tag.tag_name] for log in logs]
                
                if tag.is_cumulative:
                    aggregated[tag.tag_name] = values[-1] - values[0]  # DELTA
                elif tag.tag_group == "flow_rates":
                    aggregated[tag.tag_name] = average(values)
                elif tag.tag_group == "weights":
                    aggregated[tag.tag_name] = sum(values)
                elif tag.tag_group in ["setpoints", "status"]:
                    aggregated[tag.tag_name] = values[-1]  # LAST
            
            # 3. Apply HOURLY_ARCHIVE calculations
            computed = calculation_engine.execute(
                config.calculations["HOURLY_ARCHIVE"],
                aggregated,
                all_records=logs
            )
            
            # 4. Build per_bin_weights from active_sources
            per_bin_weights = aggregate_bin_weights(logs)
            
            # 5. Insert archive record
            INSERT INTO generic_monitor_logs_archive (
                report_type_id, order_name, archive_hour,
                tag_values_aggregated, setpoints_snapshot,
                record_count, first_record_time, last_record_time,
                per_bin_weights
            ) VALUES (...)
            
            # 6. Delete archived live logs
            DELETE FROM generic_monitor_logs
            WHERE report_type_id = ?
            AND created_at >= archive_hour
            AND created_at < archive_hour + 1 hour
            
        except Exception as e:
            log_error(e)
            # Don't delete live logs if archive failed
```

## Aggregation Rules from Configuration

| tag.is_cumulative | tag.tag_group | Aggregation Method |
|-------------------|---------------|-------------------|
| true | any | DELTA (last - first) |
| false | flow_rates | AVERAGE |
| false | weights | SUM |
| false | setpoints | LAST |
| false | status | LAST |
| false | (other) | LAST |

## Flow Rate to Weight Conversion

**During Archive:**
```
# Calculate dynamic divisor based on actual record count
time_span_hours = (last_record.created_at - first_record.created_at).hours
records_per_hour = len(logs) / time_span_hours

# Convert t/h to kg
for each flow_rate_value:
    kg_per_record = flow_rate_tph * 1000 / records_per_hour
    total_kg += kg_per_record
```

## Special Cases

**Case: Multiple Orders in Same Hour**
- Create separate archive record for each order
- Group logs by order_name before aggregating

**Case: No Data for Hour**
- Don't create archive record
- Log info message

**Case: Archive Fails**
- Don't delete live logs
- Retry on next cycle
- Alert admin

---

# Feature 9: Dynamic Live Monitor UI

## Overview
Live Monitor page renders entirely from layout configuration. Any section type, any position, any data binding.

## How Live Monitor Renders

**Step 1: Load Layout from Config**
```javascript
const layout = await api.getLayout(reportTypeId, "live_monitor");
// Returns layout_config JSONB from monitor_layouts table
```

**Step 2: Connect to WebSocket**
```javascript
socket.on(`${reportTypeName.toLowerCase()}_data`, (data) => {
    setLiveData(data);
});
```

**Step 3: Render Sections Dynamically**
```javascript
<div className="grid grid-cols-12 gap-4">
    {layout.sections.map(section => (
        <div 
            key={section.id}
            style={{
                gridColumn: `${section.position.col} / span ${section.position.width}`,
                gridRow: section.position.row
            }}
        >
            <SectionRenderer section={section} data={liveData} />
        </div>
    ))}
</div>
```

**Step 4: SectionRenderer Switches on Type**
```javascript
function SectionRenderer({ section, data }) {
    switch (section.type) {
        case "table":
            return <DynamicTable config={section.config} data={data} />;
        case "gauge":
            return <DynamicGauge config={section.config} data={data} />;
        case "line_chart":
            return <DynamicChart config={section.config} data={data} />;
        case "status_grid":
            return <DynamicStatusGrid config={section.config} data={data} />;
        case "summary_cards":
            return <DynamicSummaryCards config={section.config} data={data} />;
        default:
            return <div>Unknown section type: {section.type}</div>;
    }
}
```

## Section Types and Data Binding

**Table Section:**
```json
{
    "type": "table",
    "config": {
        "data_source": "active_sources",
        "columns": [
            { "field": "bin_id", "header": "Bin" },
            { "field": "material_name", "header": "Material" },
            { "field": "weight", "header": "Flow", "unit": "t/h", "decimals": 3 }
        ]
    }
}
```

**Gauge Section:**
```json
{
    "type": "gauge",
    "config": {
        "tag_name": "FlowRate_2_521WE",
        "min": 0,
        "max": 25,
        "unit": "t/h"
    }
}
```

**Status Grid Section:**
```json
{
    "type": "status_grid",
    "config": {
        "indicators": [
            { "tag_name": "OrderActive", "label": "Running", "on_color": "green" },
            { "tag_name": "AlarmActive", "label": "Alarm", "on_color": "red" }
        ]
    }
}
```

## Special Cases

**Case: Data Source Not in Payload**
- Show empty state / placeholder
- Don't crash

**Case: Tag Value is Null**
- Show "N/A" or "--"
- Handle gracefully

**Case: Layout Not Configured**
- Show default layout (basic data dump)
- Or show "Layout not configured" message

---

# Feature 10: Dynamic Report Generation

## Overview
Reports are generated based on configuration. Any date range, any calculations, any layout.

## How Reports Generate

**Step 1: User Selects Parameters**
```
report_type_id: 1 (FTRA)
start_date: 2025-01-01
end_date: 2025-01-31
order_name: null (all orders)
```

**Step 2: Backend Queries Archive**
```sql
SELECT * FROM generic_monitor_logs_archive
WHERE report_type_id = 1
AND archive_hour >= '2025-01-01'
AND archive_hour < '2025-02-01'
ORDER BY archive_hour
```

**Step 3: Apply REPORT_SUMMARY Calculations**
```python
calculations = config.calculations["REPORT_SUMMARY"]

for calc in calculations:
    if calc.method == "SUM":
        result = sum(record[calc.input_tag] for record in records)
    elif calc.method == "AVERAGE":
        result = avg(record[calc.input_tag] for record in records)
    elif calc.method == "DELTA":
        result = records[-1][calc.input_tag] - records[0][calc.input_tag]
    
    summary[calc.output_field_name] = result
```

**Step 4: Aggregate Per-Bin Weights**
```python
bin_totals = {}
for record in records:
    for bin_weight in record.per_bin_weights:
        bin_id = bin_weight["bin_id"]
        bin_totals[bin_id] = bin_totals.get(bin_id, 0) + bin_weight["total_weight"]

# Enrich with material names
for bin_id, total in bin_totals.items():
    material_name = get_material_name(bin_id, report_type_id)
    bin_summary[bin_id] = {
        "bin_id": bin_id,
        "material_name": material_name,
        "total_weight": total
    }
```

**Step 5: Return Report Data**
```json
{
    "report_type": "FTRA",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31",
    "summary": {
        "total_produced_kg": 152345.67,
        "avg_flow_rate": 12.34,
        "efficiency_percent": 98.29
    },
    "per_bin_totals": [
        { "bin_id": 101, "material_name": "Wheat A", "total_kg": 85234.12 },
        { "bin_id": 102, "material_name": "Barley B", "total_kg": 67111.55 }
    ],
    "hourly_breakdown": [...],
    "daily_breakdown": [...]
}
```

**Step 6: Frontend Renders Based on Layout**
- Loads report_view layout from config
- Renders summary cards, tables, charts as configured

---

# Feature 11: Dynamic Order Analytics

## Overview
When order completes, system automatically calculates all configured ORDER_ANALYTICS calculations.

## Order Analytics Calculation

**Triggered When:** Order status changes to "completed"

**Data Source:** All logs for this order
```sql
SELECT * FROM generic_monitor_logs
WHERE report_type_id = ?
AND order_name = 'FTRA15'
ORDER BY created_at
```

**Calculations Applied:**
```python
analytics = {}

# Standard calculations (always)
analytics["duration_seconds"] = (end_time - start_time).total_seconds()
analytics["record_count"] = len(logs)

# Configured calculations
for calc in config.calculations["ORDER_ANALYTICS"]:
    if calc.method == "SUM":
        analytics[calc.output_field] = sum(log[calc.input] for log in logs)
    elif calc.method == "AVERAGE":
        analytics[calc.output_field] = avg(...)
    elif calc.method == "DELTA":
        analytics[calc.output_field] = logs[-1][calc.input] - logs[0][calc.input]
    elif calc.method == "CUSTOM":
        analytics[calc.output_field] = evaluate_formula(calc.formula, context)
```

**Stored In:**
```sql
UPDATE generic_orders SET
    analytics_data = '{"duration_seconds": 7620, "total_produced_kg": 15234.5, ...}',
    sources_info = '[{"bin_id": 101, "material_name": "Wheat A", "total_kg": 8234}]',
    destination_info = '{"bin_id": 203, "material_name": "Mixed Output"}'
WHERE order_name = 'FTRA15'
```

## Order Analytics UI

**Order List Page:**
- Shows all orders with key KPIs in columns
- KPIs come from analytics_data JSONB

**Order Detail Page:**
- Shows full analytics breakdown
- Uses order_detail layout from config

---

# Feature 12: Adding a New Report Type

## Overview
When Salalah gets a new Mill (e.g., MILB), they can configure it completely through the Admin UI without any code changes.

## Step 1: Create Report Type in Admin Panel

**UI Location:** Admin → Report Types → "Add New"

**User Fills In:**

| Field | Example Value | What It Means |
|-------|---------------|---------------|
| Name | MILB | System identifier (no spaces, uppercase) |
| Display Name | Mill B Production | Shown in menus and headers |
| Description | Second milling line | Optional notes |
| DB Number | 2100 | PLC Data Block number |
| Polling Interval | 1000 | How often to read PLC (milliseconds) |
| Archive Interval | 60 | How often to create archive (minutes) |
| Color Theme | #10B981 | UI accent color |

**User Configures Order Trigger:**

| Field | Example Value | What It Means |
|-------|---------------|---------------|
| Trigger Type | Bit | Watch a single bit for 0→1 or 1→0 |
| Offset | 100 | Byte position in PLC DB |
| Bit Position | 0 | Which bit (0-7) to watch |
| Start Value | 1 | Value that means "order started" |
| Stop Value | 0 | Value that means "order finished" |
| Order Prefix | MILB | Prefix for order names (MILB1, MILB2...) |

**System Does:**
- Creates report_types record
- Creates empty plc_tags, calculations, layouts for this type
- Logs action to audit_logs
- Report type starts as INACTIVE (won't poll until activated)

**Special Cases:**
- Name must be unique (show error if duplicate)
- DB Number can be shared with other report types
- If user enters invalid JSON, show field-level error

## Step 2: Configure PLC Tags

**UI Location:** Admin → Report Types → MILB → "PLC Tags"

**User Adds Each Tag:**

| Tag Name | Display Name | Type | DB | Offset | Bit | Unit | Group |
|----------|--------------|------|-----|--------|-----|------|-------|
| OrderActive | Order Status | BOOL | 2100 | 100 | 0 | - | status |
| FlowRate_Main | Main Flow Rate | REAL | 2100 | 0 | - | t/h | flow_rates |
| ReceiverBinId | Receiver Bin | INT | 2100 | 104 | - | - | destination |
| Sender1BinId | Sender 1 Bin | INT | 2100 | 106 | - | - | sources |
| Sender1Weight | Sender 1 Weight | REAL | 2100 | 108 | - | t/h | sources |
| MoistureSetpoint | Moisture Target | REAL | 2100 | 112 | - | % | setpoints |

**User Sets Flags for Each Tag:**

| Flag | When to Check | Effect |
|------|---------------|--------|
| Is Cumulative | Tag is a running total counter | Use DELTA in reports |
| Is Order KPI | Include in order summary | Appears in order analytics |
| Is Live Display | Show in live monitor | Included in WebSocket data |
| Is Archived | Store in hourly archive | Stored for reports |

**User Can Test Each Tag:**
- Click "Test" button next to any tag
- System reads current value from PLC
- Shows: "Current Value: 12.456" or "Error: PLC offline"

**Bulk Import Option:**
- Export tags from another report type as CSV/JSON
- Modify offsets for new PLC
- Import into MILB

**Special Cases:**
- If REAL type, byte_swap defaults to true (Siemens endianness)
- If BOOL type, bit field is required (0-7)
- If STRING type, length field is required
- Duplicate tag names within report type not allowed

## Step 3: Configure Bin Mappings

**UI Location:** Admin → Bin Master

**User Adds Bin Mappings:**

| Bin ID | Material Name | Material Code | Report Type |
|--------|---------------|---------------|-------------|
| 301 | Wheat Grade A | WGA-301 | MILB |
| 302 | Barley Premium | BAR-302 | MILB |
| 303 | Mixed Output | MIX-303 | MILB |

**What Happens:**
- When PLC sends bin_id=301, UI shows "Wheat Grade A"
- Material name appears in Live Monitor, Reports, Order Analytics
- If no mapping exists, shows "Unknown Bin 301"

**Special Cases:**
- Bin ID can be reused across report types (different meanings)
- Global bins (report_type = null) apply to all report types
- Report-specific bins override global bins

## Step 4: Create Calculations

**UI Location:** Admin → Report Types → MILB → "Calculations"

**Live Monitor Calculations:**

| Output Field | Formula | Method | Context |
|--------------|---------|--------|---------|
| total_sender_weight | Sender1Weight + Sender2Weight | DIRECT | LIVE_MONITOR |
| line_status | IF(OrderActive, "Running", "Stopped") | DIRECT | LIVE_MONITOR |

**Archive Calculations:**

| Output Field | Formula | Method | Context |
|--------------|---------|--------|---------|
| produced_weight_kg | SUM(Sender1Weight) × 1000 / divisor | SUM | HOURLY_ARCHIVE |
| avg_flow_rate | AVG(FlowRate_Main) | AVERAGE | HOURLY_ARCHIVE |

**Order Analytics Calculations:**

| Output Field | Formula | Method | Context |
|--------------|---------|--------|---------|
| total_produced | SUM(produced_weight_kg) | SUM | ORDER_ANALYTICS |
| efficiency | (total_produced / total_consumed) × 100 | CUSTOM | ORDER_ANALYTICS |
| run_time_hours | duration_seconds / 3600 | DIRECT | ORDER_ANALYTICS |

**User Tests Each Formula:**
- Enter sample values: Sender1Weight=10, Sender2Weight=5
- Click "Test"
- Shows: "Result: 15.0"

**Special Cases:**
- Division by zero: Formula returns 0 or null
- Missing input: Formula returns null
- Invalid syntax: Show error, don't save

## Step 5: Design UI Layout

**UI Location:** Admin → Report Types → MILB → "Layouts"

**User Creates Live Monitor Layout:**

**Section 1: Source Table**
- Type: Table
- Position: Row 1, Column 1-6
- Data Source: active_sources
- Columns: bin_id, material_name, weight (t/h)

**Section 2: Flow Rate Gauge**
- Type: Gauge
- Position: Row 1, Column 7-9
- Tag: FlowRate_Main
- Min: 0, Max: 25
- Thresholds: Red <5, Yellow 5-15, Green >15

**Section 3: Status Indicators**
- Type: Status Grid
- Position: Row 1, Column 10-12
- Indicators: OrderActive (green/gray), Alarm (red/gray)

**Section 4: Flow Chart**
- Type: Line Chart
- Position: Row 2, Column 1-12
- Series: FlowRate_Main (last 60 minutes)

**Special Cases:**
- Sections can overlap (show warning)
- Mobile layout auto-stacks sections
- Empty layout shows "No sections configured"

## Step 6: Activate Report Type

**UI Location:** Admin → Report Types → MILB → "Activate"

**What Happens When Activated:**
1. System validates all configuration:
   - At least one PLC tag defined
   - Order trigger configured
   - At least one layout defined
2. If valid, sets is_active = true
3. Monitor Worker starts for this report type
4. Appears in navigation menu
5. Live Monitor page available

**Special Cases:**
- Cannot activate without order trigger
- Can activate without calculations (just stores raw data)
- Can activate without layout (uses default layout)

## What User Does NOT Need to Do

- ❌ Write any code
- ❌ Modify database directly
- ❌ Restart the server
- ❌ Deploy anything
- ❌ Contact developers

## Testing Checklist for New Report Type

- [ ] Report Type appears in Admin list
- [ ] All PLC tags show current values when tested
- [ ] Bin IDs display as material names
- [ ] Live Monitor shows real-time data
- [ ] Order starts when PLC trigger changes
- [ ] Order name increments correctly (MILB1, MILB2)
- [ ] Archive creates hourly records
- [ ] Reports show correct summary data
- [ ] Order Analytics shows KPIs
- [ ] All data persists after system restart

---

# Feature 13: Modifying PLC Offsets

## Overview
When PLC programmer changes an offset (e.g., FlowRate moves from offset 0 to offset 20), plant engineers can update the system themselves.

## What the User Needs to Do

**UI Location:** Admin → Report Types → [Select Type] → PLC Tags

**Steps:**
1. Find the tag that needs updating (e.g., "FlowRate_Main")
2. Click "Edit"
3. Change Offset from 0 to 20
4. Click "Test" to verify new value is correct
5. Click "Save"

**System Does:**
- Updates plc_tags record
- Logs change to audit_logs (old: offset=0, new: offset=20)
- Invalidates config cache
- Next poll reads from new offset

**Time to Apply:** < 1 second (no restart needed)

## Special Cases

**Case 1: Multiple Tags Need Updating**
- User can bulk edit via CSV export/import
- Or update one-by-one
- Changes apply immediately

**Case 2: Offset Now Overlaps Another Tag**
- System allows this (user's responsibility)
- Show warning: "Offset 20-24 overlaps with OtherTag (18-22)"

**Case 3: Data Type Changed (INT → REAL)**
- User changes Type dropdown
- System validates:
  - REAL: Check byte_swap setting
  - BOOL: Require bit position
  - STRING: Require length

**Case 4: Tag No Longer Exists in PLC**
- User deletes tag from Admin
- Historical data with this tag preserved
- Tag removed from live monitor

## Testing Checklist

- [ ] Tag edit form loads current values
- [ ] Offset change saves correctly
- [ ] Test button reads from new offset
- [ ] Live monitor shows data from new offset
- [ ] Audit log shows the change
- [ ] No restart required

---

# Feature 14: Adding a New Calculation

## Overview
When plant wants a new KPI (e.g., "Efficiency Percentage"), they can add it themselves.

## What the User Needs to Do

**UI Location:** Admin → Report Types → [Select Type] → Calculations → "Add New"

**User Fills In:**

| Field | Example Value |
|-------|---------------|
| Output Field Name | efficiency_percent |
| Display Name | Efficiency (%) |
| Formula | (produced_weight / consumed_weight) × 100 |
| Calculation Method | CUSTOM |
| Context | ORDER_ANALYTICS |
| Unit | % |
| Decimal Places | 2 |

**User Tests Formula:**
1. Click "Test"
2. Enter: produced_weight = 1000, consumed_weight = 1050
3. See Result: 95.24
4. If correct, click "Save"

## Context Options Explained

| Context | When Calculated | Where Shown |
|---------|-----------------|-------------|
| LIVE_MONITOR | Every poll (1 second) | Live Monitor page |
| HOURLY_ARCHIVE | When creating archive | Archive records |
| ORDER_ANALYTICS | When order completes | Order detail, analytics |
| REPORT_SUMMARY | When generating report | Report summary cards |

## Formula Functions Available

| Function | Usage | Example |
|----------|-------|---------|
| SUM(field) | Sum across records | SUM(produced_weight) |
| AVG(field) | Average | AVG(flow_rate) |
| DELTA(field) | Last - First | DELTA(cumulative_counter) |
| MIN(field) | Minimum | MIN(temperature) |
| MAX(field) | Maximum | MAX(pressure) |
| COUNT() | Record count | COUNT() |
| IF(cond, true, false) | Conditional | IF(running, value, 0) |
| ROUND(value, n) | Round | ROUND(efficiency, 2) |
| ABS(value) | Absolute | ABS(difference) |

## Special Cases

**Case 1: Formula References Non-Existent Tag**
- Show error: "Tag 'unknown_tag' not found"
- Don't save until fixed

**Case 2: Division by Zero**
- Formula returns 0 or null
- Show in UI as "N/A" or "0"
- Log warning, don't crash

**Case 3: Circular Reference**
- Calc A uses Calc B, Calc B uses Calc A
- Detect and show error
- Don't save

**Case 4: Complex Nested Formula**
```
IF(consumed_weight > 0, 
   ROUND((produced_weight / consumed_weight) × 100, 2), 
   0)
```
- System parses correctly
- Test with edge cases

## Testing Checklist

- [ ] Formula editor validates syntax
- [ ] Auto-complete shows available tags
- [ ] Test button calculates correctly
- [ ] Division by zero handled
- [ ] Calculation appears in correct context
- [ ] Value shows with correct decimals and unit
- [ ] Audit log records the addition

---

# Feature 15: Handling Different Source/Destination Structures

## Overview
Different production lines have different source/destination structures. The system must handle all variations.

## Structure Type 1: Simple (FTRA)

**PLC Data:**
- ReceiverBinId: INT at offset 136
- Sender1BinId: INT at offset 138
- Sender2BinId: INT at offset 140

**Configuration:**
- Add 3 PLC tags with source_type = "sender" or "receiver"
- System automatically groups into active_sources array

## Structure Type 2: Complex (FCL/SCL)

**PLC Data:**
- ActiveDestination struct at offset 528 (8 bytes)
  - dest_no: INT
  - bin_id: INT
  - prd_code: DINT
- ActiveSources array at offset 536 (5 × 16 bytes each)
  - bin_id: INT
  - prd_code: DINT
  - weight: REAL
  - status: BOOL

**Configuration:**
1. Add destination tags with source_type = "receiver"
2. Add source tags as array:
   - Sender1BinId, Sender1PrdCode, Sender1Weight (offsets 536, 538, 542)
   - Sender2BinId, Sender2PrdCode, Sender2Weight (offsets 552, 554, 558)
   - ...

## Structure Type 3: Multiple Receivers (FCL)

**PLC Data:**
- Receiver 1: Flow rate at offset X
- Receiver 2: Cumulative counter at offset Y (FCL_2_520WE)

**Configuration:**
1. Add both receiver tags
2. Mark cumulative counter with is_cumulative = true
3. DON'T add cumulative counter to flow total

## Special Cases

**Case: Source Becomes Inactive (bin_id = 0)**
- System filters out sources where bin_id = 0
- UI shows only active sources

**Case: Material Name Not Found**
- Check bin_master for bin_id
- If not found, show "Unknown Bin {id}"
- Log warning for admin to add mapping

**Case: Cumulative Counter Rollover**
- Counter wraps from max value to 0
- DELTA calculation detects: if new < old, assume rollover
- Calculate: new + (max_value - old)

---

# Feature 16: Flow Rate to Weight Conversion

## Overview
PLC sends flow rates in t/h (tons per hour). Reports need weights in kg. The conversion must be configurable.

## How Conversion Works

**Formula:**
```
kg_per_record = flow_rate_tph × 1000 / records_per_hour
```

**Example:**
- Flow rate: 12.5 t/h
- Polling interval: 1 second (3600 records/hour)
- kg_per_record = 12.5 × 1000 / 3600 = 3.47 kg

## Where User Configures This

**Option 1: Use Default (Automatic)**
- System calculates records_per_hour from actual data
- time_span = last_record_time - first_record_time
- records_per_hour = record_count / time_span_hours

**Option 2: Create Conversion Calculation**
```
Output Field: weight_kg
Formula: flow_rate_tph × 1000 / 3600
Context: HOURLY_ARCHIVE
```

## When Conversion Applies

| Data Type | Live Monitor | Archive | Reports |
|-----------|--------------|---------|---------|
| Flow rate | Show t/h (raw) | Convert to kg | Sum kg |
| Weight | Show kg | Store kg | Sum kg |
| Cumulative | Show kg (current) | DELTA | Sum deltas |

## Special Cases

**Case: Variable Polling Rate**
- Some records 1 second apart, some 3 seconds
- Use actual time span, not assumed rate
- Formula: (flow × 1000 × actual_seconds) / 3600

**Case: Gaps in Data**
- PLC offline for 10 minutes
- Don't interpolate missing data
- Archive shows actual recorded data only

---

# Feature 17: Order Analytics on Completion

## Overview
When an order completes, system calculates KPIs and stores them with the order.

## What Gets Calculated

**Standard KPIs (Always Calculated):**

| KPI | Formula | Source |
|-----|---------|--------|
| duration_seconds | end_time - start_time | Order record |
| record_count | COUNT(*) from logs | Monitor logs |
| total_produced_kg | SUM(produced_weight) | Archive records |

**Custom KPIs (User Defined):**
- Any calculation with context = ORDER_ANALYTICS
- Uses all data from order's time range

## Where Results Are Stored

**generic_orders.analytics_data (JSONB):**
```json
{
  "duration_seconds": 7620,
  "record_count": 7620,
  "total_produced_kg": 15234.56,
  "avg_flow_rate": 12.45,
  "efficiency_percent": 98.2,
  "sources_used": [
    {"bin_id": 27, "material_name": "Wheat A", "total_kg": 8234.12},
    {"bin_id": 29, "material_name": "Barley B", "total_kg": 7000.44}
  ]
}
```

## Special Cases

**Case: Order Aborted (System Restart)**
- Calculate partial analytics with flag
- analytics_data.incomplete = true
- Show warning in UI

**Case: Very Short Order (<1 minute)**
- Still calculate, may have limited data
- Show "Limited Data" indicator

**Case: Order Spans Multiple Hours**
- Query across archive records
- Sum archived data + live data (if any)

---

# Feature 18: Handling Legacy Data Formats

## Overview
Historical data may be in different formats. System must handle all.

## per_bin_weights Formats

**New Format (Array):**
```json
[
  {"bin_id": 27, "total_weight": 771.222},
  {"bin_id": 29, "total_weight": 5183.214}
]
```

**Old Format (Dict):**
```json
{
  "27": 771.222,
  "29": 5183.214
}
```

**System Handling:**
```
if per_bin_weights is array:
    loop and extract bin_id, total_weight
else if per_bin_weights is dict:
    loop keys as bin_id, values as total_weight
```

## active_sources Formats

**Format 1: With Material Info**
```json
{
  "bin_id": 27,
  "material_name": "Wheat A",
  "weight": 12.456
}
```

**Format 2: Without Material Info**
```json
{
  "bin_id": 27,
  "weight": 12.456
}
```

**System Handling:**
- If material_name missing, lookup from bin_master
- If still not found, show "Unknown Bin 27"

---

# Feature 19: Multi-Report-Type Dashboard

## Overview
User should see all production lines in one view.

## Dashboard Features

**Summary Cards:**
- One card per active report type
- Shows: Line status, current order, flow rate, today's production

**Click to Navigate:**
- Click card → Go to that line's Live Monitor

## Configuration

**Admin → Dashboard Settings:**

| Setting | Options |
|---------|---------|
| Visible Report Types | Checkboxes for each |
| Card Order | Drag to reorder |
| Refresh Interval | 1/5/10/30 seconds |

---

# Feature 20: Configuration Export/Import

## Overview
Export configuration from one site to another (e.g., deploy to new plant).

## Export

**UI Location:** Admin → Backups → "Export Configuration"

**Options:**
- Full Export: All report types, tags, calculations, layouts, bins
- Single Report Type: Just one type and its dependencies

**Output:** JSON file download

## Import

**UI Location:** Admin → Backups → "Import Configuration"

**Steps:**
1. Upload JSON file
2. System validates structure
3. Preview shows what will be created/updated
4. User confirms
5. System imports with new IDs

**Conflict Handling:**
- If name exists: Ask to skip, rename, or replace
- If bin_id exists: Ask to skip or replace

---

# Feature 21: Real-Time Alerts

## Overview
Notify users when values exceed thresholds.

## Alert Configuration

**UI Location:** Admin → Report Types → [Type] → "Alerts"

**User Creates Alert:**

| Field | Example |
|-------|---------|
| Name | High Temperature |
| Tag | Temperature_Main |
| Condition | > |
| Threshold | 85 |
| Unit | °C |
| Severity | Warning |
| Notify | Email, On-Screen |

## Alert Actions

| Severity | On-Screen | Email | Log |
|----------|-----------|-------|-----|
| Info | Banner (blue) | No | Yes |
| Warning | Banner (yellow) | Optional | Yes |
| Critical | Modal (red) | Yes | Yes |

## Special Cases

**Case: Value Oscillates Around Threshold**
- Add hysteresis (e.g., alert at 85, clear at 80)
- Prevents alert spam

**Case: PLC Offline**
- Don't trigger "value too low" alerts
- Show "PLC Offline" alert instead

---

# Feature 22: Admin Panel UI

## Overview
Complete admin interface for managing all system configurations without code changes.

---

## 22.1 Report Type Manager

**URL:** `/admin/report-types`

### Features
- List all report types with status (Active/Inactive)
- Create new report type
- Edit existing report type
- Activate/deactivate report type
- Delete with confirmation
- Duplicate report type (copy all config)

### Report Type Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Name | Text | Yes | Unique system name (FCL, SCL, MILB) |
| Display Name | Text | Yes | User-friendly name |
| Description | Textarea | No | Description |
| DB Number | Number | Yes | PLC DB number |
| Polling Interval (ms) | Number | Yes | PLC read frequency (default: 1000) |
| Archive Interval (mins) | Number | Yes | Archive frequency (default: 60) |
| Color Theme | Color Picker | No | UI accent color |
| Icon | Icon Picker | No | UI icon |

### Order Trigger Configuration (Sub-form)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Trigger Type | Dropdown | Yes | "Bit" or "Value Change" |
| Tag Name | Dropdown | Yes | Select from configured tags |
| Offset | Number | Yes | Byte position in PLC DB |
| Bit Position | Number | For Bit | Which bit (0-7) |
| Start Value | Number | Yes | Value that means "started" |
| Stop Value | Number | Yes | Value that means "stopped" |
| Order Prefix | Text | Yes | Prefix for order names |
| Debounce (ms) | Number | No | Ignore rapid changes (default: 500) |

### UI Actions

| Button | Action | Confirmation |
|--------|--------|--------------|
| Save | Create/Update report type | No |
| Activate | Set is_active = true, start worker | Yes |
| Deactivate | Set is_active = false, stop worker | Yes |
| Delete | Remove report type and all related data | Yes (type name to confirm) |
| Duplicate | Copy to new report type with new name | No |

---

## 22.2 PLC Tag Manager

**URL:** `/admin/report-types/:id/tags`

### Features
- List all tags for report type (sortable table)
- Add new tag
- Edit tag properties
- Delete tag
- Drag & drop reorder (display_order)
- Test tag reading (verify PLC connection)
- Bulk import from JSON/CSV
- Export tags to JSON

### Tag List Table Columns

| Column | Sortable | Description |
|--------|----------|-------------|
| Order | Drag | Display order |
| Tag Name | Yes | Internal name |
| Display Name | Yes | User-friendly name |
| Type | Yes | BOOL, INT, DINT, REAL, STRING |
| DB | Yes | PLC DB number |
| Offset | Yes | Byte offset |
| Bit | Yes | Bit position (BOOL only) |
| Unit | No | Unit of measurement |
| Group | Yes | Tag group (sources, setpoints, etc.) |
| Flags | No | Icons for is_cumulative, is_order_kpi, etc. |
| Actions | No | Edit, Test, Delete buttons |

### Tag Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Tag Name | Text | Yes | Internal name (FlowRate_Main) |
| Display Name | Text | No | User-friendly name |
| Tag Group | Dropdown | No | flow_rates, sources, setpoints, status, destination |
| DB Number | Number | Yes | PLC DB number |
| Offset | Number | Yes | Byte offset |
| Data Type | Dropdown | Yes | BOOL, INT, DINT, REAL, STRING |
| Bit Position | Number | BOOL only | Bit 0-7 |
| String Length | Number | STRING only | Max characters |
| Byte Swap | Checkbox | REAL only | Swap bytes for endianness (default: true) |
| Unit | Text | No | t/h, kg, %, °C |
| Decimal Places | Number | Yes | Display precision (default: 2) |
| Min Value | Number | No | Validation minimum |
| Max Value | Number | No | Validation maximum |
| Source Type | Dropdown | No | "sender", "receiver", or none |

### Tag Flags (Checkboxes)

| Flag | Description | Effect |
|------|-------------|--------|
| Is Cumulative | Running total counter | Use DELTA in reports |
| Is Order KPI | Include in order summary | Appears in order analytics |
| Is Live Display | Show in live monitor | Included in WebSocket data |
| Is Archived | Store in hourly archive | Stored for reports |

### Test Tag Feature

**Button:** "Test" next to each tag

**What It Does:**
1. Reads current value from PLC
2. Shows result popup:
   - Success: "Current Value: 12.456 t/h"
   - Error: "PLC offline" or "Invalid offset"

### Bulk Import

**Button:** "Import Tags"

**Accepts:**
- JSON file (array of tag objects)
- CSV file (with headers)

**Process:**
1. Upload file
2. Preview table shows tags to import
3. Validation errors highlighted
4. User confirms import
5. Tags created (skip duplicates or replace)

### Export Tags

**Button:** "Export Tags"

**Output:** JSON file with all tags for this report type

---

## 22.3 Calculation Builder

**URL:** `/admin/report-types/:id/calculations`

### Features
- List calculations grouped by context
- Add new calculation
- Formula editor with syntax highlighting
- Auto-complete for tag names
- Test formula with sample data
- Preview calculation result
- Validation before save

### Calculation List (Grouped by Context)

```
LIVE_MONITOR
├── total_sender_weight (Sender1Weight + Sender2Weight)
├── line_status (IF(OrderActive, "Running", "Stopped"))

HOURLY_ARCHIVE
├── produced_weight_kg (SUM formula)
├── avg_flow_rate (AVG formula)

ORDER_ANALYTICS
├── total_produced (SUM formula)
├── efficiency (Custom formula)

REPORT_SUMMARY
├── period_total (SUM formula)
```

### Calculation Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Output Field Name | Text | Yes | Result field name (efficiency_percent) |
| Display Name | Text | No | User-friendly name |
| Context | Dropdown | Yes | LIVE_MONITOR, HOURLY_ARCHIVE, ORDER_ANALYTICS, REPORT_SUMMARY |
| Calculation Method | Dropdown | Yes | DIRECT, SUM, DELTA, AVERAGE, CUSTOM |
| Formula | Code Editor | Yes | Calculation formula |
| Unit | Text | No | Result unit (%, kg, t/h) |
| Decimal Places | Number | Yes | Result precision (default: 2) |
| Display Order | Number | Yes | Order in results |
| Is Active | Checkbox | Yes | Enable/disable |

### Formula Editor Features

**Syntax Highlighting:**
- Tag names: Blue
- Functions: Purple
- Operators: Red
- Numbers: Green
- Strings: Orange

**Auto-Complete:**
- Type tag name → dropdown shows matching tags
- Type function name → dropdown shows available functions
- Tab to accept suggestion

**Available Functions (shown in sidebar):**
```
SUM(field)     - Sum across records
AVG(field)     - Average
DELTA(field)   - Last - First
MIN(field)     - Minimum
MAX(field)     - Maximum
COUNT()        - Record count
IF(cond, t, f) - Conditional
ROUND(val, n)  - Round to decimals
ABS(val)       - Absolute value
```

### Test Formula Feature

**Button:** "Test Formula"

**Test Dialog:**
1. Shows input fields for each tag in formula
2. User enters sample values:
   - produced_weight: 1000
   - consumed_weight: 1050
3. Click "Calculate"
4. Shows result: "95.24 %"

### Validation Rules

| Rule | Error Message |
|------|---------------|
| Empty formula | "Formula is required" |
| Unknown tag | "Tag 'unknown_tag' not found" |
| Syntax error | "Syntax error at position X" |
| Circular reference | "Circular reference detected: A → B → A" |
| Division by zero possible | "Warning: Division by zero possible" |

---

## 22.4 Layout Editor

**URL:** `/admin/report-types/:id/layouts`

### Features
- Visual layout designer (drag & drop)
- Grid-based positioning (12 columns)
- Multiple layout types (live_monitor, report_view, order_detail)
- Configure section properties
- Live preview with sample data
- Save as default layout

### Layout Types

| Type | Description | Used In |
|------|-------------|---------|
| live_monitor | Real-time monitoring page | Live Monitor page |
| report_view | Historical report layout | Report page |
| order_detail | Single order view | Order detail page |

### Layout Canvas

**Grid System:**
- 12 columns
- Unlimited rows
- Sections snap to grid
- Drag to resize
- Drag to reposition

**Toolbar:**
- Add Section dropdown
- Undo / Redo
- Preview button
- Save button
- Reset to default

### Section Types

| Type | Icon | Description |
|------|------|-------------|
| Table | 📊 | Data table with columns |
| Gauge | 🎯 | Circular gauge meter |
| Line Chart | 📈 | Time series chart |
| Bar Chart | 📊 | Bar chart |
| Status Grid | 🚦 | Boolean status indicators |
| Summary Cards | 🃏 | KPI cards |
| Text | 📝 | Static text/label |

### Section Configuration (Right Panel)

**When section selected, show config panel:**

**Common Fields (All Sections):**

| Field | Type | Description |
|-------|------|-------------|
| Section ID | Text | Unique identifier |
| Title | Text | Section header |
| Row | Number | Grid row (auto from drag) |
| Column | Number | Grid column start |
| Width | Number | Column span (1-12) |

**Table Section Config:**

| Field | Type | Description |
|-------|------|-------------|
| Data Source | Dropdown | active_sources, computed_values, etc. |
| Columns | Array | Column definitions |
| Pagination | Checkbox | Enable pagination |
| Page Size | Number | Rows per page |
| Sortable | Checkbox | Allow column sorting |

**Column Definition:**

| Field | Type | Description |
|-------|------|-------------|
| Field | Text/Dropdown | Data field name |
| Header | Text | Column header |
| Width | Number | Column width (px) |
| Unit | Text | Unit suffix |
| Decimals | Number | Decimal places |
| Align | Dropdown | left, center, right |

**Gauge Section Config:**

| Field | Type | Description |
|-------|------|-------------|
| Tag Name | Dropdown | Tag to display |
| Min | Number | Minimum value |
| Max | Number | Maximum value |
| Unit | Text | Display unit |
| Thresholds | Array | Color thresholds |

**Threshold Definition:**

| Field | Type | Description |
|-------|------|-------------|
| Value | Number | Threshold value |
| Color | Color Picker | Color when below this value |
| Label | Text | Optional label |

**Line Chart Section Config:**

| Field | Type | Description |
|-------|------|-------------|
| Series | Array | Data series to plot |
| Time Range | Number | Minutes of history |
| Y-Axis Label | Text | Y-axis label |
| Y-Min | Number | Y-axis minimum (auto if blank) |
| Y-Max | Number | Y-axis maximum (auto if blank) |

**Series Definition:**

| Field | Type | Description |
|-------|------|-------------|
| Tag Name | Dropdown | Tag to plot |
| Label | Text | Series label |
| Color | Color Picker | Line color |

**Status Grid Section Config:**

| Field | Type | Description |
|-------|------|-------------|
| Indicators | Array | Status indicators |

**Indicator Definition:**

| Field | Type | Description |
|-------|------|-------------|
| Tag Name | Dropdown | Boolean tag |
| Label | Text | Indicator label |
| On Color | Color Picker | Color when true |
| Off Color | Color Picker | Color when false |

**Summary Cards Section Config:**

| Field | Type | Description |
|-------|------|-------------|
| Cards | Array | KPI cards |

**Card Definition:**

| Field | Type | Description |
|-------|------|-------------|
| Field | Dropdown | Data field |
| Label | Text | Card label |
| Unit | Text | Unit suffix |
| Icon | Icon Picker | Card icon |
| Format | Dropdown | number, percent, duration |

### Preview Mode

**Button:** "Preview"

**What It Does:**
1. Shows layout with sample data
2. Sample data from last PLC reading (if available)
3. Or generates mock data based on tag types
4. Sections render as they will in production

---

## 22.5 Bin Master Manager

**URL:** `/admin/bin-master`

### Features
- List all bin mappings (filterable by report type)
- Add new bin mapping
- Edit bin mapping
- Delete bin mapping
- Bulk import from CSV

### Bin List Table Columns

| Column | Sortable | Description |
|--------|----------|-------------|
| Bin ID | Yes | PLC bin ID |
| Material Name | Yes | Display name |
| Material Code | Yes | Material code |
| Report Type | Yes | Specific report or "Global" |
| Actions | No | Edit, Delete |

### Bin Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Bin ID | Number | Yes | PLC bin ID |
| Material Name | Text | Yes | Display name (Wheat Grade A) |
| Material Code | Text | No | Material code (WGA-001) |
| Report Type | Dropdown | No | Specific report type or "Global (All)" |

---

## 22.6 Audit Log Viewer

**URL:** `/admin/audit-logs`

### Features
- List all configuration changes
- Filter by user, entity type, action, date range
- View change details (before/after)
- Export to CSV

### Audit Log Table Columns

| Column | Sortable | Description |
|--------|----------|-------------|
| Timestamp | Yes | When change occurred |
| User | Yes | Who made change |
| Action | Yes | CREATE, UPDATE, DELETE |
| Entity Type | Yes | report_type, plc_tag, calculation, etc. |
| Entity Name | Yes | Name of affected item |
| IP Address | No | Client IP |
| Actions | No | View Details button |

### Change Detail Modal

**Shows:**
- Full before/after JSON comparison
- Changed fields highlighted
- Timestamp and user info

---

## 22.7 Config Backup & Restore

**URL:** `/admin/backups`

### Features
- List all backups (auto and manual)
- Create manual backup
- Preview backup contents
- Restore from backup
- Export backup as JSON file
- Import configuration from JSON

### Backup List Table Columns

| Column | Sortable | Description |
|--------|----------|-------------|
| Created At | Yes | Backup timestamp |
| Type | Yes | Auto, Manual, Pre-change |
| Report Type | Yes | Specific or "Full System" |
| Created By | Yes | User (or "System") |
| Description | No | Backup description |
| Actions | No | Preview, Restore, Export, Delete |

### Create Backup Dialog

| Field | Type | Description |
|-------|------|-------------|
| Backup Type | Dropdown | "Full System" or specific report type |
| Description | Textarea | Optional description |

### Restore Dialog

**Steps:**
1. Click "Restore" on backup
2. Preview shows what will be restored
3. Warning: "This will overwrite current configuration"
4. User types "RESTORE" to confirm
5. System restores and reloads config

### Import Configuration

**Button:** "Import Configuration"

**Steps:**
1. Upload JSON file
2. System validates structure
3. Preview shows:
   - New items to create
   - Existing items to update
   - Conflicts to resolve
4. User selects action for conflicts (Skip, Replace, Rename)
5. Confirm import
6. System imports and creates audit log

---

## 22.8 Frontend Component Structure

### Dynamic Components Library

```
Frontend/src/Components/Dynamic/
├── SectionRenderer.jsx       # Routes to correct component
├── DynamicTable.jsx          # Configurable data table
├── DynamicGauge.jsx          # Circular gauge
├── DynamicLineChart.jsx      # Time series chart
├── DynamicBarChart.jsx       # Bar chart
├── DynamicStatusGrid.jsx     # Status indicators
├── DynamicSummaryCards.jsx   # KPI cards
└── DynamicText.jsx           # Static text
```

### Admin Components

```
Frontend/src/Pages/Admin/
├── ReportTypeManager.jsx     # Report types CRUD
├── ReportTypeForm.jsx        # Report type form
├── PLCTagManager.jsx         # Tags CRUD
├── PLCTagForm.jsx            # Tag form
├── TagTestButton.jsx         # Test tag reading
├── CalculationBuilder.jsx    # Calculations CRUD
├── FormulaEditor.jsx         # Formula editor with highlighting
├── FormulaTest.jsx           # Test formula dialog
├── LayoutEditor.jsx          # Visual layout editor
├── LayoutCanvas.jsx          # Drag & drop canvas
├── SectionConfig.jsx         # Section configuration panel
├── BinMasterManager.jsx      # Bin mappings CRUD
├── AuditLogViewer.jsx        # Audit log list
├── ConfigBackup.jsx          # Backup & restore
└── ImportExport.jsx          # Import/export dialogs
```

### Shared Hooks

```
Frontend/src/Hooks/
├── useDynamicConfig.js       # Load config from API
├── useLiveData.js            # WebSocket live data
├── useReportData.js          # Historical data queries
├── useAdminApi.js            # Admin CRUD operations
└── useAuditLog.js            # Audit log queries
```

---

# Feature Summary

## What Makes It Dynamic

| Component | How It's Dynamic |
|-----------|------------------|
| **PLC Reading** | Tags from database, not hardcoded |
| **Data Types** | Type from config, parsed accordingly |
| **Bin Mapping** | Lookup from bin_master table |
| **Calculations** | Formulas from database, evaluated at runtime |
| **Order Tracking** | Trigger config from database |
| **Live Monitor** | Layout from database, rendered dynamically |
| **Reports** | Calculations + layout from database |
| **Archive** | Aggregation rules from tag config |

## What Users Can Configure Without Developers

| Task | Admin UI Location | Time Required |
|------|-------------------|---------------|
| Add new production line | Report Types → Add | 30-60 minutes |
| Change PLC offset | PLC Tags → Edit | 2 minutes |
| Add new tag | PLC Tags → Add | 5 minutes |
| Add bin mapping | Bin Master → Add | 1 minute |
| Add calculation | Calculations → Add | 5 minutes |
| Modify UI layout | Layouts → Edit | 15 minutes |
| Export config | Backups → Export | 1 minute |
| View audit trail | Audit Logs | Instant |
| Restore backup | Backups → Restore | 5 minutes |

**Total Time to Configure New Mill:** ~1-2 hours (not 3 days of development!)

---

**Document Version:** 2.0  
**Last Updated:** December 2024  
**Status:** Feature Specifications Complete
