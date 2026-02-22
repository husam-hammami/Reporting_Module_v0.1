# Database Schema Reference

> Reporting Module v0.1 -- PostgreSQL (17.x)
> Database name: `dynamic_db_hercules` (configurable via `POSTGRES_DB`)

This document describes every table created by the migration scripts and the
dynamic-table creation logic in `dynamic_tables.py`. Column types, constraints,
indexes, and JSONB structures are all taken directly from the SQL source files.

---

## 1. Tag Management

### `tags`

Defines every data point the system can read, compute, or display.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment identifier |
| tag_name | VARCHAR(255) | UNIQUE NOT NULL | Machine-readable tag key (e.g. `FlowRate_2_521WE`) |
| display_name | VARCHAR(255) | | Human-friendly label |
| source_type | VARCHAR(50) | NOT NULL DEFAULT `'PLC'`, CHECK IN (`'PLC'`,`'Formula'`,`'Mapping'`,`'Manual'`) | Where the value originates |
| db_number | INTEGER | | S7 data-block number (PLC tags only) |
| offset | INTEGER | | Byte offset inside the DB (PLC tags only) |
| data_type | VARCHAR(20) | NOT NULL DEFAULT `'REAL'`, CHECK IN (`'BOOL'`,`'INT'`,`'DINT'`,`'REAL'`,`'STRING'`) | PLC data type |
| bit_position | INTEGER | CHECK 0-7 or NULL | Bit index for BOOL tags |
| string_length | INTEGER | DEFAULT 40 | Max length for STRING tags |
| byte_swap | BOOLEAN | DEFAULT false | If true, swap bytes for REAL reads (big-endian is default for Siemens) |
| unit | VARCHAR(20) | | Engineering unit (e.g. `t/h`, `kW`) |
| scaling | DECIMAL(10,4) | DEFAULT 1.0 | Multiplicative scaling factor |
| decimal_places | INTEGER | DEFAULT 2 | Display precision |
| formula | TEXT | | Formula expression (source_type = `'Formula'`) |
| mapping_name | VARCHAR(255) | | Mapping rule name (source_type = `'Mapping'`) |
| value_formula | TEXT | | Post-read transformation formula; use `value` as variable (e.g. `value * 0.277778`) |
| is_counter | BOOLEAN | DEFAULT FALSE | Marks cumulative/counter tags; historian uses `SUM(value_delta)` instead of `AVG(value)` |
| is_bin_tag | BOOLEAN | DEFAULT FALSE | Tag represents a bin requiring activation checking |
| activation_tag_name | VARCHAR(255) | | Tag to check for bin activation (e.g. `flap_1_selected`) |
| activation_condition | VARCHAR(50) | | Condition type: `equals`, `not_equals`, `true`, `false`, `greater_than`, `less_than` |
| activation_value | VARCHAR(255) | | Value to compare against for activation |
| description | TEXT | | Free-text description |
| is_active | BOOLEAN | DEFAULT true | Soft-delete / enable flag |
| created_at | TIMESTAMP | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last modification (trigger-updated) |

**Indexes:**

| Index | Columns | Condition |
|-------|---------|-----------|
| idx_tags_active | is_active | WHERE is_active = true |
| idx_tags_db_offset | db_number, offset | WHERE source_type = 'PLC' |
| idx_tags_source_type | source_type | |
| idx_tags_is_bin_tag | is_bin_tag | WHERE is_bin_tag = true |

**Trigger:** `update_tags_updated_at` -- sets `updated_at = NOW()` before every UPDATE.

---

### `tag_groups`

Logical grouping of tags for display and filtering.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment identifier |
| group_name | VARCHAR(255) | UNIQUE NOT NULL | Display name of the group |
| description | TEXT | | Free-text description |
| display_order | INTEGER | DEFAULT 0 | Sort priority |
| is_active | BOOLEAN | DEFAULT true | Soft-delete flag |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | Trigger-updated |

**Indexes:**

| Index | Columns | Condition |
|-------|---------|-----------|
| idx_tag_groups_active | is_active | WHERE is_active = true |

**Trigger:** `update_tag_groups_updated_at`

---

### `tag_group_members`

