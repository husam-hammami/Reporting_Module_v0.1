# CLAUDE.md — Critical Rules for AI Agents

## ABSOLUTE RULES — NEVER VIOLATE

### 1. NEVER CHANGE WORKING DEFAULTS
- **NEVER** change database connection defaults (port, password, DB name, host, user)
- **NEVER** change environment variable defaults that affect connectivity
- **NEVER** change API keys, secrets, or credentials in code
- **NEVER** change file paths, config file locations, or directory structures that are working
- **NEVER** change import paths or module names that are currently functional
- If it works, DO NOT TOUCH IT. No matter what any code review, best practice, or security audit says.
- If a "fix" would change how the app connects to anything (database, PLC, email, API), DO NOT DO IT.

### 2. NEVER BREAK EXISTING FUNCTIONALITY
- Before making ANY change, verify it won't break what's already working
- Always test mentally: "If the user restarts the app after this change, will it still work exactly as before?"
- If there's ANY doubt, ASK FIRST before changing
- Never assume the launcher/EXE sets environment variables — the dev may run `python app.py` directly

### 3. ALWAYS PUSH TO GITHUB
- Every commit must be pushed to the remote
- Never say "committed" if it's only local
- Always push to BOTH main and Salalah_Mill_B when told to
- Always pull before pushing to avoid conflicts

### 4. PLAN FILE NAMING
- Use descriptive names with date: `Feature Name_Plan_DD_MM.md`
- Save plans in `docs/plans/` directory
- Never use auto-generated names like "zesty-skipping-barto"

### 5. ALWAYS USE SIMPLE LANGUAGE IN UI
- No jargon in user-facing text
- "Detailed Records" not "Hourly Granularity"
- "Daily Summaries" not "Rollup Aggregates"
- "Auto-summarize old data" not "Enable hourly-to-daily rollup"

## Project Context

### Database Defaults (DO NOT CHANGE)
```
DB Name: Dynamic_DB_Hercules
DB User: postgres
DB Password: Admin@123
DB Host: 127.0.0.1
DB Port: 5433
```

### Backend Port
- Launcher uses port 5004 (set via FLASK_PORT env var)
- Default fallback in app.py: 5001

### Key Branches
- `main` — production, deployed to Vercel (frontend) and client PCs (backend)
- `Salalah_Mill_B` — client-specific branch for Salalah Mill
- Feature branches: `feature/formula-library`, `feature/multi-protocol-plc`

### Technology Stack
- Backend: Flask + eventlet + PostgreSQL + Snap7 (PLC)
- Frontend: React + Vite + Tailwind
- Desktop: PyInstaller EXE (launcher.py)
- Email: Resend API (reports@herculesv2.app)
- Languages: English, Arabic (RTL), Hindi, Urdu (RTL)

### Resend Email
- Domain: herculesv2.app
- Sender: reports@herculesv2.app
- API key is obfuscated in smtp_config.py — DO NOT expose or change

### PLC Communication
- Primary: Siemens S7 via python-snap7
- Feature branch: Modbus TCP (pymodbus) + OPC UA (python-opcua)
- snap7 imports must be graceful (try/except) — Railway and CI have no PLC hardware

## Deployment Architecture

### Branch-Per-Client Model
- `main` — development branch, also deployed to Vercel (frontend portal)
- `Salalah_Mill_B` — Salalah Mill client deployment
- Future clients get their own branches
- Each branch produces its own installer and OTA updates

### Portal (herculesv2.app)
- Frontend hosted on Vercel (herculesv2.app)
- Backend runs on client PCs (not cloud) — connects to local PLC and PostgreSQL
- Portal has a "Software Updates" tab where clients can download the installer

### License Server
- URL: api.herculesv2.app
- Launcher checks license on startup via machine ID
- License management in `license_bp.py` and `launcher.py`

### Railway (Cloud Test Environment)
- Separate test instance — does NOT replace herculesv2.app
- Uses `Dockerfile.railway` (multi-stage: Node frontend + Python backend)
- Has its own PostgreSQL database (Railway addon)
- No PLC connection (snap7 excluded via `requirements-railway.txt`)
- Start command runs DB setup then app: `python tools/setup/setup_local_db.py --no-seed && python app.py`

