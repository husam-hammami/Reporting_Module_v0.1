# 10 - Live Monitoring

## What is Live Monitoring?

Live Monitoring is the real-time dashboard that shows plant data as it happens. Tag values update every second, giving operators an immediate view of what is running, what is producing, and what needs attention.

When a layout is published in the Report Builder, it becomes available as a live monitor. The system reads PLC tag values once per second, evaluates any configured formulas, stores the results in the database, and pushes the values to every connected browser via WebSocket. The operator sees the same widgets they designed in the Report Builder -- tables, KPI cards, gauges, and charts -- but now with real data flowing through them continuously.

---

## How Live Data Flows

The complete pipeline from PLC to browser screen:

```
PLC / Emulator
     |
     |  snap7 read (or emulator values)
     v
Tag Reader  (utils/tag_reader.py — read_all_tags)
     |
     +-----> Historian Worker  (historian_worker.py)
     |         Writes every tag value to tag_history each second
     |         (layout_id IS NULL — universal, plant-wide recording)
     |
     +-----> Dynamic Monitor Worker  (dynamic_monitor_worker.py)
     |         Resolves section-based data per published layout
     |         Stores JSONB row in <layout>_monitor_logs each second
     |         Tracks orders (start/stop) via DynamicOrderTracker
     |
     +-----> WebSocket Emitter  (app.py — dynamic_tag_realtime_monitor)
              Reads all active tags every 1 second
              Broadcasts via socketio.emit('live_tag_data', {...})
              All connected browsers receive the update
```

### Step by Step

1. **PLC Tag Read** -- The `read_all_tags()` function reads all active tags from the PLC via snap7. In demo mode, it reads from the emulator instead. This happens every 1 second in multiple workers simultaneously.

2. **Historian Worker** (`historian_worker.py`) -- An independent worker that records every active PLC tag to the `tag_history` table each second with `layout_id = NULL`. This is the universal plant-wide recorder, running regardless of whether any layout is published. For counter tags, it also computes `value_delta` (the difference from the previous reading). Controlled by the `USE_CENTRAL_HISTORIAN` environment variable (default: true).

3. **Dynamic Monitor Worker** (`dynamic_monitor_worker.py`) -- For each published layout, this worker:
   - Extracts which tags the layout needs (via `get_layout_tags()` and `get_kpi_tag_names_for_layout()`)
   - Resolves section-based data from the raw tag values (via `get_layout_sections_data()`)
   - Checks order triggers (start/stop signals from the PLC status tag)
   - Inserts a row into the layout's live table (`<layout_name>_monitor_logs`) with the section data as JSONB
   - Dynamically adjusts its sleep time to maintain exactly 1-second intervals

4. **WebSocket Broadcast** (`app.py` -- `dynamic_tag_realtime_monitor()`) -- A separate loop that reads all active tags every 1 second and emits them to all connected WebSocket clients. The payload:
   ```json
   {
     "timestamp": "2026-02-22T10:30:15.123",
     "tag_values": {
       "GS_Silo1_Weight": 1245.67,
       "FCL_Line1_Temp": 82.3,
       ...
     },
     "plc_connected": true
   }
   ```

5. **Frontend Receives** -- The React frontend listens on the `live_tag_data` WebSocket event and updates widget values in real time.

---

## The Live Monitor Page

When an operator opens a report in Live mode, they see:

### Layout-Based Rendering
The page renders the same layout that was designed in Report Builder. Widgets are positioned on a grid using `react-grid-layout` with the exact coordinates and sizes saved during design. In live mode, all widgets are static (no drag/resize) -- this is a read-only view.

### Widget Types
- **Tables** -- Rows of live-updating tag values. Each column can be sourced from a PLC tag, a formula, a mapping, or static text. Values update every time a new WebSocket message arrives.
- **KPI Cards** -- Large numeric displays showing a single value (e.g., total production, current temperature). Configurable with icons, colors, and sizes (Small, Medium, Large).
- **Charts** -- Line charts or bar charts with rolling time windows. In live mode, chart data accumulates as new values arrive, showing trends over the session. The `useTagHistory` hook maintains a buffer of recent `{t, v}` data points per tag.
- **Text/Labels** -- Static content like report titles, section headers, and descriptive text.
- **Separators** -- Visual dividers between sections, with configurable thickness, style, and color.

### Status Indicators
The toolbar shows the current connection state:
- **Green pulsing dot + "Live"** -- Emulator is active and data is flowing
- **Yellow clock + "Emulator off"** -- No data source is active; operators need to enable the emulator or connect to the PLC
- **Red dot + error message** -- Failed to fetch live data from the backend

