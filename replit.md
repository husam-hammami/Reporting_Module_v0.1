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

### Design System (Global)
- **Palette**: Deep space dark (`#060c18` deepest, `#0c1222` base), electric cyan accent (`#38bdf8` dark / `#0c7bb3` light), amber warnings (`#fbbf24`), neon green success (`#34d399`)
- **Glass morphism**: `backdrop-blur(20px)` on Navbar, SideNav, Login card; custom utilities in Tailwind config
- **Typography**: Inter font, system-ui fallback stack
- **Animations**: `animate-live-pulse` (DEMO/LIVE badge), `animate-mc-glow` (accent elements)
- **Scrollbars**: Premium thin dark scrollbars globally
- **Files**: `Frontend/src/index.css`, `Frontend/tailwind.config.js`

### Navbar (52px)
- Frosted glass backdrop, animated DEMO/LIVE badge with pulse dot, refined user avatar dropdown
- Gradient divider line at bottom (cyan-to-transparent in dark mode)
- All height references migrated from 70px to 52px app-wide
- File: `Frontend/src/Components/Navbar/Navbar.jsx`

### Sidebar Navigation
- Color-coded categories: BUILD=cyan (`#38bdf8`), VIEW=green (`#34d399`), CONFIGURE=purple (`#a78bfa`)
- Active item has left accent bar + subtle background glow
- 200px open / 56px collapsed with smooth transitions
- File: `Frontend/src/Components/Common/SideNav.jsx`

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
- **Table Widget**: Gradient header strip, monospace tabular-nums, section headers, multi-row static data, boolean checkboxes, weight/unit formatting, report header support
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
