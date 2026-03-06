# Salalah PC — Hercules Reporting Module: Deployment & Auto-Deploy Plan

**Date:** 2026-03-06
**Prepared for:** All team members (Salalah plant)
**Application:** Hercules Reporting Module v0.1
**Repository:** `husam-hammami/Reporting_Module_v0.1`

---

## Golden Rules

1. **Everyone works on `main`** — one branch, one source of truth
2. **Push to `main` = auto-deploy to Salalah PC** — no manual steps after initial setup
3. **Every deploy is tagged** — easy one-command rollback to any previous version

---

## Part 1: One-Time Setup on Salalah PC

> This section is done **once** by the person setting up the Salalah PC.
> After this, all future updates are automatic.

### 1.1 Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Python 3.10+
sudo apt install -y python3 python3-pip python3-venv

# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 17
sudo apt install -y postgresql-17

# Nginx
sudo apt install -y nginx

# Git
sudo apt install -y git

# snap7 (REQUIRED for PLC communication — without this, python-snap7 crashes)
sudo apt install -y libsnap7-1 libsnap7-dev
```

### 1.2 Clone the Repository

```bash
cd /opt
sudo mkdir hercules && sudo chown $USER:$USER hercules
git clone https://github.com/husam-hammami/Reporting_Module_v0.1.git /opt/hercules
cd /opt/hercules
git checkout main
```

### 1.3 Set Up PostgreSQL

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo -u postgres psql
```

```sql
CREATE USER hercules_app WITH PASSWORD '<CHOOSE-STRONG-PASSWORD>';
CREATE DATABASE dynamic_db_hercules OWNER hercules_app;
GRANT ALL PRIVILEGES ON DATABASE dynamic_db_hercules TO hercules_app;
\q
```

Run migrations:

```bash
cd /opt/hercules/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python tools/setup/setup_local_db.py
```

> First time: run without `--no-seed` to get demo tags for testing.
> Production: add `--no-seed` and configure real tags via Engineering UI.

### 1.4 Configure Backend

**Create `.env`:**

```bash
cp /opt/hercules/backend/.env.example /opt/hercules/backend/.env
```

Edit `/opt/hercules/backend/.env`:

```env
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=hercules_app
POSTGRES_PASSWORD=<SAME-PASSWORD-FROM-STEP-1.3>
DB_HOST=127.0.0.1
DB_PORT=5432
FLASK_SECRET_KEY=<RANDOM-64-CHAR-STRING>
USE_CENTRAL_HISTORIAN=true
```

**Configure PLC** — edit `/opt/hercules/backend/config/plc_config.json`:

```json
{
  "ip": "192.168.23.11",
  "rack": 0,
  "slot": 3
}
```

**Disable demo mode** — edit `/opt/hercules/backend/config/demo_mode.json`:

```json
{
  "enabled": false
}
```

> Verify PLC reachability: `nc -zv 192.168.23.11 102`

### 1.5 Build Frontend (first time)

```bash
cd /opt/hercules/Frontend
npm install
npm run build
sudo mkdir -p /usr/share/nginx/html
sudo cp -r dist/* /usr/share/nginx/html/
```

### 1.6 Configure Nginx

```bash
sudo cp /opt/hercules/nginx.conf /etc/nginx/conf.d/hercules.conf

# Fix: replace Docker service name with localhost
sudo sed -i 's|http://backend:5000|http://127.0.0.1:5000|g' /etc/nginx/conf.d/hercules.conf

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

### 1.7 Create Backend Systemd Service

Create `/etc/systemd/system/hercules-backend.service`:

```ini
[Unit]
Description=Hercules Reporting Module Backend
After=network.target postgresql.service

[Service]
Type=simple
User=hercules
WorkingDirectory=/opt/hercules/backend
Environment="PATH=/opt/hercules/backend/venv/bin"
EnvironmentFile=/opt/hercules/backend/.env
ExecStart=/opt/hercules/backend/venv/bin/gunicorn \
    --worker-class eventlet \
    -w 1 \
    --bind 0.0.0.0:5000 \
    --timeout 120 \
    app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false hercules 2>/dev/null
