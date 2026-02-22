# 14 — Deployment

## Overview

This guide covers deploying the Reporting Module to a production environment. The system has three components:

| Component | Technology | Default Port |
|-----------|-----------|-------------|
| **Backend** | Flask + Flask-SocketIO + eventlet | 5000 |
| **Frontend** | React + Vite (built to static files) | 80 (via Nginx) |
| **Database** | PostgreSQL 17 | 5432 |

In production, Nginx serves the React frontend as static files and reverse-proxies API and WebSocket requests to the Flask backend. The backend communicates with one or more Siemens PLCs via snap7 for real-time data collection.

```
Browser ──▶ Nginx (port 80/443)
               ├── /              → React static files (dist/)
               ├── /api/*         → Flask backend (port 5000)
               ├── /socket.io/*   → Flask-SocketIO (port 5000, WebSocket upgrade)
               ├── /login, /logout, /check-auth → Flask auth endpoints
               └── /orders/*      → Flask orders blueprint
                        │
                  Flask Backend
                   ├── PostgreSQL (port 5432)
                   └── Siemens PLC (snap7, e.g. 192.168.23.11)
```

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Server OS** | Ubuntu 20.04+ (recommended) or Windows Server | Linux preferred for production |
| **Python** | 3.10+ | Required for backend |
| **Node.js** | 18+ | Required to build the frontend |
| **npm** | 9+ | Comes with Node.js |
| **PostgreSQL** | 17 | Database server |
| **Nginx** | Latest stable | Reverse proxy and static file server |
| **Git** | Latest | To clone the repository |

---

## Environment Variables

The backend reads configuration from environment variables (or a `.env` file in the `backend/` directory). Copy `.env.example` to `.env` and set the values for your environment.

### Database Connection

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_DB` | Yes | `dynamic_db_hercules` | PostgreSQL database name |
| `POSTGRES_USER` | Yes | `postgres` | Database username |
| `POSTGRES_PASSWORD` | Yes | `Hercules` | Database password |
| `DB_HOST` | Yes | `127.0.0.1` | Database host address |
| `DB_PORT` | No | `5432` | Database port |

### Flask Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FLASK_SECRET_KEY` | Recommended | `hercules-dev-secret-key-2026` | Secret key for session signing. **Change this in production.** |
| `FLASK_ENV` | No | (none) | Set to `development` to enable debug routes (`/test`, `/debug/routes`) |
| `DEV_MODE` | No | `0` | Set to `1` to enable debug routes (alternative to `FLASK_ENV=development`) |
| `SESSION_COOKIE_SECURE` | No | `false` | Set to `true` when serving over HTTPS |
| `SESSION_COOKIE_SAMESITE` | No | `Lax` | Set to `None` for cross-origin HTTPS deployments |

### Worker Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USE_CENTRAL_HISTORIAN` | No | `true` | Enable/disable the universal historian worker that records all active PLC tags every second |

### PLC Settings (File-Based)

PLC connection is configured via JSON files in `backend/config/`, not environment variables. These files are managed through the **Engineering > System** page in the frontend.

| Config File | Purpose | Default Content |
|-------------|---------|-----------------|
| `config/plc_config.json` | PLC IP, rack, and slot | `{ "ip": "192.168.23.11", "rack": 0, "slot": 3 }` |
| `config/demo_mode.json` | Demo vs production mode toggle | `{ "enabled": true }` |
| `config/smtp_config.json` | SMTP email settings | Auto-created with empty defaults |
| `config/shifts_config.json` | Shift schedule | Auto-created with 3 default shifts |

### Frontend Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `/` (production) or `http://localhost:5000` (dev) | Backend API base URL. In production builds, defaults to `/` (same-origin via Nginx proxy). |

### Production `.env` Example

```env
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=hercules_app
POSTGRES_PASSWORD=<strong-random-password>
DB_HOST=127.0.0.1
DB_PORT=5432
FLASK_SECRET_KEY=<random-64-char-string>
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=None
USE_CENTRAL_HISTORIAN=true
```

