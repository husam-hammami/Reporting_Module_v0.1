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

## App-Wide "Mission Control" UI/UX Redesign
Complete app-shell redesign extending the Report Builder's Mission Control aesthetic to all pages. Zero backend changes.

### Design System (Global) — Industrial SCADA Theme
- **Dark palette**: Deep control-room dark (`#050b18` body, `#070e1c` panels, `#0a1525`/`#0c1829` elevated surfaces)
- **Primary accent**: Cyan `#22d3ee` (dark mode), `#0c7bb3` (light mode) — used for active states, borders, glows
- **Panel borders**: `rgba(34, 211, 238, 0.22)` widget cards, `rgba(34, 211, 238, 0.18)` tables/sections, with subtle box-shadow glow in dark mode
- **Typography**: Inter font, system-ui fallback; category headers bold uppercase with `tracking-[0.18em]`
- **Utility classes**: `.scada-panel`, `.scada-panel-glow`, `.scada-header` for consistent instrument-panel look
- **Scrollbars**: Cyan-tinted in dark mode (`rgba(34, 211, 238, 0.12)`)
- **Animations**: `animate-live-pulse`, `animate-mc-glow` (cyan glow pulse), `mc-border-glow`
- **Files**: `Frontend/src/index.css`, `Frontend/tailwind.config.js`

### Navbar (80px)
- Original Hercules_New.png logo at `h-14`, clearly visible
- Frosted glass backdrop, cyan gradient divider line at bottom with glow shadow in dark mode
- DEMO/LIVE badge with animated pulse dot
- User avatar with cyan border in dark mode
- All height references use 80px app-wide
- File: `Frontend/src/Components/Navbar/Navbar.jsx`

### Sidebar Navigation
- Dark mode: `#070e1c` background, cyan-tinted border `rgba(34, 211, 238, 0.1)`
- Category labels (BUILD, VIEW, CONFIGURE) in cyan-tinted `#22d3ee/60%`
- Active item: cyan accent bar with glow, cyan border, subtle cyan background
- Material Design icons: `MdDashboardCustomize`, `MdInsertChart`, `MdEngineering` (22px)
- Active icons render in `#22d3ee` cyan, inactive in muted `#556677`
- 220px open / 60px collapsed
- File: `Frontend/src/Components/Common/SideNav.jsx`, `Frontend/src/Data/Navbar.js`

### Login Page
- Centered frosted glass card on grid-pattern background
- Premium gradient submit button, accent focus rings on inputs
- File: `Frontend/src/Pages/Login.jsx`

### Settings / Engineering Pages
- Refined tab bar with pill-style active indicators, premium section headers
- File: `Frontend/src/Pages/Settings/SettingsHome.jsx`

## Report Builder UI — "Mission Control" Redesign (v3)
Complete creative rendering-layer redesign inspired by SpaceX mission control, Bloomberg Terminal, and SCADA HMIs.
- **KPI Widget**: Massive centered value with glowing accent bar, gradient-filled area sparkline
- **Gauge Widget**: Gradient arc stroke, glowing endpoint dot, digital value readout
- **Silo Widget**: Enhanced metallic gradients, glossy liquid surface, dual-wave animation
- **Chart Widget**: Edge-to-edge layout, Mission Control color palette (#00d4ff, #00e88f, #ffaa33)
- **Table Widget**: Grafana/Power BI-inspired CSS-driven styling. Header rows: 11px bold uppercase `rb-table-header-row`. Body rows: 13px `rb-table-body-row` with `rb-row-striped`, `rb-cell-numeric` (mono tabular-nums), `rb-cell-threshold`, `rb-cell-hint`. Section headers: `rb-section-header-row` cyan uppercase. Summary/totals: `rb-summary-row` bold with accent top border. Compact density: `rb-table-compact` modifier class on `.rb-production-table`. Title: `rb-table-title` (13px bold). All padding/font/border controlled via CSS, only user-configurable colors (borderColor, headerBg, etc.) applied as inline styles. Multi-row static data, boolean checkboxes, weight/unit formatting, report header support
- **Stat Widget**: Large auto-sizing value with accent glow, left accent border strip
- **Manager**: Holographic gradient-border cards, status badges with colored glow dots
- **Canvas**: Deep dark workspace with cyan dot grid, frosted glass floating toolbar
- **Properties Panel**: Monospace layout inputs, glowing segmented control
- **Grid**: [4,4] margins in Canvas and Preview
- **Canvas Data Flow**: Emulator ON → front-end emulator values; OFF → polls `/api/live-monitor/tags` every 5s
- **Emulator Tag Seeding**: 31 grain terminal demo tags seeded into DB. Backend serves 33+ live tag values.
- **Preserved Contracts**: All API endpoints, schema, hook signatures, data flow, and infrastructure untouched

## Key Files
- `backend/app.py` - Main Flask app, DB connection pool, CORS, SocketIO
- `backend/config/demo_mode.json` - Demo mode toggle
- `backend/config/plc_config.json` - PLC connection settings
- `Frontend/src/API/axios.js` - API base URL config (uses relative URLs for Vite proxy)
- `Frontend/vite.config.js` - Vite dev server config with proxy
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` - Report Builder design system tokens