sudo chown -R hercules:hercules /opt/hercules
sudo systemctl daemon-reload
sudo systemctl enable hercules-backend
sudo systemctl start hercules-backend
```

**Critical:** Must use `-w 1` (single worker). WebSocket + eventlet breaks with multiple workers.

### 1.8 Verify Initial Setup

```bash
# Database
pg_isready -h 127.0.0.1 -p 5432 -d dynamic_db_hercules

# Backend API
curl http://localhost:5000/api/settings/system-status

# PLC network
nc -zv 192.168.23.11 102

# Frontend via Nginx
curl -s http://localhost | head -5

# Tags flowing
curl http://localhost:5000/api/live-monitor/tags
```

Open browser: **http://localhost** — login with `admin` / `admin` — **change password immediately**.

---

## Part 2: Auto-Deploy Setup (GitHub Actions Self-Hosted Runner)

> This makes it so **any push to `main`** automatically deploys to the Salalah PC.

### 2.1 What is a Self-Hosted Runner?

A small GitHub agent that runs on the Salalah PC. When someone pushes to `main`, GitHub tells this agent to pull the code and restart services. It runs as a background service — no manual intervention needed.

### 2.2 Install the Runner on Salalah PC

```bash
# Create runner directory
mkdir -p /opt/github-runner && cd /opt/github-runner

# Download (check https://github.com/actions/runner/releases for latest version)
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# Configure — get the token from:
# GitHub repo → Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/husam-hammami/Reporting_Module_v0.1 \
            --token <TOKEN-FROM-GITHUB> \
            --labels salalah-pc \
            --name salalah-runner

