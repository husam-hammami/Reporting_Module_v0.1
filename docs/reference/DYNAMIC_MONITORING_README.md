# Dynamic Monitoring System

## Overview

The dynamic monitoring system allows you to create custom reports (like MIL-B) that automatically:
- Store data every second in a database table
- Archive data every hour into an archive table
- Track orders based on status codes (1 = start, 0 = stop)

## How It Works

### 1. Create a Layout

Create a layout in the Admin UI (Report Config page) with your desired sections and columns.

### 2. Configure Order Tracking (Optional)

When creating or editing a layout, you can configure order tracking:
- **Order Status Tag Name**: The tag that indicates order status (e.g., `job_status`, `OrderActive`)
- **Order Prefix**: Prefix for order names (e.g., `MIL-B`, `FCL`, `SCL`)
- **Start Value**: Status value that starts an order (default: 1)
- **Stop Value**: Status value that stops an order (default: 0)

### 3. Publish the Layout

Click the "Publish" button on the layout. This will:
- Create two database tables:
  - `{layout_name}_monitor_logs` - Stores data every second
  - `{layout_name}_monitor_logs_archive` - Stores hourly aggregated data
- Register the layout in the monitoring system
- Start storing data immediately

### 4. Data Storage

**Every Second:**
- All tag values are read from PLC
- Data is stored in the live table regardless of status code
- If order tracking is configured:
  - Status = 1: Creates a new order (e.g., MIL-B1, MIL-B2)
  - Status = 0: Completes the current order
  - Status = 2, 3, 4, etc.: Ignored (data still stored)

**Every Hour:**
- Data from the previous hour is aggregated
- Aggregated data is stored in the archive table
- Original second-by-second data is deleted from the live table

## Database Tables

### Live Table Structure
```sql
CREATE TABLE {layout_name}_monitor_logs (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL,
    order_name TEXT,              -- NULL if no active order
    tag_values JSONB NOT NULL,    -- All tag values
    computed_values JSONB,
    active_sources JSONB,
    line_running BOOLEAN,         -- True if order exists
    created_at TIMESTAMP
);
```

### Archive Table Structure
```sql
CREATE TABLE {layout_name}_monitor_logs_archive (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL,
    order_name TEXT,
    tag_values JSONB NOT NULL,    -- Aggregated tag values
    computed_values JSONB,
    active_sources JSONB,
    per_bin_weights JSONB,
    line_running BOOLEAN,
    archive_hour TIMESTAMP,       -- Hour this archive represents
    created_at TIMESTAMP
);
```

## API Endpoints

### Publish Layout
```
POST /api/live-monitor/layouts/<layout_id>/publish
```

Response:
```json
{
    "status": "success",
    "message": "Layout 'MIL-B' published successfully",
    "live_table": "mil_b_monitor_logs",
    "archive_table": "mil_b_monitor_logs_archive"
}
```

### Update Layout (with order tracking)
```
PUT /api/live-monitor/layouts/<layout_id>
```

Request body:
```json
{
    "layout_name": "MIL-B",
    "order_status_tag_name": "job_status",
    "order_prefix": "MIL-B",
    "order_start_value": 1,
    "order_stop_value": 0
}
```

## Order Tracking Logic

- **Status Code = 1**: Start a new order
  - Creates order name: `{order_prefix}{next_number}` (e.g., MIL-B1)
  - Sets `line_running = TRUE`
  - Stores order in `dynamic_orders` table

- **Status Code = 0**: Complete current order
  - Marks order as completed
  - Sets `line_running = FALSE`
  - Updates `dynamic_orders` table with end time

- **Status Code = 2, 3, 4, etc.**: Ignored
  - No order action taken
  - Data is still stored every second

## Example: Creating MIL-B Report

1. Go to Report Config page
2. Create new layout named "MIL-B"
3. Add sections (Table, KPI, Chart) as needed
4. Configure order tracking:
   - Order Status Tag: `job_status`
   - Order Prefix: `MIL-B`
   - Start Value: `1`
   - Stop Value: `0`
5. Click "Publish"
6. System automatically:
   - Creates `mil_b_monitor_logs` table
   - Creates `mil_b_monitor_logs_archive` table
   - Starts storing data every second
   - Archives data every hour
   - Tracks orders (MIL-B1, MIL-B2, etc.)

## Monitoring

The system runs two background workers:

1. **Dynamic Monitor Worker**: Stores data every second
2. **Dynamic Archive Worker**: Archives data every hour

Both workers start automatically when the Flask app starts.

## Notes

- Data is stored **every second** regardless of status code
- Status codes are **only** used for order tracking
- Order names are automatically generated sequentially
- Archive tables store aggregated (summed/averaged) data
- All tag values are stored in JSONB format for flexibility

