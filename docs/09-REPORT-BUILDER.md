# 09 - Report Builder

Previous: [08-REPORT-TEMPLATES-AND-SEEDING](08-REPORT-TEMPLATES-AND-SEEDING.md) | Next: [10-LIVE-MONITORING](10-LIVE-MONITORING.md)

---

## What Is the Report Builder?

The Report Builder is the visual editor where engineers design report layouts. It is a drag-and-drop canvas where you place widgets (tables, charts, gauges, KPI cards, silo visualizations) and connect them to live tags or tag groups. What you build here is what operators see in the Live Monitor and Report Viewer.

The builder is implemented as a React page at `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx`, using `react-grid-layout` for drag-and-drop positioning.

---

## Report Types

Each report type represents a production line, mill section, or plant area. Examples include:

- **FCL** -- Floor Cleaning Line
- **SCL** -- Sizing & Classification
- **MILA** -- Milling A
- **Grain Silos** -- Grain terminal intake, storage, and outload

Creating a new report type gives it its own set of tags, layouts, and data isolation. Reports are stored in the `report_builder_templates` table and each has its own `layout_config` containing the widget grid.

---

## The Canvas

The Report Builder canvas is based on `react-grid-layout` (the `GridLayout` component) with the following configuration:

| Setting | Value | Description |
|---------|-------|-------------|
| Columns | 12 | The grid has 12 columns, matching standard responsive layouts |
| Row Height | 40px | Each grid row is 40 pixels tall |
| Margin | 8px horizontal, 8px vertical | Gap between adjacent widgets |
| Container Padding | 0px | Outer padding is handled by the page container |
| Compact Type | `null` (free placement) | Widgets do not auto-compact; they stay where you place them |
| Overlap | Allowed | Widgets can overlap if needed |
| Resize Handles | All 8 directions | `s`, `w`, `e`, `n`, `sw`, `nw`, `se`, `ne` |

### Page Modes

The canvas supports two page modes, toggled from the floating toolbar:

- **A4 Mode** (`max-width: 1200px`) -- Constrains the layout to a printable page width
- **Full Dashboard Mode** (`max-width: 100%`) -- Uses the full available width

### Zoom

The canvas supports zoom from 50% to 150% via `transform: scale()`. Keyboard shortcuts:

- `Ctrl+=` / `Ctrl+-` -- Zoom in / out
- `Ctrl+0` -- Reset zoom to 100%
- **Fit to Page** button -- Auto-calculates zoom to fit the viewport

### Drag and Drop

Widgets are added to the canvas in two ways:

1. **Click to add** -- Click a widget type in the toolbox; it is appended at the bottom of the canvas
2. **Drag and drop** -- Drag a widget type from the toolbox onto the canvas; it is placed at the drop coordinates (snapped to grid)

Once on the canvas, widgets can be repositioned by dragging the handle (the `......` grip in the top-left corner) and resized from any edge or corner.

---

## Available Widget Types

The widget type registry is defined in `Frontend/src/Pages/ReportBuilder/widgets/WidgetRenderer.jsx` and the full catalog is in `Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js`.

### Values Category

| Type | Label | Default Size | Description |
|------|-------|-------------|-------------|
| `kpi` | KPI Card | 3 x 2 | Single value display with title, unit, optional sparkline, and color. Use for headline metrics like "Intake Today: 450 t". |
| `gauge` | Gauge | 3 x 3 | Radial/circular progress indicator with min/max range and color zones (red/yellow/green). Use for values with known bounds like motor load percentage. |
| `silo` | Silo | 2 x 4 | Custom 2.5D cylinder visualization showing fill level with color zones. Supports separate tags for level (%), capacity, and tons. Use for grain silo or tank monitoring. |
| `stat` | Stat Panel | 2 x 2 | Large centered number with label. Similar to KPI but with center-aligned layout. Use for summary statistics like OEE, availability, or daily throughput. |

### Trends Category

| Type | Label | Default Size | Description |
|------|-------|-------------|-------------|
| `chart` | Line Chart | 6 x 4 | Time-series line or area chart with multiple series support. Each series has its own `dataSource`. Configurable time range, legend, grid, and annotations. Use for trending temperature, flow rates, or any value over time. |
| `barchart` | Bar Chart | 6 x 4 | Categorical or time-based bar visualization. Supports stacked mode. Uses the same `ChartWidget` renderer as the line chart. Use for comparing values across categories or time periods. |

### Data Category