Junction table linking tags to groups (many-to-many).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| tag_id | INTEGER | NOT NULL, REFERENCES tags(id) ON DELETE CASCADE | |
| group_id | INTEGER | NOT NULL, REFERENCES tag_groups(id) ON DELETE CASCADE | |
| display_order | INTEGER | DEFAULT 0 | Sort within group |
| created_at | TIMESTAMP | DEFAULT NOW() | |

**Unique constraint:** `(tag_id, group_id)`

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_tag_group_members_tag | tag_id |
| idx_tag_group_members_group | group_id |

---

## 2. Data Storage (Historian)

### `tag_history`

Central plant-wide historian -- one row per tag per timestamp. Stores raw second-level readings from the PLC worker.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| layout_id | INTEGER | REFERENCES live_monitor_layouts(id) ON DELETE CASCADE, **nullable** | Layout context (NULL for universal historian writes) |
| tag_id | INTEGER | NOT NULL, REFERENCES tags(id) ON DELETE RESTRICT | |
| value | DOUBLE PRECISION | NOT NULL | Scaled display value (BOOL stored as 0/1) |
| value_raw | DOUBLE PRECISION | | Pre-scaling raw value |
| value_delta | DOUBLE PRECISION | | Change since previous read (for counter tags) |
| is_counter | BOOLEAN | DEFAULT FALSE | Mirrors tags.is_counter at write time |
| quality_code | VARCHAR(20) | NOT NULL DEFAULT `'GOOD'`, CHECK IN (`'GOOD'`,`'BAD'`,`'STALE'`,`'COMM_ERROR'`) | SCADA-standard quality indicator |
| timestamp | TIMESTAMP | NOT NULL DEFAULT NOW() | Reading time |
| order_name | TEXT | | Production order active at write time |

**Indexes:**

| Index | Columns | Notes |
|-------|---------|-------|
| uq_tag_history_layout_tag_time | COALESCE(layout_id, 0), tag_id, timestamp | UNIQUE -- deduplication; COALESCE handles NULL layout_id |
| idx_tag_history_layout_tag_time | layout_id, tag_id, timestamp | Composite range query |
| idx_tag_history_timestamp | timestamp | Time-range scans |

---

### `tag_history_archive`

Hourly aggregated historian data for reporting and KPI calculations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| layout_id | INTEGER | REFERENCES live_monitor_layouts(id) ON DELETE CASCADE, **nullable** | |
| tag_id | INTEGER | NOT NULL, REFERENCES tags(id) ON DELETE RESTRICT | |
| value | DOUBLE PRECISION | NOT NULL | Aggregated value (AVG or SUM depending on is_counter) |
| value_raw | DOUBLE PRECISION | | |
| value_delta | DOUBLE PRECISION | | |
| is_counter | BOOLEAN | DEFAULT FALSE | |
| quality_code | VARCHAR(20) | NOT NULL DEFAULT `'GOOD'`, CHECK IN (`'GOOD'`,`'BAD'`,`'STALE'`,`'COMM_ERROR'`) | |
| archive_hour | TIMESTAMP | NOT NULL | Hour bucket start |
| order_name | TEXT | | |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_tag_history_archive_layout_tag_hour | layout_id, tag_id, archive_hour |
| idx_tag_history_archive_hour | archive_hour |

---

## 3. Monitoring

### `live_monitor_layouts`

Top-level layout definition for the live-monitoring dashboard.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_name | VARCHAR(255) | UNIQUE NOT NULL | Display name (e.g. `Grain Terminal Demo`) |
| description | TEXT | | |
| is_active | BOOLEAN | DEFAULT true | |
| is_default | BOOLEAN | DEFAULT false | Show by default on page load |
| config | JSONB | DEFAULT `'{}'` | Full layout configuration (sections, columns, KPI cards) -- see JSONB structures below |
| is_published | BOOLEAN | DEFAULT FALSE | Whether the layout has been published to start monitoring |
| published_at | TIMESTAMP | | Timestamp of last publish |
| monitoring_enabled | BOOLEAN | DEFAULT FALSE | Master switch for data collection |
| order_status_tag_name | VARCHAR(255) | | Tag name that signals order start/stop |
| order_prefix | VARCHAR(50) | DEFAULT `''` | Prefix for auto-generated order names |
| order_start_value | INTEGER | DEFAULT 1 | Tag value that means "order started" |
| order_stop_value | INTEGER | DEFAULT 0 | Tag value that means "order stopped" |
| include_line_running_tag | BOOLEAN | DEFAULT FALSE | Show line running status indicator |
| line_running_tag_name | VARCHAR(255) | | BOOL tag for line status (1 = Running, 0 = Stopped) |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | Trigger-updated |

