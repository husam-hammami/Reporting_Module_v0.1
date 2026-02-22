# 08 - Report Templates and Seeding

Previous: [07-EMULATOR](07-EMULATOR.md) | Next: [09-REPORT-BUILDER](09-REPORT-BUILDER.md)

---

## What Are Report Templates?

Report templates are pre-built report layouts that serve as starting points for new reports. Instead of building a 48-widget Grain Silos dashboard from scratch, you load the template and customize it. Templates define widget types, grid positions, tag bindings, threshold colors, and visual configuration -- everything needed to render a complete report.

Templates are stored in two places:

- **Database** (`report_builder_templates` table) -- the canonical source for running deployments
- **JSON files** (`docs/report-templates/*.json`) -- version-controlled, portable definitions that seed the database

---

## Available Templates

### Grain Silos

The primary template, modeling a grain terminal with **48 widgets** across **10 sections**:

| Section | Widgets | Widget Types | Tags Used |
|---------|---------|-------------|-----------|
| Intake Metrics | 6 KPI cards | `kpi` | `Intake_Today`, `Intake_Week`, `Intake_Month`, `Outload_Ship`, `Outload_Truck`, `Outload_Rail` |
| Balance & Trend | 2 KPIs + 1 chart | `kpi`, `chart` | `Balance_Tons`, `Queue_Status`, plus intake/outload series |
| Silo Status | 8 silo widgets + 1 table + 1 chart | `silo`, `table`, `chart` | `Silo1_Level` through `Silo8_Level`, `Silo1_Capacity` through `Silo8_Capacity`, `Silo1_Tons` through `Silo8_Tons` |
| Grain Quality | 3 KPIs + 1 table + 1 chart | `kpi`, `table`, `chart` | `Moisture_Avg`, `Aeration_Status`, `Quality_Deviation`, `Silo1_Temp` through `Silo8_Temp` |
| Equipment | 1 table + 1 bar chart | `table`, `barchart` | `Conveyor1_Status`, `Conveyor1_Throughput`, `Elevator1_Running`, `Equipment_Downtime_Pct`, `Equipment_Utilization_Pct` |
| Energy & Utilities | 4 KPIs + 1 table + 1 chart | `kpi`, `table`, `chart` | `Power_Intake_Area`, `Power_Storage_Area`, `Energy_Per_Ton`, `Peak_Power_kW` |
| Alarms & Ops KPI | 3 KPIs + 3 stats + 1 table + 2 stats | `kpi`, `stat`, `table` | `Alarm_Active_Count`, `Alarm_Critical_Count`, `Alarm_Response_Time_Avg`, `Tons_Per_Day`, `Terminal_Availability_Pct`, `OEE_Style`, `Downtime_Pct`, `Losses_Pct` |
| Maintenance | 1 table | `table` | `Running_Hours_Main`, `StartStop_Cycles`, `Abnormal_Load_Count`, `Early_Warning_Count` |
| Section Headers | 5 text labels | `text` | (none -- static labels) |

---

## Template Anatomy

A template JSON file contains three top-level fields and a nested `layout_config` object that holds the complete widget layout.

### Top-Level Structure

```json
{
  "name": "Grain_Silos",
  "description": "Grain Terminal: Intake, Silo Status, Quality, Equipment, ...",
  "is_default": true,
  "layout_config": {
    "schemaVersion": 2,
    "widgets": [ ... ],
    "grid": { "cols": 12, "rowHeight": 40 }
  }
}
```

| Field | Purpose |
|-------|---------|
| `name` | Unique template identifier, used for upsert matching |
| `description` | Human-readable summary shown in the template picker |
| `is_default` | Whether this template auto-loads for new reports |
| `layout_config.schemaVersion` | Currently `2` -- triggers migration logic if lower |
| `layout_config.widgets` | Array of widget objects (the core content) |
| `layout_config.grid` | Canvas configuration: `cols` (default 12) and `rowHeight` (default 40px) |

### Widget Object Structure

Every widget in the `widgets[]` array follows this shape:

```json
{
  "id": "w-grain-1-c9cffe",
  "type": "kpi",
  "x": 0, "y": 0, "w": 2, "h": 1,
  "config": {
    "title": "Intake Today",
    "dataSource": {
      "type": "tag",
      "tagName": "Intake_Today",
      "formula": "",
      "groupTags": [],
      "aggregation": "last"
    },
    "unit": "t",
    "decimals": 1,
    "showSparkline": false,
    "thresholds": [],
    "color": "#06b6d4",
    "showCard": true,
    "align": "left",
    "showTitle": true
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique widget identifier (e.g., `w-grain-1-c9cffe`) |
| `type` | Widget renderer type: `kpi`, `chart`, `table`, `silo`, `stat`, `text`, `barchart`, `gauge`, `image` |
| `x`, `y` | Grid position (column, row). 12-column grid, 0-indexed. |
| `w`, `h` | Grid size (width in columns, height in rows). Each row is 40px tall. |
| `config` | Widget-specific settings -- varies by type |

### Example Widgets

**KPI Card** -- Single value with unit:

```json
{
  "id": "w-grain-4-62b735",
  "type": "kpi",
  "x": 6, "y": 0, "w": 2, "h": 1,
  "config": {
    "title": "Outload Ship",
    "dataSource": { "type": "tag", "tagName": "Outload_Ship", "aggregation": "last" },
    "unit": "t",
    "decimals": 1,
    "color": "#06b6d4"
  }
}
```

**Silo Widget** -- 2.5D cylinder visualization with level, capacity, and color zones:

```json
{
  "id": "w-grain-11-55f794",
  "type": "silo",
  "x": 0, "y": 4, "w": 3, "h": 2,
  "config": {
    "title": "S1",
    "dataSource": { "type": "tag", "tagName": "Silo1_Level", "aggregation": "last" },
    "capacityTag": "Silo1_Capacity",
    "tonsTag": "Silo1_Tons",
    "unit": "%",
    "zones": [
      { "from": 0, "to": 70, "color": "#22c55e" },
      { "from": 70, "to": 90, "color": "#fbbf24" },
      { "from": 90, "to": 100, "color": "#f87171" }
    ],
    "showTons": true
  }
}
```

**Line Chart** -- Time-series with multiple series:

```json
{
  "id": "w-grain-9-f4d16c",
  "type": "chart",
  "x": 4, "y": 1, "w": 8, "h": 2,
  "config": {
    "title": "Intake / Outload",
    "chartType": "line",
    "series": [
      { "label": "Intake_Today", "dataSource": { "type": "tag", "tagName": "Intake_Today", "aggregation": "avg" } },
      { "label": "Outload_Ship", "dataSource": { "type": "tag", "tagName": "Outload_Ship", "aggregation": "avg" } }
    ],
    "timeRange": "1h",
    "showLegend": true,
    "showGrid": true
  }
}
```

### The `dataSource` Object

The `dataSource` is the v2 schema model for connecting a widget to data:

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `tag`, `formula`, `group` | Where the data comes from |
| `tagName` | string | Tag name for `type: "tag"` (e.g., `"Intake_Today"`) |
| `formula` | string | Expression for `type: "formula"` |
| `groupTags` | string[] | Array of tag names for `type: "group"` |
| `aggregation` | `last`, `avg`, `sum`, `min`, `max`, `count`, `delta` | How multiple values are reduced to one |

---

## Schema Versioning

### Current Version: 2

The system supports automatic migration from schema v1 to v2. This is handled by `templateSchema.js` (`Frontend/src/Pages/ReportBuilder/state/templateSchema.js`).

### What Changed in v2

| Aspect | v1 | v2 |
|--------|----|----|
| Tag binding | Flat `config.tagName` field | Nested `config.dataSource` object |
| Chart series | `config.tags[]` array of `{ tagName, displayName }` | `config.series[]` with nested `dataSource` per series |
| Table columns | Had legacy `tableRows` field | Column-only model, `tableRows` removed |
| Schema marker | No `schemaVersion` field (or `1`) | `schemaVersion: 2` |

### Migration Logic

When a template is loaded, `loadAndMigrateConfig()` runs:

1. **Version check** -- If `schemaVersion < 2`, runs `migrateV1toV2()`
2. **Flat tagName migration** -- If a widget has `config.tagName` but no `config.dataSource`, it creates the dataSource object automatically
3. **Chart tags migration** -- If a widget has `config.tags[]` but no `config.series`, it converts to the series model
4. **Widget repair** -- `repairWidget()` ensures every widget has valid `id`, `type`, `x`, `y`, `w`, `h` fields with safe defaults
5. **Table cleanup** -- Removes legacy `tableRows`, ensures `tableColumns` have `aggregation` and `format` defaults
6. **Threshold validation** -- Ensures `thresholds` is always an array

If migration fails entirely, the system returns `EMPTY_LAYOUT_CONFIG` rather than crashing the canvas.

---

## Seeding the System

Seeding populates the database with tags, templates, and demo layouts so a fresh deployment has working content immediately.

### Step 1: Seed Tags

```bash
python backend/tools/setup/seed_demo_tags.py
```

This script seeds approximately 160 tags into the `tags` table:

- **~84 PLC tags** -- Copied from `INTEGRATED_OFFSETS` in `plc_data_source.py` (DB199 FCL registers, DB2099 report/flow registers, etc.)
- **~76 Manual (emulator) tags** -- Copied from `EmulatorContext.jsx` `TAG_PROFILES` (silo levels, intake metrics, quality indicators, equipment status, energy, alarms, maintenance)

These tags cover every `tagName` referenced by the Grain Silos template. The script uses `ON CONFLICT (tag_name) DO UPDATE SET ...` so it is idempotent and safe to re-run.

### Step 2: Seed Templates

```bash
# Seed all templates from docs/report-templates/
python backend/tools/setup/seed_report_templates.py

