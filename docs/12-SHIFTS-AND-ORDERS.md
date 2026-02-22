# 12 -- Shifts and Orders

## Shift Configuration

Industrial plants operate around the clock. Production is divided into **shifts** -- typically two to four per day -- each with a named crew and a defined time window. In the Reporting Module, shifts serve as time boundaries for reporting: when a manager selects "Shift A" in the Report Viewer, the system translates that into the exact start and end timestamps for that shift on the chosen date, then queries the historian accordingly.

Each shift has three properties:

| Property | Description | Example |
|----------|-------------|---------|
| **Name** | A human-readable label for the shift | `Morning` |
| **Start** | The time the shift begins (HH:MM, 24-hour) | `06:00` |
| **End** | The time the shift ends (HH:MM, 24-hour) | `14:00` |

The system ships with a sensible default of three shifts:

| Shift | Start | End |
|-------|-------|-----|
| Morning | 06:00 | 14:00 |
| Evening | 14:00 | 22:00 |
| Night | 22:00 | 06:00 |

---

## Configuring Shifts

Shift configuration is managed through the Engineering section of the application.

### Step-by-step

1. Navigate to **Engineering > Shifts** (the Shifts tab in the Settings/Engineering page).
2. Select the **number of shifts** (1 to 4) using the selector buttons. The system enforces a minimum of 1 and a maximum of 4.
3. For each shift, fill in:
   - **Shift Name** -- a descriptive label (e.g., `Morning`, `Shift A`, `Night`).
   - **Start Time** -- the time the shift begins, using the built-in time picker (HH:MM format).
   - **End Time** -- the time the shift ends (HH:MM format).
4. Click **Save Shifts** to persist the configuration.

### Validation rules

The backend (`shifts_config.py`) enforces these rules when saving:

- `shift_count` must be between 1 and 4.
- The `shifts` array length must exactly match `shift_count`.
- Every shift must have a non-empty `name`.
- Both `start` and `end` must be in `HH:MM` format (validated by regex `^\d{2}:\d{2}$`).

If validation fails, the backend returns a `400` error with a descriptive message, and the frontend displays a toast notification.

### Storage

The configuration is stored as a JSON file on disk:

```
backend/config/shifts_config.json
```

Example file content:

```json
{
  "shift_count": 3,
  "shifts": [
    { "name": "Morning", "start": "06:00", "end": "14:00" },
    { "name": "Evening", "start": "14:00", "end": "22:00" },
    { "name": "Night",   "start": "22:00", "end": "06:00" }
  ]
}
```

If the file does not exist or cannot be read, the system falls back to the built-in defaults (three shifts as shown above). A short in-memory cache (5-second TTL) avoids re-reading the file on every request.

> **Best practice:** Shifts should cover the full 24 hours without gaps. If Shift A ends at 14:00, Shift B should start at 14:00. Gaps or overlaps will not cause errors, but they will produce incomplete or duplicated data in shift-filtered reports.

---

## How Shifts Affect Reports

Shifts integrate with the Report Viewer's time filter system:

1. **Shift filter in Report Viewer** -- When a user selects a date and a shift name, the system looks up that shift's `start` and `end` times from the configuration and constructs the exact timestamp range. For example, selecting "2026-02-22" + "Morning" resolves to `2026-02-22 06:00:00` through `2026-02-22 14:00:00`.

2. **Night shifts spanning midnight** -- A night shift with `start: "22:00"` and `end: "06:00"` is handled correctly. If the selected date is February 22, the system calculates the range as `2026-02-22 22:00:00` to `2026-02-23 06:00:00`.

3. **Shift-wise KPI calculations** -- When KPIs are calculated for a shift context, the shift boundaries define the time window over which aggregation functions (SUM, AVG, MAX, etc.) operate.

4. **API endpoint** -- The shifts configuration is available at:
   - `GET /api/settings/shifts` -- returns the current configuration (requires authentication).
   - `POST /api/settings/shifts` -- saves a new configuration (requires authentication).

---

## Order Tracking

### What orders represent

A **production order** (or simply "order") represents one batch or run of material through a production line. In the Reporting Module, orders are associated with **layouts** (Live Monitor configurations). Each layout can optionally have order tracking enabled, which auto-detects when a production run starts and stops based on a PLC signal.

Each order records:

| Field | Description |
|-------|-------------|
| `order_name` | Auto-generated name, e.g., `MILLING-1`, `MILLING-2` |
| `order_number` | Auto-incrementing integer, never resets |
| `start_time` | Timestamp when the order started |
| `end_time` | Timestamp when the order completed (NULL while running) |
| `status` | Either `running` or `completed` |
| `duration_seconds` | Calculated duration (populated on completion) |

---

## Order Detection

Order detection is implemented in `backend/utils/order_tracker.py` via the `DynamicOrderTracker` class. Each published Live Monitor layout can have an **order status tag** -- a PLC tag whose value changes signal order start and stop events.

### How it works

1. **Status tag monitoring** -- The dynamic monitor worker reads all PLC tags every second. For each layout that has order tracking configured, the worker passes the tag values to the layout's `DynamicOrderTracker` instance.

2. **Trigger detection** -- The `check_trigger()` method watches for value transitions on the status tag:
   - **START**: The status tag transitions **to** the configured `start_value` (default: `1`). For example, the value changes from `0` to `1`.
   - **STOP**: The status tag transitions **to** the configured `stop_value` (default: `0`). For example, the value changes from `1` to `0`.
   - **Other values ignored**: Status codes like `2`, `3`, `4`, etc. are intentionally ignored. The tracker only responds to the configured start and stop values.