**Indexes:**

| Index | Columns | Notes |
|-------|---------|-------|
| idx_layouts_active | is_active | WHERE is_active = true |
| idx_layouts_config | config | GIN index for JSONB queries |

**Trigger:** `update_layouts_updated_at`

---

### `live_monitor_sections`

Sections within a layout (Table or KPI card strip).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_id | INTEGER | NOT NULL, REFERENCES live_monitor_layouts(id) ON DELETE CASCADE | |
| section_name | VARCHAR(255) | NOT NULL | |
| section_type | VARCHAR(50) | NOT NULL, CHECK IN (`'Table'`, `'KPI'`) | |
| display_order | INTEGER | DEFAULT 0 | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | Trigger-updated |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_sections_layout | layout_id |
| idx_sections_active | is_active (WHERE is_active = true) |

**Trigger:** `update_sections_updated_at`

---

### `live_monitor_columns`

Column definitions for Table-type sections.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| section_id | INTEGER | NOT NULL, REFERENCES live_monitor_sections(id) ON DELETE CASCADE | |
| column_label | VARCHAR(255) | NOT NULL | Header text |
| source_type | VARCHAR(50) | NOT NULL, CHECK IN (`'Tag'`, `'Formula'`, `'Mapping'`, `'Text'`) | |
| tag_name | VARCHAR(255) | | Tag reference (source_type = `'Tag'`) |
| formula | TEXT | | Formula expression |
| mapping_name | VARCHAR(255) | | Mapping rule name |
| text_value | TEXT | | Static text |
| unit | VARCHAR(20) | | |
| decimals | INTEGER | DEFAULT 2 | |
| alignment | VARCHAR(10) | DEFAULT `'left'`, CHECK IN (`'left'`, `'center'`, `'right'`) | |
| width | INTEGER | | Column width (px or %) |
| display_order | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | Trigger-updated |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_columns_section | section_id |

**Trigger:** `update_columns_updated_at`

---

### `live_monitor_table_config`

Per-section configuration for Table sections.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| section_id | INTEGER | NOT NULL, REFERENCES live_monitor_sections(id) ON DELETE CASCADE, UNIQUE | |
| tag_group_id | INTEGER | REFERENCES tag_groups(id) ON DELETE SET NULL | Restrict rows to this group |
| row_mode | VARCHAR(20) | DEFAULT `'Dynamic'`, CHECK IN (`'Dynamic'`, `'Static'`) | |
| refresh_interval | INTEGER | DEFAULT 1 | Update frequency in seconds |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | Trigger-updated |

**Trigger:** `update_table_config_updated_at`

---

### `live_monitor_kpi_config`

KPI card definitions for KPI-type sections.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| section_id | INTEGER | NOT NULL, REFERENCES live_monitor_sections(id) ON DELETE CASCADE | |
| card_label | VARCHAR(255) | NOT NULL | Display title on the card |
| source_type | VARCHAR(50) | NOT NULL, CHECK IN (`'Tag'`, `'Formula'`) | |
| tag_name | VARCHAR(255) | | Tag reference |
| formula | TEXT | | Formula expression |
| unit | VARCHAR(20) | | |
| decimals | INTEGER | DEFAULT 2 | |
| icon | VARCHAR(100) | | Icon name/class |
| color | VARCHAR(50) | | CSS color code |
| size | VARCHAR(20) | DEFAULT `'Medium'`, CHECK IN (`'Small'`, `'Medium'`, `'Large'`) | |
| display_order | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | Trigger-updated |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_kpi_config_section | section_id |

**Trigger:** `update_kpi_config_updated_at`

---

### `dynamic_monitor_registry`

