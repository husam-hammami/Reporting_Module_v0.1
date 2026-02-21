# Silos Reporting V1.0 — Documentation

This folder contains the **full documentation** for the Hercules Silos Reporting module: **Report Builder**, **Reporting** (view reports), **Engineering** (Tags, Tag Groups, Formulas, Mappings), and **TIA Tags Import**. It does not include legacy Salalah-specific setup.

---

## Contents

| Document | Description |
|----------|-------------|
| [REPORT_BUILDER_AND_REPORTING.md](./REPORT_BUILDER_AND_REPORTING.md) | User guide: Report Builder (design layouts), Reporting (view reports), Engineering (Settings: Tags, Tag Groups, Formulas, Mappings). |
| [GRAIN_SILOS_REPORT_IMPLEMENTATION_PLAN.md](./GRAIN_SILOS_REPORT_IMPLEMENTATION_PLAN.md) | Implementation plan for the Grain_Silos report template and custom Silo widget. |
| [GRAIN_TERMINAL_SILO_READINESS.md](./GRAIN_TERMINAL_SILO_READINESS.md) | Grain Terminal / Silo module readiness: dashboard requirements and next steps (assumes TIA import). |
| [TIA_TAGS_IMPORT.md](./TIA_TAGS_IMPORT.md) | TIA Portal tags import: sync PLC symbol table from Siemens TIA into Hercules. |

---

## Module Overview

- **Report Builder** — Design report layouts: drag widgets (KPI, Gauge, Silo, Chart, Table, Text, etc.), bind to tags/formulas, resize and position. Templates are stored locally; Save Template persists the layout.
- **Reporting** — View built reports with live or historical data (from emulator or backend).
- **Engineering** — **Settings** in the app: **Tags** (PLC/tag list), **Tag Groups**, **Formulas** (reusable expressions), **Mappings**, **Export/Import**, **Demo Mode**. Used to configure data sources for reports.
- **TIA Tags Import** — Import PLC tag names, addresses, and descriptions from Siemens TIA Portal CSV export into Hercules `tags` table.

These four areas are the scope of Silos Reporting V1.0; other legacy modules (e.g. old Salalah dashboards) are out of scope for this documentation set.
