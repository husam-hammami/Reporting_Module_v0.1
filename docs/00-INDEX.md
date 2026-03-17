# Reporting Module v0.1 -- Documentation Index

Welcome to the Reporting Module documentation. This system connects to industrial PLCs, collects real-time process data, and presents it through configurable dashboards and historical reports. These docs cover everything from initial setup to multi-site deployment.

---

## Reading Paths

**For Engineers & Operators** -- Start here if you need to configure tags, build reports, or monitor live data:

> 01 --> 02 --> 03 --> 04 --> 05 --> 06 --> 07 --> 10 --> 11 --> 12

**For Developers** -- Start here if you need to understand the architecture, extend the backend, or deploy:

> 01 --> 14 --> 13 --> 08 --> 09 --> 15 --> reference/API-ENDPOINTS --> reference/DATABASE-SCHEMA

---

## Table of Contents

| #  | Document | Description |
|----|----------|-------------|
| 00 | [INDEX](00-INDEX.md) | This file -- master navigation hub and reading paths |
| 01 | [SYSTEM-OVERVIEW](01-SYSTEM-OVERVIEW.md) | Architecture, tech stack, terminology, and data flow |
| 02 | [PLC-CONNECTION](02-PLC-CONNECTION.md) | Connecting to Siemens S7 PLCs via snap7 |
| 03 | [TAG-ENGINEERING](03-TAG-ENGINEERING.md) | Creating, importing, and managing PLC tags |
| 04 | [TAG-GROUPING](04-TAG-GROUPING.md) | Organizing tags into logical groups |
| 05 | [TAG-MAPPING](05-TAG-MAPPING.md) | Mapping raw PLC addresses to human-readable names |
| 06 | [FORMULAS-AND-CALCULATIONS](06-FORMULAS-AND-CALCULATIONS.md) | Defining computed tags with formulas and KPI expressions |
| 07 | [EMULATOR](07-EMULATOR.md) | Built-in software emulator for testing without hardware |
| 08 | [REPORT-TEMPLATES-AND-SEEDING](08-REPORT-TEMPLATES-AND-SEEDING.md) | Report type definitions and seed data scripts |
| 09 | [REPORT-BUILDER](09-REPORT-BUILDER.md) | Drag-and-drop report layout designer |
| 10 | [LIVE-MONITORING](10-LIVE-MONITORING.md) | Real-time dashboards with WebSocket-driven tag values |
| 11 | [HISTORICAL-DATA-AND-REPORTS](11-HISTORICAL-DATA-AND-REPORTS.md) | Historian, archive workers, and time-filtered reports |
| 12 | [SHIFTS-AND-ORDERS](12-SHIFTS-AND-ORDERS.md) | Shift schedules, production orders, and order tracking |
| 13 | [USER-ROLES-AND-AUTH](13-USER-ROLES-AND-AUTH.md) | Authentication, user management, and role-based access |
| 14 | [DEPLOYMENT](14-DEPLOYMENT.md) | Production deployment with Docker, Nginx, and PostgreSQL |
| 15 | [MULTI-SITE-SETUP](15-MULTI-SITE-SETUP.md) | Running the system across multiple plant sites |

### Reference

| Document | Description |
|----------|-------------|
| [API-ENDPOINTS](reference/API-ENDPOINTS.md) | Complete REST and WebSocket API reference |
| [DATABASE-SCHEMA](reference/DATABASE-SCHEMA.md) | All tables, columns, and relationships |
| [TROUBLESHOOTING](reference/TROUBLESHOOTING.md) | Common issues, error messages, and fixes |

### Plans

| Document | Description |
|----------|-------------|
| [Desktop_App_Plan_2026-03-18](Desktop_App_Plan_2026-03-18.md) | Electron + PyInstaller desktop app with license enforcement |

### Templates & Seed Data

| Document | Description |
|----------|-------------|
| [Templates/README](Templates/README.md) | Report template seed scripts |
| [report-templates/](report-templates/) | JSON report template files |

---

*Reporting Module v0.1 -- Hercules Project*