---

## Database Setup

### 1. Install PostgreSQL 17

Download from https://www.postgresql.org/downloads/ or install via package manager:

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install postgresql-17

# Verify
psql --version
pg_isready
```

### 2. Create Database and User

```bash
sudo -u postgres psql
```

```sql
CREATE USER hercules_app WITH PASSWORD '<strong-password>';
CREATE DATABASE dynamic_db_hercules OWNER hercules_app;
GRANT ALL PRIVILEGES ON DATABASE dynamic_db_hercules TO hercules_app;
\q
```

### 3. Run Migrations

The system includes 13 SQL migration files in `backend/migrations/`. Run them using the automated setup script:

```bash
cd backend
python tools/setup/setup_local_db.py
```

This script runs all migrations in dependency order:

| # | Migration File | Creates |
|---|---------------|---------|
| 1 | `create_tags_tables.sql` | `tags`, `tag_groups`, `tag_group_members`, `live_monitor_layouts`, `live_monitor_sections`, `live_monitor_columns`, `live_monitor_table_config`, `live_monitor_kpi_config` |
| 2 | `create_users_table.sql` | `users` |
| 3 | `create_bins_and_materials_tables.sql` | `materials`, `bins` |
| 4 | `create_report_builder_tables.sql` | `report_builder_templates` |
| 5 | `create_tag_history_tables.sql` | `tag_history`, `tag_history_archive` |
| 6 | `create_kpi_engine_tables.sql` | `kpi_config`, `kpi_tag_mapping`, `kpi_history` |
| 7 | `add_is_counter_to_tags.sql` | Adds `is_counter` column to `tags` |
| 8 | `add_bin_activation_fields.sql` | Adds bin activation columns to `tags` |
| 9 | `add_value_formula_field.sql` | Adds `value_formula` column to `tags` |
| 10 | `add_layout_config_field.sql` | Adds `config` JSONB column to `live_monitor_layouts` |
| 11 | `add_line_running_tag_fields.sql` | Adds line running tag columns to `live_monitor_layouts` |
| 12 | `add_dynamic_monitoring_tables.sql` | Adds publishing columns to `live_monitor_layouts` + creates `dynamic_monitor_registry`, `dynamic_order_counters`, `dynamic_orders` |
| 13 | `alter_tag_history_nullable_layout.sql` | Alters `tag_history` nullable layout column |

To skip demo data seeding on a production server:

```bash
python tools/setup/setup_local_db.py --no-seed
```

> **Cross-reference:** See [LOCAL_DB_SETUP.md](LOCAL_DB_SETUP.md) for detailed step-by-step instructions including PostgreSQL authentication configuration (`pg_hba.conf`).

### 4. Seed Initial Data (Optional)

The setup script optionally seeds 160 demo tags and a "Grain Terminal Demo" layout. For production, skip seeding (`--no-seed`) and configure real tags through the Engineering page. The setup script always creates a default `admin` user (password: `admin`) -- **change this password immediately after first login**.

---

## Backend Deployment

### 1. Clone the Repository

```bash
git clone <repo-url> /opt/hercules
cd /opt/hercules/backend
```

### 2. Create Python Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

Key backend dependencies:

| Package | Purpose |
|---------|---------|
| `Flask==2.3.2` | Web framework |
| `Flask-SocketIO==5.3.6` | WebSocket support |
| `eventlet==0.33.3` | Async worker for WebSocket |
| `gunicorn==20.1.0` | Production WSGI server |
| `psycopg2-binary==2.9.8` | PostgreSQL driver |
| `python-snap7==1.3` | Siemens PLC communication |
| `APScheduler` | Background job scheduling |
| `Flask-Login==0.6.2` | Session-based authentication |
| `xhtml2pdf==0.2.16` | PDF report generation |
| `pytz==2023.3` | Timezone handling |
| `asteval==0.9.31` | Safe formula evaluation |

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with production values (see Environment Variables section above)
```

