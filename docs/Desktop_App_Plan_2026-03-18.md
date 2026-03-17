# Hercules Reporting Module - Windows Desktop Application Plan

## Context

The Hercules Reporting Module is currently a web application (React frontend + Flask backend) deployed on Vercel + Cloudflare tunnel. The product is distributed as an EXE to customers who run it locally on Windows PCs connected to Siemens PLCs. The goal is to package the entire stack into a standalone Windows desktop application (.exe installer) with license enforcement — so Husam can control who uses it, set expiry dates, and revoke access remotely via the superadmin Licenses page on herculesv2.app.

**Why:** Customers currently receive the full source + manual setup. A proper desktop app hides the source code, simplifies installation, and enforces licensing.

---

## Architecture

```
[Windows NSIS Installer]
  |
  +-- Electron Main Process (main.js)
  |     |
  |     +-- License Gate: POST to api.herculesv2.app/api/license/register
  |     |   (blocks app if denied/expired/pending)
  |     |
  |     +-- Spawns: hercules-backend.exe (PyInstaller-frozen Flask+SocketIO)
  |     |     - Serves React frontend on localhost:5001
  |     |     - Connects to local PostgreSQL
  |     |     - Connects to PLC via snap7.dll
  |     |     - Runs background workers (historian, monitor, archive)
  |     |
  |     +-- BrowserWindow loads http://localhost:5001
  |
  +-- Bundled PostgreSQL Portable (~80 MB)
  +-- Config stored in %APPDATA%/Hercules/
```

---

## Directory Structure (new files only)

```
Reporting_Module_v0.1/
  desktop/                          # Electron wrapper
    package.json                    # Electron + electron-builder
    main.js                         # Main process (lifecycle, license, spawn backend)
    preload.js                      # IPC bridge
    splash.html                     # Loading screen
    license-pending.html            # Awaiting approval screen
    license-denied.html             # Denied/expired screen
    setup-wizard.html               # First-run DB/PLC/admin setup
    icons/icon.ico                  # App icon
    pgsql/                          # Bundled PostgreSQL portable (bin/ + lib/)
  backend/
    config_paths.py                 # Config dir resolver (%APPDATA% vs local)
    desktop_entry.py                # PyInstaller entry point
    machine_id.py                   # Hardware fingerprint (SHA-256)
    init_db.py                      # Database schema + default admin creation
    hercules.spec                   # PyInstaller spec file
  Frontend/
    .env.desktop                    # VITE_API_URL=http://localhost:5001
  build-desktop.bat                 # Full build pipeline script
```

---

## Phase 1: Backend Preparation

### 1.1 Config path resolution — `backend/config_paths.py`

Centralizes config directory. Desktop mode (`HERCULES_DESKTOP=1` env var) stores configs in `%APPDATA%/Hercules/config/`. Web mode uses `backend/config/` as today.

**Files to update** (change `_CONFIG_DIR` to use `config_paths.get_config_dir()`):
- `backend/plc_config.py`
- `backend/demo_mode.py`
- `backend/smtp_config.py`
- `backend/shifts_config.py`

### 1.2 Hardware fingerprint — `backend/machine_id.py`

Generates deterministic machine ID: `SHA-256(hostname + sorted_MACs + disk_serial)`. Used by both Python (defense-in-depth license check) and Node.js (Electron license gate). Both must produce identical output.

- MAC: `uuid.getnode()`
- Hostname: `socket.gethostname()`
- Disk serial: `wmic diskdrive get serialnumber` (Windows)

### 1.3 Desktop entry point — `backend/desktop_entry.py`

PyInstaller freezes this file. It:
1. Sets `HERCULES_DESKTOP=1`
2. Copies default config files from bundled resources to `%APPDATA%/Hercules/config/` on first run
3. Adds `GET /health` endpoint (returns `{"status":"ok"}`) for Electron to poll
4. Performs a secondary license check (defense-in-depth — calls api.herculesv2.app)
5. Imports `app` (which triggers `eventlet.monkey_patch()` as first import)
6. Runs `socketio.run(app, host='127.0.0.1', port=5001)`

Note: gunicorn is Unix-only but not needed — `socketio.run()` with eventlet is the actual server already used in `app.py` line 876.

### 1.4 Database initialization — `backend/init_db.py`

Creates database and all tables on first run:
- `Dynamic_DB_Hercules` database
- All tables: `users`, `tags`, `tag_groups`, `tag_history`, `licenses`, `system_settings`, `report_builder_templates`, `live_monitor_layouts`, mapping tables, KPI tables
- Default admin user: `admin` / `admin` (force password change on first login)

### 1.5 PyInstaller spec — `backend/hercules.spec`

**Entry point:** `desktop_entry.py`

