# Hercules — Auto-Deploy Guide

How the Reporting Module auto-deploys when code is pushed to the `main` branch.

---

## Architecture

```
Push to main branch
    │
    ├─► Vercel ─── auto-deploys Frontend (React)
    │
    └─► GitHub Actions (self-hosted runner on server)
         ├── git pull
         ├── pip install (new dependencies)
         ├── Run DB migrations
         ├── nssm restart backend service
         └── Health check
```

| Component    | Hosting                                | Auto-deploy? |
|-------------|----------------------------------------|-------------|
| **Frontend** | Vercel (herculesv2.app)               | Yes — Vercel watches `main` |
| **Backend**  | Local server, Windows service (nssm)  | Yes — GitHub Actions self-hosted runner |
| **Database** | Local PostgreSQL (port 5433)          | Yes — migrations run on each deploy |
| **Tunnel**   | Cloudflare Tunnel (configured separately) | Always on |

---

## How It Works

1. Developer pushes code to the `main` branch on GitHub
2. **Vercel** detects the push and auto-deploys the frontend
3. **GitHub Actions** triggers the `Deploy Reporting Module` workflow
4. The **self-hosted runner** on the server executes:
   - `git pull origin main` — pulls latest code
   - `pip install -r requirements.txt` — installs any new Python packages
   - `setup_local_db.py --no-seed` — runs new DB migrations (safe to re-run, skips existing)
   - `nssm restart hercules-backend` — restarts the backend service
   - Health check — verifies the backend responds on port 5001

---

## Key Paths on the Server

| Item | Path |
|------|------|
| Project root | `D:\Reporting_hercules\Reporting_Module_v0.1` |
| Backend code | `D:\Reporting_hercules\Reporting_Module_v0.1\backend` |
| Python venv | `D:\Reporting_hercules\Reporting_Module_v0.1\backend\venv` |
| nssm.exe | `D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe` |
| Service logs | `D:\Reporting_hercules\Reporting_Module_v0.1\backend\logs\service.log` |
| GitHub runner | `C:\actions-runner` |
| Deploy workflow | `.github\workflows\deploy.yml` |

---

## Backend Service Management (nssm)

The backend runs as a Windows service called `hercules-backend`, managed by [nssm](https://nssm.cc) (Non-Sucking Service Manager). It starts automatically on boot and is restarted by the deploy workflow.

### Check if backend is running

```powershell
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe status hercules-backend
```

Expected output: `SERVICE_RUNNING`

### Stop the backend

```powershell
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe stop hercules-backend
```

### Start the backend

```powershell
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe start hercules-backend
```

### Restart the backend

```powershell
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe restart hercules-backend
```

### View backend logs

```powershell
Get-Content D:\Reporting_hercules\Reporting_Module_v0.1\backend\logs\service.log -Tail 50
```

Or to follow logs in real-time:

```powershell
Get-Content D:\Reporting_hercules\Reporting_Module_v0.1\backend\logs\service.log -Tail 50 -Wait
```

### Remove the service entirely

```powershell
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe stop hercules-backend
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe remove hercules-backend confirm
```

After removing, you would need to run the backend manually: `cd backend && python app.py`

### Re-create the service

```powershell
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe install hercules-backend "D:\Reporting_hercules\Reporting_Module_v0.1\backend\venv\Scripts\python.exe" "app.py"
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe set hercules-backend AppDirectory "D:\Reporting_hercules\Reporting_Module_v0.1\backend"
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe set hercules-backend AppStdout "D:\Reporting_hercules\Reporting_Module_v0.1\backend\logs\service.log"
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe set hercules-backend AppStderr "D:\Reporting_hercules\Reporting_Module_v0.1\backend\logs\service.log"
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe start hercules-backend
```

---

## GitHub Actions Self-Hosted Runner

The runner listens for workflow jobs from GitHub and executes them on the server.

### Check runner status

Go to: https://github.com/husam-hammami/Reporting_Module_v0.1/settings/actions/runners

### Start the runner (if stopped)

```powershell
cd C:\actions-runner
.\run.cmd
```

Keep the window open — the runner stops if you close it.

### View workflow runs

Go to: https://github.com/husam-hammami/Reporting_Module_v0.1/actions

---

## Important Notes

- **Do NOT run `python app.py` manually** — the nssm service handles it. Running both will cause a port conflict on 5001.
- **Backend .env file** is not in git. The deploy workflow passes DB credentials as environment variables in the migration step.
- **DB migrations are idempotent** — running them multiple times is safe. Existing tables/columns are skipped.
- **The runner processes one job at a time.** If multiple pushes happen quickly, they queue up.

---

## Troubleshooting

### Backend not responding after deploy

```powershell
# Check service status
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe status hercules-backend

# Check logs for errors
Get-Content D:\Reporting_hercules\Reporting_Module_v0.1\backend\logs\service.log -Tail 100

# Restart manually
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe restart hercules-backend
```

### Deploy workflow stuck as "Queued"

The self-hosted runner is offline. Start it:

```powershell
cd C:\actions-runner
.\run.cmd
```

### Deploy workflow fails at "Install dependencies"

Check `requirements.txt` for syntax errors. Common issue: using `+=` instead of `>=` or `==`.

### Deploy workflow fails at "Run DB migrations"

Check that PostgreSQL is running on port 5433 and the credentials in `deploy.yml` are correct.

### Port conflict (Address already in use)

Two Python processes are trying to use port 5001:

```powershell
# Find what's using port 5001
netstat -ano | findstr "5001"

# Kill a specific PID
Stop-Process -Id <PID> -Force

# Then restart the service
D:\Reporting_hercules\Reporting_Module_v0.1\nssm.exe restart hercules-backend
```

---

*Created: 2026-03-27*