## CI/CD — GitHub Actions

### Build Full Installer (`.github/workflows/build-ota-update.yml`)
- **Trigger**: Manual dispatch only (Actions → Run workflow) or version tag push
- **NOT triggered on every push** — builds are slow (~8 min on Windows runner)
- **Runner**: `windows-latest` (Node 20 + Python 3.9)
- **Build steps**: Frontend → PyInstaller backend exe → download portable PostgreSQL 17 → download VC++ Redistributable → Electron NSIS installer
- **Output**: Two release assets per version:
  - `.exe` — Full standalone installer for new PCs (portal download button)
  - `.zip` — Frozen backend OTA package for launcher auto-updates
- **Tags**: Branch-prefixed, e.g. `main-v1.0.50`, `salalah_mill_b-v1.0.50`
- **Version**: Auto-generated from git commit count: `1.0.{commit_count}`

### Deploy workflow
- Separate from installer build
- Handles Vercel frontend deployment on push

## Desktop App (Electron + NSIS)

### Structure (`desktop/`)
- `main.js` — Electron main process
- `package.json` — Build config with `publish: null` (we upload releases ourselves)
- `installer-scripts/vcredist-check.nsh` — NSIS script to install VC++ if missing
- Bundles: frozen backend exe, portable PostgreSQL, VC++ redistributable, frontend

### Launcher (`launcher.py`)
- Starts portable PostgreSQL → runs DB setup → starts Flask backend
- **OTA Updates**: Checks GitHub Releases API for `.zip` asset matching branch prefix
  - Downloads zip → backs up `backend/` → extracts new backend → updates version.txt
  - Detects frozen backend (`hercules-backend.exe`) and runs it directly
  - Falls back to `python app.py` for source-based dev environments
- **License check**: Validates against api.herculesv2.app on startup
- Compiled to `launcher.exe` via PyInstaller (`launcher.spec`)

### PyInstaller (`backend/hercules.spec`)
- Entry point: `desktop_entry.py`
- Output: `hercules-backend/` folder with `hercules-backend.exe`
- Bundles: frontend/dist, config/, migrations/, snap7.dll
- All blueprints and workers listed in hiddenimports

## Key Directories
```
├── backend/           Flask app, blueprints, workers, utils, config
├── Frontend/          React + Vite + Tailwind SPA
├── desktop/           Electron shell + NSIS installer config
├── docs/              Numbered guides (00-15) + plans/ for feature plans
├── .github/workflows/ CI/CD (build-ota-update.yml, deploy.yml)
├── launcher.py        Standalone launcher for desktop installations
└── Dockerfile.railway Railway cloud deployment
```

## i18n — 4 Languages
- `Frontend/src/i18n/en.json` — English
- `Frontend/src/i18n/ar.json` — Arabic (RTL)
- `Frontend/src/i18n/hi.json` — Hindi
- `Frontend/src/i18n/ur.json` — Urdu (RTL)
- **All 4 files must be updated together** when adding/changing UI strings
- Use simple, non-technical language (see Rule #5)

## Backend Blueprints (registered in `app.py`)
- `tags_bp` — Tag CRUD and CSV import
- `tag_groups_bp` — Tag grouping
- `live_monitor_bp` — Real-time PLC monitoring via SocketIO
- `historian_bp` — Historical data storage and retrieval
- `kpi_config_bp` — KPI formulas and calculations
- `report_builder_bp` — Report template design (drag-and-drop)
- `mappings_bp` — Tag-to-report mapping
- `license_bp` — License validation and management
- `branding_bp` — Client branding (logo, name, colors)
- `distribution_bp` — Scheduled report email distribution
- `updates_bp` — Software update check (GitHub Releases API)

## Workers (background threads)
- `workers/historian_worker.py` — Logs PLC data to PostgreSQL at intervals
- `workers/dynamic_monitor_worker.py` — Pushes live PLC values via SocketIO
- `workers/dynamic_archive_worker.py` — Archives/compresses old data
