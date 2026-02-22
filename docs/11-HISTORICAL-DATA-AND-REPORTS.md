# 11 - Historical Data and Reports

## What is Historical Reporting?

While live monitoring shows the present, historical reporting lets you look back at any time period. See what happened yesterday, last week, during a specific shift, or any custom date range. The same widgets that show live data can show historical data -- just select a different time filter.

The report viewer toolbar presents six options: **Live**, **Today**, **This Week**, **This Month**, **Shift**, and **Custom**. When you select any option other than Live, the system fetches stored data for that time range from the historian database and renders it in the same layout. Tables show aggregated values, charts show trends across the full period, and KPI cards show totals or averages.

---

## How Historical Data is Stored

The system uses a two-tier storage architecture to balance resolution with efficiency.

### Tier 1: Per-Second Recording

Every second, two independent workers record tag values:

1. **Historian Worker** (`historian_worker.py`) -- Records every active PLC tag to the `tag_history` table with `layout_id = NULL`. This is a universal, plant-wide recording that runs regardless of whether any layout is published. Each row contains the tag's numeric value, the raw value, the delta from the previous reading (for counter tags), a quality code, and a timestamp. Controlled by the `USE_CENTRAL_HISTORIAN` environment variable (default: true).

2. **Dynamic Monitor Worker** (`dynamic_monitor_worker.py`) -- Records section-based data for each published layout to its own per-layout table (`<layout_name>_monitor_logs`). The data is stored as JSONB with section keys and row arrays.

This dual recording means the data is available both per-tag (for cross-layout queries and the historian API) and per-layout (for layout-specific views with section context).

### Tier 2: Hourly Archives

The **Dynamic Archive Worker** (`dynamic_archive_worker.py`) runs once per hour, at the top of each hour. It performs two types of aggregation:

**Per-Layout Archiving:**
- Reads all per-second rows from each layout's live table (`<layout_name>_monitor_logs`) that are older than the current hour boundary
- Aggregates tag values intelligently:
  - Tags with names containing `flow`, `weight`, `rate`, or `produced` are aggregated using **SUM** (because these represent cumulative quantities)
  - All other tags are aggregated using **AVG** (because these represent instantaneous measurements like temperature or pressure)
- Stores the aggregated result in the layout's archive table (`<layout_name>_monitor_logs_archive`) with the `archive_hour` timestamp
- Deletes the original per-second rows from the live table to free space

**Universal Historian Archiving:**
- Aggregates `tag_history` rows (where `layout_id IS NULL`) from the previous hour
- For counter tags (`is_counter = TRUE`): sums the `value_delta` column
- For non-counter tags: averages the `value` column
- Stores the result in `tag_history_archive`

### Timing

The archive worker uses the **Asia/Dubai** timezone for determining hour boundaries. On startup, it calculates how many seconds until the next hour boundary and sleeps until then, ensuring archives run at exactly :00 of each hour.

---

## Time Filters

The report viewer provides six time filter presets, defined in `ReportViewer.jsx` as the `TIME_PRESETS` array:

```javascript
const TIME_PRESETS = [
  { id: 'live',   label: 'Live' },
  { id: 'day',    label: 'Today' },
  { id: 'week',   label: 'This Week' },
  { id: 'month',  label: 'This Month' },
  { id: 'shift',  label: 'Shift' },
  { id: 'custom', label: 'Custom' },
];
```

Each preset maps to a date range computed by the `getDateRange()` function or by dedicated logic in the `dateRange` useMemo.

### Live

- **What it shows:** Real-time data updating every second
- **Data source:** WebSocket (`live_tag_data` event) + REST polling (`/api/live-monitor/tags` every 5 seconds as a fallback)
- **No date range is computed** -- `getDateRange('live')` returns `null`
- **Best for:** "What is happening right now?"

### Today (Daily)

- **What it shows:** Data from midnight today to the current moment
- **Date range:** `from = start of today (00:00:00)` to `to = now`
- **How it is computed:**
  ```javascript
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: sod, to: now };
  ```
- **Data source:** REST API call to `/api/historian/by-tags` with the computed range
- **Best for:** "What happened today?" or "How much have we produced since this morning?"

