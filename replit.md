# Hercules v2 - Dynamic Plant Monitoring System

## Project Overview
A full-stack industrial plant monitoring system with a React frontend and Flask backend. Designed for grain silo/processing plant monitoring via Siemens S7 PLCs.

## Architecture

### Frontend (React + Vite)
- **Location**: `Frontend/`
- **Port**: 5000 (Replit webview)
- **Framework**: React 18 + Vite 6
- **Styling**: Tailwind CSS + MUI
- **Key libraries**: socket.io-client, chart.js, react-router-dom, axios

### Backend (Flask + SocketIO)
- **Location**: `backend/`
- **Port**: 8000 (localhost only)
- **Framework**: Flask 2.x + Flask-SocketIO (eventlet async)
- **Database**: PostgreSQL (Replit built-in)
- **PLC**: Siemens S7 via python-snap7 (in demo mode without PLC)

## Configuration

### Frontend → Backend Proxy (vite.config.js)
- `/api/*` → `http://127.0.0.1:8000`
- `/orders/*` → `http://127.0.0.1:8000`
- `/socket.io/*` → `http://127.0.0.1:8000` (WebSocket)
- `host: 0.0.0.0`, `allowedHosts: true` for Replit proxy

### Database
- Uses Replit PostgreSQL (env vars: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
- Backend `.env` maps these to POSTGRES_DB, POSTGRES_USER, etc.
- All migrations in `backend/migrations/` have been applied

### CORS
- Backend allows all origins (`*`) for Replit proxy compatibility
- SocketIO also uses `cors_allowed_origins="*"`

## Workflows
- **Start application**: `cd Frontend && npm run dev` (port 5000, webview)
- **Backend**: `cd backend && python app.py` (port 8000, console)

## Known Behaviors
- PLC connection errors are expected (no physical PLC in dev environment)
- Enable demo mode in settings to use the built-in emulator
- xhtml2pdf not installed (cairo dependency missing) — PDF email reports are gracefully skipped
- snap7 v2.1.0 uses `snap7.type` (not `snap7.types`) — fixed in plc_utils.py

## Report Builder UI Redesign (Completed — v2 Industrial/SCADA Density Pass)
Full rendering-layer redesign for professional Grafana/SCADA-caliber industrial dashboards. Zero backend changes.
- **Design System**: `reportBuilderTheme.css` — density-first CSS tokens: dark navy surfaces (#0a0f1a, #111827), cyan/teal accents, tight spacing (4-8px padding), compact typography (10px uppercase titles, 18-32px tabular-nums values, 11px body, 9px captions)
- **Grid**: `GRID_MARGIN` reduced from [8,8] to [4,4] in both Canvas and Preview for dense layouts
- **Widget Cards**: Single clean layer — 1px border, 4px radius, 8px internal padding via `.rb-widget-card` CSS class. No nested wrappers or double-padding
- **Default Sizes**: Compact defaults — KPI/Stat 2×1, Gauge 2×2, Silo 2×3, Chart/Table 4×3, Text 3×1
- **Widget Toolbox**: Neutral monochrome icon backgrounds using `var(--rb-surface)` + `var(--rb-border)` — no colored ICON_TINTS
- **Properties Panel**: Layout section (X/Y/W/H number inputs) added above Data/Format tabs for precise positioning
- **Seed Template**: Grain Silos template optimized — silos changed from 3×2 (4 per row) to 2×3 (6 per row) for better density
- **Files Modified**: All files under `Frontend/src/Pages/ReportBuilder/` (widgets, panels, canvas, manager, preview, seed template, theme CSS)
- **Preserved Contracts**: All API endpoints, schema (templateSchema.js), hook signatures (useReportCanvas, useTagHistory, useSocket), data flow, and infrastructure (react-grid-layout, Chart.js, uPlot, html2canvas, jspdf) untouched

## Key Files
- `backend/app.py` - Main Flask app, DB connection pool, CORS, SocketIO
- `backend/config/demo_mode.json` - Demo mode toggle
- `backend/config/plc_config.json` - PLC connection settings
- `Frontend/src/API/axios.js` - API base URL config (uses relative URLs for Vite proxy)
- `Frontend/vite.config.js` - Vite dev server config with proxy
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` - Report Builder design system tokens
