# API Endpoints Reference

> Reporting Module v0.1 -- Complete REST API and WebSocket reference.
> All API routes are prefixed with `/api` unless otherwise noted.
> Base URL: `http://localhost:5000`

---

## 1. Authentication

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| POST | `/login` | Authenticate user, returns session cookie + Bearer token | No | -- |
| POST | `/logout` | End session | Yes | Any |
| GET | `/check-auth` | Check if current session is authenticated | No | -- |

**POST /login**

Request body:
```json
{
  "username": "admin",
  "password": "secret"
}
```

Response (200):
```json
{
  "message": "Login successful",
  "user_data": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "auth_token": "<bearer-token>"
  }
}
```

**Authentication methods:**
- Session cookie (set automatically on login)
- Bearer token: send `Authorization: Bearer <auth_token>` header for cross-origin requests
- Token validity: 7 days

---

## 2. Tags

All tag endpoints are on the `tags_bp` blueprint, mounted at `/api`.

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/tags` | List all tags | No | -- |
| POST | `/api/tags` | Create a new tag | No | -- |
| GET | `/api/tags/<tag_name>` | Get single tag by name | No | -- |
| PUT | `/api/tags/<tag_name>` | Update a tag | No | -- |
| DELETE | `/api/tags/<tag_name>` | Soft-delete a tag (sets is_active=false) | No | -- |
| GET | `/api/tags/<tag_name>/test` | Test-read a PLC tag value | No | -- |
| POST | `/api/tags/get-values` | Get current values for multiple tags | No | -- |
| POST | `/api/tags/bulk-import` | Bulk import tags from JSON | No | -- |
| GET | `/api/tags/export` | Export all tags to JSON | No | -- |
| POST | `/api/tags/seed` | Seed demo tags, groups, and mappings | No | -- |

**GET /api/tags**

Query parameters:
- `source_type` (optional): Filter by source type (`PLC`, `Formula`, `Mapping`, `Manual`)
- `is_active` (optional, default `true`): Filter by active status

Response fields per tag: `id`, `tag_name`, `display_name`, `source_type`, `db_number`, `offset`, `data_type`, `bit_position`, `string_length`, `byte_swap`, `unit`, `scaling`, `decimal_places`, `formula`, `mapping_name`, `value_formula`, `description`, `is_active`, `is_bin_tag`, `activation_tag_name`, `activation_condition`, `activation_value`, `plc_address`, `created_at`, `updated_at`.

**POST /api/tags**

Request body:
```json
{
  "tag_name": "Temperature_1",
  "display_name": "Temperature Sensor 1",
  "source_type": "PLC",
  "plc_address": "DB2099.0",
  "data_type": "REAL",
  "byte_swap": false,
  "unit": "C",
  "scaling": 1.0,
  "decimal_places": 1,
  "description": "Main process temperature",
  "is_active": true,
  "is_bin_tag": false,
  "activation_tag_name": null,
  "activation_condition": null,
  "activation_value": null,
  "value_formula": null
}
```

Valid `data_type` values: `BOOL`, `INT`, `DINT`, `REAL`, `STRING`.
Valid `source_type` values: `PLC`, `Formula`, `Mapping`, `Manual`.

**POST /api/tags/get-values**

Request body:
```json
{
  "tag_names": ["Temperature_1", "Pressure_1", "Flow_Rate_1"]
}
```

Response:
```json
{
  "status": "success",
  "tag_values": {
    "Temperature_1": 72.5,
    "Pressure_1": 3.21,
    "Flow_Rate_1": 15.8
  }
}
```

Bin activation filtering is applied automatically: if a tag has `is_bin_tag=true` and an `activation_tag_name`, the activation condition is evaluated and inactive bins return value `0`.

---

## 3. Tag Groups

All tag group endpoints are on the `tag_groups_bp` blueprint, mounted at `/api`.

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/tag-groups` | List all tag groups with member tags | No | -- |
| POST | `/api/tag-groups` | Create a tag group | No | -- |
| GET | `/api/tag-groups/<id>` | Get single group with tags | No | -- |
| PUT | `/api/tag-groups/<id>` | Update a tag group | No | -- |
| DELETE | `/api/tag-groups/<id>` | Soft-delete a group (sets is_active=false) | No | -- |
| POST | `/api/tag-groups/<id>/tags` | Add tags to a group | No | -- |
| DELETE | `/api/tag-groups/<id>/tags/<tag_id>` | Remove a tag from a group | No | -- |

