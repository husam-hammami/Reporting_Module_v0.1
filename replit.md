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

## Report Builder UI Redesign (Completed)
Premium-quality redesign of the Report Builder module (Manager, Canvas, Preview + all 9 widget types).
- **Design System**: `reportBuilderTheme.css` — CSS custom properties for colors, typography scale, spacing, elevation, transitions; full dark mode support
- **Design Constraints**: Solid surfaces with clean borders (no glassmorphism/backdrop-blur), no new dependencies, animations use only transform+opacity under 400ms, all gated by `useReducedMotion()` and `ThumbnailCaptureContext`
- **Files Modified**: All files under `Frontend/src/Pages/ReportBuilder/` (widgets, panels, canvas, manager, preview, formulas, thumbnail, seed template, theme CSS) plus `Frontend/src/index.css` for global animation keyframes
- **Widget Types**: KPI, Stat, Gauge, Silo, Chart, Table, Text, Image — all use consistent typographic scale and spacing tokens
- **Value Animations**: KPI/Stat use animated number counting, Gauge uses spring-like needle animation, Silo uses smooth fill transitions — all gated

## Key Files
- `backend/app.py` - Main Flask app, DB connection pool, CORS, SocketIO
- `backend/config/demo_mode.json` - Demo mode toggle
- `backend/config/plc_config.json` - PLC connection settings
- `Frontend/src/API/axios.js` - API base URL config (uses relative URLs for Vite proxy)
- `Frontend/vite.config.js` - Vite dev server config with proxy
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` - Report Builder design system tokens