| Type | Label | Default Size | Description |
|------|-------|-------------|-------------|
| `table` | Table | 6 x 4 | Data table with configurable columns. Each column binds to a tag with its own source type, aggregation, format, unit, and thresholds. Supports summary rows, striped/compact modes, and custom header/row colors. Use for tabular process data, silo percentage overviews, or equipment status tables. |

### Layout Category

| Type | Label | Default Size | Description |
|------|-------|-------------|-------------|
| `text` | Text | 4 x 1 | Static text label for section headers and annotations. Configurable font size, weight, style, alignment, and color. Renders without a card wrapper (invisible background). Use for section headings like "Silo Status & Capacity". |
| `image` | Image | 4 x 3 | Upload an image from your PC. Configurable object-fit, alt text, and border radius. Use for company logos, diagrams, or reference images. |

### Advanced Category

| Type | Label | Default Size | Description |
|------|-------|-------------|-------------|
| `repeat` | Repeat Panel | 6 x 4 | Repeats a child widget for each value of a report parameter. Configurable direction (horizontal/vertical) and max visible count. Use for dynamic dashboards where the number of items varies by parameter. |

---

## Configuring a Widget

When a widget is selected on the canvas, the **Properties Panel** (right sidebar, 324px wide) displays its configuration options.

### Data Source

Every data-driven widget needs a data source:

- **Tag** (`type: "tag"`) -- Bind to a single tag by name (e.g., `Intake_Today`). The `aggregation` field controls how values are reduced: `last` (most recent), `avg`, `sum`, `min`, `max`, `count`, or `delta`.
- **Formula** (`type: "formula"`) -- Compute a value from an expression referencing other tags.
- **Group** (`type: "group"`) -- Bind to multiple tags via the `groupTags` array. Used primarily by table widgets where each tag becomes a column.

### Display Options

Common across most widget types:

| Option | Description |
|--------|-------------|
| `title` | Widget heading text |
| `unit` | Unit suffix displayed after the value (e.g., `t`, `%`, `kW`, `kWh/t`) |
| `decimals` | Number of decimal places (0-4) |
| `color` | Accent color for the value or visual element |
| `showCard` | Whether to render the card wrapper (border and background) |
| `showTitle` | Whether to display the title text |
| `align` | Text alignment: `left`, `center`, or `right` |
| `valueFontSize` | Override value font size: `auto`, `sm` (18px), `md` (24px), `lg` (30px), `xl` (36px) |
| `titleFontSize` | Override title font size: `sm` (9px), `md` (10px), `lg` (12px) |

### Thresholds

KPI, Stat, and Gauge widgets support threshold-based color changes:

```json
{
  "condition": "above",
  "value": 80,
  "valueTo": 0,
  "color": "#ef4444"
}
```

Conditions: `above`, `below`, `between`, `equals`. When the value meets the condition, the widget accent color changes to the threshold color.

### Gauge Zones

Gauge and Silo widgets use a zones array instead of thresholds:

```json
{
  "zones": [
    { "from": 0, "to": 40, "color": "#ef4444" },
    { "from": 40, "to": 70, "color": "#f59e0b" },
    { "from": 70, "to": 100, "color": "#10b981" }
  ]
}
```

### Table Column Configuration

Each column in a table widget has:

| Field | Description |
|-------|-------------|
| `label` | Column header text |
| `sourceType` | `tag` or `group` |
| `tagName` | Tag to display in this column |
| `formula` | Optional formula expression |
| `aggregation` | `last`, `avg`, `sum`, `min`, `max`, `count` |
| `format` | `number`, `percentage`, `text` |
| `decimals` | Decimal precision |
| `unit` | Unit suffix |
| `align` | Column alignment |
| `width` | Column width in pixels |
| `thresholds` | Per-column conditional coloring |

### Chart Series Configuration

Each series in a chart or bar chart has:

| Field | Description |
|-------|-------------|
| `label` | Legend label / display name |
| `dataSource` | Full `dataSource` object (`{ type, tagName, aggregation }`) |
| `color` | Series line/bar color (empty string = auto-assigned) |

Additional chart config: `timeRange` (e.g., `"1h"`, `"5m"`), `showLegend`, `showGrid`, `annotations[]`, `stacked` (bar charts only).

---

## Building a Report -- End-to-End Example

### 1. Create a New Report

Navigate to `/report-builder` and click "Create New". The Report Builder opens with an empty canvas.

### 2. Add Section Headers

Drag a **Text** widget onto the canvas. Set its content to "Production Overview" and font weight to bold. It occupies the full 12-column width at row 0.

### 3. Add a KPI Row

Drag three **KPI Card** widgets onto row 1. Configure each:

- Widget 1: Title = "Daily Output", Tag = `Daily_Output`, Unit = "t"
- Widget 2: Title = "Efficiency", Tag = `Line_Efficiency`, Unit = "%"
- Widget 3: Title = "Energy", Tag = `Energy_Per_Ton`, Unit = "kWh/t"

Each KPI is 4 columns wide, filling the row.

### 4. Add a Data Table

Drag a **Table** widget onto row 3. Configure columns:

- Column 1: Label = "Temperature", Tag = `Temperature_1`, Unit = "C"
- Column 2: Label = "Flow Rate", Tag = `FlowRate_2_521WE`, Unit = "t/h"
- Column 3: Label = "Water Flow", Tag = `Water_Flow`, Unit = "m3/h"

### 5. Add a Trend Chart

Drag a **Line Chart** widget onto row 7. Add two series:

- Series 1: Tag = `Temperature_1`, Label = "Temp"
- Series 2: Tag = `FlowRate_2_521WE`, Label = "Flow"

Set time range to "1h".

### 6. Configure Thresholds

Select the Temperature KPI and add a threshold: condition = `above`, value = `80`, color = `#ef4444` (red). Values above 80 will display in red.

### 7. Preview and Save

Click **Preview** to see the report with live emulator data. When satisfied, click **Save Template** (Ctrl+S). To make it visible in Live Monitor and Report Viewer, click **Publish**.

---

## How Widget Data Is Resolved

The data flow from tags to rendered widgets follows this chain:

```
Tag Group
  --> contains Tags (each tag has a name, source, unit)
    --> each Tag has a current value (from PLC polling, formula computation, or manual/emulator input)
      --> WidgetRenderer reads tagValues[tagName] and passes to the widget component
```

### By Widget Type

- **KPI / Stat / Gauge**: Reads a single tag value via `config.dataSource.tagName`. Displays the latest value with formatting and threshold coloring.
- **Silo**: Reads `config.dataSource.tagName` for level, plus `config.capacityTag` and `config.tonsTag` for secondary values. The fill level drives the 2.5D cylinder height and zone coloring.
- **Table**: Each `tableColumns[]` entry references a tag. The widget renders one row of current values with all tag columns side by side. Columns can have individual units, formats, and thresholds.
- **Chart / Bar Chart**: Each `series[]` entry has a `dataSource` with a tag name. The widget collects `tagHistory[tagName]` (an array of `{ timestamp, value }` samples) and plots them as lines or bars over the configured time range.
- **Text / Image**: No data source -- purely visual/layout widgets.

### Tag Collection

The `collectWidgetTagNames()` function in `useReportBuilder.js` walks all widgets and extracts every tag name from `dataSource.tagName`, `series[].dataSource.tagName`, `tableColumns[].tagName`, **table static row cells** (`staticDataRows`: each cell with `sourceType === 'tag'` and `tagName`, or with `groupTags`), `capacityTag`, `tonsTag`, and legacy `config.tagName` / `config.tags[]` fields. These collected tag names are used to:

1. Subscribe to live tag values via the emulator or WebSocket
2. Build tag history for chart rendering

---

## Saving and Publishing

### Draft (Local Storage)

The Report Builder maintains drafts in `localStorage` under the key `hercules_report_builder_templates`. Each edit updates the local copy immediately, providing crash recovery.

### Save to Database

Clicking **Save Template** (or pressing `Ctrl+S`) sends the current layout to the backend via `PUT /api/report-builder/templates/<id>`. The full `layout_config` (with `schemaVersion`, `widgets`, `grid`, `parameters`, `computedSignals`) is saved as a JSONB column.

### Publish

Clicking **Publish** sets `status: "published"` on the template and saves it. Published layouts appear in the Live Monitor and Report Viewer for operators.

### Report States

| Status | Meaning |
|--------|---------|
| `draft` | Work in progress, visible only in the Report Builder |
| `validated` | Reviewed but not yet live |
| `published` | Active and visible to operators in Live Monitor and Report Viewer |

### Undo/Redo

The canvas maintains an undo/redo history stack. Keyboard shortcuts:

- `Ctrl+Z` -- Undo
- `Ctrl+Shift+Z` or `Ctrl+Y` -- Redo

---

## For Developers

### Backend API -- `report_builder_bp.py`