**GET /api/tag-groups**

Query parameters:
- `is_active` (optional, default `true`): Filter by active status

Response includes nested `tags` array and `tag_count` for each group.

**POST /api/tag-groups**

Request body:
```json
{
  "group_name": "Process Sensors",
  "description": "Core process measurement sensors",
  "display_order": 0,
  "is_active": true,
  "tag_names": ["Temperature_1", "Pressure_1"]
}
```

**POST /api/tag-groups/<id>/tags**

Request body:
```json
{
  "tag_names": ["Flow_Rate_1", "Level_Tank_1"]
}
```

---

## 4. Bin Mapping

Bins and materials tables exist in the database schema but CRUD API endpoints are not yet exposed in the current codebase (v0.1). The tables (`bins`, `materials`) are created by the migration `create_bins_and_materials_tables.sql`.

Bin activation logic is handled through the tags system:
- Tags with `is_bin_tag=true` have activation conditions
- Activation conditions: `equals`, `not_equals`, `true`, `false`, `greater_than`, `less_than`
- See the Tags section for `/api/tags/get-values` which applies bin activation filtering

---

## 5. Report Builder

All report builder endpoints are on the `report_builder_bp` blueprint, mounted at `/api`.

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/report-builder/templates` | List all templates | No | -- |
| POST | `/api/report-builder/templates` | Create a template | No | -- |
| GET | `/api/report-builder/templates/<id>` | Get single template | No | -- |
| PUT | `/api/report-builder/templates/<id>` | Update a template | No | -- |
| DELETE | `/api/report-builder/templates/<id>` | Delete a template (hard delete) | No | -- |
| POST | `/api/report-builder/templates/<id>/duplicate` | Duplicate a template | No | -- |

**POST /api/report-builder/templates**

Request body:
```json
{
  "name": "Daily Production Report",
  "description": "Summary of daily production metrics",
  "layout_config": {
    "widgets": [],
    "grid": {
      "cols": 12,
      "rowHeight": 60
    }
  }
}
```

**PUT /api/report-builder/templates/<id>**

Accepts any subset of: `name`, `description`, `thumbnail`, `is_active`, `is_default`, `layout_config`.

The `layout_config` field is a JSONB column. See the Database Schema document for the `layout_config` structure.

---

## 6. Live Monitor

All live monitor endpoints are on the `live_monitor_bp` blueprint, mounted at `/api`.

### Layout Management

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/live-monitor/layouts` | List all layouts | No | -- |
| POST | `/api/live-monitor/layouts` | Create a layout | No | -- |
| GET | `/api/live-monitor/layouts/<id>` | Get layout with sections and columns | No | -- |
| PUT | `/api/live-monitor/layouts/<id>` | Update a layout | No | -- |
| DELETE | `/api/live-monitor/layouts/<id>` | Delete a layout (hard delete) | No | -- |
| GET | `/api/live-monitor/layouts/<id>/config` | Get full layout config (JSONB) | No | -- |
| PUT | `/api/live-monitor/layouts/<id>/config` | Save full layout config (JSONB) | No | -- |
| POST | `/api/live-monitor/layouts/<id>/publish` | Publish layout (create dynamic tables, start monitoring) | No | -- |
| POST | `/api/live-monitor/layouts/<id>/unpublish` | Unpublish layout (stop monitoring) | No | -- |