### This Week (Weekly)

- **What it shows:** Data from Monday of the current week to the current moment
- **Date range:** `from = most recent Monday at 00:00:00` to `to = now`
- **How it is computed:**
  ```javascript
  const d = now.getDay();            // 0=Sunday, 1=Monday, ...
  const diff = d === 0 ? 6 : d - 1;  // days since Monday
  const m = new Date(sod);
  m.setDate(m.getDate() - diff);     // roll back to Monday
  return { from: m, to: now };
  ```
  Note: the week starts on Monday (ISO standard), not Sunday.
- **Data source:** REST API -- the historian endpoint. If per-second data is not available for the full range, the system falls back to the hourly `tag_history_archive` table automatically.
- **Best for:** "How was this week's production?" or "What were the average temperatures this week?"

### This Month (Monthly)

- **What it shows:** Data from the 1st of the current month to the current moment
- **Date range:** `from = 1st of current month at 00:00:00` to `to = now`
- **How it is computed:**
  ```javascript
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  ```
- **Data source:** REST API -- for ranges this long, the historian endpoint typically falls back to `tag_history_archive` (hourly aggregated data) for efficiency.
- **Best for:** "Monthly production summary" or "How did we perform this month compared to target?"

### Shift

- **What it shows:** Data for a specific shift period on the current day
- **How it works:**
  1. The frontend fetches the shift schedule from `/api/settings/shifts` on component mount
  2. When the user selects "Shift", a dropdown appears listing all configured shifts (e.g., Shift A: 06:00-14:00, Shift B: 14:00-22:00, Shift C: 22:00-06:00)
  3. The user selects a shift from the dropdown
  4. The date range is calculated from today's date combined with the shift's start and end times:
     ```javascript
     const [startH, startM] = shift.start.split(':').map(Number);
     const [endH, endM] = shift.end.split(':').map(Number);
     const from = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startH, startM, 0);
     const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endH, endM, 0);
     if (to <= from) to.setDate(to.getDate() + 1);  // handles overnight shifts
     ```
  5. If the end time is before or equal to the start time (e.g., 22:00-06:00), the system assumes the shift crosses midnight and adds one day to the end time
- **If no shifts are configured:** The dropdown is replaced with a warning message: "No shifts configured -- go to Engineering > Shifts"
- **Best for:** "How did the night shift perform?" or "What was production during Shift B?"

### Custom Range

- **What it shows:** Data for any user-specified time range
- **How it works:**
  1. When the user selects "Custom", two datetime-local input fields appear below the toolbar
  2. The user picks an exact start datetime ("From") and end datetime ("To")
  3. The date range is constructed directly from these inputs:
     ```javascript
     { from: new Date(customFrom), to: new Date(customTo) }
     ```
  4. The range can span minutes, hours, days, or months -- there is no limit
- **Data source:** The backend automatically chooses the appropriate data source:
  - Short ranges (where per-second data exists): uses `tag_history`
  - Long ranges or older data: falls back to `tag_history_archive`
- **Best for:** "Show me data from Feb 10 9am to Feb 12 5pm" or "What happened during yesterday's maintenance window?"

---

## How the Correct Data Shows

The technical pipeline from time filter selection to rendered widgets:

### 1. Date Range Calculation

When the user clicks a time preset button, `setTimePreset(preset_id)` is called. The `dateRange` useMemo recomputes based on the selected preset:

- For `day`, `week`, `month`: calls `getDateRange(preset)` which returns `{ from, to }` with JavaScript Date objects
- For `shift`: looks up the selected shift in `shiftsConfig.shifts` and computes the range from today's date + shift start/end times
- For `custom`: uses the `customFrom` and `customTo` state values directly
- For `live`: `dateRange` is null (no historical fetch needed)

### 2. Aggregation Grouping

Different widgets may need different aggregation functions for the same time range. The system handles this intelligently:

- `collectWidgetTagAggregations(widgets)` scans all widgets and builds a map of `{ tagName: aggregationType }` based on each widget's configuration
- Tags are grouped by their required aggregation type (e.g., `last`, `avg`, `sum`, `delta`, `min`, `max`, `count`)
- Parallel API requests are fired for each aggregation group

