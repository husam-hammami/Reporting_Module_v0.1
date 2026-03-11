# Hercules Reporting — Salalah PC Deployment (Auto-Deploy)

## Overview

The Hercules Reporting Module is deployed on **Salalah PC** with **auto-deploy** enabled. When you push a commit to the `main` branch on GitHub, the self-hosted runner on the server automatically pulls the latest code and restarts the backend and frontend Docker containers with the updated application.

The database (PostgreSQL) is **not** restarted on deploy, so data and connectivity remain intact.

---

## How It Works

1. **You push** to `main` (e.g. `git push origin main`).
2. **GitHub Actions** triggers the workflow defined in `.github/workflows/deploy.yml`.
3. The job runs on the **self-hosted runner** installed on Salalah PC.
4. The runner:
   - Pulls the latest code from GitHub (`git pull origin main`).
   - Rebuilds and restarts the **backend** container.
   - Rebuilds and restarts the **frontend** container.
   - Leaves **Postgres** running (no restart).
5. The Reporting Module is then serving the latest code.

---

## Components

| Component        | Role |
|-----------------|-----|
| **GitHub repo** | Source of truth; push to `main` to deploy. |
| **GitHub Actions** | Runs the deploy workflow on every push to `main`. |
| **Self-hosted runner** | Windows service on Salalah PC that executes the workflow. |
| **Docker Compose** | Runs backend, frontend, and Postgres; workflow uses `docker compose -p reporting_module_v01` to target this stack. |

---

## Workflow File

The auto-deploy workflow is defined in:

- **`.github/workflows/deploy.yml`**

It runs on `push` to `main`, uses `runs-on: self-hosted`, and sets a default working directory and PowerShell shell so all steps run in the correct repo path on Salalah PC.

---

## After a Deploy

- **Backend** and **frontend** containers are rebuilt and restarted with the new code.
- **Postgres** keeps running; no data loss or re-migration.
- Typical deploy duration is on the order of tens of seconds to a couple of minutes, depending on build time.

---

## Manual Run (Optional)

To run the same deploy steps manually on Salalah PC (without pushing):

```powershell
cd C:\Users\Administrator\Desktop\Config_system\V3\Reporting_Module_v0.1\Reporting_Module_v0.1
git pull origin main
docker compose -p reporting_module_v01 build backend
docker compose -p reporting_module_v01 up -d backend
docker compose -p reporting_module_v01 build frontend
docker compose -p reporting_module_v01 up -d frontend
docker ps
```

---

## Related Docs

- **DOCKER.md** (repo root) — Running the stack with Docker Compose.
- **docs/deployment/DEPLOYMENT_PLAN.md** — Broader deployment architecture and options.
- **docs/14-DEPLOYMENT.md** — General deployment and environment notes.
