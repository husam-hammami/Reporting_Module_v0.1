# Salalah PC — Hercules Reporting Module Deployment Plan

**Date:** 2026-03-06
**Prepared for:** Salalah plant team
**Application:** Hercules Reporting Module v0.1
**Repository:** `husam-hammami/Reporting_Module_v0.1`

---

## Overview

This plan covers two things:

1. **Pulling the latest frontend performance fixes** from the correct branch
2. **Running the full Reporting Module** (backend + frontend + database) on the Salalah PC

The Salalah PC must be on the same network as the Siemens PLC (`192.168.23.11`) to read live data.

---

## Part 1: Git — Pull the Frontend Performance Fixes

The frontend performance fixes (code splitting, lazy routes, UI/UX improvements, Netlify config) were pushed to branch **`claude/deploy-netlify-0vtpS`**.

### Commits included in this branch (on top of `main`):

| Commit | Description |
|--------|-------------|
| `1f4f80e` | Add UI/UX design skills and shadcn/ui setup |
| `c77c67e` | Optimize frontend loading with code splitting and lazy routes |
| `e40a0f7` | Seed Mil-A report template alongside Grain_Silos |
| `b481f59` | Fix grid layout granularity and widget sizing constraints |
| `db962d2` | Revert grid layout fix (reverted due to issues) |
| `dc58aae` | Add Netlify deployment config for one-click deploy |

### Steps to pull:

```bash
# 1. Navigate to the repo on Salalah PC
cd /path/to/Reporting_Module_v0.1

# 2. Fetch the branch with the fixes
git fetch origin claude/deploy-netlify-0vtpS

# 3. Option A: Merge into your current branch (recommended)
git merge origin/claude/deploy-netlify-0vtpS

# 3. Option B: Or checkout that branch directly
git checkout claude/deploy-netlify-0vtpS
git pull origin claude/deploy-netlify-0vtpS
```

After pulling, rebuild the frontend (see Part 2, Step 4).

---

## Part 2: Full Deployment on Salalah PC

### Prerequisites — What to Install

| Software | Version | Install Command (Ubuntu) |
|----------|---------|--------------------------|
| Python | 3.10+ | `sudo apt install python3 python3-pip python3-venv` |
| Node.js | 18+ | `curl -fsSL https://deb.nodesource.com/setup_18.x \| sudo -E bash - && sudo apt install nodejs` |
| PostgreSQL | 17 | `sudo apt install postgresql-17` |
| Nginx | Latest | `sudo apt install nginx` |
| Git | Latest | `sudo apt install git` |
| snap7 lib | — | `sudo apt install libsnap7-1 libsnap7-dev` (required for PLC communication) |

> **snap7 note:** The `python-snap7` pip package needs the native `libsnap7` library installed on the system. Without it, PLC reads will fail with a missing library error.

---

### Step 1: Clone the Repository

```bash
cd /opt
sudo mkdir hercules && sudo chown $USER:$USER hercules
git clone https://github.com/husam-hammami/Reporting_Module_v0.1.git /opt/hercules

cd /opt/hercules

# Pull the branch with frontend fixes
git fetch origin claude/deploy-netlify-0vtpS
git merge origin/claude/deploy-netlify-0vtpS
```

---