### 3. Data Fetching (Historical Mode)

Two types of data are fetched in parallel:

**Aggregated Values** (for tables, KPI cards):
```
GET /api/historian/by-tags?tag_names=Tag1,Tag2&from=...&to=...&aggregation=last
GET /api/historian/by-tags?tag_names=Tag3&from=...&to=...&aggregation=sum
```
Each request returns `{ data: { tagName: value, ... } }`. Results are merged into a single `historicalTagValues` object.

**Time-Series Data** (for charts):
```
GET /api/historian/time-series?tag_names=Tag1,Tag2&from=...&to=...&max_points=500
```
Returns `{ data: { tagName: [{t: epoch_ms, v: number}, ...], ... } }`. The backend automatically downsamples if there are more data points than `max_points` by bucketing timestamps into intervals and averaging.

### 4. Backend Query Logic

The `/api/historian/by-tags` endpoint:
1. Resolves tag names to tag IDs via the `tags` table
2. Queries `tag_history` first (per-second data), applying the requested aggregation:
   - `last`: `DISTINCT ON (tag_id) ... ORDER BY timestamp DESC` -- most recent value in range
   - `avg/min/max/sum/count`: Standard SQL aggregation functions grouped by tag_id
   - `delta`: Last value minus first value in the range (for totalizer/counter tags)
3. If no results from `tag_history` (data may have been archived), falls back to `tag_history_archive` with the same logic using `archive_hour` instead of `timestamp`

### 5. Widget Rendering

The same `WidgetRenderer` component is used for both live and historical modes. The only difference is the `tagValues` prop:

- **Live mode:** `tagValues` comes from `liveTagValues` (updated by WebSocket + REST polling), optionally merged with emulator values
- **Historical mode:** `tagValues` comes from `historicalTagValues` (fetched via the historian API)

For charts, the `tagHistory` prop switches between:
- **Live mode:** `liveTagHistory` from the `useTagHistory` hook (accumulated during the current browser session)
- **Historical mode:** `historicalTagHistory` from the `/api/historian/time-series` endpoint (full historical range from the database)

---

## Live vs Historical -- The Switch

The report viewer seamlessly switches between two fundamentally different data delivery modes:

| Aspect | Live Mode | Historical Mode |
|--------|-----------|-----------------|
| **Data delivery** | WebSocket (`live_tag_data` event every 1 second) + REST polling every 5 seconds | REST API (single request on preset change) |
| **Update frequency** | Continuous (every 1 second) | Static snapshot (re-fetches when time range changes) |
| **Tag values source** | `liveTagValues` state (from WebSocket handler) | `historicalTagValues` state (from historian API) |
| **Chart data source** | `useTagHistory` hook (accumulates in browser memory) | `/api/historian/time-series` endpoint (from database) |
| **Status indicator** | Green dot + "Live" (or error state) | Blue clock + date range and tag count |
| **Date range** | Not applicable (always "now") | Computed from preset or user input |

The switch is controlled by a single state variable: `timePreset`. When it equals `'live'`, WebSocket listeners are active and REST polling runs. When it equals anything else, the historical fetch effects fire and WebSocket data is ignored for display purposes (though the connection remains open).

---

## Report Viewing -- Step by Step

1. **Navigate to Reports** -- Click "Reporting" in the sidebar navigation

2. **Select a Report** -- The Reports page shows a grid of available report templates (only published/validated reports appear). Each card shows:
   - A thumbnail preview of the report layout
   - The report name and description
   - The status badge (draft, validated, published)
   - How long ago it was last updated

3. **Select the Time Filter** -- The toolbar shows six buttons: Live, Today, This Week, This Month, Shift, Custom
   - Click **Live** for real-time data
   - Click **Today** to see data from midnight to now
   - Click **This Week** to see data from Monday to now
   - Click **This Month** to see data from the 1st to now
   - Click **Shift** and then select a shift from the dropdown
   - Click **Custom** and enter start/end datetimes in the fields that appear

4. **View the Report** -- The report renders with the appropriate data:
   - **Tables** show aggregated values for the selected period
   - **Charts** show trends across the time range (up to 500 data points, auto-downsampled)
   - **KPI cards** show totals, averages, or latest values for the period
   - A status bar below the toolbar shows the active time range and how many tags have data

