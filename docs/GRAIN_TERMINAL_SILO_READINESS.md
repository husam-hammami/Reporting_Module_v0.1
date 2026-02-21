# Grain Terminal / Silo Module — Hercules Readiness

This document maps the **Grain Terminal Dashboards (1st Draft)** requirements to Hercules and lists the **next steps** to make the reporting system ready for the Silo module. It assumes the **TIA Tags Import** feature (see [TIA_TAGS_IMPORT.md](./TIA_TAGS_IMPORT.md)) is implemented so that PLC tags (names, addresses, descriptions) are available in Hercules.

---

## Prerequisite: TIA Tags Import

- **Status:** Implement per `docs/TIA_TAGS_IMPORT.md`.
- **Outcome:** Engineer exports symbol table from TIA to a known path; Hercules parses and populates the `tags` table. All Silo/terminal tags (silo levels, temperatures, conveyors, intake/outload counters, alarms, etc.) are then available by name and address in Hercules.

Once TIA import is in place, the steps below make Hercules **100% ready** for the Grain Terminal / Silo dashboards.

---

## Dashboard Requirements (from PDF) vs Hercules

| Dashboard | Purpose | What to show | Hercules today | Gap / next step |
|-----------|---------|--------------|----------------|------------------|
| **Grain Intake & Outloading** | Movement in/out – live & historical | Total intake (Today/Week/Month), outloading (Ship/Truck/Rail), balance, queue status, peak hours | Live Monitor + Dynamic Report (tags, historian); KPI formulas | Tag naming + layouts; aggregations (sum by day/week); optional queue tags |
| **Silo Status & Capacity** | Storage utilization | Per-silo fill %, tons, free capacity, overfill, empty/standby, trend | Live Monitor (tables, KPIs, charts); tags per silo | Silo config (name, capacity_tons); layouts using tags like `Silo1_Level`, `Silo1_Capacity`; formulas for % and free capacity |
| **Grain Quality** | Quality from intake to dispatch | Temp per silo, hot spots, moisture, aeration, quality alerts | Tags + Live Monitor / Dynamic Report | Layouts and KPIs from quality tags (temp, moisture, aeration); optional threshold alerts |
| **Equipment Performance** | Conveyors & machines | Running status, throughput t/h, downtime, bottlenecks, utilization % | Tags + historian; Live Monitor tables/charts | Layouts for equipment tags; downtime/throughput from tags or counters; optional OEE-style formulas |
| **Energy & Utilities** | Operational costs | Power per area, energy per ton, peak, equipment ranking, cost trends | Energy module (power monitor, energy_readings); Dynamic Report | Extend or re-enable Energy for “per area” / “per ton”; cost trends from historian |
| **Alarms & Events** | Operational awareness | Active alarms, frequency, categories, response time, critical vs non-critical | Not present | **New:** Alarms/events source, storage, and Alarms dashboard |
| **Operations KPI (Management)** | High-level view | Tons/day, terminal availability %, downtime %, losses, OEE-style KPIs | KPI engine; Dynamic Report (historical) | Management layout(s) with aggregate KPIs; role-based default view |
| **Maintenance-Ready (optional)** | Predictive maintenance | Running hours, start/stop cycles, load trends, early warnings | Tags + historian | Optional layouts and KPIs when module is purchased |

---

## Next Steps (in order)

### 1. Complete TIA Tags Import

- Implement parsing of TIA CSV (default format), TIA address parser (DBW/DBD/DBX/DBB), data type mapping, and upsert into `tags`.
- Ensure Grain Terminal PLC project exports to the configured path (e.g. `C:\Hercules\symbol_export.csv`) with symbol names and comments so “what the tag is for” is available.

### 2. Define Tag Naming Convention (with customer)

- Agree with the customer/TIA project how tags are named so layouts can be built consistently, e.g.:
  - **Silos:** `Silo1_Level`, `Silo1_Capacity`, `Silo1_Temp`, `Silo2_Level`, …
  - **Intake/Outload:** `Intake_Today`, `Intake_Ship`, `Intake_Truck`, `Intake_Rail`, `Outload_Ship`, … or counters that historian can aggregate.
  - **Equipment:** `Conveyor1_Status`, `Conveyor1_Throughput`, `Elevator1_Running`, …
  - **Alarms:** `Alarm_Active`, or event log from PLC/system (see step 5).
- Document the convention in project handover so future TIA exports keep the same names.

### 3. Silo Configuration (optional but recommended)

- **Option A:** No new table: use tags only. Layouts reference tags like `Silo1_Level`, `Silo2_Level`; capacity and “free capacity” are formulas (e.g. KPI or column formula: `Capacity - Level` if both exist as tags) or fixed in layout labels.
- **Option B:** Add a **silos** table (e.g. `silo_id`, `silo_name`, `capacity_tons`, `display_order`) and optionally link tags to silos (e.g. `tags.silo_id` or a mapping table). Then build “Silo Status” dashboard from silo list + tagged values (level, temp, etc.). Use Option B if you need silo metadata (capacity, name) maintained in Hercules independent of TIA.