3. **Transition-based, not level-based** -- The tracker compares the current value against `last_status_value`. A START event only fires when the previous value was *not* the start value and the current value *is* the start value. This prevents repeated triggers when the signal stays at `1`.

4. **Configuration per layout** -- Each layout stores its order tracking configuration in the `live_monitor_layouts` database table:
   - `order_status_tag_name` -- the PLC tag to monitor.
   - `order_prefix` -- prefix for generated order names (e.g., `MILLING-`). Defaults to the layout name in uppercase.
   - `order_start_value` -- the value that signals an order start (default: `1`).
   - `order_stop_value` -- the value that signals an order stop (default: `0`).

### Order numbering

Order numbers are auto-incrementing and never reset. When a new order starts, the tracker determines the next number by checking the maximum order number across three sources:

1. The **live data table** for the layout.
2. The **archive data table** for the layout.
3. The **`dynamic_orders`** table.

The next order number is `max + 1`, ensuring uniqueness even after data archival.

---

## Order Lifecycle

### Starting an order

When the tracker detects a START event:

1. The next order number is calculated (see above).
2. An order name is generated: `{prefix}{number}` (e.g., `MILLING-42`).
3. The `dynamic_order_counters` table is updated with the current counter and order name.
4. A new row is inserted into `dynamic_orders` with `status = 'running'` and the current timestamp as `start_time`.
5. The tracker's internal state is updated: `is_running = True`, `current_order_name` is set.

### During an order

While an order is running, every data row stored by the dynamic monitor worker includes the `order_name` field. This associates all recorded data with the active order, enabling order-scoped queries and analytics later.

### Completing an order

When the tracker detects a STOP event:

1. The `dynamic_orders` row is updated: `end_time` is set, `status` changes to `completed`, and `duration_seconds` is calculated as the difference between end and start times.
2. The tracker's internal state is reset: `is_running = False`, `current_order_name = None`.

### Order analytics

Once an order completes, historical queries can retrieve all data rows associated with that order name. This enables:

- Total production during the order.
- Energy consumption for the order's duration.
- Efficiency and throughput KPIs.
- Comparison across orders over time.

---

## For Developers

### Key source files

| File | Purpose |
|------|---------|
| `backend/utils/order_tracker.py` | `DynamicOrderTracker` class -- state machine for order detection, start/stop logic, counter management |
| `backend/workers/dynamic_monitor_worker.py` | Main worker loop -- reads PLC tags, invokes order tracker, stores data with order association |
| `backend/shifts_config.py` | Shift configuration read/write, validation, caching |
| `backend/config/shifts_config.json` | Persisted shift schedule (auto-created on first save) |
| `backend/migrations/add_dynamic_monitoring_tables.sql` | Database schema for `dynamic_orders` and `dynamic_order_counters` tables |

### Database schema

**`dynamic_order_counters`** -- Tracks the current order counter per layout:

```sql
CREATE TABLE dynamic_order_counters (
    id              SERIAL PRIMARY KEY,
    layout_id       INTEGER NOT NULL REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    layout_name     VARCHAR(255) NOT NULL,
    current_counter INTEGER DEFAULT 0,
    last_order_name VARCHAR(255),
    last_updated    TIMESTAMP DEFAULT NOW(),
    UNIQUE(layout_id)
);
```

**`dynamic_orders`** -- Stores individual order records:

```sql
CREATE TABLE dynamic_orders (
    id               SERIAL PRIMARY KEY,
    layout_id        INTEGER NOT NULL REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    order_name       VARCHAR(255) NOT NULL,
    order_number     INTEGER NOT NULL,
    start_time       TIMESTAMP NOT NULL,
    end_time         TIMESTAMP,
    status           VARCHAR(50) DEFAULT 'running',
    duration_seconds NUMERIC,
    created_at       TIMESTAMP DEFAULT NOW()
);
```

Indexes exist on `layout_id`, `order_name`, and `status` for efficient querying.

### Shifts API endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/settings/shifts` | `@login_required` | Returns current shift configuration |
| `POST` | `/api/settings/shifts` | `@login_required` | Saves new shift configuration (validates input) |

### DynamicOrderTracker API

The `DynamicOrderTracker` class exposes these methods:

- `check_trigger(tag_values)` -- Accepts a dict of tag name/value pairs. Returns `"START"`, `"STOP"`, or `None`.
- `start_new_order()` -- Creates a new order record in the database and updates internal state.
- `complete_order()` -- Marks the current order as completed and resets internal state.
- `get_current_order()` -- Returns the current order name (or `None` if no order is running).

### How the monitor worker uses order tracking

The `dynamic_monitor_worker` function (in `workers/dynamic_monitor_worker.py`) runs in an eventlet greenthread. On each 1-second iteration:

1. It reads all active PLC tags via `read_all_tags()`.
2. For each published layout, it retrieves (or creates) a `DynamicOrderTracker` instance.
3. It calls `check_trigger(tag_values)` to detect order events.
4. If a START is detected, it calls `start_new_order()`. If a STOP is detected, it calls `complete_order()`.
5. It stores the current data row into the layout's live table. If an order is active, the `order_name` column is populated; otherwise it is `NULL`.

Data is stored **continuously regardless of order status**. The order tracking system only tags rows with the order name -- it does not gate data storage.

---

Previous: [11-HISTORICAL-DATA-AND-REPORTS](11-HISTORICAL-DATA-AND-REPORTS.md) | Next: [13-USER-ROLES-AND-AUTH](13-USER-ROLES-AND-AUTH.md)