# Install as system service (auto-starts on boot)
sudo ./svc.sh install
sudo ./svc.sh start
```

### 2.3 Create the Auto-Deploy Workflow

Create this file in the repo at `.github/workflows/deploy-salalah.yml`:

```yaml
name: Deploy to Salalah PC

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: [self-hosted, salalah-pc]

    steps:
      - name: Pull latest code
        working-directory: /opt/hercules
        run: |
          git fetch origin main
          git checkout main
          git pull origin main

      - name: Tag this deploy (for rollback)
        working-directory: /opt/hercules
        run: |
          DEPLOY_TAG="deploy-$(date +%Y%m%d-%H%M%S)"
          git tag "$DEPLOY_TAG"
          echo "Tagged as: $DEPLOY_TAG"
          echo "DEPLOY_TAG=$DEPLOY_TAG" >> $GITHUB_ENV

      - name: Update backend dependencies (if changed)
        working-directory: /opt/hercules/backend
        run: |
          source venv/bin/activate
          pip install -r requirements.txt --quiet

      - name: Rebuild frontend (if changed)
        working-directory: /opt/hercules/Frontend
        run: |
          npm install --silent
          npm run build
          sudo cp -r dist/* /usr/share/nginx/html/

      - name: Restart backend service
        run: |
          sudo systemctl restart hercules-backend

      - name: Health check (wait for startup)
        run: |
          sleep 5
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/settings/system-status)
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "HEALTH CHECK FAILED — Status: $HTTP_STATUS"
            echo "Rolling back to previous version..."
            cd /opt/hercules
            git checkout HEAD~1
            sudo systemctl restart hercules-backend
            exit 1
          fi
          echo "Health check passed (HTTP $HTTP_STATUS)"

      - name: Deploy summary
        run: |
          echo "Deployed commit: $(cd /opt/hercules && git log --oneline -1)"
          echo "Deploy tag: ${{ env.DEPLOY_TAG }}"
          echo "Status: http://localhost:5000/api/settings/system-status"
```

**What this does on every push to `main`:**

1. Pulls the latest code
2. Creates a timestamped git tag (e.g., `deploy-20260306-143022`) for rollback
3. Updates Python & Node dependencies
4. Rebuilds the React frontend and copies to Nginx
5. Restarts the Flask backend
6. Runs a health check — **if it fails, automatically rolls back**

### 2.4 Give the Runner Permission to Restart Services

The runner needs `sudo` access for `systemctl` without a password:

```bash
# Create sudoers file for the runner
sudo visudo -f /etc/sudoers.d/github-runner
```

Add this line (replace `runner-user` with the user running the GitHub runner):

```
runner-user ALL=(ALL) NOPASSWD: /bin/systemctl restart hercules-backend, /bin/systemctl reload nginx, /bin/cp -r *
```

---

## Part 3: How Everyone Works — Single `main` Branch Workflow

### The Rule: Everyone pushes to `main`

```
Developer A (any PC)          Developer B (any PC)          Salalah PC
       │                             │                          │
       │  git push origin main       │                          │
       ├────────────────────────────► │                          │
       │                             │  git push origin main    │
       │                             ├─────────────────────────►│
       │                             │                          │
       │                     GitHub Actions triggers            │
       │                             │                          │
       │                   Self-hosted runner on Salalah PC     │
       │                             │     pulls + rebuilds     │
       │                             │     + restarts           │
       │                             │     + health check       │
       │                             │                          │
       │                             │      LIVE IN ~60 SECONDS │
```

### Daily Workflow for Every Team Member

```bash
# 1. Start of day — pull latest
cd /path/to/Reporting_Module_v0.1
git pull origin main

# 2. Make your changes (code, fix, feature — whatever)
#    ... edit files ...

# 3. Commit with a clear message
git add -A
git commit -m "Fix: corrected KPI formula for throughput calculation"

# 4. Push — this triggers auto-deploy to Salalah PC
git push origin main

# 5. Done. Salalah PC updates automatically in ~60 seconds.
```

### If Two People Push at the Same Time

```bash
# Git will reject the second push. Just pull and push again:
git pull origin main    # merges the other person's changes
git push origin main    # now it works
```

### Using Claude Code (AI Sessions)

Claude Code creates temporary branches like `claude/fix-something-abc123`. After the session:

```bash
# Merge Claude's work into main
git checkout main
git merge claude/fix-something-abc123
git push origin main    # triggers auto-deploy
```

---

## Part 4: Rollback — How to Undo a Bad Deploy

Every deploy creates a git tag like `deploy-20260306-143022`. This makes rollback trivial.

### Option 1: Rollback to Previous Deploy (most common)

SSH into the Salalah PC:

```bash
cd /opt/hercules

# See all deploy tags (most recent first)
git tag -l "deploy-*" --sort=-creatordate | head -10

# Example output:
#   deploy-20260306-143022   ← current (broken)
#   deploy-20260306-110515   ← previous (known good)
#   deploy-20260305-161230
#   ...

# Rollback to the previous good deploy
git checkout deploy-20260306-110515

# Rebuild and restart
cd Frontend && npm run build && sudo cp -r dist/* /usr/share/nginx/html/ && cd ..
sudo systemctl restart hercules-backend

# Verify
curl http://localhost:5000/api/settings/system-status
```

### Option 2: Rollback via Git Revert (preserves history — recommended for team)

From any PC:

```bash
# Revert the bad commit (creates a NEW commit that undoes it)
git revert HEAD
git push origin main    # triggers auto-deploy with the fix
```

This is better because:
- Everyone sees what happened in git log
- Auto-deploy picks it up
- No manual SSH needed

### Option 3: Rollback Multiple Commits

```bash
# Revert last 3 commits
git revert HEAD~2..HEAD --no-commit
git commit -m "Revert: rolling back last 3 commits due to PLC read issue"
git push origin main
```

### Option 4: Emergency — Force Reset to a Known Tag

Only use this if the Salalah PC is down and you need it back NOW:

```bash
# SSH into Salalah PC
cd /opt/hercules
git fetch origin main
git reset --hard deploy-20260305-161230    # known good tag

cd Frontend && npm run build && sudo cp -r dist/* /usr/share/nginx/html/ && cd ..
sudo systemctl restart hercules-backend
```

Then on your dev PC, force-push main to match:

```bash
git push origin main --force    # WARNING: this rewrites history
```

---

## Part 5: Architecture on Salalah PC

```
                    ┌──────────────────────────────────────────────┐
                    │              SALALAH PC                      │
                    │                                              │
  Browser ────────► │  Nginx (port 80)                             │
  (any PC on LAN)   │    ├── /              → React (dist/)        │
                    │    ├── /api/*         → Flask (port 5000)    │
                    │    ├── /socket.io/*   → WebSocket (5000)     │
                    │    └── /login,logout  → Flask auth           │
                    │              │                                │
                    │    Flask Backend (1 eventlet worker)          │
                    │        ├── PostgreSQL (port 5432)            │
                    │        │     └── dynamic_db_hercules         │
                    │        ├── Historian Worker (1s intervals)   │
                    │        ├── Monitor Worker (live layouts)     │
                    │        ├── Archive Worker (hourly rollup)    │
                    │        └── PLC Reader (snap7)                │
                    │              │                                │
                    └──────────────┼────────────────────────────────┘
                                   │ TCP port 102
                                   ▼
                            Siemens PLC
                          192.168.23.11
                          rack 0, slot 3

  GitHub ─────────► Self-Hosted Runner ─── auto-deploys on push
```

---

## Part 6: Key File Locations on Salalah PC

| What | Path |
|------|------|
| Application root | `/opt/hercules/` |
| Backend code | `/opt/hercules/backend/` |
| Frontend code | `/opt/hercules/Frontend/` |
| Built frontend (served by Nginx) | `/usr/share/nginx/html/` |
| Backend `.env` (credentials) | `/opt/hercules/backend/.env` |
| PLC config | `/opt/hercules/backend/config/plc_config.json` |
| Demo mode toggle | `/opt/hercules/backend/config/demo_mode.json` |
| Shift schedule | `/opt/hercules/backend/config/shifts_config.json` |
| SMTP/email config | `/opt/hercules/backend/config/smtp_config.json` |
| Nginx site config | `/etc/nginx/conf.d/hercules.conf` |
| Backend systemd service | `/etc/systemd/system/hercules-backend.service` |
| GitHub runner | `/opt/github-runner/` |
| DB migrations | `/opt/hercules/backend/migrations/` |
| Backend logs | `journalctl -u hercules-backend -f` |
| Deploy tags | `git tag -l "deploy-*" --sort=-creatordate` |

---

## Part 7: Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Backend won't start | `journalctl -u hercules-backend -f` | Check `.env` values, ensure PostgreSQL is running: `sudo systemctl status postgresql` |
| No PLC data | `nc -zv 192.168.23.11 102` | Salalah PC must be on 192.168.23.x subnet. Check cables/switch. |
| WebSocket not connecting | Browser F12 → Console | Verify Nginx has `Upgrade` headers in `/socket.io/` block |
| `libsnap7 not found` | `ldconfig -p \| grep snap7` | `sudo apt install libsnap7-1 libsnap7-dev` |
| Login fails silently | Backend logs | Ensure migrations ran. Default: admin/admin |
| Port 5000 already in use | `sudo lsof -i :5000` | Kill conflicting process or change port |
| Auto-deploy not triggering | GitHub → Actions tab | Check runner status: `cd /opt/github-runner && ./svc.sh status` |
| Runner offline | GitHub → Settings → Actions → Runners | Restart: `cd /opt/github-runner && sudo ./svc.sh start` |
| Frontend shows old version | Hard refresh (Ctrl+Shift+R) | Vite uses content-hashed filenames — old cache is the likely cause |
| Slow historical queries | DB growing | `DELETE FROM tag_history WHERE recorded_at < NOW() - INTERVAL '7 days'; VACUUM ANALYZE tag_history;` |
| Need to rollback | See Part 4 above | Quickest: `git revert HEAD && git push origin main` |

---

## Checklist: Things to Do in Order

- [ ] **One-time setup person** installs dependencies on Salalah PC (Part 1, Steps 1.1–1.4)
- [ ] **One-time setup person** builds frontend and configures Nginx (Part 1, Steps 1.5–1.6)
- [ ] **One-time setup person** creates systemd service and starts backend (Part 1, Step 1.7)
- [ ] **One-time setup person** verifies everything works (Part 1, Step 1.8)
- [ ] **One-time setup person** installs GitHub Actions runner (Part 2, Steps 2.2–2.4)
- [ ] **Any team member** creates `.github/workflows/deploy-salalah.yml` and pushes to `main` (Part 2, Step 2.3)
- [ ] **Verify auto-deploy:** push a small change to `main`, confirm Salalah PC updates automatically
- [ ] **Everyone** follows the daily workflow (Part 3) — pull, commit, push to `main`