**Hidden imports** (dynamically loaded modules):
- eventlet hubs: `eventlet.hubs.epolls`, `eventlet.hubs.kqueue`, `eventlet.hubs.selects`
- Flask-SocketIO driver: `engineio.async_drivers.eventlet`
- All 9 blueprints: `tags_bp`, `tag_groups_bp`, `live_monitor_bp`, `historian_bp`, `kpi_config_bp`, `report_builder_bp`, `mappings_bp`, `license_bp`, `branding_bp`
- Workers: `workers.historian_worker`, `workers.dynamic_monitor_worker`, `workers.dynamic_archive_worker`
- All utils: `utils.tag_value_cache`, `utils.plc_parser`, `utils.tag_reader`, etc.
- PLC: `plc_utils`, `plc_config`, `plc_emulator`, `plc_data_source`
- Config: `demo_mode`, `smtp_config`, `shifts_config`, `scheduler`, `report_mailer`
- Libraries: `psycopg2`, `snap7`, `xhtml2pdf`, `reportlab`, `apscheduler`, `asteval`, `itsdangerous`

**Bundled binaries:**
- `snap7.dll` — from python-snap7 package directory

**Bundled data:**
- `frontend/dist/` — built React app
- `config/*.json` — default config templates

**Source protection:**
- `--key=<16-byte-AES-key>` encrypts .pyc bytecode (requires `tinyaes`)

**Mode:** one-dir (faster startup, entire dir bundled into Electron installer)

---

## Phase 2: Frontend Build for Desktop

### 2.1 Create `Frontend/.env.desktop`
```
VITE_API_URL=http://localhost:5001
```

### 2.2 Build
```bash
cd Frontend
copy .env.desktop .env.production.local
npm run build
```

### 2.3 Copy to backend
```bash
xcopy /E /Y Frontend\dist backend\frontend\dist\
```

Flask already serves `frontend/dist` via the catch-all route at `app.py:857-867`. Socket.IO URL resolves to `window.location.origin` in production which will be `http://localhost:5001`. No CORS issues since same origin.

---

## Phase 3: Electron Main Process — `desktop/main.js`

### 3.1 Startup sequence

1. **Single instance lock** — `app.requestSingleInstanceLock()`, focus existing window if already running
2. **License check** — generate machine_id, POST to `api.herculesv2.app/api/license/register`
   - `approved` + not expired → cache result, continue
   - `pending` → show `license-pending.html`, poll every 30s
   - `denied` or expired → show `license-denied.html`, quit
   - Network error → check cache (`%APPDATA%/Hercules/license_cache.json`), allow 7-day offline grace period
3. **First-run detection** — if `%APPDATA%/Hercules/config/db_config.json` missing, show setup wizard
4. **Start PostgreSQL** (bundled) — `pg_ctl start`, wait for `pg_isready`
5. **Start Flask backend** — spawn `resources/backend/hercules-backend.exe` with env vars
6. **Health poll** — GET `http://localhost:5001/health` every 500ms, timeout 30s
7. **Show splash** during steps 4-6
8. **Load app** — `mainWindow.loadURL('http://localhost:5001')`

### 3.2 Runtime

- **System tray** — minimize to tray on close, context menu (Show / Quit)
- **Periodic license check** — every 60 minutes, silently call `/api/license/status`
  - If no longer approved: warn user, 5-minute grace, then quit
  - If network error: silently continue (grace period from last cache)
- **Backend crash recovery** — on `exit` event from child process, auto-restart up to 3 times

### 3.3 Shutdown

- Send SIGTERM to Flask process, wait 5s
- `pg_ctl stop -D <pgdata> -m fast`
- Force-kill if still running

### 3.4 Machine ID in Node.js

Must produce identical SHA-256 to `backend/machine_id.py`:
```javascript
const hash = crypto.createHash('sha256');
hash.update(hostname + sortedMACs + diskSerial);
const machineId = hash.digest('hex');
```

---

## Phase 4: License Enforcement

### 4.1 Two-layer enforcement

| Layer | Where | When | Bypass difficulty |
|-------|-------|------|-------------------|
| Electron gate | `main.js` | Before app loads | Must decompile asar + patch JS |
| Python gate | `desktop_entry.py` | Before Flask starts | Must decompile PyInstaller + patch bytecode |

Both layers call `api.herculesv2.app`. Both must pass.

### 4.2 Status flow

```
Customer installs EXE → starts app
  → POST /api/license/register { machine_id, hostname }
  → Server creates record with status="pending"

Husam sees it in Licenses page → clicks Approve (sets expiry date)

Customer's app polls → gets status="approved", expiry="2026-06-15"
  → App loads, caches result

Husam clicks Deny → customer's hourly check detects change
  → Warning shown, 5 min to save work, app quits
```

### 4.3 Offline grace period

Last successful license check is cached with timestamp in `%APPDATA%/Hercules/license_cache.json`. If internet is unavailable, the app runs for up to **7 days** from last check. After that, it requires internet to re-verify.

### 4.4 Anti-bypass measures

- License URL split into parts in compiled code, assembled at runtime
- Integrity check on critical files at startup
- `desktop_entry.py` compiled with Cython to `.pyd` before PyInstaller (optional, stronger)
- PyInstaller `--key` encrypts all `.pyc` bytecode

---

## Phase 5: Installer (electron-builder)

### 5.1 electron-builder config

```json
{
  "appId": "com.hercules.reporting",
  "productName": "Hercules Reporting Module",
  "win": { "target": "nsis", "icon": "icons/icon.ico" },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  },
  "extraResources": [
    { "from": "../backend/dist/hercules-backend", "to": "backend" },
    { "from": "pgsql", "to": "pgsql" }
  ]
}
```

