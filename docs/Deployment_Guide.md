# Hercules Reporting Module — Deployment Guide

## Prerequisites

### Target PC Requirements
- Windows 10/11 or Windows Server 2019/2022
- 4GB RAM minimum
- Internet connection for license check and OTA updates
- Network access to PLC (Siemens S7 via Ethernet)

### VC++ Redistributable
The installer auto-installs VC++ Redistributable. If it fails:
1. Navigate to install directory → `resources\vcredist\`
2. Run `vc_redist.x64.exe /install /quiet /norestart`
3. Restart the app

## Salalah Mill Server

### Server Info
- **OS**: Windows Server 2022 (Build 20348.2655)
- **User**: Administrator
- **DNS Suffix**: mercury-mes.net

### Network Interfaces

| Adapter | IP Address | Subnet | Gateway | Purpose |
|---------|-----------|--------|---------|---------|
| ASM Network | 192.168.23.9 | 255.255.255.0 | 192.168.23.1 | Main network (MES) |
| Plant Network | 192.168.23.241 | 255.255.255.0 | — | PLC / plant floor |
| vEthernet (ASM Network) | 192.168.31.233 | 255.255.255.0 | — | Virtual switch |

### LAN Access
- From ASM Network: `http://192.168.23.9:5001`
- From Plant Network: `http://192.168.23.241:5001`

### Remote Access (SSH via Cloudflare Tunnel)
- **Hostname**: `ssh-salalah.herculesv2.app`
- **Tunnel name**: `salalah-mill` (Cloudflare Zero Trust dashboard)
- **Server service**: `cloudflared` Windows service (auto-starts on boot)
- **Server SSH**: OpenSSH Server on port 22, key auth enabled
- **Connect**: Double-click `Connect-Salalah-Mill.bat` on desktop, or manually:
  1. `cloudflared access tcp --hostname ssh-salalah.herculesv2.app --url localhost:2222`
  2. `ssh -p 2222 Administrator@localhost`
- **SSH key**: `C:\ProgramData\ssh\administrators_authorized_keys` on server

## Fresh Installation

### Step 1: Download Installer
- Go to GitHub Releases: `https://github.com/husam-hammami/Reporting_Module_v0.1/releases`
- Download the latest `Hercules-Setup-salalah_mill_b-v*.exe`

### Step 2: Install
- Run the installer
- Choose install directory (default or custom)
- VC++ Redistributable is auto-installed if missing
- Desktop shortcut is created

### Step 3: First Launch
- Launch "Hercules Reporting Module" from desktop
- License check runs (machine registers with api.herculesv2.app)
- If license is pending: contact admin to approve the machine
- Setup wizard runs on first launch:
  - Database initialization (PostgreSQL)
  - PLC configuration
  - SMTP configuration (optional)
- Login with default credentials: `admin` / `admin`
- **Change the admin password immediately**

## Data Storage

| Data | Location | Survives Reinstall? |
|------|----------|-------------------|
| Database (tags, templates, history) | `%APPDATA%\Hercules\pgdata\` | YES |
| Config (PLC, SMTP, DB settings) | `%APPDATA%\Hercules\config\` | YES |
| Backend logs | `%APPDATA%\Hercules\logs\` | YES |
| PostgreSQL logs | `%APPDATA%\Hercules\pg.log` | YES |
| License cache | `%APPDATA%\Hercules\license_cache.json` | YES |
| App code | Install directory → `resources\` | Replaced on install/OTA |

**Reinstalling the app NEVER touches your data.** Only the app code is replaced.

## OTA Updates

### Automatic (on every app launch)
1. Splash screen appears
2. App checks GitHub Releases for a newer `.zip`
3. If found: downloads with progress bar → extracts → starts new backend
4. If offline: starts normally with existing version

### Manual (from inside the app)
1. Go to Settings → Updates
2. Click "Check for Updates"
3. If update available: click "Install & Restart"
4. App restarts and applies the update

### What OTA Updates
- Backend code (Flask, blueprints, workers)
- Frontend code (React SPA)
- Database migrations (auto-run on backend startup)

### What OTA Does NOT Update
- Electron shell (main.js, splash.html)
- PostgreSQL binaries
- VC++ Redistributable

For Electron-level fixes, a new installer must be downloaded and run.

## Network Access (LAN)

To access the app from other PCs on the network:

### Automatic Setup
The backend binds to `0.0.0.0` by default, allowing LAN access. A Windows Firewall rule is needed:

```powershell
netsh advfirewall firewall add rule name="Hercules Reporting" dir=in action=allow protocol=tcp localport=5001
```

### Access from Other PCs
Open a browser on any LAN PC and go to: `http://<server-ip>:5001`

