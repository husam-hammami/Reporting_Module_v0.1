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

## Report Builder UI — "Mission Control" Redesign (v3)
Complete creative rendering-layer redesign inspired by SpaceX mission control, Bloomberg Terminal, and SCADA HMIs. Zero backend changes.
- **Design Concept**: "Mission Control" — dark-first with deep space palette, electric cyan accents, glowing edges, gradient-border cards, extreme typographic contrast
- **Theme CSS** (`reportBuilderTheme.css`): Full token system — deep space blacks (#030711, #0c1222), electric cyan (#38bdf8 dark / #0ea5e9 light), amber warnings (#fbbf24), neon green success (#34d399). Glowing box-shadows, frosted glass effects, custom scrollbars
- **KPI Widget**: Massive centered value with glowing accent bar underneath, gradient-filled area sparkline, compact horizontal mode at h=1
- **Gauge Widget**: Gradient arc stroke through zone colors, glowing endpoint dot (replaces needle), digital value readout, tick marks with variable thickness
- **Silo Widget**: Enhanced metallic gradients (8-stop), glossy liquid surface, dual-wave animation, bold percentage overlay
- **Chart Widget**: Edge-to-edge layout, Mission Control color palette (#00d4ff, #00e88f, #ffaa33), gradient bar fills, dark tooltips with monospace
- **Table Widget**: Gradient header strip, monospace tabular-nums, accent hover rows
- **Stat Widget**: Large auto-sizing value with accent glow, left accent border strip
- **Manager**: Holographic gradient-border cards (`.rb-holo-card`), status badges with colored glow dots, premium empty state
- **Canvas**: Deep dark workspace with cyan dot grid, glowing selection handles (circular), frosted glass floating toolbar
- **Toolbox**: Cyan accent header, icon-pill buttons with glow on hover, widget selection restores canvas focus
- **Properties Panel**: Monospace layout inputs, glowing segmented control, accent section headers with icon badges
- **Grid**: [4,4] margins in Canvas and Preview
- **Files Modified**: All under `Frontend/src/Pages/ReportBuilder/` — widgets, panels, canvas, manager, preview, theme CSS
- **Canvas Data Flow**: When emulator is ON, uses front-end emulator values; when OFF, polls backend `/api/live-monitor/tags` every 5s (same as Preview). This ensures the canvas always displays live data regardless of emulator state.
- **Emulator Tag Seeding**: 31 grain terminal demo tags (Intake_Today, Silo1_Level, etc.) seeded into DB via `seed_report_templates.py`. Backend serves 33+ live tag values from emulator.
- **Preserved Contracts**: All API endpoints, schema, hook signatures, data flow, and infrastructure untouched

## Key Files
- `backend/app.py` - Main Flask app, DB connection pool, CORS, SocketIO
- `backend/config/demo_mode.json` - Demo mode toggle
- `backend/config/plc_config.json` - PLC connection settings
- `Frontend/src/API/axios.js` - API base URL config (uses relative URLs for Vite proxy)
- `Frontend/vite.config.js` - Vite dev server config with proxy
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` - Report Builder design system tokens
