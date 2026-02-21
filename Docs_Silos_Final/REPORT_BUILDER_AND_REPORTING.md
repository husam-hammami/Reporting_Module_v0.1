# Report Builder & Reporting — User Guide

This document describes the **running features** for Silos Reporting V1.0: Report Builder (design), Reporting (view), and Engineering (Settings).

---

## Report Builder

**Purpose:** Design report layouts by placing widgets on a grid and binding them to tags or formulas.

### Access

- From the app sidebar: **Report Builder**.
- Opens the report list; click a report to edit or **Create** a new one.

### Workspace

- **Left panel — Components:** KPI Card, Table, Line Chart, Bar Chart, Gauge, Silo, Stat Panel, Text/Header, Divider, Repeat Panel. Click to add at the end of the layout, or drag onto the canvas to drop at a specific position.
- **Center — Canvas:** Grid layout (default 12 columns, 48px row height). Drag widgets to move, resize from corners/edges. New widgets are added at the bottom by default; existing layout is not shifted.
- **Right panel — Properties:** When a widget is selected, edit title, data source (tag/formula), unit, decimals, thresholds, etc.

### Widgets

- **Values:** KPI Card, Gauge, Silo (2.5D fill level), Stat Panel.
- **Trends:** Line Chart, Bar Chart (bound to tags; smooth mock trend when using emulator).
- **Data:** Table (columns from tags/formulas/groups).
- **Layout:** Text/Header (free-sized), Divider.

### Saving

- **Save Template** is always available in the top bar (saves current layout to browser storage).
- **Preview** opens the report in read-only mode with live data.
- **Publish** sets report status to published.

### Data source

- In design mode, **emulator** values (if enabled in Demo Mode) drive widgets so you see live-looking data.
- Tags and formulas are configured under **Engineering** (Settings).

---

## Reporting

**Purpose:** View built reports with live or historical data.

### Access

- From the sidebar: **Reporting**.
- Lists saved report templates; open one to view. Data comes from emulator (demo) or backend when connected.

---

## Engineering (Settings)

**Purpose:** Configure tags, tag groups, formulas, and mappings used by Report Builder and Reporting.

### Access

- From the sidebar: **Engineering** (or **Settings**), then:
  - **Tags** — PLC/tag list (name, address, type, unit, etc.). Can be populated via **TIA Tags Import** (see [TIA_TAGS_IMPORT.md](./TIA_TAGS_IMPORT.md)).
  - **Tag Groups** — Group tags for use in tables and charts.
  - **Formulas** — Reusable expressions (e.g. `100 - {Flour_Extraction} - {Bran_Extraction}`); available in Report Builder when binding widgets.
  - **Mappings** — Tag/source mappings if used by the system.
  - **Export/Import** — Backup or restore configuration.
  - **Demo Mode** — Toggle emulator on/off and set update interval for design-time and Reporting view.

---

## TIA Tags Import

See **[TIA_TAGS_IMPORT.md](./TIA_TAGS_IMPORT.md)** for how to export the PLC symbol table from Siemens TIA Portal to a CSV and import it into Hercules so tags (names, addresses, descriptions) are available for Report Builder and Engineering.