# Seed a single template
python backend/tools/setup/seed_report_templates.py docs/report-templates/Grain_Silos.json
```

This script:

1. Reads all `.json` files from `docs/report-templates/` (or a specific file passed as argument)
2. Validates each file has `name` and `layout_config` fields
3. Upserts into the `report_builder_templates` table -- matching by `name`
   - If the template exists: updates `layout_config`, `description`, `is_active`, `is_default`
   - If it does not exist: inserts a new row
4. Reports widget count and action taken for each template

The script is **idempotent** -- running it multiple times updates existing templates rather than creating duplicates.

### Step 3: Seed Demo Layout (Live Monitor)

```bash
python backend/tools/setup/seed_demo_layout.py
```

This creates a **"Grain Terminal Demo"** layout in the Live Monitor system. It:

1. Inserts (or updates) a row in `live_monitor_layouts` with sections for Silo Status, Process, and Energy
2. Creates dynamic monitor tables (live + archive) via `create_dynamic_monitor_tables()`
3. Registers the monitor in `dynamic_monitor_registry`

**Important**: This uses the older **Live Monitor section/column model** (sections with `section_type: "table"` or `"kpi_cards"` containing column arrays), **not** the Report Builder grid model. It is a separate system that still works but follows a different architecture.

### Frontend Seed

The frontend also has an auto-seeding mechanism in `useReportBuilder.js`:

```
Frontend/src/Pages/ReportBuilder/seed/grainSilosTemplate.js
```

When `SEED_DEMO_REPORTS` is `true` (currently hardcoded to `true`), the hook checks on first load:

1. Whether the `hercules_report_builder_grain_silos_seeded` localStorage flag is set
2. If not, whether any template named `Grain_Silos` already exists in localStorage
3. If no Grain Silos template exists, it calls `buildGrainSilosTemplate()` to generate the full 48-widget template programmatically and writes it to localStorage

This ensures the Report Builder has a working template even without a backend database connection, which is useful during frontend-only development.

---

## Creating Your Own Template

### From the Report Builder UI

1. Open the Report Builder and create a new report
2. Drag and drop widgets from the toolbox onto the canvas
3. Configure each widget's data source, display options, and thresholds
4. Save the report

### Exporting and Sharing

1. Build your report in the Report Builder (arrange widgets, configure data sources)
2. Export as JSON (or manually construct the JSON following the template anatomy above)
3. Save to `docs/report-templates/YourTemplate.json`
4. Run the seeding script to load into the database:

```bash
python backend/tools/setup/seed_report_templates.py docs/report-templates/YourTemplate.json
```

5. Share the JSON file with other deployments -- they run the same seed command to import it

### Template JSON Requirements

Your JSON file must include at minimum:

```json
{
  "name": "Your_Template_Name",
  "description": "Description shown in the template picker",
  "is_default": false,
  "layout_config": {
    "schemaVersion": 2,
    "widgets": [ ... ],
    "grid": { "cols": 12, "rowHeight": 40 }
  }
}
```

The `name` field is used as the unique key for upsert operations. Choose a name that will not conflict with existing templates.

---

## Audit Status

Current compatibility of all seeding components:

| Component | Status | Notes |
|-----------|--------|-------|
| `docs/report-templates/Grain_Silos.json` | Fully compatible | Schema v2, 48 widgets, all dataSource objects present |
| `Frontend/.../seed/grainSilosTemplate.js` | Fully compatible | Actively imported by `useReportBuilder`, generates v2 widgets via `CURRENT_SCHEMA_VERSION` |
| `backend/tools/setup/seed_report_templates.py` | Fully compatible | Correct DB schema (upserts to `report_builder_templates`), idempotent |
| `backend/tools/setup/seed_demo_tags.py` | Fully compatible | All ~160 tags match template tag references |
| `backend/tools/setup/seed_demo_layout.py` | Older architecture | Uses Live Monitor section/column model, not Report Builder grid. Still works but is a separate system. |

---

Previous: [07-EMULATOR](07-EMULATOR.md) | Next: [09-REPORT-BUILDER](09-REPORT-BUILDER.md)