Tracks which layouts have been published and maps them to their dynamically-created live/archive tables.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_id | INTEGER | NOT NULL, REFERENCES live_monitor_layouts(id) ON DELETE CASCADE, UNIQUE | |
| layout_name | VARCHAR(255) | NOT NULL | |
| live_table_name | VARCHAR(255) | NOT NULL UNIQUE | Name of the per-layout live table (e.g. `grain_terminal_demo_monitor_logs`) |
| archive_table_name | VARCHAR(255) | NOT NULL UNIQUE | Name of the per-layout archive table |
| is_active | BOOLEAN | DEFAULT TRUE | Master toggle for the monitor worker |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| last_archive_at | TIMESTAMP | | Timestamp of last successful archive run |

**Indexes:**

| Index | Columns | Condition |
|-------|---------|-----------|
| idx_monitor_registry_active | is_active | WHERE is_active = true |

---

### `dynamic_order_counters`

Maintains an auto-incrementing order counter per layout.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_id | INTEGER | NOT NULL, REFERENCES live_monitor_layouts(id) ON DELETE CASCADE, UNIQUE | |
| layout_name | VARCHAR(255) | NOT NULL | |
| current_counter | INTEGER | DEFAULT 0 | Current sequence number |
| last_order_name | VARCHAR(255) | | Most recently generated order name |
| last_updated | TIMESTAMP | DEFAULT NOW() | |

---

### `dynamic_orders`

Records every production order (start/stop events).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_id | INTEGER | NOT NULL, REFERENCES live_monitor_layouts(id) ON DELETE CASCADE | |
| order_name | VARCHAR(255) | NOT NULL | Generated name (prefix + counter) |
| order_number | INTEGER | NOT NULL | Sequence number within the layout |
| start_time | TIMESTAMP | NOT NULL | |
| end_time | TIMESTAMP | | NULL while order is running |
| status | VARCHAR(50) | DEFAULT `'running'` | `'running'` or `'completed'` |
| duration_seconds | NUMERIC | | Computed on completion |
| created_at | TIMESTAMP | DEFAULT NOW() | |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_dynamic_orders_layout | layout_id |
| idx_dynamic_orders_name | order_name |
| idx_dynamic_orders_status | status |

---

### Dynamic per-layout tables (created at runtime)

When a layout is published, `dynamic_tables.py` creates two tables using the
sanitized layout name. Example: layout "Grain Terminal Demo" produces
`grain_terminal_demo_monitor_logs` and `grain_terminal_demo_monitor_logs_archive`.

#### `{name}_monitor_logs` (live table)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_id | INTEGER | NOT NULL | |
| order_name | TEXT | | Active production order |
| tag_values | JSONB | NOT NULL DEFAULT `'{}'` | All tag readings for this cycle -- see JSONB structures below |
| computed_values | JSONB | DEFAULT `'{}'` | Formula/mapping results |
| active_sources | JSONB | DEFAULT `'{}'` | Which bins/sources are active |
| line_running | BOOLEAN | DEFAULT FALSE | Line status at write time |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `{name}_monitor_logs_archive` (archive table)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| layout_id | INTEGER | NOT NULL | |
| order_name | TEXT | | |
| tag_values | JSONB | NOT NULL DEFAULT `'{}'` | Hourly aggregated tag values |
| computed_values | JSONB | DEFAULT `'{}'` | |
| active_sources | JSONB | DEFAULT `'{}'` | |
| per_bin_weights | JSONB | DEFAULT `'{}'` | Per-bin weight totals for the hour |
| line_running | BOOLEAN | DEFAULT FALSE | |
| archive_hour | TIMESTAMP | NOT NULL | Hour bucket start |
| created_at | TIMESTAMP | DEFAULT NOW() | |

Both tables receive indexes on `layout_id` and on `archive_hour` (archive only).

---

## 4. Report Builder

### `report_builder_templates`

Stores report templates with a Power BI / Grafana-style grid-based widget layout.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| name | VARCHAR(255) | NOT NULL | Template display name |
| description | TEXT | DEFAULT `''` | |
| thumbnail | TEXT | DEFAULT `''` | Base64 or URL for preview image |
| is_active | BOOLEAN | DEFAULT true | |
| is_default | BOOLEAN | DEFAULT false | |
| layout_config | JSONB | DEFAULT (see below) | Full widget grid definition -- see JSONB structures below |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_report_builder_active | is_active |
| idx_report_builder_default | is_default |

---

## 5. Bin / Material Mapping

### `materials`