The Report Builder backend is a Flask Blueprint registered at `/api/report-builder/`. It provides full CRUD operations on the `report_builder_templates` table.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/report-builder/templates` | List all templates (ordered by `updated_at DESC`) |
| `POST` | `/api/report-builder/templates` | Create a new template |
| `GET` | `/api/report-builder/templates/<id>` | Get a single template by ID |
| `PUT` | `/api/report-builder/templates/<id>` | Update template fields (name, description, layout_config, is_active, is_default, thumbnail) |
| `DELETE` | `/api/report-builder/templates/<id>` | Delete a template |
| `POST` | `/api/report-builder/templates/<id>/duplicate` | Duplicate a template (creates a copy with " (Copy)" suffix) |

The blueprint auto-creates the `report_builder_templates` table if it does not exist (via `_ensure_table()`).

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS report_builder_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    thumbnail TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    layout_config JSONB DEFAULT '{"widgets":[],"grid":{"cols":12,"rowHeight":60}}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

The `layout_config` JSONB column stores the complete report definition including `schemaVersion`, `widgets[]`, `parameters[]`, `computedSignals[]`, and `grid` settings.

### Frontend Component Architecture

```
ReportBuilderCanvas.jsx          -- Main page: toolbar, canvas, panels
  |
  +-- WidgetToolbox              -- Left panel: widget catalog, drag source
  |     (panels/WidgetToolbox)
  |
  +-- GridLayout                 -- react-grid-layout: drag/drop/resize grid
  |     |
  |     +-- WidgetRenderer       -- Type dispatcher: routes to correct widget component
  |           |
  |           +-- KPIWidget      -- Single value + sparkline
  |           +-- ChartWidget    -- Line chart / bar chart (shared component)
  |           +-- GaugeWidget    -- Radial gauge
  |           +-- SiloWidget     -- 2.5D cylinder
  |           +-- TableWidget    -- Data table with columns
  |           +-- StatWidget     -- Large stat number
  |           +-- TextWidget     -- Static text / heading
  |           +-- ImageWidget    -- Uploaded image
  |
  +-- PropertiesPanel            -- Right panel: selected widget configuration
        (panels/PropertiesPanel)
```

### Canvas State Management

The canvas state is managed by the `useReportCanvas` hook (from `useReportBuilder.js`), which provides:

| Function | Description |
|----------|-------------|
| `addWidget(widget)` | Add a new widget to the layout |
| `addWidgetAt(widget, x, y)` | Add a widget at specific grid coordinates |
| `updateWidget(id, patch)` | Merge a partial update into a widget's properties |
| `removeWidget(id)` | Delete a widget from the layout |
| `updateLayout(newLayout)` | Sync grid positions after drag/resize (from react-grid-layout callback) |
| `addParameter(param)` | Add a report parameter |
| `updateParameter(index, patch)` | Update a parameter |
| `removeParameter(index)` | Remove a parameter |
| `addComputedSignal(signal)` | Add a computed signal |
| `saveLayout()` | Persist to backend database |
| `updateMeta(patch)` | Update template metadata (name, status, grid settings) |
| `undo()` / `redo()` | Navigate undo/redo history |

Template loading applies `loadAndMigrateConfig()` from `templateSchema.js` to ensure all widgets conform to schema v2 before rendering.

### Widget Renderer Dispatch

`WidgetRenderer.jsx` maintains a type-to-component map:

```javascript
const RENDERERS = {
  kpi:      KPIWidget,
  chart:    ChartWidget,
  barchart: ChartWidget,   // same component, different chartType config
  gauge:    GaugeWidget,
  silo:     SiloWidget,
  table:    TableWidget,
  stat:     StatWidget,
  image:    ImageWidget,
  text:     TextWidget,
};
```

Special behaviors:

- **Text widgets** get `INVISIBLE_WRAPPER_TYPES` treatment: no card border, no background, no visual chrome
- **Image widgets** get `CARDLESS_WIDGET_TYPES` treatment: card wrapper only if `showCard: true`
- **Table widgets** receive additional props: `isSelected`, `onUpdate`, `widgetId`, `tags`, `layoutH`, `layoutRowHeight`, `savedFormulas`
- **KPI widgets** receive `sparklineData` from `tagHistory` when `showSparkline` is enabled
- **Chart/Barchart widgets** receive the full `tagHistory` object for plotting time-series data
- **Silo widgets** receive `isReportBuilderWorkspace` flag for workspace-specific behavior

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save template |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+D` | Duplicate selected widget |
| `Delete` | Delete selected widget |
| `Escape` | Deselect widget / cancel name edit |
| `Ctrl+=` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |

---

Previous: [08-REPORT-TEMPLATES-AND-SEEDING](08-REPORT-TEMPLATES-AND-SEEDING.md) | Next: [10-LIVE-MONITORING](10-LIVE-MONITORING.md)
