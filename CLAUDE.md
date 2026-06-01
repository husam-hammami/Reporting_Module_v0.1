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
- Electron app uses port 5001 (set via FLASK_PORT env var)
- Default fallback in app.py: 5001
- LAN access controlled via `FLASK_HOST` env var in `desktop_entry.py` (default: `0.0.0.0`)

### Key Branches
- `main` — production, deployed to Vercel (frontend) and client PCs (backend)
- `Salalah_Mill_B` — client-specific branch for Salalah Mill
- Feature branches: `feature/formula-library`, `feature/multi-protocol-plc`

### Technology Stack
- Backend: Flask + eventlet + PostgreSQL + Snap7 (PLC)
- Frontend: React + Vite + Tailwind
- Desktop: Electron + NSIS installer (primary), launcher.py (legacy, do not use for new deployments)
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
- **TWO requirements files** — BOTH must be updated when adding Python packages:
  - `backend/requirements.txt` — desktop/PyInstaller builds
  - `backend/requirements-railway.txt` — Railway Docker builds (excludes snap7)

## CI/CD — GitHub Actions

### Build Full Installer (`.github/workflows/build-ota-update.yml`)
- **Trigger**: Push to `Salalah_Mill_B` branch or manual dispatch
- **Runner**: `windows-latest` (Node 20 + Python 3.9)
- **Build steps**: Frontend → PyInstaller backend exe → download portable PostgreSQL 17 → download VC++ Redistributable → Electron NSIS installer
- **Output**: Two release assets per version:
  - `.exe` — Full standalone installer for new PCs (portal download button)
  - `.zip` — Frozen backend OTA package (auto-downloaded by Electron app on startup)
- **Tags**: Branch-prefixed, e.g. `main-v1.0.50`, `salalah_mill_b-v1.0.50`
- **Version**: Auto-generated from git commit count: `1.0.{commit_count}`
- **PostgreSQL**: Bundled as portable PG 17.2 — requires VC++ Redistributable (installed by NSIS)
- **IMPORTANT**: Every push to `Salalah_Mill_B` triggers a build (~8 min). Be aware of this when pushing multiple commits.

### Deploy workflow
- Separate from installer build
- Handles Vercel frontend deployment on push

## Desktop App (Electron + NSIS)

### Structure (`desktop/`)
- `main.js` — Electron main process (OTA, splash, backend lifecycle, license check)
- `preload.js` — IPC bridge (initDatabase, saveConfig, restartForUpdate)
- `splash.html` — Splash screen with progress bar and close button
- `package.json` — Build config with `publish: null` (we upload releases ourselves)
- `installer-scripts/vcredist-check.nsh` — NSIS script to install VC++ if missing
- Bundles: frozen backend exe, portable PostgreSQL, VC++ redistributable, frontend

### Electron Startup Sequence
1. Single-instance lock
2. License check (Node.js HTTPS → api.herculesv2.app)
3. First-run → setup wizard (auto-init DB, PLC, SMTP config)
4. Splash screen shown
5. **OTA auto-update** — checks GitHub Releases for newer `.zip`, downloads + extracts
6. Port checks (PG 5435, backend 5001)
7. Start PostgreSQL (pg_ctl.exe from `resources/pgsql/bin/`)
8. Start backend (hercules-backend.exe from `resources/backend/`)
9. Health poll → load main window → destroy splash

### OTA Auto-Update System
- **Runs on every app startup** before backend starts
- Checks GitHub Releases API for `.zip` asset matching branch prefix (e.g. `salalah_mill_b-v*`)
- Downloads with progress bar on splash screen
- Backs up `resources/backend/` → extracts new zip → writes new version
- **Rollback**: If extraction fails, restores backup automatically
- **LIMITATION**: OTA only replaces `resources/backend/`. It does NOT update the Electron shell (`main.js`, `splash.html`, `preload.js`). Electron-level fixes require a new installer.
- Version/branch files: `resources/version.txt` and `resources/release_branch.txt`
- Settings > Updates page has "Install & Restart" button for manual OTA trigger

### Splash Screen Behavior
- **NEVER use `closable: false`** — it prevents `splashWindow.close()` from working programmatically
- Use `splashWindow.destroy()` (not `.close()`) to dismiss — `.close()` is blocked by event handlers
- 15-second fallback timeout auto-destroys splash if `ready-to-show` never fires
- Close button (x) on splash for manual dismissal
- Splash is unclosable ONLY during OTA download (via `otaInProgress` flag in close event handler)

### Window Close Behavior
- Clicking X shows "Minimize" / "Quit" confirmation dialog
- "Minimize" keeps PLC polling and distribution running in background
- If tray icon exists (`icons/icon.ico`), window hides to tray instead of showing dialog
- Auto-start via Windows registry (`HKCU\...\Run\HerculesReporting`)

