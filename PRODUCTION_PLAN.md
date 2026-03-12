# Production Plan — Hercules Reporting Module Standalone Installer

## Overview

Turn the Hercules Reporting Module into a standalone Windows installer (.exe) that:
- Installs and runs everything with zero technical knowledge
- Auto-updates from GitHub when new code is pushed
- Licenses users via MAC address fingerprinting stored in the GitHub repo
- Requires no Docker, no Python, no Node.js, no Postgres install from the user

---

## Architecture

```
ReportingModuleSetup.exe (Inno Setup Installer)
  │
  └── C:\ReportingModule\
      ├── pgsql\              Portable PostgreSQL binaries
      ├── python\             Embedded Python 3.9 + all pip packages
      ├── web\                Pre-built React dist/ (Vite output)
      ├── backend\            Flask source code
      ├── config\             App config (auto-generated .env, plc_config, etc.)
      ├── data\               PostgreSQL data directory (initdb output)
      ├── launcher.exe        Compiled launcher (starts everything)
      └── updater.exe         Background update service
```

---

## Component Breakdown

### 1. Launcher (launcher.py → compiled to launcher.exe)

**Responsibilities:**
- Start portable PostgreSQL via `pg_ctl start`
- Wait for Postgres to be ready (pg_isready check loop)
- Run `setup_local_db.py` logic on first launch (create DB, migrations, seed, default user)
- Start Flask backend (`python app.py`) as subprocess
- Open default browser to `http://localhost:5001`
- System tray icon with: Open Browser / Restart / Stop / Exit
- On exit: stop Flask, stop Postgres cleanly via `pg_ctl stop`

**First run detection:**
- Check if `data\` directory exists (PostgreSQL data dir)
- If not → run `initdb` → create database → run migrations → seed
- If yes → just start Postgres and Flask

### 2. Updater (updater.py → compiled to updater.exe)

**Responsibilities:**
- Runs as background process (started by launcher)
- Polls GitHub Releases API every 5 minutes:
  `GET https://api.github.com/repos/husam-hammami/Reporting_Module_v0.1/releases/latest`
- Compares remote version tag vs local `version.txt`
- If new version detected:
  1. Download release asset (zip of backend/ + web/)
  2. Extract and replace `backend\` and `web\` files
  3. Check for new migration SQL files → run them against local DB
  4. Restart Flask process (kill old, start new)
  5. Update local `version.txt`
- Uses GitHub fine-grained PAT for authenticated API calls (higher rate limit)

**Update behavior:**
- Frontend updates: immediate on next browser refresh (static file swap)
- Backend updates: 2-3 second Flask restart, WebSocket auto-reconnects
- DB migrations: run before Flask restart, data preserved

### 3. Licensing System (licensing.py)

**Storage:** `licenses.json` file in the GitHub repo

**Format:**
```json
{
  "machines": [
    {
      "mac": "AA:BB:CC:DD:EE:FF",
      "hostname": "FACTORY-PC-1",
      "status": "allowed",
      "note": "Line 1 main operator PC",
      "registered": "2026-03-12T10:30:00Z"
    }
  ]
}
```

**Statuses:**
- `allowed` — full access
- `banned` — app locks with "Contact administrator" message
- `limited` — app runs in read-only / demo mode (future use)

**Registration flow (first install):**
1. Collect machine fingerprint: MAC address + hostname
2. Check if MAC exists in `licenses.json` (fetch via GitHub API)
3. If not found → add entry with `status: "allowed"` → commit via GitHub API
4. If found → enforce current status

**Enforcement flow (every launch + every browser refresh):**
1. Backend fetches `licenses.json` from GitHub (cached for 60 seconds)
2. Looks up current machine's MAC
3. Returns status to frontend via `GET /api/license-check`
4. Frontend enforces: banned → redirect to lock screen

**Admin workflow (you):**
- Open `licenses.json` on GitHub
- Change any machine's status to `banned`
- Next check cycle (within 60 seconds) → that machine is locked out

**GitHub API Token:**
- Fine-grained PAT scoped to this repo only, contents read/write only
- Embedded in the app (obfuscated)
- If compromised: revoke and regenerate, push new token in next update

### 4. App Modifications (app.py changes)

**Serve React frontend directly from Flask:**
- Already partially done (`static_folder='frontend/dist'`, catch-all route exists)
- Ensure `web\` folder is used as static folder in installer mode
- No Nginx needed — Flask serves static files directly

**New endpoint: `GET /api/license-check`**
- Calls licensing module
- Returns `{ "status": "allowed" | "banned" | "limited", "mac": "..." }`
- Frontend checks this on every page load / route change

**Environment detection:**
- New env var: `HERCULES_MODE=standalone` (vs `docker` or `dev`)
- Adjusts DB defaults, static folder path, log file location based on mode

### 5. Installer (Inno Setup)

**What gets bundled:**
- Portable PostgreSQL 17 for Windows (~150MB compressed)
- Python 3.9 embeddable zip + pre-installed pip packages (~80MB)
- Pre-built React dist/ (~5MB)
- Backend source code (~2MB)
- Migration SQL files
- launcher.exe + updater.exe
- Default .env template

**Installer behavior:**
1. Standard Windows installer UI (Next → Next → Install)
2. Extracts all files to `C:\ReportingModule\` (user can change)
3. Creates Start Menu shortcut → launcher.exe
4. Creates Desktop shortcut → launcher.exe
5. Optionally adds to Windows startup (checkbox in installer)
6. Runs launcher.exe after install completes

**Uninstaller:**
- Stops Postgres + Flask
- Removes all files (asks about keeping database data)
- Removes shortcuts and startup entry

### 6. Build Pipeline (GitHub Action)

**Trigger:** Manual dispatch or new git tag (e.g., `v0.1.5`)

**Steps:**
1. Check out code
2. Build React frontend: `npm ci && npm run build`
3. Download portable PostgreSQL binaries (cached)
4. Download Python embeddable zip (cached)
5. Install pip packages into embedded Python: `python\python.exe -m pip install -r requirements.txt --target python\Lib`
6. Compile launcher.py → launcher.exe (Nuitka or PyInstaller, on Windows runner)
7. Compile updater.py → updater.exe
8. Run Inno Setup compiler → produces `ReportingModuleSetup.exe`
9. Create GitHub Release with installer attached

**Runner:** Self-hosted Windows runner (same one used for deploy.yml)

---

## File Structure (New Files)

```
Reporting_Module_v0.1/
├── installer/
│   ├── launcher.py              Main launcher script
│   ├── updater.py               Background auto-updater
│   ├── licensing.py             MAC fingerprint + GitHub license check
│   ├── build_installer.py       Build script (downloads deps, runs Inno Setup)
│   ├── inno_setup.iss           Inno Setup configuration
│   ├── icon.ico                 App icon for installer + shortcuts
│   └── version.txt              Current version number
├── licenses.json                Machine registry (committed to repo)
├── backend/                     (existing — no structural changes)
├── Frontend/                    (existing — no structural changes)
└── .github/workflows/
    ├── deploy.yml               (existing — Docker auto-deploy, unchanged)
    └── build-installer.yml      NEW: builds Windows installer on tag/release