### Order Tracking
If the layout has an order status tag configured, the system automatically:
- Detects when a new order starts (status tag value matches `order_start_value`, default: 1)
- Generates an order name using the configured prefix (e.g., `GRAIN-SILOS-001`)
- Tracks the order through its lifecycle
- Detects when the order stops (status tag value matches `order_stop_value`, default: 0)

### Time Display
The toolbar continuously shows the current date and time, updating every second.

---

## Data Accuracy

The system ensures displayed values match plant reality:

### Value Formatting
- **Decimal Places** -- Each tag has a `decimals` setting (configured in the column/KPI definition) that controls how many decimal places are shown. Default is 2.
- **Units** -- Units come from the tag metadata (degrees C, kg, t/h, bar, kW, etc.) and are displayed alongside the value.
- **Alignment** -- Column alignment (left, center, right) is configurable per column.

### Data Quality
- **Quality Codes** -- The historian records a quality code with every value: `GOOD`, `BAD`, `STALE`, or `COMM_ERROR`. These follow industrial SCADA standards.
- **Null/Error Handling** -- When a tag value is null or cannot be read, widgets display a placeholder (typically "--" or a blank cell) rather than showing stale data.
- **Counter/Totalizer Tags** -- Tags marked as `is_counter` get special treatment: the system computes `value_delta` (the change since the last reading) and handles counter resets (when the current value is less than the previous value).

### Aggregation Intelligence
- Flow-rate, weight, and production tags (detected by keywords like `flow`, `weight`, `rate`, `produced` in the tag name) are aggregated using SUM when archived.
- Temperature, pressure, and other analog tags are aggregated using AVG.

---

## WebSocket Connection

The WebSocket connection is managed by `SocketContext.jsx`, which provides a React context used throughout the application.

### Connection Setup

The `SocketProvider` component establishes a Socket.IO connection when the application loads:

```
Connection URL:
  - Production: window.location.origin (same host as the web app)
  - Development: configured API base URL, with fallback to http://localhost:5000
```

**Configuration:**
- Transport: `websocket` only (no polling fallback)
- Credentials: `withCredentials: true`
- Auto-connect: disabled (the provider manually calls `connect()` after setup)
- Connection timeout: 3 seconds

### Reconnection Behavior
- Automatic reconnection: enabled
- Maximum reconnection attempts: 3
- Initial reconnection delay: 2 seconds
- Maximum reconnection delay: 10 seconds
- On connect error in dev mode: attempts a fallback to `localhost:5000` if the primary URL fails

### Events

| Direction | Event Name | Payload | Description |
|-----------|-----------|---------|-------------|
| Server -> Client | `live_tag_data` | `{ timestamp, tag_values, plc_connected }` | All active tag values, emitted every 1 second |
| Server -> Client | `live_tag_data` (error) | `{ error, plc_connected: false, timestamp }` | Emitted when the PLC read fails |
| Client -> Server | `connect` | (automatic) | Socket.IO connection handshake |
| Client -> Server | `disconnect` | (automatic) | Socket.IO disconnection |

### Context API

Components access the WebSocket via the `useSocket()` hook:

```jsx
const { socket, isConnected } = useSocket();
```

- `socket` -- The Socket.IO client instance (or null if in local test mode)
- `isConnected` -- Boolean indicating whether the WebSocket is currently connected

### Multiple Browser Tabs
Each browser tab creates its own WebSocket connection. The server broadcasts `live_tag_data` to all connected clients simultaneously using `socketio.emit()` (which is a broadcast to all sockets, not a room-specific emit). This means every open tab receives the same data stream.

### Local Test Mode
A `LOCAL_TEST_MODE` flag (hardcoded to `false`) can be set to `true` to disable the WebSocket entirely. In this mode, `socket` is null and `isConnected` is always false. This is useful for frontend development without a running backend.

---

## For Developers

### dynamic_monitor_worker.py

**Purpose:** Stores per-second section-based data for each published layout.

**Polling Loop:**
1. Fetches all active monitors from `dynamic_monitor_registry` via `get_active_monitors()`
2. Reads all PLC tags once via `read_all_tags(tag_names=None, ...)`
3. For each active monitor:
   - Extracts the tags needed by this layout (`get_layout_tags()` + `get_kpi_tag_names_for_layout()`)
   - Resolves section data from tag values (`get_layout_sections_data()`)
   - Checks order triggers (via `DynamicOrderTracker`)
   - Inserts into the layout's live table with columns: `layout_id`, `order_name`, `tag_values` (JSONB), `line_running`, `created_at`