5. **Export** -- Use the Export dropdown in the top-right to:
   - **Print** the report (browser print dialog)
   - **Export as PDF** (client-side PDF generation)
   - **Export as PNG** (client-side image capture)

6. **Fullscreen** -- Click the expand icon to enter fullscreen mode for presentations or control room displays

---

## For Developers

### historian_bp.py Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/historian/history` | Raw per-sample data from `tag_history`. Requires: `layout_id`, `from`, `to`. Optional: `tag_ids`. Returns individual tag readings with timestamps. |
| GET | `/historian/archive` | Hourly aggregated data from `tag_history_archive`. Requires: `layout_id`, `from`, `to`. Optional: `tag_ids`. Falls back to latest archive data if no rows match the range. |
| GET | `/historian/by-tags` | Tag-name-based query (no layout_id required). Used by ReportViewer. Requires: `tag_names`, `from`, `to`. Optional: `aggregation` (last/avg/min/max/sum/delta/count, default: last). Tries `tag_history` first, falls back to `tag_history_archive`. |
| GET | `/historian/time-series` | Time-series arrays for chart rendering. Requires: `tag_names`, `from`, `to`. Optional: `max_points` (default 500, clamped to 10-5000). Returns `{tagName: [{t, v}, ...]}`. Auto-downsamples by bucketing and averaging when data exceeds max_points. |

**Feature flag:** `REPORT_USE_HISTORIAN` (env var, default: `true`). When false, the `/historian/history` and `/historian/archive` endpoints return HTTP 503 with `{"use_legacy": true}`, signaling callers to use per-layout tables instead.

**Timestamp handling:** The `_parse_iso_to_naive_local()` helper converts incoming ISO timestamps (which may be in UTC or have timezone offsets) to naive local-time datetimes. This ensures queries match `tag_history.timestamp`, which is stored as naive local time.

### ReportViewer.jsx

**File:** `Frontend/src/Pages/Reports/ReportViewer.jsx`

**TIME_PRESETS Array:**
```javascript
const TIME_PRESETS = [
  { id: 'live',   label: 'Live' },
  { id: 'day',    label: 'Today' },
  { id: 'week',   label: 'This Week' },
  { id: 'month',  label: 'This Month' },
  { id: 'shift',  label: 'Shift' },
  { id: 'custom', label: 'Custom' },
];
```

**getDateRange(preset) Function:**
- `'day'`: from = start of today (midnight), to = now
- `'week'`: from = most recent Monday at midnight, to = now (ISO week starting Monday)
- `'month'`: from = 1st of current month at midnight, to = now
- All other presets (including `'live'`): returns `null`

Shift and custom ranges are handled separately in the `dateRange` useMemo, not in `getDateRange()`.

**Key State Variables:**
- `timePreset` -- Current time filter selection (`'live'`, `'day'`, `'week'`, `'month'`, `'shift'`, `'custom'`)
- `liveTagValues` -- Tag values from WebSocket/REST polling (live mode)
- `historicalTagValues` -- Aggregated tag values from historian API (historical mode)
- `historicalTagHistory` -- Time-series data for charts (historical mode)
- `historicalLoading` -- Loading state for historical data fetch
- `historicalError` -- Error message from historical data fetch
- `shiftsConfig` -- Shift schedule loaded from `/api/settings/shifts`
- `selectedShift` -- Index of the selected shift in the shift dropdown

**Data Flow by Mode:**
- Live: `useEffect` sets up REST polling every 5 seconds to `/api/live-monitor/tags` and listens for `live_tag_data` WebSocket events
- Historical: `useEffect` fires parallel requests to `/api/historian/by-tags` (grouped by aggregation type) and `/api/historian/time-series` (for chart tags) whenever `timePreset`, `usedTagNames`, or `dateRange` changes

### dynamic_archive_worker.py

**File:** `backend/workers/dynamic_archive_worker.py`

