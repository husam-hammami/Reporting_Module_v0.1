# 01 -- System Overview

## What This System Does

The Reporting Module is an industrial reporting and monitoring platform designed for process plants. It connects to Siemens S7 PLCs (or a built-in software emulator), reads sensor and process data at one-second intervals, and stores it in a PostgreSQL database. Operators use configurable live dashboards to monitor real-time values and drag-and-drop report builders to design historical reports. The system supports shift-based filtering, formula-driven KPIs, hourly data archival, and multi-site deployment.

---

## Architecture Diagram

```
+---------------------+         +-------------------------------+         +------------------+
|                     |         |          Backend              |         |                  |
|   PLC (Siemens S7)  | ------> |  Flask + Flask-SocketIO       | ------> |   PostgreSQL 17  |
|   or Emulator       |  snap7  |                               |  SQL    |                  |
|                     |         |  Workers:                     |         |  - tags          |
+---------------------+         |    - Monitor Worker (1s poll) |         |  - tag_history   |
                                |    - Archive Worker (hourly)  |         |  - tag_archive   |
                                |    - Historian Worker          |         |  - layouts       |
                                |                               |         |  - reports       |
                                +----------|--------------------+         |  - users         |
                                           |                              +------------------+
                                           | WebSocket + REST API
                                           |
                                +----------|--------------------+
                                |                               |
                                |   Frontend (React + Vite)     |
                                |                               |
                                |   Pages:                      |
                                |     - Report Builder          |
                                |     - Live Monitor            |
                                |     - Reports (Historical)    |
                                |     - Engineering / Settings  |
                                |                               |
                                +-------------------------------+
```

**Simplified flow:**

```
PLC / Emulator  --->  Backend (Flask + Workers)  --->  PostgreSQL
                                                          |
                         Frontend (React)  <--- WebSocket + REST API
```

---

## Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18, Vite, Tailwind CSS | SPA served on port 5174 (dev) or built to `dist/` |
| **Backend** | Flask, Flask-SocketIO, Python 3.10+ | REST API + WebSocket server on port 5000 |
| **Database** | PostgreSQL 17 | Relational storage via psycopg2 connection pool |
| **PLC Communication** | Siemens S7 via python-snap7 | Reads DB blocks, inputs, outputs, and markers |
| **Real-time** | WebSocket (Socket.IO) | Pushes live tag values to connected dashboards |
| **Task Scheduling** | APScheduler | Runs archive and monitor workers on timed intervals |
| **Authentication** | Flask-Login | Session-based auth with role-based access control |

---

## Key Terminology

| Term | Definition |
|------|-----------|
| **Tag** | A single data point read from the PLC (e.g., temperature sensor, motor speed). Each tag has a name, data type, PLC address, and polling configuration. |
| **Group** | A logical collection of related tags (e.g., "Conveyor Belt 1", "Boiler Room Sensors"). Used to organize the tag list and filter views. |
| **Mapping** | The association between a raw PLC memory address (DB number, byte offset, bit) and a human-readable tag name. |
| **Formula** | A calculated value derived from one or more tags using arithmetic expressions (e.g., `tag_A + tag_B`, `tag_C * 0.001`). Evaluated at read time. |
| **Report Type** | A category of report (e.g., "Daily Production", "Shift Summary"). Defines which sections and widgets appear. |
| **Layout** | A saved arrangement of widgets on a live monitoring dashboard. Each layout belongs to a specific monitor page. |
| **Section** | A vertical block within a report template. Sections contain one or more widgets and stack top-to-bottom. |
| **Widget** | A visual element inside a section or layout -- can be a gauge, chart, table, value card, or label. |
| **Historian** | The subsystem that queries stored tag data for a specific time range and returns it for historical reports. |
| **Archive** | Hourly (or configurable) aggregation of raw per-second tag data into summary rows (min, max, avg, last). Reduces storage and speeds up queries. |
| **Monitor Worker** | A background thread that polls the PLC every second, broadcasts values over WebSocket, and writes raw readings to the database. |
| **Order** | A production order with a start time, end time, and associated metadata. Used to filter report data to a specific production run. |
| **Shift** | A named time window (e.g., "Morning 06:00-14:00") used to partition data and reports by operator shift. |
| **Emulator** | A software-based PLC simulator built into the backend. Generates realistic time-varying tag values for development and demo without physical hardware. |

---

## Data Flow

The system moves data through five stages:

```
1. READ        2. BROADCAST       3. STORE          4. ARCHIVE        5. VIEW
PLC/Emulator   Monitor Worker     PostgreSQL        Archive Worker    Frontend
   |               |                  |                  |               |
   |-- tag data -->|-- WebSocket ---->|  (live display)  |               |
   |               |-- INSERT ------->|  tag_history     |               |
   |               |                  |  (per-second)    |               |
   |               |                  |                  |               |
   |               |                  |-- hourly ------->|               |
   |               |                  |                  |-- aggregate ->|
   |               |                  |                  |  tag_archive  |
   |               |                  |                  |               |
   |               |                  |                  |   Report ---->|
   |               |                  |                  |   Viewer      |
```

**Step by step:**

1. **PLC Read** -- The Monitor Worker connects to the PLC (or Emulator) and reads all active tags every 1 second using python-snap7.

2. **Live Broadcast** -- Each batch of tag values is immediately pushed to all connected Frontend clients via WebSocket (Socket.IO). The Live Monitor page renders these in real time.