4. Dynamically sleeps to maintain 1-second cycle (warns if loop takes > 500ms)

**Key design decisions:**
- Data is stored **continuously** regardless of order status. The status tag is only used for order tracking, not for controlling data storage.
- Tag values are filtered per layout -- only tags actually used in the layout are stored (not all PLC tags).
- If no active monitors exist, the worker sleeps 5 seconds before checking again.
- On error, the worker waits 5 seconds and retries (it never crashes permanently).

### live_monitor_bp.py Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/live-monitor/predefined` | Hardcoded report using emulator offsets (fallback when no layouts exist) |
| GET | `/live-monitor/tags` | Current values for all (or specified) active tags from the PLC. Optional query param: `tags` (comma-separated tag names) |
| GET | `/live-monitor/layouts` | List all layouts. Optional query param: `is_active` (true/false) |
| POST | `/live-monitor/layouts` | Create a new layout |
| GET | `/live-monitor/layouts/<id>` | Get layout with sections and columns |
| PUT | `/live-monitor/layouts/<id>` | Update layout (including order tracking config) |
| DELETE | `/live-monitor/layouts/<id>` | Hard-delete a layout |
| GET | `/live-monitor/layouts/<id>/config` | Get full layout configuration (JSONB) |
| PUT | `/live-monitor/layouts/<id>/config` | Save full layout configuration (JSONB) |
| POST | `/live-monitor/layouts/<id>/publish` | Publish layout: creates dynamic tables, registers monitor, starts data collection |
| POST | `/live-monitor/layouts/<id>/unpublish` | Unpublish layout: stops data collection, deactivates monitor |
| POST | `/live-monitor/layouts/<id>/sections` | Create a section (Table or KPI) in a layout |
| POST | `/live-monitor/sections/<id>/columns` | Add a column to a Table section |
| POST | `/live-monitor/sections/<id>/kpi-cards` | Add a KPI card to a KPI section |

### SocketContext.jsx

**File:** `Frontend/src/Context/SocketContext.jsx`

Provides a React context wrapping Socket.IO. The `SocketProvider` should be placed near the root of the component tree so all pages can access `useSocket()`.

Key implementation details:
- Uses a `socketRef` to hold the current socket instance for cleanup
- The `triedFallback` ref prevents infinite fallback loops in development
- The `setApiFallback()` call switches the axios base URL when the primary WebSocket fails (coordinating REST and WebSocket to the same backend)
- Cleanup on unmount: calls `socketRef.current?.disconnect()`

### Database Tables

**Per-Layout Live Table** (`<layout_name>_monitor_logs`):
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| layout_id | INTEGER | References live_monitor_layouts |
| order_name | TEXT | Current order (null if no active order) |
| tag_values | JSONB | Section-based data: `{"section_name": [{row_data}, ...]}` |
| computed_values | JSONB | Computed/formula values |
| active_sources | JSONB | Which sources (bins) are currently feeding |
| line_running | BOOLEAN | True if an order is active |
| created_at | TIMESTAMP | When this row was stored |

**tag_history** (Universal historian -- per-tag, per-second):
| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| layout_id | INTEGER | NULL for universal recording; layout ID for layout-specific |
| tag_id | INTEGER | References tags table |
| value | DOUBLE PRECISION | Tag value (booleans stored as 0/1) |
| value_raw | DOUBLE PRECISION | Raw value before any processing |
| value_delta | DOUBLE PRECISION | Change since last reading (for counters) |
| is_counter | BOOLEAN | Whether this tag is a counter/totalizer |
| quality_code | VARCHAR(20) | GOOD, BAD, STALE, or COMM_ERROR |
| timestamp | TIMESTAMP | When the value was read |
| order_name | TEXT | Associated order name (if any) |

**dynamic_monitor_registry** (Tracks which layouts are being monitored):
| Column | Type | Description |
|--------|------|-------------|
| layout_id | INTEGER | References live_monitor_layouts |
| layout_name | TEXT | Layout name (for logging/debugging) |
| live_table_name | TEXT | Name of the per-second table |
| archive_table_name | TEXT | Name of the hourly archive table |
| is_active | BOOLEAN | Whether the worker should process this layout |
| last_archive_at | TIMESTAMP | When the last archive was completed |

---

Previous: [09-REPORT-BUILDER](09-REPORT-BUILDER.md) | Next: [11-HISTORICAL-DATA-AND-REPORTS](11-HISTORICAL-DATA-AND-REPORTS.md)