### 5.2 Install size estimate

| Component | Size |
|-----------|------|
| Electron runtime | ~80 MB |
| Python backend (PyInstaller) | ~100 MB |
| PostgreSQL portable | ~80 MB |
| React frontend (built) | ~15 MB |
| **Total installer** | **~250 MB** |

### 5.3 Code signing

- EV code signing certificate required for SmartScreen trust
- Without it: SmartScreen warning on first download (functional but unprofessional)
- Configure in electron-builder: `certificateFile` + `certificatePassword`

### 5.4 Auto-updater

- `electron-updater` with GitHub Releases (can be private repo)
- On startup (after license): check for updates silently
- Download in background, install on next restart
- Allows pushing updates to all deployed customers

---

## Phase 6: First-Run Setup Wizard

HTML page loaded in BrowserWindow before main app, with steps:

1. **Database** — auto-initializes bundled PostgreSQL (runs `initdb`, `createdb`, `init_db.py`)
2. **PLC** — enter PLC IP/rack/slot, or enable Demo Mode
3. **Admin User** — create first admin account (username + password)
4. **SMTP (optional)** — email server config for automated reports
5. **Complete** — saves configs to `%APPDATA%/Hercules/config/`, marks setup done

Wizard communicates with Electron main process via IPC.

---

## Phase 7: Security

| Concern | Solution |
|---------|----------|
| Python source code | PyInstaller `--key` AES encryption of .pyc |
| JavaScript source | Electron asar packing (default) |
| SMTP passwords | Windows DPAPI via `keyring` package |
| License bypass | Two-layer check (Electron + Python) |
| Config tampering | Integrity hash check on startup |
| Critical modules | Optional Cython compilation of `machine_id.py`, `desktop_entry.py` |

---

## Build Pipeline — `build-desktop.bat`

```batch
@echo off
echo === Building Hercules Desktop App ===

echo [1/4] Building frontend...
cd Frontend
copy .env.desktop .env.production.local
call npm run build
cd ..

echo [2/4] Copying frontend to backend...
xcopy /E /Y Frontend\dist backend\frontend\dist\

echo [3/4] Building Python backend with PyInstaller...
cd backend
python -m PyInstaller hercules.spec --noconfirm
cd ..

echo [4/4] Building Electron installer...
cd desktop
call npm install
call npm run build
cd ..

echo === Done: desktop\build\ ===
```

---

## Testing Checklist (Clean Windows VM)

- [ ] Run installer on fresh Windows 10/11 (no dev tools)
- [ ] PostgreSQL initializes on first run
- [ ] Setup wizard completes (DB, PLC demo mode, admin user)
- [ ] License check: test pending → approve from herculesv2.app → app loads
- [ ] License check: test deny → app shows denied screen
- [ ] License check: test expired → app shows expired screen
- [ ] License check: disconnect internet → verify 7-day grace period
- [ ] Login with admin user
- [ ] Report Builder: create, edit, release report
- [ ] Dashboards/Table Reports pages show released reports
- [ ] Live Monitor with demo data (PLC emulator mode)
- [ ] WebSocket real-time data updates
- [ ] PDF export works
- [ ] Branding: upload client logo
- [ ] Minimize to tray, restore
- [ ] Backend crash → auto-restart
- [ ] Auto-updater detects new version
- [ ] Uninstall preserves %APPDATA%/Hercules/ data

---

## Implementation Order (dependency chain)

| Step | File(s) | Depends on |
|------|---------|------------|
| 1 | `backend/config_paths.py` | — |
| 2 | Update 4 config modules | Step 1 |
| 3 | `backend/machine_id.py` | — |
| 4 | `backend/init_db.py` | — |
| 5 | `backend/desktop_entry.py` | Steps 1, 3 |
| 6 | `Frontend/.env.desktop` | — |
| 7 | Build frontend + copy to `backend/frontend/dist/` | Step 6 |
| 8 | `backend/hercules.spec` | Steps 2, 5, 7 |
| 9 | Test PyInstaller build standalone | Step 8 |
| 10 | `desktop/package.json` + HTML screens | — |
| 11 | `desktop/main.js` (machine_id, license, spawn, tray) | Steps 9, 10 |
| 12 | `desktop/preload.js` + setup wizard IPC | Step 11 |
| 13 | Download + place PostgreSQL portable | — |
| 14 | `build-desktop.bat` | All above |
| 15 | Test on clean Windows VM | Step 14 |

---

## Critical Existing Files (reference, not modified unless noted)

- `backend/app.py` — add `/health` endpoint, conditionally skip `license_bp` in desktop mode
- `backend/license_bp.py` — cloud-side only, reference for status flow
- `backend/plc_utils.py` — snap7.dll dependency, must bundle
- `backend/requirements.txt` — all Python deps for PyInstaller
- `Frontend/src/API/axios.js` — API URL resolution (works with localhost:5001 via env)
- `Frontend/src/Context/SocketContext.jsx` — Socket URL (auto-resolves to same origin)