### 5. Configure PLC Connection

Edit `backend/config/plc_config.json` with the real PLC address:

```json
{
  "ip": "192.168.23.11",
  "rack": 0,
  "slot": 3
}
```

Disable demo mode in `backend/config/demo_mode.json`:

```json
{
  "enabled": false
}
```

> These settings can also be changed at runtime through **Engineering > System** in the frontend UI.

### 6. Run with Gunicorn (Production)

```bash
gunicorn \
  --worker-class eventlet \
  -w 1 \
  --bind 0.0.0.0:5000 \
  --timeout 120 \
  app:app
```

**Important notes:**

- **Single worker (`-w 1`) is required.** WebSocket connections and the eventlet async model require a single worker process. Do not increase the worker count.
- The `--worker-class eventlet` flag is mandatory for WebSocket support via Flask-SocketIO.
- `--timeout 120` prevents Gunicorn from killing long-running PLC operations.

### 7. Background Workers

The backend automatically spawns three background workers when it starts (via eventlet greenlets). No separate process management is needed:

| Worker | File | Purpose |
|--------|------|---------|
| **Historian Worker** | `workers/historian_worker.py` | Records ALL active PLC tags to `tag_history` every second. Controlled by `USE_CENTRAL_HISTORIAN` env var. |
| **Dynamic Monitor Worker** | `workers/dynamic_monitor_worker.py` | Stores data every second for all published layouts. Handles order tracking (start/stop). |
| **Dynamic Archive Worker** | `workers/dynamic_archive_worker.py` | Archives second-by-second data into hourly summaries in `tag_history_archive`. Runs on the hour. |

Additionally, APScheduler runs background jobs (e.g., monthly report emails) -- started via `start_scheduler()` in `app.py`.

### 8. Systemd Service (Linux)

Create a systemd unit file to run the backend as a service:

```ini
# /etc/systemd/system/hercules-backend.service
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
sudo systemctl daemon-reload
sudo systemctl enable hercules-backend
sudo systemctl start hercules-backend
```

---

## Frontend Deployment

### 1. Install Dependencies

```bash
cd /opt/hercules/Frontend
npm install
```

### 2. Configure API Base URL

For production, the frontend defaults to `/` (same-origin) when no `VITE_API_URL` is set, meaning all API requests go through the Nginx reverse proxy. This is the recommended production configuration -- no `.env.local` file is needed.

If the backend is on a different server, create `Frontend/.env.local`:

```
VITE_API_URL=http://backend-server-ip:5000
```

### 3. Build for Production

```bash
npm run build
```

This produces optimized static files in `Frontend/dist/`. The output includes:

- `index.html` — single-page app entry point
- `assets/` — bundled JS, CSS, and images (content-hashed filenames for cache busting)

### 4. Deploy to Nginx

Copy the built files to the Nginx web root:

```bash
sudo cp -r /opt/hercules/Frontend/dist/* /usr/share/nginx/html/
```

Or configure Nginx to serve directly from the `dist/` directory (see Nginx section below).

---

## Nginx Configuration

Nginx serves two roles: hosting the React frontend as static files and proxying API/WebSocket requests to the Flask backend.

### Base Configuration