3. **Database Write** -- The same batch is inserted into the `tag_history` table with a timestamp. This creates a per-second log of every tag value.

4. **Hourly Archival** -- The Archive Worker runs on a schedule (default: every hour). It reads raw rows from `tag_history`, computes aggregates (min, max, avg, last), and writes summary rows to `tag_archive`. Old raw data can then be pruned.

5. **Report Viewing** -- When a user opens a historical report, the Historian queries either `tag_history` (recent, high-resolution) or `tag_archive` (older, aggregated) based on the requested time range. Data is returned to the Frontend and rendered in the report layout.

---

## Project Structure

```
Reporting_Module_v0.1/
|
|-- backend/
|   |-- app.py                      # Main Flask app, CORS, SocketIO init, routes
|   |-- plc_utils.py                # PLC connection helpers (snap7 wrapper)
|   |-- plc_emulator.py             # Software PLC emulator for demo mode
|   |-- plc_config.py               # PLC IP, rack, slot, DB configuration
|   |-- plc_data_source.py          # Abstraction layer: real PLC vs. emulator
|   |-- scheduler.py                # APScheduler: starts background workers
|   |-- demo_mode.py                # Demo/production mode toggle logic
|   |
|   |-- tags_bp.py                  # Blueprint: tag CRUD, import/export
|   |-- tag_groups_bp.py            # Blueprint: tag group management
|   |-- report_builder_bp.py        # Blueprint: report template CRUD
|   |-- live_monitor_bp.py          # Blueprint: layout CRUD, live values
|   |-- historian_bp.py             # Blueprint: historical data queries
|   |-- kpi_config_bp.py            # Blueprint: KPI formula configuration
|   |-- shifts_config.py            # Shift schedule definitions
|   |-- report_mailer.py            # Email report delivery
|   |-- smtp_config.py              # SMTP server settings
|   |
|   |-- workers/
|   |   |-- dynamic_monitor_worker.py   # 1s PLC polling + WebSocket broadcast
|   |   |-- dynamic_archive_worker.py   # Hourly aggregation into tag_archive
|   |   |-- historian_worker.py         # Historical data retrieval worker
|   |
|   |-- utils/
|   |   |-- tag_reader.py               # Low-level tag reading from PLC
|   |   |-- plc_parser.py               # Parse raw PLC bytes into typed values
|   |   |-- kpi_engine.py               # KPI calculation engine
|   |   |-- kpi_formula.py              # Formula parsing and evaluation
|   |   |-- order_tracker.py            # Production order state tracking
|   |   |-- dynamic_tables.py           # Dynamic table creation helpers
|   |   |-- historian_helpers.py        # Query builders for historian
|   |   |-- layout_tag_extractor.py     # Extract tag refs from layout JSON
|   |   |-- section_data_resolver.py    # Resolve section data for reports
|   |
|   |-- migrations/                 # SQL migration files (run in order)
|   |-- config/                     # Auto-generated JSON configs (runtime)
|   |-- tools/                      # Setup scripts, diagnostics, utilities
|   |-- legacy/                     # Archived code (reference only)
|
|-- Frontend/
|   |-- src/
|   |   |-- main.jsx                # App entry point
|   |   |-- App.jsx                 # Root component, theme, layout
|   |   |
|   |   |-- Pages/
|   |   |   |-- ReportBuilder/      # Drag-and-drop report designer
|   |   |   |-- LiveMonitor/        # Real-time dashboard
|   |   |   |-- Reports/            # Historical report viewer
|   |   |   |-- Settings/           # Engineering configuration pages
|   |   |   |-- Admin/              # User management
|   |   |   |-- Login.jsx           # Authentication page
|   |   |   |-- Home.jsx            # Landing / home page
|   |   |
|   |   |-- Components/
|   |   |   |-- Common/             # Shared UI components
|   |   |   |-- Dynamic/            # Data-driven dynamic components
|   |   |   |-- LiveMonitor/        # Live monitor specific components
|   |   |   |-- Navbar/             # Navigation bar
|   |   |   |-- Shared/             # Cross-page shared components
|   |   |   |-- ui/                 # Base UI primitives (buttons, inputs)
|   |   |
|   |   |-- Context/
|   |   |   |-- AuthProvider.jsx        # Authentication state
|   |   |   |-- SocketContext.jsx       # WebSocket connection
|   |   |   |-- EmulatorContext.jsx     # Demo mode state
|   |   |   |-- DarkModeProvider.jsx    # Theme toggle
|   |   |   |-- SystemStatusContext.jsx # System health state
|   |   |   |-- NavbarContext.jsx       # Navigation state
|   |   |
|   |   |-- API/
|   |   |   |-- axios.js                # Axios instance with base URL
|   |   |   |-- endpoints.js            # API endpoint constants
|   |   |   |-- reportBuilderApi.js     # Report builder API calls
|   |   |
|   |   |-- Hooks/                  # Custom React hooks
|   |   |-- Routes/                 # React Router configuration
|   |   |-- utils/                  # Frontend utility functions
|   |
|   |-- vite.config.js              # Vite dev server (port 5174, proxy to 5000)
|
|-- docs/                           # Documentation (you are here)
|-- QUICKSTART.md                   # 5-minute setup guide
|-- README.md                       # Project overview
```

---

## What to Read Next

Each numbered document builds on the previous. Start with PLC connectivity, then work through tags, reports, and deployment:

**Next: [02 -- PLC Connection](02-PLC-CONNECTION.md)**