### Backend Process Spawning (Windows)
- **Always use `windowsHide: true`** on `spawn()` calls — prevents black console windows
- **NEVER use `detached: true`** on Windows — it forces a new console window. `pg_ctl start` already backgrounds itself.
- `execSync` calls (for pg_isready, initdb, etc.) also flash consoles — use `{ stdio: 'pipe', windowsHide: true }`

### Launcher (`launcher.py`) — LEGACY
- **Do NOT use for new deployments** — Electron app is the primary desktop entry point
- The standalone launcher was the v1 approach, kept for backwards compatibility
- Has its own OTA logic separate from Electron's

### PyInstaller (`backend/hercules.spec`)
- Entry point: `desktop_entry.py`
- Output: `hercules-backend/` folder with `hercules-backend.exe`
- Bundles: frontend/dist, config/, migrations/, version.txt, release_branch.txt, snap7.dll
- All blueprints and workers listed in hiddenimports
- **When adding a new blueprint or Python dependency**: add to `hiddenimports` in `hercules.spec`

### Backend Self-Bootstrapping (`app.py` — `_run_startup_migrations`)
- Runs at import time when `app.py` loads — no dependency on `psql.exe`
- **Step 0**: Connects to `postgres` system DB, creates app database if missing
- **Step 1**: Runs all migration SQL files via psycopg2 (splits by `;` so trigger errors don't rollback tables)
- **Step 2**: Creates default admin user with **werkzeug** `generate_password_hash` (NOT bcrypt)
- **Step 3**: Detects and converts existing bcrypt `$2b$` hashes to werkzeug format
- Migration order must match `MIGRATION_ORDER` in both `init_db.py` AND `app.py`

### Database Defaults for Electron (DO NOT CHANGE)
```
DB Name: dynamic_db_hercules (lowercase — set by Electron via POSTGRES_DB env var)
DB User: postgres
DB Password: (empty — trust auth)
DB Host: 127.0.0.1
DB Port: 5435
```
Note: These differ from the dev defaults in app.py (`Dynamic_DB_Hercules`, port 5433, password `Admin@123`). Electron overrides them via environment variables.

## API Response Formats — MUST MATCH Frontend

Backend endpoints return different response structures. When writing frontend fetch helpers, the key MUST match:

| Endpoint | Response Key | Example |
|----------|-------------|---------|
| `/api/tags` | `{ tags: [...] }` | `.data?.tags` |
| `/api/tag-groups` | `{ tag_groups: [...] }` | `.data?.tag_groups` |
| `/api/mappings` | `{ mappings: [...] }` | `.data?.mappings` |
| `/api/report-builder/templates` | `{ data: [...] }` | `.data?.data` |
| `/api/distribution/rules` | `{ data: [...] }` | `.data?.data` |

**Common mistake**: Using `.data?.templates` or `.data?.rules` when the backend returns `.data` as the array. Always check the actual `jsonify()` call in the blueprint.

### Export/Import (`ExportImport.jsx`)
- Export fetches from API and bundles into JSON
- Import reads JSON and POSTs/PUTs back to API
- **Report templates** are in the database (`report_builder_templates` table)
- **Report configs** are in browser `localStorage` (`dynamicReportConfigs` key)
- Both use the same export JSON file with different section keys

### Password Hashing
- **werkzeug** `generate_password_hash` / `check_password_hash` — used by Flask login
- **NEVER use bcrypt** `$2b$` hashes — werkzeug cannot verify them, login returns 500
- The Electron setup wizard's `runInitDb()` historically used a bcrypt hash — `_run_startup_migrations` auto-detects and converts these

## Adding New Features — Checklist

When adding a new feature that touches backend + frontend + database:

1. **Database migration**: Add SQL file in `backend/migrations/`, append to `MIGRATION_ORDER` in **THREE places**: `init_db.py`, `app.py` (`_run_startup_migrations`), and `desktop/main.js` (`migrationOrder`)
2. **Auto-create tables**: New blueprints can create their own tables via `before_request` hook — but use `actual = conn._conn if hasattr(conn, '_conn') else conn; actual.autocommit = True` to unwrap PooledConnection
3. **Requirements**: Add Python packages to BOTH `requirements.txt` AND `requirements-railway.txt`
4. **PyInstaller**: Add new modules to `hiddenimports` in `backend/hercules.spec`
5. **Blueprint registration**: Register in `app.py` with `url_prefix='/api'`
6. **i18n**: Add translation keys to ALL 4 language files (`en.json`, `ar.json`, `hi.json`, `ur.json`)
7. **Routes**: Add route in `Frontend/src/Routes/AppRoutes.jsx`, nav item in `Frontend/src/Data/Navbar.js`

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
- `hercules_ai_bp` — AI tag profiling, classification, config, and summary preview

## Workers (background threads)
- `workers/historian_worker.py` — Logs PLC data to PostgreSQL at intervals
- `workers/dynamic_monitor_worker.py` — Pushes live PLC values via SocketIO
- `workers/dynamic_archive_worker.py` — Archives/compresses old data

## Report Builder — Two Types

### Grid/Dashboard Builder (`ReportBuilderCanvas.jsx`)
- Drag-and-drop widget-based layout (charts, tables, gauges, KPIs)
- Uses `useReportCanvas` hook for state, autosave, undo/redo
- Table widget: per-COLUMN aggregation (all rows in a column share the same aggregation)
- Properties panel: `panels/PropertiesPanel.jsx`
- Widget renderer: `widgets/TableWidget.jsx`, `widgets/ChartWidget.jsx`, etc.

### Paginated Report Builder (`PaginatedReportBuilder.jsx`)
- Section-based A4 layout: header, table, KPI row, text block, spacer, signature
- Has its OWN autosave (bypasses useReportCanvas hook) — `triggerSave()` with 1.5s debounce
- Respects the `autoSave` toggle from the hook
- Table sections: per-CELL aggregation (each cell independently picks tag + aggregation)
- **Aggregation options**: Last, First (Start), Delta (End−Start), Average, Sum, Min, Max, Count
- **Use case**: Totalizer reports — same tag with different aggregations per column (Delta for weight, First for start, Last for end)

### Cell Value Formatting (`resolveCellValue()`)
- **Decimals**: Each cell stores its own `decimals` property. Default fallback is `0` (no decimals) when unset.
- **Unit**: Each cell stores its own `unit` property. Displayed via `effectiveUnit()` which handles `__custom__`, `__checkbox__`, and predefined units.
- **IMPORTANT**: Decimals and unit are **snapshotted** into the report cell JSON when a tag is first picked via `TagPicker`. Changing the tag's `decimal_places` or `unit` in Settings does NOT retroactively update existing report cells. Users must edit the cell in the report builder to update.
- **TagPicker defaults**: When picking a tag, decimals defaults to `tag.decimal_places`, or `0` for INT/DINT/BOOL types, `2` for REAL. Unit defaults to `tag.unit`.
- **Known pitfall**: If a report shows wrong decimals or missing units, check the stored `layout_config` JSON in `report_builder_templates` table — the cell-level config overrides everything.

### Per-Cell Aggregation Architecture
- **Frontend**: `collectPaginatedTagAggregations()` groups tags by aggregation type → `{ 'last': [tags], 'sum': [tags], 'delta': [tags] }`
- **Live preview**: Queries `/api/historian/by-tags` with 1-hour rolling window, parallel requests per aggregation group
- **Namespaced keys**: Non-default aggregations stored as `first::tagName`, `delta::tagName` in tag values map
- **resolveTagKey()**: Maps cell aggregation to namespaced key, falls back to plain tagName for live mode
- **Backend** (`distribution_engine.py`): `_fetch_tag_data_multi_agg()` fetches 'last' for all tags, then additional queries per aggregation group
- **Config preview**: `renderCellConfigBadge()` shows color-coded aggregation badges (Δ=orange, First=purple, etc.)

### Historian Aggregation (`historian_bp.py`)
- Endpoint: `/api/historian/by-tags?tag_names=...&from=...&to=...&aggregation=...`
- Supported: `last`, `first`, `avg`, `min`, `max`, `sum`, `delta`, `count`, `auto`
- `auto` mode: counter tags → `SUM(value_delta)`, others → last value
- Falls back to `tag_history_archive` when `tag_history` has no data for the range

## Hercules AI (Phase 1)

### Architecture
- `backend/ai_provider.py` — Dual provider abstraction (Cloud Claude API + Local LM Studio)
- `backend/hercules_ai_bp.py` — Blueprint: scan, profiles, config, preview, test-connection
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` — Setup page (scan → review → complete)
- `Frontend/src/API/herculesAIApi.js` — API wrapper

### AI Provider
- Cloud: Anthropic Claude API via `anthropic` SDK (Opus/Sonnet/Haiku)
- Local: LM Studio via `openai` SDK (OpenAI-compatible API at localhost:1234)
- Lazy imports in `ai_provider.py` — packages resolved at call time, not import time
- Config stored in `hercules_ai_config` table (key-value JSONB)
- API key stored redacted in API responses (only hint + boolean), raw key used internally

### AI Tables (`hercules_ai_bp.py` — `_ensure_tables`)
- Tables: `hercules_ai_config` (key-value config) and `hercules_ai_tag_profiles` (tag classification results)
- Created via `before_request` hook on first request to any `/api/hercules-ai/*` endpoint
- Also created by `_run_startup_migrations` via `create_hercules_ai_tables.sql`
- **CRITICAL**: When using `_ensure_tables`, must unwrap PooledConnection before setting autocommit:
  ```python
  actual = conn._conn if hasattr(conn, '_conn') else conn
  actual.autocommit = True
  ```
  Setting `conn.autocommit = True` on a PooledConnection does NOTHING — it sets the attribute on the wrapper, not the real psycopg2 connection. Without this fix, DDL statements silently roll back.
- Trigger creation failures are caught individually and do not affect table creation (autocommit = each statement commits independently)

### Tag Classification
- Rule-based: metadata first (unit, data_type, is_counter), then name/label keyword fallback
- Types: counter, rate, boolean, percentage, analog, setpoint, id_selector, unknown
- User corrections (source='user') are never overwritten by re-scans (UPSERT with WHERE clause)

### AI Summary in Distribution Emails
- `distribution_engine.py` calls `_generate_ai_summary()` between email build and send
- 30-tag significance filter, 200 calls/day rate limit, graceful timeout (never blocks email)

## Deployment

For full deployment instructions, see **[`docs/Deployment_Guide.md`](docs/Deployment_Guide.md)**.

### Troubleshooting

### Common Issues on Windows Server
- **psql.exe / pg_ctl.exe "access denied"**: Missing VC++ Redistributable (`VCRUNTIME140_1.dll`). Install from `resources/vcredist/vc_redist.x64.exe`
- **PostgreSQL version mismatch**: PG data directory created by one version, binaries from another. Check `pgdata/PG_VERSION` and match with `postgres.exe --version`
- **Login returns 500**: Admin password hash is bcrypt (`$2b$`). Backend `_run_startup_migrations` auto-fixes this, but only runs on startup. Restart the app.
- **Manual backend start — wrong DB port**: If starting `hercules-backend.exe` manually (without Electron), PostgreSQL defaults to port 5432 but the backend defaults to 5433. Set `DB_PORT` env var to match the running PG port. Electron hardcodes `PG_PORT=5435` and starts PG on that port — never change this.
- **Manual backend start — auth/timeout failures**: PLC read errors can flood eventlet workers, causing HTTP timeouts and eventual crash. This is a known issue when PLCs are unreachable. The backend will still serve reports but log many PLC errors.
- **`db_config.json` port mismatch**: Electron overwrites `db_config.json` on every startup with `db_port: 5435`. If running manually, edit this file to match your PG port — but know Electron will reset it.
- **Missing tables** (`hercules_ai_config`, `distribution_rules`): Migration didn't run. Check `_run_startup_migrations` logs. Tables are created by both `before_request` hooks and startup migrations.
- **Splash stuck on "Starting services..."**: Use `splashWindow.destroy()` not `.close()`. 15-second fallback timeout should auto-dismiss.
- **Black terminal window flashing**: `detached: true` on `spawn()` creates console windows on Windows. Remove it. Use `windowsHide: true` instead.
- **Timezone errors in pg.log**: `pgsql/share/timezone` directory missing. Reinstall PostgreSQL binaries.
- **Multiple installations conflicting**: Check for old installs at `C:\Program Files\HerculesReporting\`. Uninstall old versions.

### Debugging Without psql.exe
If `psql.exe` doesn't work, use Python psycopg2 to query the database directly:
```python
import psycopg2
conn = psycopg2.connect(dbname='dynamic_db_hercules', user='postgres', host='127.0.0.1', port=5435)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT * FROM users")
print(cur.fetchall())
```

### OTA Limitations
- OTA replaces `resources/backend/` ONLY
- Does NOT update: `main.js`, `splash.html`, `preload.js`, `pgsql/` directory
- Electron shell fixes require a new installer build
- Version detection: `resources/version.txt` (written by OTA) and `backend/_internal/release_branch.txt` (bundled by PyInstaller)

## UI Patterns — Report Builder
- CSS variables: `--rb-accent`, `--rb-surface`, `--rb-panel`, `--rb-border`, `--rb-text`, `--rb-text-muted`
- Input class: `rb-input-base` (shared across all inputs/selects)
- Minimum font size: `text-[9px]` for labels, `text-[10px]`-`text-[11px]` for inputs
- `InlineTagSelect`: Searchable dropdown with fixed positioning, auto-flips upward near viewport bottom
- `UnitSelector`: Predefined units dropdown + custom unit input, accepts className for size override
- Cell editors wrapped in bordered cards with alternating backgrounds for visual separation
