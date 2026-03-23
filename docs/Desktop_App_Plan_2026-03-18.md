# Hercules Reporting Module - Windows Desktop Application Plan

## Context

The Hercules Reporting Module is currently a web application (React frontend + Flask backend) deployed on Vercel + Cloudflare tunnel. The product is distributed as an EXE to customers who run it locally on Windows PCs connected to Siemens PLCs. The goal is to package the entire stack into a standalone Windows desktop application (.exe installer) with license enforcement — so Husam can control who uses it, set expiry dates, and revoke access remotely via the superadmin Licenses page on herculesv2.app.

**Why:** Customers currently receive the full source + manual setup. A proper desktop app hides the source code, simplifies installation, and enforces licensing.

---

## Phase 0: Proof-of-Concept (DO THIS FIRST)

Before building the full desktop app, validate the riskiest assumption: **eventlet + PyInstaller on Windows**.

eventlet's `monkey_patch()` modifies stdlib modules (`socket`, `threading`, `ssl`) at import time. PyInstaller's bootloader may load some of these before user code runs, causing silent failures in WebSocket and background workers. No amount of planning guarantees this works — it requires hands-on testing.

### POC steps

1. Create a minimal `poc_entry.py` that imports `eventlet`, monkey-patches, then imports `app`
2. Freeze with PyInstaller: `pyinstaller --onedir poc_entry.py`
3. Run the frozen exe on a clean Windows machine (no Python installed)
4. Verify: Flask starts, WebSocket connects from a browser, workers run, PLC emulator produces data

### If POC fails

Switch from `eventlet` to `threading` async mode for Flask-SocketIO:
- Change `async_mode="eventlet"` to `async_mode="threading"` in `app.py`
- Remove `eventlet.monkey_patch()` from line 1-2
- Remove `eventlet` from `requirements.txt`
- Workers already use eventlet greenlets — convert to `threading.Thread`
- This is a well-supported PyInstaller path but has different concurrency characteristics

### If POC passes

Proceed with Phase 1.

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
  +-- Bundled VC++ Redistributable (installed silently if missing)
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
    vcredist/                       # Bundled VC++ Redistributable installer
  backend/
    config_paths.py                 # Config dir resolver (%APPDATA% vs local)
    desktop_entry.py                # PyInstaller entry point
    machine_id.py                   # Hardware fingerprint (SHA-256)
    init_db.py                      # Database schema + default admin creation (standalone)
    hercules.spec                   # PyInstaller spec file
    pyinstaller_runtime_hook.py     # Runtime hook for eventlet monkey-patching
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
- Disk serial: **PowerShell `Get-CimInstance Win32_DiskDrive | Select-Object SerialNumber`** (NOT `wmic` which is deprecated on Windows 11 and may not be available)

### 1.3 Desktop entry point — `backend/desktop_entry.py`