Master list of raw materials handled by the plant.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| material_name | VARCHAR(100) | NOT NULL | e.g. `Wheat Grain` |
| material_code | VARCHAR(50) | NOT NULL | e.g. `SEMI-115` |
| category | VARCHAR(50) | NOT NULL | e.g. `Grain`, `Additive` |
| is_released | BOOLEAN | DEFAULT TRUE | Whether the material is approved for use |

---

### `bins`

Physical storage bins that hold materials.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| bin_name | VARCHAR(50) | NOT NULL | e.g. `Silo 1` |
| bin_code | VARCHAR(50) | NOT NULL | e.g. `S01` |
| material_id | INTEGER | REFERENCES materials(id) | Currently assigned material |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_bins_material_id | material_id |
| idx_bins_bin_code | bin_code |

---

## 6. KPI Engine

### `kpi_config`

KPI definitions with formula expressions and aggregation rules.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| kpi_name | VARCHAR(255) | NOT NULL | e.g. `Specific Energy Consumption` |
| layout_id | INTEGER | NULL, REFERENCES live_monitor_layouts(id) ON DELETE SET NULL | Optional scope to a layout |
| formula_expression | TEXT | NOT NULL | e.g. `energy / throughput` |
| aggregation_type | VARCHAR(50) | DEFAULT `'instant'`, CHECK IN (`'instant'`, `'sum'`, `'avg'`, `'ratio'`) | |
| unit | VARCHAR(20) | | e.g. `kWh/t` |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| created_by | INTEGER | NULL | User ID of creator |

**Indexes:**

| Index | Columns | Condition |
|-------|---------|-----------|
| idx_kpi_config_layout | layout_id | |
| idx_kpi_config_active | is_active | WHERE is_active = TRUE |

---

### `kpi_tag_mapping`

Maps alias variable names used inside KPI formulas to actual tag IDs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| kpi_id | INTEGER | NOT NULL, REFERENCES kpi_config(id) ON DELETE CASCADE | |
| tag_id | INTEGER | NOT NULL, REFERENCES tags(id) ON DELETE RESTRICT | |
| alias_name | VARCHAR(255) | NOT NULL | Variable name used in formula_expression |

**Unique constraint:** `(kpi_id, alias_name)`

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_kpi_tag_mapping_kpi | kpi_id |
| idx_kpi_tag_mapping_tag | tag_id |

---

### `kpi_history`

Cached KPI calculation results for trends and reports.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| kpi_id | INTEGER | NOT NULL, REFERENCES kpi_config(id) ON DELETE CASCADE | |
| layout_id | INTEGER | NOT NULL | Layout the calculation ran against |
| value | DOUBLE PRECISION | NOT NULL | Computed KPI value |
| timestamp | TIMESTAMP | NOT NULL | Calculation time |
| period_type | VARCHAR(20) | NULL, CHECK IN (`'instant'`, `'hour'`, `'shift'`, `'day'`) or NULL | Aggregation window |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_kpi_history_kpi_time | kpi_id, timestamp |
| idx_kpi_history_layout_time | layout_id, timestamp |

---

## 7. User Management

### `users`

Login credentials and role-based access control.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | |
| username | VARCHAR(255) | NOT NULL UNIQUE | Login name |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| role | VARCHAR(64) | NOT NULL | e.g. `admin`, `operator`, `viewer` |

**Indexes:**

| Index | Columns |
|-------|---------|
| idx_users_username | username |

---

## 8. Legacy / FCL Tables

### `fcl_monitor_logs` and `fcl_monitor_logs_archive`

These tables are referenced by the `add_fcl_receivers_column.sql` migration,
which adds an `fcl_receivers JSONB DEFAULT '[]'` column to both tables. They
are part of the legacy FCL (Finished-product Container Loading) monitoring
system and are created by older application code. The `receiver` column and
`created_at` column also exist on these tables based on the migration's SELECT
statements.

---

## Key JSONB Structures

### `tag_values` (dynamic monitor logs)

Stored in `{name}_monitor_logs.tag_values`. A flat object mapping tag names to
their current numeric (or string) values at the time of the worker write cycle:

```json
{
  "FlowRate_2_521WE": 11.11,
  "Water_Flow": 107.38,
  "C2.EffectivePower": 111.08,
  "C2.Total_Active_Energy": 1039099.0,
  "Silo_1_Level": 72.5
}
```