**Archive Cycle:**
1. On startup, calculates seconds until the next hour boundary and sleeps
2. At each hour mark:
   - Sets `archive_hour` to the current hour (truncated to :00:00)
   - For each active monitor:
     - Reads all rows from the live table where `created_at < archive_hour`
     - Aggregates tag values (SUM for flow/weight/rate/produced tags, AVG for all others)
     - Inserts one archive row into `<layout>_monitor_logs_archive`
     - Deletes the processed per-second rows from the live table
     - Updates `last_archive_at` in `dynamic_monitor_registry`
   - For universal historian rows (`layout_id IS NULL` in `tag_history`):
     - Aggregates by tag_id for the previous hour
     - Counter tags: `SUM(value_delta)` | Non-counter tags: `AVG(value)`
     - Inserts into `tag_history_archive`
3. Calculates seconds until the next hour boundary and sleeps again

**Timezone:** Uses `Asia/Dubai` (UTC+4) for all archive timestamps.

**Error handling:** On failure, waits 60 seconds before retrying.

### How Per-Second vs Archive Queries are Chosen

The `/historian/by-tags` endpoint implements a fallback pattern:
1. First, it queries `tag_history` (per-second data) for the requested time range
2. If the query returns no results (data may have been archived/deleted), it automatically falls back to `tag_history_archive` with the same aggregation logic

The `/historian/time-series` endpoint follows the same pattern:
1. First counts rows in `tag_history` for the range
2. If rows exist and count is manageable: returns raw data or downsampled data
3. If no rows exist: queries `tag_history_archive` for hourly data points

This means callers never need to decide which table to query -- the backend handles it transparently.

### Database Tables

**tag_history** (Per-second, universal):
| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| layout_id | INTEGER | NULL for universal recording |
| tag_id | INTEGER | FK to tags table |
| value | DOUBLE PRECISION | Numeric value (booleans as 0/1) |
| value_raw | DOUBLE PRECISION | Raw value before processing |
| value_delta | DOUBLE PRECISION | Change since last reading |
| is_counter | BOOLEAN | Whether this is a counter/totalizer tag |
| quality_code | VARCHAR(20) | GOOD, BAD, STALE, COMM_ERROR |
| timestamp | TIMESTAMP | When the value was recorded |
| order_name | TEXT | Associated order (if any) |

**tag_history_archive** (Hourly aggregated):
| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| layout_id | INTEGER | NULL for universal archives |
| tag_id | INTEGER | FK to tags table |
| value | DOUBLE PRECISION | Aggregated value (AVG or SUM depending on tag type) |
| value_raw | DOUBLE PRECISION | Raw aggregated value |
| value_delta | DOUBLE PRECISION | Summed delta for counter tags |
| is_counter | BOOLEAN | Whether this is a counter tag |
| quality_code | VARCHAR(20) | Quality code |
| archive_hour | TIMESTAMP | The hour this archive represents |
| order_name | TEXT | Associated order (if any) |

**Per-Layout Archive Table** (`<layout_name>_monitor_logs_archive`):
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| layout_id | INTEGER | References live_monitor_layouts |
| order_name | TEXT | Order name at time of archive |
| tag_values | JSONB | Aggregated tag values |
| computed_values | JSONB | Aggregated computed values |
| active_sources | JSONB | Active source summary |
| per_bin_weights | JSONB | Per-bin weight totals |
| line_running | BOOLEAN | Whether line was running at archive time |
| archive_hour | TIMESTAMP | The hour this archive represents |
| created_at | TIMESTAMP | When the archive row was created |

### JSONB Query Patterns

Tag values and computed values are stored as JSONB in the per-layout tables. The historian endpoints (`/historian/by-tags` and `/historian/time-series`) query from the normalized `tag_history` and `tag_history_archive` tables instead, which store one row per tag per timestamp. This avoids complex JSONB extraction queries for historical reporting.

The per-layout JSONB tables (`<layout>_monitor_logs` and `<layout>_monitor_logs_archive`) are primarily used by the legacy layout-specific endpoints (`/historian/history` and `/historian/archive`) which filter by `layout_id`.

---

Previous: [10-LIVE-MONITORING](10-LIVE-MONITORING.md) | Next: [12-SHIFTS-AND-ORDERS](12-SHIFTS-AND-ORDERS.md)