### Live Data

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/live-monitor/tags` | Get current live values for all active tags | No | -- |
| GET | `/api/live-monitor/predefined` | Get predefined report (emulator offsets) | No | -- |

### Sections and Columns

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| POST | `/api/live-monitor/layouts/<id>/sections` | Create a section (Table or KPI) | No | -- |
| POST | `/api/live-monitor/sections/<id>/columns` | Add column to a Table section | No | -- |
| POST | `/api/live-monitor/sections/<id>/kpi-cards` | Add KPI card to a KPI section | No | -- |

**GET /api/live-monitor/layouts**

Query parameters:
- `is_active` (optional): Filter by active status. If omitted, returns all layouts.

**GET /api/live-monitor/tags**

Query parameters:
- `tags` (optional): Comma-separated tag names to read. If omitted, reads all active tags.

**POST /api/live-monitor/layouts**

Request body:
```json
{
  "layout_name": "Grain Terminal Demo",
  "description": "Main production monitoring layout",
  "is_active": true,
  "is_default": false,
  "order_status_tag_name": "OrderStatus",
  "order_prefix": "ORD",
  "order_start_value": 1,
  "order_stop_value": 0,
  "include_line_running_tag": true,
  "line_running_tag_name": "Line_Running"
}
```

**POST /api/live-monitor/layouts/<id>/sections**

Request body:
```json
{
  "section_name": "Process Sensors",
  "section_type": "Table",
  "display_order": 0,
  "is_active": true,
  "table_config": {
    "tag_group_id": 1,
    "row_mode": "Dynamic",
    "refresh_interval": 1
  }
}
```

Valid `section_type` values: `Table`, `KPI`.

**POST /api/live-monitor/layouts/<id>/publish**

Publishing a layout:
1. Creates dynamic monitoring tables (`<name>_monitor_logs`, `<name>_archive`)
2. Registers in `dynamic_monitor_registry`
3. Sets `is_published = TRUE` and `monitoring_enabled = TRUE`
4. Background workers begin recording data

---

## 7. Historical Data

All historian endpoints are on the `historian_bp` blueprint, mounted at `/api`.

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/historian/history` | Raw per-sample tag history (layout-based) | No | -- |
| GET | `/api/historian/archive` | Hourly aggregated history (layout-based) | No | -- |
| GET | `/api/historian/by-tags` | Tag-name-based query (no layout_id required) | No | -- |
| GET | `/api/historian/time-series` | Time-series arrays for chart rendering | No | -- |

**GET /api/historian/history**

Query parameters:
- `layout_id` (required): Layout ID
- `from` (required): ISO timestamp (start of range)
- `to` (required): ISO timestamp (end of range)
- `tag_ids` (optional): Comma-separated tag IDs

Controlled by `REPORT_USE_HISTORIAN` environment variable (default `true`). Returns 503 when disabled to signal callers to use legacy layout tables.

**GET /api/historian/by-tags**

Query parameters:
- `tag_names` (required): Comma-separated tag names
- `from` (required): ISO timestamp
- `to` (required): ISO timestamp
- `aggregation` (optional, default `last`): One of `last`, `avg`, `min`, `max`, `sum`, `delta`, `count`

Response:
```json
{
  "data": {
    "Temperature_1": 72.5,
    "Pressure_1": 3.21
  },
  "source": "historian",
  "tags_requested": 2,
  "tags_found": 2
}
```

Falls back to `tag_history_archive` if no data found in `tag_history`.

**GET /api/historian/time-series**

Query parameters:
- `tag_names` (required): Comma-separated tag names
- `from` (required): ISO timestamp
- `to` (required): ISO timestamp
- `max_points` (optional, default `500`, max `5000`): Maximum data points per tag

Response:
```json
{
  "data": {
    "Temperature_1": [
      {"t": 1708300000000, "v": 72.5},
      {"t": 1708300001000, "v": 72.6}
    ]
  },
  "source": "historian_ts"
}
```

Auto-downsamples when data exceeds `max_points` using time-bucket averaging.

---

## 8. Orders

Order tracking is integrated into the Live Monitor layout system. Orders are tracked per layout via the `dynamic_orders` table.