PyInstaller freezes this file. It:
1. Sets `HERCULES_DESKTOP=1`
2. **Resolves `sys._MEIPASS`** for frozen path resolution (see 1.6)
3. Copies default config files from bundled resources to `%APPDATA%/Hercules/config/` on first run
4. **Configures file logging** to `%APPDATA%/Hercules/logs/` (the current `app.py` only logs to stdout which is invisible in a desktop app)
5. Adds `GET /health` endpoint (returns `{"status":"ok"}`) for Electron to poll
6. Performs a secondary license check (defense-in-depth — calls api.herculesv2.app)
7. Imports `app` (which triggers `eventlet.monkey_patch()` as first import)
8. **Calls `start_scheduler()`** explicitly (in web mode this is called inside `if __name__ == '__main__'` at `app.py:870` which won't execute when imported)
9. Runs `socketio.run(app, host='127.0.0.1', port=5001)`

Note: gunicorn is Unix-only but not needed — `socketio.run()` with eventlet is the actual server already used in `app.py` line 875.

### 1.4 Database initialization — `backend/init_db.py`

**Must run as a standalone script** (called by Electron setup wizard via `child_process.execFile`, NOT through Flask). The setup wizard runs before the backend starts — so `init_db.py` cannot depend on Flask or the app module.

Creates database and all tables on first run:
- `Dynamic_DB_Hercules` database
- All tables from all 16 migration files in `backend/migrations/` (run in dependency order)
- Default admin user: `admin` / `admin` (force password change on first login)

**Database credentials:** Must use consistent values. Currently `app.py` has mismatched defaults — pool uses port 5433 + password `Admin@123` (line 399-406), fallback uses port 5432 + password `Hercules` (line 427-432). Desktop mode must set `DB_PORT=5432` and a single consistent password via env vars passed from Electron.

### 1.5 PyInstaller spec — `backend/hercules.spec`

**Entry point:** `desktop_entry.py`

**Runtime hook:** `pyinstaller_runtime_hook.py` — ensures `eventlet.monkey_patch()` runs before any stdlib imports. Register via `runtime_hooks=['pyinstaller_runtime_hook.py']` in the spec.

**Hidden imports** (dynamically loaded modules):
- eventlet hubs: **`eventlet.hubs.selects` only** (epolls and kqueue are Linux/macOS — unnecessary on Windows)
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
- ~~`--key=<16-byte-AES-key>` encrypts .pyc bytecode~~ **Removed in PyInstaller v6+.** Use Cython compilation of critical modules (`machine_id.py`, `desktop_entry.py`) to `.pyd` before freezing. This is the primary source protection method.
- Electron asar packing for JavaScript (default)

**Mode:** one-dir (faster startup, entire dir bundled into Electron installer)

### 1.6 Frozen path resolution

When PyInstaller freezes the app, `__file__` and `os.path.dirname(__file__)` point to PyInstaller's temp extraction directory, not the install location. This breaks:

- `app.py:58` — `static_folder='frontend/dist'` (relative to `__file__`)
- `app.py:7` — `.env` loading (relative to `__file__`)
- All config modules using `_BASE_DIR = os.path.abspath(os.path.dirname(__file__))`

**Fix:** `desktop_entry.py` must detect frozen mode and set paths accordingly:
```python
import sys, os
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS          # bundled data extracted here
    INSTALL_DIR = os.path.dirname(sys.executable)  # where .exe lives
else:
    BUNDLE_DIR = os.path.dirname(__file__)
    INSTALL_DIR = BUNDLE_DIR
```

Then override `app.static_folder` to `os.path.join(BUNDLE_DIR, 'frontend', 'dist')` before any routes are registered.

### 1.7 Fix DB port/password defaults

`app.py` currently has inconsistent defaults:
- **Pool** (line 399-406): port `5433`, password `Admin@123`
- **Fallback** (line 427-432): port `5432`, password `Hercules`

For desktop mode, the Electron main process must pass consistent env vars (`DB_PORT=5432`, `POSTGRES_PASSWORD=<value>`) when spawning the backend. These should be set during the setup wizard and stored in `%APPDATA%/Hercules/config/db_config.json`.

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

Flask already serves `frontend/dist` via the catch-all route at `app.py:856-867`. Socket.IO URL resolves to `window.location.origin` in production which will be `http://localhost:5001`. No CORS issues since same origin.

---

## Phase 3: Electron Main Process — `desktop/main.js`

### 3.1 Port conflict detection

Before starting PostgreSQL or Flask, check if ports 5432 and 5001 are already in use:
```javascript
const net = require('net');
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}
```
If either port is taken, show an error dialog telling the customer which port is blocked and to close the conflicting application.

### 3.2 Startup sequence

1. **Single instance lock** — `app.requestSingleInstanceLock()`, focus existing window if already running
2. **License check** — generate machine_id, POST to `api.herculesv2.app/api/license/register` with full machine info payload (see Phase 4.2)
   - `approved` + not expired → cache result, continue
   - `pending` → show `license-pending.html`, poll every 30s
   - `denied` or expired → show `license-denied.html`, quit
   - Network error → check cache (`%APPDATA%/Hercules/license_cache.json`), allow 7-day offline grace period
3. **First-run detection** — if `%APPDATA%/Hercules/config/db_config.json` missing, show setup wizard
4. **Port check** — verify ports 5432 and 5001 are free (see 3.1)
5. **Start PostgreSQL** (bundled) — `pg_ctl start`, wait for `pg_isready`. Use `--locale=C` on `initdb` to avoid Windows locale errors.
6. **Start Flask backend** — spawn `resources/backend/hercules-backend.exe` with env vars (DB credentials, `HERCULES_DESKTOP=1`)
7. **Health poll** — GET `http://localhost:5001/health` every 500ms, timeout 30s
8. **Show splash** during steps 4-7
9. **Load app** — `mainWindow.loadURL('http://localhost:5001')`

### 3.3 Runtime

- **System tray** — minimize to tray on close, context menu (Show / Quit)
- **Periodic license check** — every 60 minutes, silently call `/api/license/status`
  - If no longer approved: warn user, 5-minute grace, then quit
  - If network error: silently continue (grace period from last cache)
- **Backend crash recovery** — on `exit` event from child process, auto-restart up to 3 times

### 3.4 Shutdown

- **Windows-compatible process termination:** call `process.kill()` on the spawned backend child process, or use `taskkill /PID <pid> /F` as fallback. **Do NOT use SIGTERM** — it does not exist on Windows and will silently fail.
- `pg_ctl stop -D <pgdata> -m fast`
- Force-kill if still running after 5s

### 3.5 Machine ID in Node.js

Must produce identical SHA-256 to `backend/machine_id.py`:
```javascript
const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

// Use PowerShell (NOT wmic — deprecated on Win11)
const diskSerial = execSync(
  'powershell -Command "(Get-CimInstance Win32_DiskDrive | Select -First 1).SerialNumber"'
).toString().trim();

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

### 4.2 Registration payload (machine info)

The EXE sends rich machine info on `/api/license/register` so the admin can identify machines:

```json
{
  "machine_id": "sha256-hash",
  "hostname": "PLANT-PC-01",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "ip_address": "192.168.1.50",
  "os_version": "Windows 11 Home 10.0.26200",
  "cpu_info": "Intel Core i5-12400",
  "ram_gb": 16.0,
  "disk_serial": "WD-ABC123456"
}
```

**Backend changes required:**
- Add columns to `licenses` table: `label`, `mac_address`, `ip_address`, `os_version`, `cpu_info`, `ram_gb`, `disk_serial`
- `label` is admin-editable from the Licenses page (e.g. "Al-Jahra Cement - Line 2")
- Update `register_machine()` to accept and store all new fields
- New migration: `add_license_machine_info.sql`

### 4.3 Server-side expiry enforcement

**Current bug:** `license_bp.py` returns `status: approved` even after the expiry date passes. The client checks expiry locally, but if someone patches the client, an expired license still gets `approved`.

**Fix:** In both `/license/register` and `/license/status`, check expiry server-side:
```python
if row['status'] == 'approved' and row['expiry'] and row['expiry'] < date.today():
    effective_status = 'expired'
else:
    effective_status = row['status']
```

### 4.4 Update `last_seen_at` on status checks

Currently only `/license/register` (POST) updates `last_seen_at`. The hourly `/license/status` (GET) poll does not. This means you can't tell if a machine is actively running.

**Fix:** Update `last_seen_at` in the `/license/status` endpoint too.

### 4.5 Status flow

```
Customer installs EXE → starts app
  → POST /api/license/register { machine_id, hostname, mac_address, ip_address, os_version, cpu_info, ram_gb, disk_serial }
  → Server creates record with status="pending"

Husam sees it in Licenses page → sees hostname, MAC, IP, OS, CPU, RAM
  → Names it "Al-Jahra Cement - Line 2" using the label field
  → Clicks Approve (sets expiry date)

Customer's app polls → gets status="approved", expiry="2026-06-15"
  → App loads, caches result

Husam clicks Deny → customer's hourly check detects change
  → Warning shown, 5 min to save work, app quits
```

### 4.6 Offline grace period

Last successful license check is cached with timestamp in `%APPDATA%/Hercules/license_cache.json`. If internet is unavailable, the app runs for up to **7 days** from last check. After that, it requires internet to re-verify.

### 4.7 Anti-bypass measures

- License URL split into parts in compiled code, assembled at runtime
- Integrity check on critical files at startup
- `desktop_entry.py` and `machine_id.py` compiled with Cython to `.pyd` before PyInstaller (primary source protection)
- Electron asar packing for JavaScript

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
    "createStartMenuShortcut": true,
    "include": "installer-scripts/vcredist-check.nsh"
  },
  "extraResources": [
    { "from": "../backend/dist/hercules-backend", "to": "backend" },
    { "from": "pgsql", "to": "pgsql" },
    { "from": "vcredist", "to": "vcredist" }
  ]
}
```

### 5.2 VC++ Redistributable

PyInstaller executables and PostgreSQL on Windows require the Visual C++ Redistributable. Many industrial PCs don't have it installed.

The NSIS installer must:
1. Check if VC++ Redistributable is already installed (registry check)
2. If missing, silently install from the bundled `vcredist/vc_redist.x64.exe /install /quiet /norestart`

### 5.3 Install size estimate

| Component | Size |
|-----------|------|
| Electron runtime | ~80 MB |
| Python backend (PyInstaller) | ~100 MB |
| PostgreSQL portable | ~80 MB |
| React frontend (built) | ~15 MB |
| VC++ Redistributable | ~15 MB |
| **Total installer** | **~275 MB** |

### 5.4 Code signing

- EV code signing certificate is **strongly recommended** — not just for SmartScreen trust but because **Windows Defender will often quarantine unsigned PyInstaller executables entirely**. For industrial customers this is practically required.
- Configure in electron-builder: `certificateFile` + `certificatePassword`

### 5.5 Auto-updater

- `electron-updater` with GitHub Releases (can be private repo)
- On startup (after license): check for updates silently
- Download in background, install on next restart
- **Database migrations on update:** After updating, before starting the backend, run any new migration files from `backend/migrations/`. The Electron main process should compare a stored `last_migration` value in `%APPDATA%/Hercules/config/` against available migrations and run new ones via `psql` or a standalone Python script.
- Allows pushing updates to all deployed customers

---

## Phase 6: First-Run Setup Wizard

HTML page loaded in BrowserWindow before main app, with steps:

1. **Database** — auto-initializes bundled PostgreSQL (runs `initdb --locale=C`, `createdb`, then `init_db.py` as a **standalone script** via `child_process.execFile` — NOT through Flask, since the backend isn't running yet)
2. **PLC** — enter PLC IP/rack/slot, or enable Demo Mode
3. **Admin User** — create first admin account (username + password)
4. **SMTP (optional)** — email server config for automated reports
5. **Complete** — saves configs to `%APPDATA%/Hercules/config/`, marks setup done

Wizard communicates with Electron main process via IPC.

---

## Phase 7: Security

| Concern | Solution |
|---------|----------|
| Python source code | Cython compilation of critical modules to `.pyd` + PyInstaller freezing |
| JavaScript source | Electron asar packing (default) |
| SMTP passwords | Windows DPAPI via `keyring` package |
| License bypass | Two-layer check (Electron + Python) + server-side expiry enforcement |
| Config tampering | Integrity hash check on startup |
| Unsigned exe quarantine | EV code signing certificate (see 5.4) |

---

## Phase 8: Logging

In desktop mode, stdout is not visible. Configure file-based logging in `desktop_entry.py`:

```python
import logging
from logging.handlers import RotatingFileHandler

log_dir = os.path.join(os.environ.get('APPDATA', '.'), 'Hercules', 'logs')
os.makedirs(log_dir, exist_ok=True)

handler = RotatingFileHandler(
    os.path.join(log_dir, 'hercules.log'),
    maxBytes=10_000_000,  # 10 MB
    backupCount=5
)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
logging.getLogger().addHandler(handler)
```

This ensures crash logs are available for debugging customer issues at `%APPDATA%/Hercules/logs/hercules.log`.

---

## Build Pipeline — `build-desktop.bat`

```batch
@echo off
echo === Building Hercules Desktop App ===

echo [1/5] Building frontend...
cd Frontend
copy .env.desktop .env.production.local
call npm run build
cd ..

echo [2/5] Copying frontend to backend...
xcopy /E /Y Frontend\dist backend\frontend\dist\

echo [3/5] Compiling critical modules with Cython (source protection)...
cd backend
python setup_cython.py build_ext --inplace
cd ..

echo [4/5] Building Python backend with PyInstaller...
cd backend
python -m PyInstaller hercules.spec --noconfirm
cd ..

echo [5/5] Building Electron installer...
cd desktop
call npm install
call npm run build
cd ..

echo === Done: desktop\build\ ===
```

---

## Testing Checklist (Clean Windows VM)

- [ ] **POC: PyInstaller + eventlet works** (Phase 0 — do this before anything else)
- [ ] Run installer on fresh Windows 10/11 (no dev tools)
- [ ] VC++ Redistributable installs silently if missing
- [ ] PostgreSQL initializes on first run (no locale errors)
- [ ] Setup wizard completes (DB, PLC demo mode, admin user)
- [ ] License check: test pending → approve from herculesv2.app → app loads
- [ ] License check: test deny → app shows denied screen
- [ ] License check: test expired → server returns `expired` (not `approved`)
- [ ] License check: disconnect internet → verify 7-day grace period
- [ ] License page shows machine info (MAC, IP, OS, CPU, RAM, hostname)
- [ ] Label field is editable and persists
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
- [ ] Auto-updater runs new DB migrations
- [ ] Log files written to %APPDATA%/Hercules/logs/
- [ ] Port conflict → clear error message shown
- [ ] Ports 5001/5432 not exposed to network (bound to 127.0.0.1 only)
- [ ] Uninstall preserves %APPDATA%/Hercules/ data

---

## Implementation Order (dependency chain)

| Step | File(s) | Depends on |
|------|---------|------------|
| **0** | **POC: freeze app.py with PyInstaller, test on clean Windows** | **—** |
| 1 | `backend/config_paths.py` | Phase 0 passes |
| 2 | Update 4 config modules | Step 1 |
| 3 | `backend/machine_id.py` (PowerShell, not wmic) | — |
| 4 | `backend/init_db.py` (standalone, not Flask-dependent) | — |
| 5 | `backend/desktop_entry.py` (frozen paths, logging, start_scheduler) | Steps 1, 3 |
| 6 | `backend/pyinstaller_runtime_hook.py` | — |
| 7 | Fix `app.py` DB port/password defaults | — |
| 8 | Add `/health` endpoint to `app.py` | — |
| 9 | `Frontend/.env.desktop` | — |
| 10 | Build frontend + copy to `backend/frontend/dist/` | Step 9 |
| 11 | `backend/hercules.spec` (with runtime hook, Windows-only hidden imports) | Steps 2, 5, 6, 10 |
| 12 | Test PyInstaller build standalone | Step 11 |
| 13 | `backend/license_bp.py` — server-side expiry, last_seen_at, machine info fields | — |
| 14 | `backend/migrations/add_license_machine_info.sql` | — |
| 15 | Frontend `LicenseActivations.jsx` — show machine info, editable label | Step 14 |
| 16 | `desktop/package.json` + HTML screens | — |
| 17 | `desktop/main.js` (machine_id via PowerShell, license, port check, spawn, tray, taskkill shutdown) | Steps 12, 16 |
| 18 | `desktop/preload.js` + setup wizard IPC | Step 17 |
| 19 | Download + place PostgreSQL portable | — |
| 20 | Bundle VC++ Redistributable | — |
| 21 | `build-desktop.bat` (with Cython step) | All above |
| 22 | Test on clean Windows VM | Step 21 |

---

## Critical Existing Files (reference, changes noted)

- `backend/app.py` — add `/health` endpoint, fix DB port/password defaults (5433→5432, single password), frozen path resolution for `static_folder`
- `backend/license_bp.py` — add server-side expiry check, update `last_seen_at` on GET `/status`, accept machine info fields, add label column
- `backend/plc_utils.py` — snap7.dll dependency, must bundle
- `backend/requirements.txt` — all Python deps for PyInstaller; add `itsdangerous` explicitly (used in `app.py:484` but only pulled in transitively by Flask)
- `Frontend/src/API/axios.js` — API URL resolution (works with localhost:5001 via env)
- `Frontend/src/Context/SocketContext.jsx` — Socket URL (auto-resolves to same origin)
- `Frontend/src/Pages/Settings/LicenseActivations/LicenseActivations.jsx` — add machine info display and editable label

---

## Revision History

| Date | Changes |
|------|---------|
| 2026-03-18 | Initial plan |
| 2026-03-24 | Added Phase 0 (POC-first), 18-point review fixes: frozen path resolution, eventlet runtime hook, Windows-compatible shutdown (taskkill not SIGTERM), PowerShell for machine ID (not wmic), Cython source protection (not PyInstaller --key), server-side expiry enforcement, last_seen_at on status checks, rich machine info + admin label, standalone init_db.py, port conflict detection, VC++ Redistributable, DB port/password fix, desktop logging, DB migrations on update, Windows-only hidden imports, code signing priority |