### 4. Build Grain Terminal Layouts in Hercules

Using Live Monitor and Dynamic Report layouts (and existing tag + historian + KPI features):

- **Grain Intake & Outloading:** New layout(s) with KPIs for total intake (today/week/month), outloading by Ship/Truck/Rail, balance; table or cards for queue status if tags exist; chart for peak hours (historian aggregation by hour).
- **Silo Status & Capacity:** Layout with per-silo rows or cards: fill level %, tons, free capacity, overfill warning (formula or threshold). Use trend chart from historian for “silo utilization trend.”
- **Grain Quality:** Layout with temperature per silo, moisture if available, aeration/cooling status; optional quality deviation alerts (formulas or thresholds on tags).
- **Equipment Performance:** Layout with equipment list, running status, throughput (t/h), utilization %; use historian for downtime events if available as tags or derived.
- **Energy & Utilities:** Use or extend existing Energy module: power per area, energy per ton (formula), peak demand, equipment energy ranking, cost trends (if cost data is stored or entered).
- **Operations KPI (Management):** One or more “Management” layouts with high-level KPIs: tons handled per day, terminal availability %, downtime %, losses; OEE-style metrics if formulas are defined.

Create these layouts in the Live Monitor Layout Manager and in Dynamic Report config; assign tags and formulas from the TIA-imported tag set.

### 5. Alarms & Events Module (new)

- **Requirement:** One screen for active alarms, alarm frequency, categories, response time, critical vs non-critical.
- **Implementation options:**
  - **A.** **PLC tags as alarms:** Tags like `Alarm_Active`, `Alarm_Code`, `Alarm_Message` (or one tag per alarm). A dedicated “Alarms” layout or page shows current values and, if stored in historian, simple “frequency” from history.
  - **B.** **Alarms table:** New table `alarms` (e.g. `id`, `source`, `tag_name` or `address`, `alarm_id`, `message`, `severity`, `raised_at`, `ack_at`, `cleared_at`). Backend fills it from PLC (poll or event) or from a gateway; frontend has an “Alarms & Events” dashboard that lists active alarms and history. Optionally add “alarm frequency” and “response time” from this table.
- **Recommendation:** Start with Option A (tags + layout) for minimal scope; add Option B if the customer needs full alarm history, acknowledgment, and response-time tracking.

### 6. Role-Based Dashboards and Navigation

- **PDF:** Role-based dashboards (Operator / Supervisor / Management).
- **Hercules:** Roles exist (Admin, Manager, Operator). Map them to the Grain Terminal roles if needed (e.g. Operator → operator, Supervisor → manager, Management → manager or admin).
- **Next steps:**
  - Set **default landing page** or default layout per role (e.g. Operator → Intake & Outloading or Silo Status; Management → Operations KPI).
  - In nav/sidebar, show only the dashboards/layouts relevant to each role (or show all but highlight “your” dashboard). Use existing role checks in routes and nav data.
- **Modular:** Hide or show entire modules (e.g. Energy, Alarms, Maintenance) via config or feature flags so the client only gets what they need.

### 7. Historical Aggregations

- **Required for:** Intake today/week/month, peak hours, utilization trends, energy per ton, cost trends.
- **Hercules:** Historian stores tag history; Dynamic Report can show historical ranges. Ensure:
  - **Aggregations:** Backend or report layer can compute sum (e.g. intake per day), max (peak hour), average (utilization %) over historian data for the chosen range. Use existing historian APIs or extend them (e.g. “sum by day” for counters).
  - **Time ranges:** Today / Week / Month are selectable in the UI (Dynamic Report or Live Monitor with date filter) and feed into the same aggregation logic.

### 8. Maintenance-Ready (Optional)

- If the Maintenance module is purchased later: add layouts and KPIs for running hours, start/stop cycles, abnormal load trends, and early warnings using tags and historian. No change to core architecture; add new layouts and optional tags when the module is enabled.

---

## Summary Checklist

- [ ] **TIA Tags Import** implemented and tested; Grain Terminal symbols exported to known path and imported into `tags`.
- [ ] **Tag naming convention** agreed and documented for silos, intake/outload, equipment, alarms.
- [ ] **Silo config** decided (tags-only vs silos table) and implemented if needed.
- [ ] **Layouts** created for: Intake & Outloading, Silo Status & Capacity, Grain Quality, Equipment Performance, Energy & Utilities, Operations KPI (Management).
- [ ] **Alarms & Events** implemented (tag-based layout and/or alarms table + dashboard).
- [ ] **Role-based** default dashboards and nav (Operator / Supervisor / Management).
- [ ] **Historical aggregations** (sum by day/week, peak hour, etc.) available for intake, utilization, energy.
- [ ] **Modular** visibility: Energy, Alarms, Maintenance optional per deployment.

When these are done, Hercules is **100% ready** for the Grain Terminal / Silo module after the TIA tags import is in place.