Configuration is done through layout fields:
- `order_status_tag_name`: PLC tag that signals order start/stop
- `order_prefix`: Prefix for auto-generated order names (e.g., `ORD`)
- `order_start_value`: Tag value that starts a new order (default 1)
- `order_stop_value`: Tag value that stops the current order (default 0)

Order data is recorded automatically by the `dynamic_monitor_worker` when a published layout has order tracking configured.

No dedicated REST API endpoints exist for orders in v0.1. Order history is stored in the `dynamic_orders` table and can be queried through the historian endpoints.

---

## 9. Settings

Settings endpoints are defined directly in `app.py` (not in a blueprint).

### Demo Mode

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/settings/demo-mode` | Get current demo mode status | No | -- |
| POST | `/api/settings/demo-mode` | Enable/disable demo mode | No | -- |

POST body: `{ "enabled": true }`

### PLC Configuration

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/settings/plc-config` | Get PLC connection settings | No | -- |
| POST | `/api/settings/plc-config` | Set PLC IP, rack, slot | No | -- |

POST body: `{ "ip": "192.168.23.11", "rack": 0, "slot": 3 }`

### SMTP / Email

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/settings/smtp-config` | Get SMTP config (password masked) | Yes | Any |
| POST | `/api/settings/smtp-config` | Save SMTP config | Yes | Any |
| POST | `/api/settings/smtp-test` | Send a test email | Yes | Any |

POST test body: `{ "to_email": "test@example.com" }`

### Shifts

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/settings/shifts` | Get shift schedule config | Yes | Any |
| POST | `/api/settings/shifts` | Save shift schedule config | Yes | Any |

### System Status

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/settings/system-status` | Combined status (demo mode + PLC config) | No | -- |

### Emulator

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/settings/emulator-offsets` | Get all emulator offsets with current values | No | -- |
| GET | `/api/settings/emulator-custom-offsets` | Get custom emulator offsets | No | -- |
| POST | `/api/settings/emulator-custom-offsets` | Add a custom emulator offset | No | -- |
| DELETE | `/api/settings/emulator-custom-offsets` | Remove a custom emulator offset | No | -- |

POST body for custom offset:
```json
{
  "db_number": 2099,
  "offset": 100,
  "data_type": "Real",
  "label": "Custom Sensor",
  "initial_value": 0.0,
  "sim_base": 25.0,
  "sim_amplitude": 5.0
}
```

DELETE query params: `?db_number=2099&offset=100`

---

## 10. Users