```

---

## Version Strategy

- `version.txt` in repo root contains current version (e.g., `0.1.5`)
- Git tags match version: `v0.1.5`
- Updater compares local `version.txt` vs latest GitHub Release tag
- Migrations are cumulative (IF NOT EXISTS / safe to re-run)
- New migrations get a higher sequence number in MIGRATION_ORDER

---

## Security Considerations

1. **GitHub PAT exposure**: Fine-grained token, single repo, contents-only permission. Obfuscated in compiled exe. Revocable if compromised.
2. **MAC spoofing**: A determined user could spoof MAC to bypass ban. Acceptable risk for this use case. Can add disk serial + motherboard ID for stronger fingerprint later.
3. **Code visibility**: Embedded Python means source code is readable in `backend\` folder. Acceptable since licensing enforcement happens server-side (GitHub check). User can't run the app if banned regardless of code access.
4. **Unsigned installer**: Windows SmartScreen will warn "Unknown publisher". Solution: purchase code signing certificate ($100-300/year) when ready for production distribution.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Portable Postgres permission issues on locked-down PCs | Medium | Test on clean Windows 10/11 VMs before distribution |
| Antivirus flags installer | Medium | Code signing certificate eliminates this |
| GitHub API rate limit (60/hr unauthenticated) | Low | Using authenticated PAT = 5000/hr, more than enough |
| snap7 DLL not found by embedded Python | Low | Bundle DLL in python\ directory, add to PATH |
| eventlet/WebSocket issues in embedded Python | Low | Test thoroughly; fallback to polling if needed |
| User has no internet (can't check license) | Medium | Cache last known status locally with 24hr expiry |

---

## Implementation Order

1. **licensing.py** — MAC collection + GitHub API read/write + enforcement
2. **licenses.json** — Initial empty registry in repo
3. **app.py modifications** — Add `/api/license-check` endpoint, standalone mode detection
4. **launcher.py** — Postgres + Flask lifecycle management, tray icon
5. **updater.py** — GitHub Release polling, download, apply, restart
6. **inno_setup.iss** — Installer configuration
7. **build_installer.py** — Automated build script
8. **build-installer.yml** — GitHub Action for CI builds
9. **Testing** — Clean Windows VM, full cycle: install → run → update → ban → verify
