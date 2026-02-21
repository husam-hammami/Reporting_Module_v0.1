# Grain Silos Report — Implementation Plan

This document is the single reference for implementing the Grain_Silos report template and the custom Silo widget. It aligns with the **Grain Terminal Dashboards 1st Draft** and extends the report builder with a domain-specific Silo visualization.

---

## Custom Silo Widget (Report Builder)

### Purpose

A dedicated **Silo** component that shows current fill level (and optional capacity/tonnage) in a **2.5D "genius" way**: a cylinder (or truncated cone) with fill rising from the bottom, so operators see at a glance how full each silo is. This replaces or complements generic gauges in the Silo Status section.

### Design

- **Visual:** 2.5D cylinder (SVG or CSS) with:
  - Shading/highlight so it looks rounded (no full 3D engine).
  - Fill height = fill level (0–100% or 0–1).
  - Optional label: "Silo 1", "67%", "450 t" (if capacity/tons tags provided).
- **Data:** Same data source pattern as Gauge/KPI:
  - **Fill level** (required): one tag or formula, value 0–100 (percent).
  - **Capacity (t)** (optional): tag for total capacity.
  - **Current tons** (optional): tag or formula; if missing, can derive from fill % × capacity.
- **Config:** Title, dataSource (type: tag/formula, tagName/formula), unit (%), decimals, optional capacityTag, optional tonsTag, thresholds (e.g. color change when > 90% or < 10%).

### Implementation steps

1. **Widget catalog** — In Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js:
   - Add a new catalog entry `type: 'silo'`, label "Silo", defaultW: 2, defaultH: 3 (or 4), defaultConfig: title, dataSource (fill level), optional capacityTag/tonsTag, thresholds.

2. **SiloWidget component** — New file Frontend/src/Pages/ReportBuilder/widgets/SiloWidget.jsx:
   - Accept `config`, `tagValues` (same as GaugeWidget).
   - Resolve fill value from config.dataSource (tag or formula).
   - Render an SVG (or div-based) cylinder: background = empty silo outline, foreground = fill up to fillLevel % with optional gradient/shading.
   - Display title and value(s) (%, t) below or inside the shape.
   - Apply threshold colors to the fill (e.g. green < 70%, amber 70–90%, red > 90%).

3. **WidgetRenderer** — In Frontend/src/Pages/ReportBuilder/widgets/WidgetRenderer.jsx:
   - Register `silo: SiloWidget` in RENDERERS.

4. **Properties panel** — In Frontend/src/Pages/ReportBuilder/panels/PropertiesPanel.jsx:
   - For widget type `silo`, show: title, data source (tag/formula for fill level), optional capacity tag, optional tons tag, thresholds (reuse existing threshold UI if available).

5. **Widget toolbox** — In Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx:
   - Add "Silo" to the Visualizations (or a "Silos" subsection) with a cylinder-style icon so users can drag it onto the canvas.

6. **Grain_Silos template** — In the "Silo Status & Capacity" section, use **8 Silo widgets** (one per silo), each bound to Silo1_Level … Silo8_Level (and optionally Silo1_Capacity, Silo1_Tons, etc.). Layout: e.g. 4 per row × 2 rows (w: 3, h: 3 or 4 each).

### Out of scope for this phase

- Real 3D (Three.js): can be a later enhancement or a separate "3D plant view" page.
- Animation (e.g. fill animation on load): optional polish after the static 2.5D works.

---

## Grain_Silos Report — Full Dashboard Coverage

The report includes all eight sections from the Grain Terminal Dashboards 1st Draft. Below is the section order and what each contains; the **Silo Status & Capacity** section uses the new **Silo** widgets as above.

1. **Grain Intake & Outloading** — KPIs (intake today/week/month, outload ship/truck/rail, balance), queue status, chart (peak hours or trend).
2. **Silo Status & Capacity** — **8 × Silo widgets** (2.5D fill level) + table (fill %, tons, free capacity, overfill, status) + chart (utilization trend).
3. **Grain Quality** — KPIs, table (temp, moisture, aeration, deviation), charts (temp per silo, moisture).
4. **Equipment Performance** — Table (status, throughput, downtime, utilization %), bar chart (throughput).
5. **Energy & Utilities** — KPIs (power per area, energy/ton, peak), table (energy ranking), chart (cost trends).
6. **Alarms & Events** — KPIs (active, frequency, critical, response time), table (active alarms), chart (categories).
7. **Operations KPI (Management)** — Row of KPIs (tons/day, availability, downtime, losses, OEE-style).
8. **Maintenance-Ready** — Table (running hours, cycles, early warning), optional chart.

Tags, groups, formulas, emulator profiles, and the seeded template layout are as in the main plan (full tag list, groups, formulas, and section-by-section widget list). The only addition is the **Silo** widget type and its use in section 2.

---

## Implementation order

1. Tags, groups, formulas, emulator (unchanged).
2. **Custom Silo widget** — Catalog, SiloWidget.jsx, WidgetRenderer, Properties, Toolbox.
3. Seed Grain_Silos template — All sections, with **8 × Silo** widgets in Silo Status & Capacity and all other widgets (KPIs, tables, charts) as specified.