Keys are `tag_name` values from the `tags` table.
Values are numbers (BOOL tags stored as `0` or `1`).

---

### `computed_values` (dynamic monitor logs)

Stored in `{name}_monitor_logs.computed_values`. Results of Formula and Mapping
column evaluations for the current write cycle:

```json
{
  "Specific_Energy": 9.82,
  "Total_Throughput": 118.49
}
```

Keys are formula/mapping column labels; values are the computed results.

---

### `layout_config` (report_builder_templates)

Stored in `report_builder_templates.layout_config`. Defines the widget grid for
a report template:

```json
{
  "widgets": [
    {
      "id": "widget-1",
      "type": "kpi-card",
      "title": "Flow Rate",
      "x": 0, "y": 0, "w": 3, "h": 2,
      "config": { "tagName": "FlowRate_2_521WE", "unit": "t/h", "decimals": 2 }
    }
  ],
  "grid": {
    "cols": 12,
    "rowHeight": 60
  }
}
```

- `widgets[]` -- array of widget objects positioned on a 12-column grid.
- `grid.cols` -- number of grid columns (always 12).
- `grid.rowHeight` -- pixel height per grid row (default 60).

---

### `config` (live_monitor_layouts)

Stored in `live_monitor_layouts.config`. Full layout configuration including
sections, tables, columns, and KPI cards:

```json
{
  "sections": [
    {
      "section_name": "Silo Status",
      "section_type": "Table",
      "display_order": 0,
      "columns": [
        {
          "column_label": "Level",
          "source_type": "Tag",
          "tag_name": "Silo_1_Level",
          "unit": "%",
          "decimals": 1
        }
      ]
    },
    {
      "section_name": "Energy",
      "section_type": "KPI",
      "display_order": 1,
      "kpi_cards": [
        {
          "card_label": "Power",
          "source_type": "Tag",
          "tag_name": "C2.EffectivePower",
          "unit": "kW",
          "size": "Medium"
        }
      ]
    }
  ]
}
```

The `config` JSONB is the source of truth for section layout when a layout is
published. Sections defined here are merged with rows in
`live_monitor_sections` at runtime (database rows take priority for IDs).

---

## Trigger Function

All tables with an `updated_at` column share the same trigger function:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

Applied to: `tags`, `tag_groups`, `live_monitor_layouts`, `live_monitor_sections`,
`live_monitor_columns`, `live_monitor_table_config`, `live_monitor_kpi_config`.

---

## Migration File Index

| # | File | Purpose |
|---|------|---------|
| 1 | `create_tags_tables.sql` | tags, tag_groups, tag_group_members, live_monitor_layouts, live_monitor_sections, live_monitor_columns, live_monitor_table_config, live_monitor_kpi_config, trigger function |
| 2 | `create_tag_history_tables.sql` | tag_history, tag_history_archive |
| 3 | `create_users_table.sql` | users |
| 4 | `create_report_builder_tables.sql` | report_builder_templates |
| 5 | `create_bins_and_materials_tables.sql` | materials, bins |
| 6 | `create_kpi_engine_tables.sql` | kpi_config, kpi_tag_mapping, kpi_history |
| 7 | `add_dynamic_monitoring_tables.sql` | dynamic_monitor_registry, dynamic_order_counters, dynamic_orders + ALTER live_monitor_layouts |
| 8 | `add_is_counter_to_tags.sql` | ALTER tags ADD is_counter |
| 9 | `add_layout_config_field.sql` | ALTER live_monitor_layouts ADD config JSONB |
| 10 | `add_value_formula_field.sql` | ALTER tags ADD value_formula |
| 11 | `add_bin_activation_fields.sql` | ALTER tags ADD is_bin_tag, activation_tag_name, activation_condition, activation_value |
| 12 | `add_line_running_tag_fields.sql` | ALTER live_monitor_layouts ADD include_line_running_tag, line_running_tag_name |
| 13 | `alter_tag_history_nullable_layout.sql` | ALTER tag_history / tag_history_archive -- make layout_id nullable |
| 14 | `add_fcl_receivers_column.sql` | ALTER fcl_monitor_logs / fcl_monitor_logs_archive ADD fcl_receivers JSONB |

---

See also: [API-ENDPOINTS](API-ENDPOINTS.md) | [TROUBLESHOOTING](TROUBLESHOOTING.md)
