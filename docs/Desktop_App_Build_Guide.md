# Hercules Desktop App — Step-by-Step Build Guide

This document explains how to build the Hercules Reporting Module as a standalone Windows desktop application (`.exe` installer) from the source code. It covers every step from prerequisites to final testing.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture Overview](#2-architecture-overview)
3. [New Files Created](#3-new-files-created)
4. [Modified Files](#4-modified-files)
5. [Phase 0 — POC Test (Do First)](#5-phase-0--poc-test-do-first)
6. [Phase 1 — Build the Frontend](#6-phase-1--build-the-frontend)
7. [Phase 2 — Freeze the Backend with PyInstaller](#7-phase-2--freeze-the-backend-with-pyinstaller)
8. [Phase 3 — Set Up the Electron Shell](#8-phase-3--set-up-the-electron-shell)
9. [Phase 4 — Bundle PostgreSQL and VC++ Redistributable](#9-phase-4--bundle-postgresql-and-vc-redistributable)
10. [Phase 5 — Build the Installer](#10-phase-5--build-the-installer)
11. [Phase 6 — Run the Database Migration](#11-phase-6--run-the-database-migration)
12. [Phase 7 — Test on a Clean Windows VM](#12-phase-7--test-on-a-clean-windows-vm)
13. [One-Command Build (build-desktop.bat)](#13-one-command-build)
14. [Manual Desktop Build (Step by Step)](#14-manual-desktop-build-step-by-step)
15. [Troubleshooting](#15-troubleshooting)
16. [File Reference](#16-file-reference)

---

## 1. Prerequisites

Install these on the **build machine** (your development PC):

| Tool | Version | Purpose |
|------|---------|---------|
| **Python** | 3.11+ | Backend + PyInstaller |
| **Node.js** | 20 LTS+ | Frontend build + Electron |
| **Git** | Any | Source control |
| **PyInstaller** | 6.x | Freeze Python backend to .exe |
| **Visual Studio Build Tools** | 2022+ | Required for some Python packages on Windows |

### Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
pip install pyinstaller
```

### Install Node.js dependencies

```bash
cd Frontend
npm install

cd ../desktop
npm install
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Windows NSIS Installer               │
├─────────────────────────────────────────────────┤
│                                                   │
│  Electron Main Process (main.js)                 │
│    ├── License Gate → api.herculesv2.app         │
│    ├── Spawns: hercules-backend.exe              │
│    │     ├── Flask + SocketIO (frozen)           │
│    │     ├── Serves React frontend on :5001      │
│    │     ├── PostgreSQL on :5432                 │
│    │     ├── PLC via snap7.dll                   │
│    │     └── Background workers                  │
│    └── BrowserWindow → http://localhost:5001     │
│                                                   │
│  Bundled PostgreSQL Portable (~80 MB)            │
│  Bundled VC++ Redistributable (~15 MB)           │
│  Config at %APPDATA%/Hercules/                   │
└─────────────────────────────────────────────────┘
```

**How it works:**
1. User double-clicks the installed EXE
2. Electron checks the license against `api.herculesv2.app`
3. If approved → starts PostgreSQL, then the frozen Flask backend
4. Polls `/health` endpoint until backend is ready
5. Opens a BrowserWindow pointing at `http://localhost:5001`
6. The app looks and works exactly like the web version
7. System tray icon allows minimize-to-tray and quit

---

## 3. New Files Created

### Backend (backend/)

| File | Purpose |
|------|---------|
| `config_paths.py` | Centralized config directory resolver — desktop mode uses `%APPDATA%/Hercules/config/`, web mode uses `backend/config/` |
| `machine_id.py` | SHA-256 hardware fingerprint (hostname + MAC + disk serial via PowerShell) |
| `desktop_entry.py` | PyInstaller entry point — sets up desktop mode, logging, license check, starts scheduler + socketio |
| `init_db.py` | Standalone DB setup script — creates database, runs all migrations, creates default admin. Called by Electron setup wizard |
| `poc_entry.py` | Proof-of-concept entry point for testing PyInstaller + eventlet |
| `pyinstaller_runtime_hook.py` | Ensures eventlet monkey-patching runs before PyInstaller's bootloader |
| `hercules.spec` | Full PyInstaller spec with all hidden imports, bundled data, and snap7.dll |
| `migrations/add_license_machine_info.sql` | Adds label, mac_address, ip_address, os_version, cpu_info, ram_gb, disk_serial columns to licenses table |

### Frontend (Frontend/)

| File | Purpose |
|------|---------|
| `.env.desktop` | `VITE_API_URL=http://localhost:5001` — tells the frontend to talk to local backend |

### Desktop (desktop/)

| File | Purpose |
|------|---------|
| `package.json` | Electron + electron-builder dependencies and build config |
| `main.js` | Electron main process — license gate, PostgreSQL management, backend spawning, system tray, health polling |
| `preload.js` | IPC bridge for the setup wizard |
| `splash.html` | Loading screen shown during startup |
| `license-pending.html` | "Awaiting admin approval" screen |
| `license-denied.html` | "Access denied / expired" screen |
| `setup-wizard.html` | First-run wizard (PLC config, admin user, SMTP) |
| `installer-scripts/vcredist-check.nsh` | NSIS script to install VC++ Redistributable if missing |

### Root

| File | Purpose |
|------|---------|
| `build-desktop.bat` | Full build pipeline script |

---

## 4. Modified Files

| File | Changes |
|------|---------|
| `backend/app.py` | Added frozen path resolution (`sys._MEIPASS`), `/health` endpoint, fixed DB port/password defaults to be consistent (both pool and fallback use same values) |
| `backend/license_bp.py` | Added server-side expiry enforcement, `last_seen_at` update on GET `/license/status`, accepts rich machine info fields (MAC, IP, OS, CPU, RAM, disk serial), supports editable `label` field |
| `backend/plc_config.py` | Uses `config_paths.get_config_dir()` instead of hardcoded `__file__` relative path |
| `backend/demo_mode.py` | Same as plc_config — uses centralized config path |
| `backend/smtp_config.py` | Same — uses `config_paths` |
| `backend/shifts_config.py` | Same — uses `config_paths` |
| `backend/tools/setup/setup_local_db.py` | Added new migrations to MIGRATION_ORDER |
| `Frontend/src/Pages/Settings/LicenseActivations/LicenseActivations.jsx` | Shows machine info (expandable row), editable label field, expired status badge |

---

## 5. Phase 0 — POC Test (Do First)

**This is the riskiest step.** Eventlet's monkey-patching may not work correctly when frozen with PyInstaller. Test this before building anything else.

### Steps

```bash
cd backend

# Activate your Python environment
# (use your venv or system Python with all deps installed)

python -m PyInstaller --onedir poc_entry.py ^
    --runtime-hook=pyinstaller_runtime_hook.py ^
    --hidden-import=engineio.async_drivers.eventlet ^
    --hidden-import=eventlet.hubs.selects ^
    --hidden-import=psycopg2 ^
    --hidden-import=dns ^
    --hidden-import=dns.resolver
```

### Test the frozen exe

```bash
# Set environment variables for your local PostgreSQL
set DB_PORT=5432
set POSTGRES_PASSWORD=your_password
set POSTGRES_DB=dynamic_db_hercules

# Run the frozen exe
dist\poc_entry\poc_entry.exe
```

### Verify

- [ ] Flask starts without errors
- [ ] Open `http://localhost:5001` in a browser — React app loads
- [ ] WebSocket connects (check browser console for `live_tag_data` events)
- [ ] Enable demo mode — emulator data flows through WebSocket
- [ ] Check `http://localhost:5001/health` returns `{"status": "ok"}`

### If POC Fails

Switch to threading mode:
1. In `app.py`, change `async_mode="eventlet"` to `async_mode="threading"`
2. Remove `eventlet.monkey_patch()` from the top of `app.py`
3. Remove `eventlet` from `requirements.txt`
4. Convert all `eventlet.spawn()` calls to `threading.Thread(target=..., daemon=True).start()`
5. Convert `eventlet.sleep()` calls to `time.sleep()`
6. Remove `pyinstaller_runtime_hook.py` from the spec (no longer needed)

---

## 6. Phase 1 — Build the Frontend

```bash
cd Frontend

# Use the desktop environment file
copy .env.desktop .env.production.local

# Build
npm run build
```

This creates `Frontend/dist/` with the production React build configured to use `http://localhost:5001` as the API URL.

### Copy to backend

```bash
# From project root
xcopy /E /Y /I Frontend\dist backend\frontend\dist
```

The Flask backend serves this via the catch-all route — any request to `http://localhost:5001/` that doesn't match an API route returns the React app.

---

## 7. Phase 2 — Freeze the Backend with PyInstaller

```bash
cd backend

# Full build using the spec file
python -m PyInstaller hercules.spec --noconfirm
```

This creates `backend/dist/hercules-backend/` containing:
- `hercules-backend.exe` — the frozen Flask+SocketIO server
- All Python dependencies, bundled DLLs (including snap7.dll)
- `frontend/dist/` — the React build
- `config/` — default configuration templates
- `migrations/` — SQL files for DB setup

### What the spec file does

- **Entry point:** `desktop_entry.py` (sets HERCULES_DESKTOP, configures logging, starts scheduler)
- **Runtime hook:** `pyinstaller_runtime_hook.py` (monkey-patches eventlet before any stdlib import)
- **Hidden imports:** All blueprints, workers, utils, PLC modules, and libraries that are dynamically imported
- **Bundled data:** `frontend/dist/`, `config/`, `migrations/`
- **Excluded:** Linux/macOS-only modules (`gunicorn`, `eventlet.hubs.epolls`, `eventlet.hubs.kqueue`)

### Test standalone

```bash
# Set required env vars
set DB_PORT=5432
set POSTGRES_PASSWORD=your_password

# Run
dist\hercules-backend\hercules-backend.exe
```

Verify at `http://localhost:5001`.

---

## 8. Phase 3 — Set Up the Electron Shell

```bash
cd desktop
npm install
```

### Key files

**`main.js`** handles the entire desktop app lifecycle:

1. **Single instance lock** — prevents running two copies
2. **Machine ID** — generates SHA-256 from hostname + MAC + disk serial (must match Python output)
3. **License check** — POST to `api.herculesv2.app/api/license/register` with full machine info
4. **First-run wizard** — if no `db_config.json` exists, shows setup wizard
5. **Port check** — verifies ports 5432 and 5001 are free
6. **PostgreSQL** — runs `initdb` (first time), then `pg_ctl start`
7. **Backend** — spawns `hercules-backend.exe` with environment variables
8. **Health poll** — hits `/health` every 500ms until 200 response
9. **BrowserWindow** — loads `http://localhost:5001`
10. **System tray** — minimize to tray, double-click to restore
11. **Periodic license recheck** — every 60 minutes
12. **Shutdown** — `taskkill` for backend, `pg_ctl stop` for PostgreSQL

### For development testing

```bash
cd desktop
npm start
```

This runs Electron in dev mode. It will try to find `hercules-backend.exe` and PostgreSQL — in dev mode, you can run the backend separately with `python app.py`.

---

## 9. Phase 4 — Bundle PostgreSQL and VC++ Redistributable

### PostgreSQL Portable

1. Download PostgreSQL portable/zip distribution from https://www.postgresql.org/download/
2. Extract only the essentials: `bin/`, `lib/`, `share/`
3. Place in `desktop/pgsql/`

**Required files in `pgsql/bin/`:**
- `pg_ctl.exe`
- `initdb.exe`
- `pg_isready.exe`
- `postgres.exe`
- `psql.exe` (for migrations)
- Various `lib*.dll` files

### VC++ Redistributable

1. Download `vc_redist.x64.exe` from Microsoft
2. Place in `desktop/vcredist/vc_redist.x64.exe`

The NSIS installer will check the registry and silently install it if missing.

---

## 10. Phase 5 — Build the Installer

```bash
cd desktop
npm run build
```

This runs `electron-builder --win` which:
1. Packages the Electron app with all extra resources
2. Creates an NSIS installer at `desktop/dist/Hercules Reporting Module Setup *.exe`

### What gets bundled

| Component | Size | Location in installer |
|-----------|------|----------------------|
| Electron runtime | ~80 MB | App root |
| Python backend (PyInstaller) | ~100 MB | `resources/backend/` |
| PostgreSQL portable | ~80 MB | `resources/pgsql/` |
| React frontend | ~15 MB | Inside backend |
| VC++ Redistributable | ~15 MB | `resources/vcredist/` |
| **Total** | **~275 MB** | |

### Install locations

- **Application:** `C:\Program Files\Hercules Reporting Module\`
- **User data:** `%APPDATA%\Hercules\`
  - `config/` — PLC, SMTP, shifts, demo mode configs
  - `logs/` — `hercules.log` (rotating, 10 MB x 5)
  - `pgdata/` — PostgreSQL data directory
  - `license_cache.json` — cached license for offline grace period

---

## 11. Phase 6 — Run the Database Migration

The new migration `add_license_machine_info.sql` adds columns to the `licenses` table. This runs automatically:

- **New installs:** `init_db.py` runs all migrations in order during the setup wizard
- **Existing installs (web):** Run manually:

```bash
cd backend
python -c "
import psycopg2
conn = psycopg2.connect(dbname='dynamic_db_hercules', user='postgres', password='Admin@123', host='127.0.0.1', port=5432)
conn.autocommit = True
cur = conn.cursor()
with open('migrations/add_license_machine_info.sql') as f:
    cur.execute(f.read())
print('Migration complete')
conn.close()
"
```

Or use `psql`:

```bash
psql -h 127.0.0.1 -U postgres -d dynamic_db_hercules -f migrations/add_license_machine_info.sql
```

---

## 12. Phase 7 — Test on a Clean Windows VM

### Setup

1. Create a Windows 10/11 VM with no development tools
2. Copy the installer (`Hercules Reporting Module Setup *.exe`)
3. Run the installer

### Test checklist

- [ ] Installer runs, installs to chosen directory
- [ ] VC++ Redistributable installs silently if missing
- [ ] First launch shows license-pending screen (machine registers on server)
- [ ] Admin approves license on herculesv2.app → restart app → loads
- [ ] Setup wizard appears on first approved launch
- [ ] PostgreSQL initializes (no locale errors)
- [ ] Backend starts, `/health` returns OK
- [ ] React app loads in the Electron window
- [ ] Login with admin/admin
- [ ] Report Builder works (create, edit, release)
- [ ] Live Monitor shows data (demo mode)
- [ ] WebSocket real-time updates flow
- [ ] PDF export works
- [ ] Minimize to tray works, double-click restores
- [ ] Backend crash → auto-restart (kill the process manually to test)
- [ ] License deny → warning → app quits after 5 minutes
- [ ] License expired → server returns `expired` (not `approved`)
- [ ] Disconnect internet → app runs on cached license for up to 7 days
- [ ] Logs written to `%APPDATA%\Hercules\logs\hercules.log`
- [ ] Port conflict → clear error dialog
- [ ] Ports bound to 127.0.0.1 only (not network-exposed)
- [ ] Uninstall preserves `%APPDATA%\Hercules\` data

---

## 13. One-Command Build

From the project root:

```bash
build-desktop.bat
```

This runs all 5 build phases in sequence:
1. Build frontend with `.env.desktop`
2. Copy frontend to backend
3. Verify psycopg2 is available
4. Build backend with PyInstaller
5. Build Electron installer

Output: `desktop\dist\Hercules Reporting Module Setup *.exe`

---

## 14. Manual Desktop Build (Step by Step)

If `build-desktop.bat` doesn't work, or you want to run each step individually, follow these exact commands in order. All commands assume you start from the project root: `Reporting_Module_v0.1\`.

### Step 1: Install all dependencies

```bash
:: Python backend dependencies
cd backend
pip install -r requirements.txt
pip install pyinstaller
cd ..

:: Frontend dependencies
cd Frontend
npm install
cd ..

:: Electron dependencies
cd desktop
npm install
cd ..
```

### Step 2: Build the React frontend for desktop

```bash
cd Frontend
copy /Y .env.desktop .env.production.local
npm run build
cd ..
```

**Expected output:** `Frontend/dist/` folder with `index.html` and `assets/` containing JS/CSS bundles.

> **If `npm run build` fails with `vite:html-inline-proxy` error:**
> This is a Vite 6.x bug with inline `<style>` tags in `index.html`. The fix is to move
> the inline CSS to a separate file in `public/` and link to it. This has already been
> done — the preloader CSS lives in `Frontend/public/preloader.css` and is loaded via
> `<link rel="stylesheet" href="/preloader.css">` in `index.html`.
> If you still see the error, make sure `index.html` has NO `<style>` tags.

### Step 3: Copy the frontend build into the backend

```bash
:: Delete old build if it exists
if exist backend\frontend\dist rmdir /s /q backend\frontend\dist

:: Copy the fresh build
xcopy /E /Y /I Frontend\dist backend\frontend\dist
```

**Verify:** `backend\frontend\dist\index.html` should exist.

### Step 4: Run the POC test (first time only)

Skip this step if you've already validated eventlet + PyInstaller works.

```bash
cd backend
python -m PyInstaller --onedir poc_entry.py ^
    --runtime-hook=pyinstaller_runtime_hook.py ^
    --hidden-import=engineio.async_drivers.eventlet ^
    --hidden-import=eventlet.hubs.selects ^
    --hidden-import=psycopg2 ^
    --hidden-import=dns ^
    --hidden-import=dns.resolver

:: Test it (set your DB env vars first)
set DB_PORT=5434
set POSTGRES_DB=dynamic_db_hercules
dist\poc_entry\poc_entry.exe
```

Open `http://localhost:5001` — if Flask loads and the React app works, proceed.

### Step 5: Freeze the full backend with PyInstaller

```bash
cd backend
python -m PyInstaller hercules.spec --noconfirm
cd ..
```

**Expected output:** `backend\dist\hercules-backend\hercules-backend.exe` plus all bundled files.

**Verify standalone:**

```bash
set DB_PORT=5432
set POSTGRES_PASSWORD=your_password
set POSTGRES_DB=dynamic_db_hercules
backend\dist\hercules-backend\hercules-backend.exe
```

Open `http://localhost:5001/health` — should return `{"status": "ok"}`.

### Step 6: Add required external files

Before building the Electron installer, you must manually place:

```
desktop\
├── icons\
│   └── icon.ico           ← Your app icon (256x256 .ico)
├── pgsql\
│   └── bin\               ← PostgreSQL portable (pg_ctl.exe, initdb.exe, etc.)
│       ├── pg_ctl.exe
│       ├── initdb.exe
│       ├── pg_isready.exe
│       ├── postgres.exe
│       └── (lib*.dll files)
└── vcredist\
    └── vc_redist.x64.exe  ← Microsoft VC++ Redistributable
```

**Download links:**
- PostgreSQL zip: https://www.postgresql.org/download/ → Windows → Zip archive
- VC++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe

### Step 7: Build the Electron installer

```bash
cd desktop
npm run build
cd ..
```

**Expected output:** `desktop\dist\Hercules Reporting Module Setup *.exe`

This is your final distributable installer (~275 MB).

### Step 8: Test on a clean machine

1. Copy the installer EXE to a Windows 10/11 VM with no dev tools
2. Run the installer
3. Launch the app
4. Verify: license check → setup wizard → app loads → WebSocket works

---

## 15. Troubleshooting

### Frontend build fails: `vite:html-inline-proxy` error

```
[vite:html-inline-proxy] Could not load index.html?html-proxy&inline-css&index=0.css
```

**Cause:** Vite 6.x cannot process inline `<style>` tags in `index.html` during production builds.

**Fix:** Move any inline CSS from `index.html` to a separate file in `Frontend/public/` and load it via `<link>`. This has already been applied — preloader CSS lives in `Frontend/public/preloader.css`.

### PyInstaller build fails

**"Module not found" errors:**
Add the missing module to `hiddenimports` in `hercules.spec` and rebuild.

**eventlet monkey-patch issues:**
Make sure `pyinstaller_runtime_hook.py` is listed in `runtime_hooks` in the spec. This ensures monkey-patching happens before PyInstaller's bootloader loads stdlib.

**snap7.dll not bundled:**
Check that python-snap7 is installed in the same environment you're building from. The spec file auto-detects it.

### Backend doesn't start in Electron

Check `%APPDATA%\Hercules\logs\hercules.log` for Python errors.

Common issues:
- Wrong DB port/password — check the env vars passed in `main.js`
- Missing DLLs — ensure VC++ Redistributable is installed
- Port already in use — another instance may be running

### Machine ID mismatch between Python and Node.js

Both must produce the same SHA-256. Debug by:
```bash
# Python
python backend/machine_id.py

# Node.js (from desktop/ directory)
node -e "const main = require('./main'); console.log(main.getMachineId())"
```

Compare the outputs. Common differences:
- MAC format: Python uses `uuid.getnode()`, Node.js uses `os.networkInterfaces()`
- Disk serial: both must use PowerShell `Get-CimInstance` (not `wmic`)

### License check fails

1. Verify internet access to `api.herculesv2.app`
2. Check if the machine is registered (Licenses page in admin portal)
3. Check the offline cache at `%APPDATA%\Hercules\license_cache.json`

---

## 16. File Reference

### Complete new directory structure

```
Reporting_Module_v0.1/
├── build-desktop.bat              # Full build pipeline
├── backend/
│   ├── config_paths.py            # Config dir resolver (%APPDATA% vs local)
│   ├── machine_id.py              # Hardware fingerprint (SHA-256)
│   ├── desktop_entry.py           # PyInstaller entry point
│   ├── init_db.py                 # Standalone DB setup
│   ├── poc_entry.py               # POC test entry point
│   ├── pyinstaller_runtime_hook.py # eventlet monkey-patch hook
│   ├── hercules.spec              # PyInstaller spec
│   └── migrations/
│       └── add_license_machine_info.sql
├── Frontend/
│   └── .env.desktop               # VITE_API_URL=http://localhost:5001
└── desktop/
    ├── package.json               # Electron + electron-builder
    ├── main.js                    # Main process
    ├── preload.js                 # IPC bridge
    ├── splash.html                # Loading screen
    ├── license-pending.html       # Awaiting approval
    ├── license-denied.html        # Denied/expired
    ├── setup-wizard.html          # First-run wizard
    ├── icons/
    │   └── icon.ico               # App icon (YOU MUST ADD THIS)
    ├── installer-scripts/
    │   └── vcredist-check.nsh     # NSIS VC++ check
    ├── pgsql/                     # YOU MUST ADD: PostgreSQL portable
    └── vcredist/                  # YOU MUST ADD: vc_redist.x64.exe
```

### What you still need to manually add

| Item | Where to get it | Where to put it |
|------|-----------------|-----------------|
| **App icon** | Create a 256x256 `.ico` file | `desktop/icons/icon.ico` |
| **PostgreSQL portable** | postgresql.org/download | `desktop/pgsql/` (bin/, lib/, share/) |
| **VC++ Redistributable** | microsoft.com | `desktop/vcredist/vc_redist.x64.exe` |
| **Code signing certificate** | DigiCert, Sectigo, etc. | Configure in electron-builder |

---

## License Enforcement Summary

| Layer | Where | When | What it does |
|-------|-------|------|-------------|
| **Electron gate** | `main.js` | Before anything starts | Checks api.herculesv2.app, shows pending/denied screen or proceeds |
| **Python gate** | `desktop_entry.py` | Before Flask starts | Secondary check (logs warning, does not block — Electron is primary) |
| **Server-side expiry** | `license_bp.py` | Every register/status call | Returns `expired` if past expiry date (can't be bypassed by patching client) |
| **Periodic recheck** | `main.js` | Every 60 minutes | If no longer approved, warns user → quits after 5 minutes |
| **Offline grace** | `main.js` | When no internet | Uses cached license for up to 7 days from last successful check |

---

*Last updated: 2026-03-24*