### Step 2: Set Up PostgreSQL Database

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create the database and user
sudo -u postgres psql
```

```sql
CREATE USER hercules_app WITH PASSWORD 'choose-a-strong-password-here';
CREATE DATABASE dynamic_db_hercules OWNER hercules_app;
GRANT ALL PRIVILEGES ON DATABASE dynamic_db_hercules TO hercules_app;
\q
```

```bash
# Run all 13 migration scripts to create tables
cd /opt/hercules/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python tools/setup/setup_local_db.py --no-seed
```

> `--no-seed` skips demo data. For first-time testing, you can omit `--no-seed` to get 160 demo tags and a sample layout.

---

### Step 3: Configure the Backend

#### 3a. Create the `.env` file

```bash
cp /opt/hercules/backend/.env.example /opt/hercules/backend/.env
```

Edit `/opt/hercules/backend/.env`:

```env
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=hercules_app
POSTGRES_PASSWORD=choose-a-strong-password-here
DB_HOST=127.0.0.1
DB_PORT=5432
FLASK_SECRET_KEY=generate-a-random-64-char-string-here
USE_CENTRAL_HISTORIAN=true
```

#### 3b. Configure PLC connection

Edit `/opt/hercules/backend/config/plc_config.json`:

```json
{
  "ip": "192.168.23.11",
  "rack": 0,
  "slot": 3
}
```

> Verify: The Salalah PC must be able to reach `192.168.23.11` on TCP port 102.
> Test with: `nc -zv 192.168.23.11 102`

#### 3c. Disable demo mode for production

Edit `/opt/hercules/backend/config/demo_mode.json`:

```json
{
  "enabled": false
}
```

> You can also toggle this later from the UI at **Engineering > System**.

---

### Step 4: Build the Frontend

```bash
cd /opt/hercules/Frontend
npm install
npm run build
```

This creates optimized static files in `Frontend/dist/`.

Copy to Nginx web root:

```bash
sudo cp -r /opt/hercules/Frontend/dist/* /usr/share/nginx/html/
```

---

### Step 5: Configure Nginx

```bash
sudo cp /opt/hercules/nginx.conf /etc/nginx/conf.d/hercules.conf
```

**Important edit required:** The repo's `nginx.conf` uses Docker service names (`http://backend:5000`). For bare-metal deployment, replace all occurrences:

```bash
# Replace Docker service name with localhost
sudo sed -i 's|http://backend:5000|http://127.0.0.1:5000|g' /etc/nginx/conf.d/hercules.conf
```

Remove the default Nginx config to avoid conflicts:

```bash
sudo rm /etc/nginx/sites-enabled/default 2>/dev/null
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 6: Start the Backend

#### Option A: Manual start (for testing)

```bash
cd /opt/hercules/backend
source venv/bin/activate

gunicorn \
  --worker-class eventlet \
  -w 1 \
  --bind 0.0.0.0:5000 \
  --timeout 120 \
  app:app
```

**Critical notes:**
- Must use `-w 1` (single worker) — WebSocket + eventlet requires exactly 1 worker
- Must use `--worker-class eventlet` — required for Flask-SocketIO

#### Option B: Systemd service (for production — auto-starts on boot)

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
# Create the hercules user (if it doesn't exist)
sudo useradd -r -s /bin/false hercules
sudo chown -R hercules:hercules /opt/hercules

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable hercules-backend
sudo systemctl start hercules-backend

# Check status
sudo systemctl status hercules-backend
```

---

### Step 7: Verify Everything Works

Run these checks in order:

```bash
# 1. Database is running
pg_isready -h 127.0.0.1 -p 5432 -d dynamic_db_hercules

# 2. Backend is responding
curl http://localhost:5000/api/settings/system-status
# Expected: {"demo_mode": false, "plc_config": {"ip": "192.168.23.11", ...}}

# 3. PLC is reachable from this PC
nc -zv 192.168.23.11 102

# 4. Nginx is serving the frontend
curl -s http://localhost | head -5
# Expected: HTML with <div id="root">

# 5. Tags are readable (if PLC is connected)
curl http://localhost:5000/api/live-monitor/tags
```

Open a browser on the Salalah PC and go to: **http://localhost**

Default login: `admin` / `admin` — **change this password immediately**.

---

## Architecture on Salalah PC

```
Browser (http://localhost)
    │
    ▼
Nginx (port 80)
    ├── /                    → React static files (Frontend/dist/)
    ├── /api/*               → Flask backend (port 5000)
    ├── /socket.io/*         → WebSocket (port 5000, upgrade)
    ├── /login, /logout      → Flask auth
    └── /orders/*            → Flask orders
              │
        Flask Backend (port 5000, 1 eventlet worker)
            ├── PostgreSQL (port 5432, dynamic_db_hercules)
            ├── Siemens PLC (192.168.23.11:102 via snap7)
            ├── Historian Worker (records all tags every 1s)
            ├── Dynamic Monitor Worker (live layout data)
            └── Archive Worker (hourly aggregation)
```

---

## Quick Reference — Key File Locations

| What | Path on Salalah PC |
|------|--------------------|
| Backend code | `/opt/hercules/backend/` |
| Frontend code | `/opt/hercules/Frontend/` |
| Built frontend | `/usr/share/nginx/html/` |
| Backend .env | `/opt/hercules/backend/.env` |
| PLC config | `/opt/hercules/backend/config/plc_config.json` |
| Demo mode toggle | `/opt/hercules/backend/config/demo_mode.json` |
| Shift config | `/opt/hercules/backend/config/shifts_config.json` |
| SMTP config | `/opt/hercules/backend/config/smtp_config.json` |
| Nginx config | `/etc/nginx/conf.d/hercules.conf` |
| Systemd service | `/etc/systemd/system/hercules-backend.service` |
| Backend logs | `journalctl -u hercules-backend -f` |
| DB migrations | `/opt/hercules/backend/migrations/` |

---

## Updating the Application Later

When new code is pushed to the repo:

```bash
cd /opt/hercules

# Pull latest changes
git pull origin main  # or the specific branch

# If backend code changed:
cd backend
source venv/bin/activate
pip install -r requirements.txt  # only if new dependencies
sudo systemctl restart hercules-backend

# If frontend code changed:
cd /opt/hercules/Frontend
npm install  # only if new dependencies
npm run build
sudo cp -r dist/* /usr/share/nginx/html/

# Verify
curl http://localhost:5000/api/settings/system-status
```

---

## Troubleshooting

| Problem | Check | Fix |
|---------|-------|-----|
| Backend won't start | `journalctl -u hercules-backend -f` | Check .env values, ensure PostgreSQL is running |
| No PLC data | `nc -zv 192.168.23.11 102` | Verify network — Salalah PC must be on PLC subnet |
| WebSocket not connecting | Browser console (F12) | Ensure Nginx has WebSocket upgrade headers in `/socket.io/` block |
| "libsnap7 not found" | `ldconfig -p \| grep snap7` | Install: `sudo apt install libsnap7-1 libsnap7-dev` |
| Login fails | Check backend logs | Ensure DB migrations ran, default user exists (admin/admin) |
| Port 5000 in use | `sudo lsof -i :5000` | Kill the conflicting process |
| CORS errors | Browser console | Not expected with Nginx same-origin setup — check Nginx config |
| Slow historical queries | DB size growing | Run: `DELETE FROM tag_history WHERE recorded_at < NOW() - INTERVAL '7 days'; VACUUM ANALYZE tag_history;` |

---

## Contacts

- **Repository owner:** husam-hammami
- **Frontend fixes branch:** `claude/deploy-netlify-0vtpS`
- **Base branch:** `main`