The repository includes an `nginx.conf` in the project root. Below is a production-ready version with explanations:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or server IP

    # ------------------------------------------
    # WebSocket proxy for Socket.IO
    # ------------------------------------------
    # These headers are CRITICAL for WebSocket connections.
    # Without Upgrade and Connection headers, WebSocket
    # will fall back to HTTP long-polling.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # ------------------------------------------
    # API proxy — all /api/ requests to Flask
    # ------------------------------------------
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ------------------------------------------
    # Authentication endpoints
    # ------------------------------------------
    location = /login {
        proxy_pass http://127.0.0.1:5000/login;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /logout {
        proxy_pass http://127.0.0.1:5000/logout;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /check-auth {
        proxy_pass http://127.0.0.1:5000/check-auth;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ------------------------------------------
    # User management endpoints
    # ------------------------------------------
    location /users {
        proxy_pass http://127.0.0.1:5000/users;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /add-user {
        proxy_pass http://127.0.0.1:5000/add-user;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /delete-user/ {
        proxy_pass http://127.0.0.1:5000/delete-user/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ------------------------------------------
    # Materials, bins, orders, and other
    # backend endpoints follow the same pattern.
    # See nginx.conf in the repo root for the
    # complete list.
    # ------------------------------------------

    # ------------------------------------------
    # Orders endpoints (with React fallback)
    # ------------------------------------------
    location ^~ /orders/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        error_page 404 = @react;
    }

    # ------------------------------------------
    # React SPA — serves frontend static files
    # ------------------------------------------
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # Named location for React SPA fallback
    location @react {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # SPA fallback for 404s
    error_page 404 /index.html;
}
```

> **Note:** The repository's `nginx.conf` uses `proxy_pass http://backend:5000` (Docker service name). For non-Docker deployments, change `backend` to `127.0.0.1` as shown above.

### HTTPS / TLS Setup

For production, enable HTTPS using Let's Encrypt (Certbot) or custom certificates:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate (Nginx plugin auto-configures SSL)
sudo certbot --nginx -d your-domain.com

# Auto-renewal (Certbot adds a systemd timer by default)
sudo certbot renew --dry-run
```

If using custom certificates:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/certs/hercules.crt;
    ssl_certificate_key /etc/ssl/private/hercules.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # ... same location blocks as above ...
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

When using HTTPS, update the backend environment:

```env
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=None
```

---

## Health Checks

### Backend API

The backend does not expose a dedicated `/api/health` endpoint. Use the system status endpoint:

```bash
curl http://localhost:5000/api/settings/system-status
```

Expected response:

```json
{
  "demo_mode": false,
  "plc_config": { "ip": "192.168.23.11", "rack": 0, "slot": 3 }
}
```

You can also verify tag data is flowing:

```bash
curl http://localhost:5000/api/live-monitor/tags
```

### Database Connection

```bash
pg_isready -h 127.0.0.1 -p 5432 -d dynamic_db_hercules
```

Or from Python:

```bash
python -c "import psycopg2; psycopg2.connect(dbname='dynamic_db_hercules', host='127.0.0.1').close(); print('OK')"
```

### PLC Connection Status

- **Frontend:** The Navbar displays a **DEMO** (amber) or **LIVE** (green) badge indicating the current mode.
- **Engineering > System page:** Shows PLC connection details (IP, rack, slot) and allows toggling between demo and production mode.
- **API:** `GET /api/settings/system-status` returns `demo_mode` (boolean) and `plc_config`.

### WebSocket Status

- **Frontend:** The Report Builder Preview page shows a **LiveDataIndicator** -- a pulsing green dot with a seconds counter when WebSocket is connected.
- **Logs:** On successful connection, the backend logs `Client connected to WebSocket`.

---

## Backup Strategy

### Database Backups

Use `pg_dump` for PostgreSQL backups:

```bash
# Full database dump (compressed)
pg_dump -h 127.0.0.1 -U postgres -d dynamic_db_hercules -Fc -f /backups/hercules_$(date +%Y%m%d_%H%M%S).dump

# Restore from dump
pg_restore -h 127.0.0.1 -U postgres -d dynamic_db_hercules -c /backups/hercules_20260222_120000.dump
```

### Configuration Backups

Back up the configuration directory which contains runtime settings:

```bash
cp -r /opt/hercules/backend/config/ /backups/config_$(date +%Y%m%d)/
cp /opt/hercules/backend/.env /backups/env_$(date +%Y%m%d)
```

Files to back up:

| File | Contents |
|------|----------|
| `backend/.env` | Database credentials, Flask secret key |
| `backend/config/plc_config.json` | PLC connection settings |
| `backend/config/demo_mode.json` | Demo/production mode toggle |
| `backend/config/smtp_config.json` | Email server configuration |
| `backend/config/shifts_config.json` | Shift schedule |

### Recommended Schedule

| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Database (full dump) | Daily | 30 days |
| Configuration files | After each change, or weekly | 90 days |
| Application code | Managed by Git | Permanent |

### Automated Backup Script

```bash
#!/bin/bash
# /opt/hercules/scripts/backup.sh
BACKUP_DIR="/backups/hercules"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Database
pg_dump -h 127.0.0.1 -U postgres -d dynamic_db_hercules -Fc \
    -f "$BACKUP_DIR/db_$TIMESTAMP.dump"

# Config files
tar czf "$BACKUP_DIR/config_$TIMESTAMP.tar.gz" \
    /opt/hercules/backend/.env \
    /opt/hercules/backend/config/

# Cleanup: remove backups older than 30 days
find "$BACKUP_DIR" -name "*.dump" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

Add to crontab for daily execution:

```bash
0 2 * * * /opt/hercules/scripts/backup.sh >> /var/log/hercules-backup.log 2>&1
```

---

## Common Production Issues

### WebSocket Not Connecting Behind Reverse Proxy

**Symptom:** Frontend falls back to REST polling. No real-time updates. Console shows WebSocket connection errors.

**Cause:** Nginx is not forwarding the WebSocket upgrade headers.

**Fix:** Ensure the `/socket.io/` location block includes these headers:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_cache_bypass $http_upgrade;
```

Also ensure Gunicorn is using `--worker-class eventlet` with `-w 1`.

### PLC Connection Timeout

**Symptom:** Tags show no data. Backend logs show snap7 connection errors.

**Cause:** Network firewall or routing prevents the backend server from reaching the PLC.

**Fix:**
- Verify the backend server is on the same network as the PLC (e.g., 192.168.23.x subnet).
- Check firewall rules: snap7 uses TCP port 102.
- Test connectivity: `telnet 192.168.23.11 102` or `nc -zv 192.168.23.11 102`.
- Verify PLC config: `GET /api/settings/plc-config` or check `backend/config/plc_config.json`.

### CORS Errors

**Symptom:** Browser console shows "Access-Control-Allow-Origin" errors.

**Cause:** The frontend origin is not in the backend's `ALLOWED_ORIGINS` set.

**Fix:** Add the production frontend URL to the `ALLOWED_ORIGINS` set in `app.py`. When using Nginx on the same server, CORS is typically not an issue because all requests go through the same origin.

### Large Database / Slow Queries

**Symptom:** Historical data queries become slow over time.

**Cause:** The `tag_history` table grows continuously (one row per tag per second).

**Fix:**
- The archive worker automatically aggregates second-by-second data into hourly summaries in `tag_history_archive`.
- Set up a retention policy to delete old raw data:

```sql
-- Delete raw tag_history older than 7 days (archived data is preserved)
DELETE FROM tag_history WHERE recorded_at < NOW() - INTERVAL '7 days';

-- Analyze tables after bulk delete
VACUUM ANALYZE tag_history;
```

- Add appropriate indexes if not present:

```sql
CREATE INDEX IF NOT EXISTS idx_tag_history_recorded_at ON tag_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_tag_history_tag_id ON tag_history(tag_id);
```

### Session Cookie Issues Over HTTPS

**Symptom:** Users cannot stay logged in. Authentication fails silently.

**Fix:** Set these environment variables when serving over HTTPS:

```env
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=None
```

### Backend Not Starting (Port Already in Use)

```bash
# Find the process using port 5000
sudo lsof -i :5000
# or
sudo ss -tlnp | grep 5000

# Kill it
sudo kill -9 <PID>
```

---

Previous: [13-USER-ROLES-AND-AUTH](13-USER-ROLES-AND-AUTH.md) | Next: [15-MULTI-SITE-SETUP](15-MULTI-SITE-SETUP.md)
