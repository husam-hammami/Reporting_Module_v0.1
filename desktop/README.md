# Hercules Desktop App — Quick Guide

## Overview

Packages the Hercules Reporting Module (React + Flask + PostgreSQL) into a standalone Windows desktop application with license enforcement.

## Architecture

```
[NSIS Installer] → Electron → spawns Flask backend (.exe) → serves React on localhost:5001
                 → bundled PostgreSQL
                 → license gate → api.herculesv2.app
```

## Prerequisites (Build Machine)

- **Windows 10/11** (building must happen on Windows)
- **Node.js 18+** and npm
- **Python 3.10+** with pip
- **Git**

## Quick Start (Development)

```bash
# 1. Install desktop dependencies
cd desktop
npm install

# 2. Install backend Python deps
cd ../backend
pip install -r requirements.txt

# 3. Run in dev mode (no PyInstaller needed)
cd ../desktop
npm start
```

In dev mode, Electron will spawn `python desktop_entry.py` directly instead of the frozen .exe.

## Phase 0: Proof of Concept (DO THIS FIRST)

Before building the full app, validate that eventlet + PyInstaller works:

```bash
cd backend
pip install pyinstaller
pyinstaller --onedir desktop_entry.py
```

Then run `dist/desktop_entry/desktop_entry.exe` on a clean Windows machine and verify:
- Flask starts and serves the React app
- WebSocket connects from a browser at `http://localhost:5001`
- Background workers run (check logs)
- PLC emulator produces data in demo mode

**If this fails** — switch from `eventlet` to `threading` async mode (see plan Phase 0).

## Full Build

```bash
# From repo root:
build-desktop.bat
```

This runs 4 steps:
1. Builds React frontend (`npm run build`)
2. Copies `Frontend/dist/` → `backend/frontend/dist/`
3. Freezes Python backend with PyInstaller → `backend/dist/hercules-backend/`
4. Packages everything into an NSIS installer → `desktop/dist/`

## Bundling PostgreSQL

Download PostgreSQL portable (Windows x64) and place it in `desktop/pgsql/`:

```
desktop/pgsql/
  bin/
    pg_ctl.exe
    initdb.exe
    psql.exe
    postgres.exe
    ...
  lib/
    ...
  share/
    ...
```

**Source:** https://www.enterprisedb.com/download-postgresql-binaries
**Version:** PostgreSQL 16.x recommended
**Size:** ~80 MB

## Directory Structure

```
desktop/
  main.js              # Electron main process
  preload.js           # IPC bridge for renderer
  package.json         # Electron + electron-builder config
  splash.html          # Loading screen
  license-pending.html # Awaiting approval screen
  license-denied.html  # Denied/expired screen
  setup-wizard.html    # First-run configuration
  icons/icon.ico       # App icon
  pgsql/               # Bundled PostgreSQL (not in git)
```

## How Licensing Works

1. App starts → generates machine fingerprint (SHA-256 of hostname + MAC + disk serial)
2. POSTs to `api.herculesv2.app/api/license/register` with machine info
3. Server creates a `pending` record
4. Admin approves from the Licenses page on herculesv2.app
5. App polls every 30s until approved, then loads normally
6. Hourly background checks ensure license stays valid
7. 7-day offline grace period if internet is unavailable

**Two-layer enforcement:**
- **Electron gate** (main.js) — blocks before app loads
- **Python gate** (desktop_entry.py) — blocks before Flask starts

## First-Run Setup

On first launch (no `db_config.json` in `%APPDATA%/Hercules/config/`):
1. Database auto-initialization (creates tables + default admin)
2. PLC connection config (or enable Demo Mode)
3. Admin account creation
4. Config saved to `%APPDATA%/Hercules/config/`

## Config & Logs

All runtime data stored in `%APPDATA%/Hercules/`:

```
%APPDATA%/Hercules/
  config/
    db_config.json
    plc_config.json
    demo_mode.json
    smtp_config.json
    shifts_config.json
    license_cache.json
  logs/
    hercules.log         # Flask backend logs
    electron.log         # Electron main process logs
    postgresql.log       # PostgreSQL logs
  pgdata/                # PostgreSQL data directory
```

## Code Signing (Recommended)

Without a code signing certificate:
- Windows SmartScreen shows a warning on first download
- Windows Defender may quarantine the unsigned PyInstaller exe

Get an EV code signing certificate and configure in `desktop/package.json`:
```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/cert.pfx",
      "certificatePassword": "..."
    }
  }
}
```

## Auto-Updates

Uses `electron-updater` with GitHub Releases. Configure a private GitHub repo for releases.

After updating, new database migrations are run automatically before starting the backend.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Port 5001 in use" | Close the app using port 5001 (or another Hercules instance) |
| Backend won't start | Check `%APPDATA%/Hercules/logs/hercules.log` |
| PostgreSQL won't start | Check `%APPDATA%/Hercules/logs/postgresql.log` |
| License stuck on pending | Ask admin to approve on herculesv2.app Licenses page |
| SmartScreen warning | Expected without code signing — click "More info" → "Run anyway" |
| Defender quarantine | Add exe to Defender exclusions, or get code signing cert |

## Testing Checklist

See `docs/Desktop_App_Plan_2026-03-18.md` for the full testing checklist (22 items).