## Auto-Start on Boot

The app can be configured to start automatically when Windows boots:

```powershell
# Add to Windows startup
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "HerculesReporting" /t REG_SZ /d "\"C:\path\to\Hercules Reporting Module.exe\"" /f
```

## Close Behavior

- **Clicking X**: Shows "Minimize" or "Quit" dialog
  - Minimize: Hides window, PLC polling continues in background
  - Quit: Stops everything (backend, PostgreSQL, PLC polling)
- **System tray**: If tray icon is active, X hides to tray (no dialog)
- **PLC polling is protected**: Accidental window close does NOT stop data collection

## Running Backend Manually (Without Electron)

For debugging or server deployments without the Electron app:

### 1. Start PostgreSQL
```powershell
& "C:\Users\Administrator\AppData\Local\Programs\Hercules Reporting Module\resources\pgsql\bin\pg_ctl.exe" start -D "$env:APPDATA\Hercules\pgdata" -l "$env:APPDATA\Hercules\pg.log"
```
Check which port it started on: `netstat -ano | findstr LISTEN | findstr 543`

### 2. Start Backend
```powershell
cd "C:\Users\Administrator\AppData\Local\Programs\Hercules Reporting Module\resources\backend"
$env:DB_PORT="<port from step 1>"    # Usually 5432 if manual, 5435 if Electron started PG
$env:POSTGRES_DB="dynamic_db_hercules"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD=""
$env:FLASK_HOST="0.0.0.0"
$env:FLASK_PORT="5001"
.\hercules-backend.exe
```

### Important Notes
- **Port mismatch is the #1 issue.** Electron starts PG on 5435. Manual `pg_ctl start` uses the port in `postgresql.conf` (default 5432). Always verify with `netstat`.
- **`db_config.json`** at `%APPDATA%\Hercules\config\` stores `db_port`. The backend reads this. Electron overwrites it on startup to 5435.
- **PLC errors will flood logs** if PLCs are unreachable — this is expected on servers without PLC access. The backend still serves HTTP requests.
- **Use `Start-Process`** in PowerShell if you want the backend to run in background.

## Troubleshooting

### App won't start
1. Check if another Hercules instance is running (Task Manager → look for `hercules-backend.exe`)
2. Kill it and retry
3. Check `%APPDATA%\Hercules\pg.log` for PostgreSQL errors

### Login returns "Server Error"
1. Restart the app — `_run_startup_migrations` fixes password hash format on startup
2. If persists: admin password hash may be corrupted. Delete the pgdata and let it recreate.

### Splash stuck on "Starting services..."
1. Wait 15 seconds — fallback timeout auto-dismisses it
2. Click the X button on the splash
3. Check if the app loaded behind the splash (try `http://127.0.0.1:5001` in a browser)

### PostgreSQL won't start
1. Check if VC++ Redistributable is installed
2. Check `%APPDATA%\Hercules\pg.log` for errors
3. Verify `resources\pgsql\bin\` contains PostgreSQL binaries
4. Check for port 5435 conflicts: `netstat -ano | findstr 5435`

### Missing tables / database errors
1. Backend auto-creates tables on startup via `_run_startup_migrations`
2. Restart the app to trigger migrations
3. Check backend logs in Settings → System Logs

### PLC not connecting
1. Verify PLC IP and rack/slot in Settings
2. Check network connectivity: `ping <plc-ip>`
3. Ensure PLC is configured for S7 communication on port 102

## Updating to New Versions

### For existing installations
Just reopen the app — OTA handles everything automatically.

### For new client PCs
Download the latest installer from GitHub Releases and run it.

### For Electron shell updates
Download and run the new installer over the existing installation. Data is preserved.