User management endpoints are defined directly in `app.py`.

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/users` | List all users (id, username, role) | Yes | Any |
| POST | `/add-user` | Create a new user | Yes | admin |
| PUT | `/update-user/<user_id>` | Update username and role | Yes | admin |
| DELETE | `/delete-user/<user_id>` | Delete a user | Yes | admin |
| POST | `/change-password/<user_id>` | Change another user's password | Yes | admin |
| POST | `/change-own-password` | Change your own password | Yes | Any |

**POST /add-user**

Request body:
```json
{
  "username": "operator1",
  "password": "pass123",
  "role": "operator"
}
```

Valid roles: `admin`, `manager`, `operator`.

**PUT /update-user/<user_id>**

Request body:
```json
{
  "username": "operator1",
  "role": "manager"
}
```

Prevents demoting the last admin user.

**POST /change-own-password**

Request body:
```json
{
  "current_password": "old_pass",
  "new_password": "new_pass"
}
```

---

## 11. KPI Engine

All KPI endpoints are on the `kpi_config_bp` blueprint, mounted at `/api`.

| Method | Path | Description | Auth | Role |
|--------|------|-------------|------|------|
| GET | `/api/kpi-config` | List KPI configs (optionally filter by layout) | No | -- |
| POST | `/api/kpi-config` | Create a KPI config with tag mappings | No | -- |
| GET | `/api/kpi-config/<id>` | Get single KPI config with mappings | No | -- |
| PUT | `/api/kpi-config/<id>` | Update a KPI config | No | -- |
| DELETE | `/api/kpi-config/<id>` | Delete a KPI config (cascades mappings + history) | No | -- |
| GET | `/api/kpi-config/values` | Get current (instant) KPI values | No | -- |
| GET | `/api/kpi-config/values/historical` | Get aggregated KPI values over time range | No | -- |

**GET /api/kpi-config**

Query parameters:
- `layout_id` (optional): Filter by layout ID. If omitted, returns all KPI configs.

**POST /api/kpi-config**

Request body:
```json
{
  "kpi_name": "Extraction Rate",
  "layout_id": 1,
  "formula_expression": "(flour / wheat_input) * 100",
  "aggregation_type": "instant",
  "unit": "%",
  "tag_mappings": [
    {"alias_name": "flour", "tag_id": 10},
    {"alias_name": "wheat_input", "tag_id": 11}
  ]
}
```

Valid `aggregation_type` values: `instant`, `sum`, `avg`, `ratio`.

**GET /api/kpi-config/values**

Query parameters:
- `layout_id` (required): Layout ID

**GET /api/kpi-config/values/historical**

Query parameters:
- `layout_id` (required): Layout ID
- `from` (required): ISO timestamp
- `to` (required): ISO timestamp
- `use_archive` (optional, default `true`): Use archive table for aggregation

---

## 12. Debug Endpoints (DEV_MODE only)

These endpoints are only registered when `FLASK_ENV=development` or `DEV_MODE=1`.

| Method | Path | Description |
|--------|------|-------------|
| GET, POST | `/test` | Health check -- returns `{ "status": "ok" }` |
| GET | `/debug/routes` | List all registered Flask routes |
| GET, POST | `/debug/test-layouts` | Test that live monitor routes are accessible |

---

## WebSocket Events

The system uses Socket.IO (via Flask-SocketIO with eventlet) for real-time data push.

### Server-to-Client Events

| Event Name | Description | Payload |
|------------|-------------|---------|
| `live_tag_data` | Live PLC tag values broadcast every ~1 second | See below |

**`live_tag_data` payload (normal):**
```json
{
  "timestamp": "2026-02-20T14:30:00.123456",
  "tag_values": {
    "Temperature_1": 72.5,
    "Pressure_1": 3.21,
    "Flow_Rate_1": 15.8
  },
  "plc_connected": true
}
```

**`live_tag_data` payload (error):**
```json
{
  "error": "PLC connection refused",
  "plc_connected": false,
  "timestamp": "2026-02-20T14:30:05.123456"
}
```

### Client-to-Server Events

| Event Name | Description | Payload |
|------------|-------------|---------|
| `connect` | Client connects to WebSocket | (none) |
| `disconnect` | Client disconnects | (none) |
| `message` | Generic message (logged server-side) | any string |

### Connection Details

- Transport: WebSocket (eventlet async mode)
- CORS: Explicit allowed origins (no wildcards)
- Credentials: Supported (`supports_credentials=True`)
- Default port: 5000 (same as HTTP)

---

## Error Response Format

All API endpoints return errors in a consistent JSON format:

```json
{
  "status": "error",
  "message": "Human-readable error description"
}
```

HTTP status codes used:
- `200` -- Success
- `201` -- Created
- `400` -- Bad request (missing/invalid parameters)
- `401` -- Not authenticated
- `403` -- Insufficient permissions (wrong role)
- `404` -- Resource not found
- `500` -- Server error (database error, PLC error)
- `503` -- Service unavailable (historian disabled)

---

## CORS Configuration

Allowed origins (explicit list, no wildcards):
- `http://localhost:5174` / `http://127.0.0.1:5174`
- `http://localhost:5175` / `http://127.0.0.1:5175`
- `http://100.118.31.61:5174` / `http://100.118.31.61:80`

Allowed headers: `Content-Type`, `Authorization`, `ngrok-skip-browser-warning`
Allowed methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
Credentials: Supported
