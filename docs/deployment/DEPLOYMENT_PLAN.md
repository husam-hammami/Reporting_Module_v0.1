# Hercules Reporting Module — Deployment Plan

## Context

The Hercules Reporting Module is an industrial SCADA/reporting system that connects to Siemens PLCs via snap7. It requires:
- Low-latency PLC communication (1-second polling cycle)
- Persistent PostgreSQL database for tag history
- Real-time WebSocket data for live dashboards
- React frontend served to plant operators via browser

The system must be deployed on-premise (same network as the PLC at 192.168.23.x), managed remotely, and auto-update when code is pushed to GitHub.

---

## Deployment Architecture

```
GitHub Repo (you push)
       │
       ▼ (auto-pull every 5 min)
┌──────────────────────────────────────────────────────┐
│  Production Server (Ubuntu Server / plant network)   │
│                                                      │
│  ┌─────────────────── Docker Compose ──────────────┐ │
│  │                                                 │ │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │ │
│  │  │ frontend │  │  backend  │  │  postgres    │  │ │
│  │  │ Nginx    │  │  Flask    │  │  Port 5432   │  │ │
│  │  │ Port 80  │→ │  SocketIO │→ │  Persistent  │  │ │
│  │  │ React    │  │  Workers  │  │  Volume      │  │ │
│  │  │ static   │  │  Port 5000│  │              │  │ │
│  │  └──────────┘  └─────┬─────┘  └─────────────┘  │ │
│  │                      │ snap7                    │ │
│  │  ┌───────────┐       │                          │ │
│  │  │ updater   │       ▼                          │ │
│  │  │ Watches   │  ┌─────────────┐                 │ │
│  │  │ GitHub    │  │ Siemens PLC │                 │ │
│  │  │ repo      │  │ 192.168.23.11                │ │
│  │  └───────────┘  └─────────────┘                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Plant operators access: http://server-ip            │
└──────────────────────────────────────────────────────┘
```

### 4 Docker Containers

| Container   | Image          | Purpose                                           |
|-------------|----------------|---------------------------------------------------|
| `postgres`  | postgres:17    | Database with persistent volume (survives rebuilds)|
| `backend`   | Custom         | Flask + SocketIO + historian/archive workers       |
| `frontend`  | Custom (Nginx) | Built React app + reverse proxy to backend         |
| `updater`   | Alpine + git   | Polls GitHub every 5 min, rebuilds on new commits  |

---

## Auto-Update Flow

```
updater container (runs continuously)
       │
       ├─ Every 5 minutes: git fetch origin main
       │
       ├─ Compare local HEAD vs remote HEAD
       │
       ├─ If different:
       │    1. git pull
       │    2. docker compose build backend frontend
       │    3. docker compose up -d backend frontend
       │    4. Log: "[updater] Deployed commit abc1234 at 2026-02-21 14:30"
       │
       └─ If same: sleep 5 min, check again
```

- **postgres is never rebuilt** — data persists in a named volume
- **backend + frontend** are rebuilt and restarted (typically ~60 seconds)
- **Zero data loss** — historian resumes recording after restart

---

## Files to Create

### 1. `docker-compose.yml` (root)

Defines all 4 services:
- **postgres**: image postgres:17, named volume `hercules_pgdata`, healthcheck
- **backend**: builds from `backend/Dockerfile`, depends_on postgres, network_mode for PLC access, env from `.env.production`
- **frontend**: builds from `Frontend/Dockerfile`, depends_on backend, ports 80:80
- **updater**: builds from `updater/Dockerfile`, mounts Docker socket + repo, polls GitHub

### 2. `Frontend/Dockerfile` (new)

Multi-stage build:
- Stage 1 (`builder`): node:18-alpine, npm ci, npm run build
- Stage 2 (`runtime`): nginx:alpine, copy built files to /usr/share/nginx/html, copy nginx.conf

### 3. `backend/Dockerfile` (update existing)

Current uses gunicorn (doesn't support WebSocket). Must switch to:
```
CMD ["python", "app.py"]
```
Because app.py already uses `socketio.run()` with eventlet, which handles HTTP + WebSocket in one process. Gunicorn with eventlet worker is also possible but the direct eventlet approach is simpler and already tested.

Additional changes:
- Install snap7 system library (`libsnap7-1`)
- Set environment variables: `USE_CENTRAL_HISTORIAN=true`, `REPORT_USE_HISTORIAN=true`

### 4. `nginx.conf` (update existing)

Already configured for Docker networking (`proxy_pass http://backend:5000`). Needs minor cleanup:
- Remove legacy endpoint blocks (materials, bins, recipes, etc.) — all go through `/api/` now
- Add WebSocket timeouts and buffer sizes
- Add gzip compression for static assets

### 5. `updater/Dockerfile` + `updater/watch.sh` (new)

Lightweight Alpine container with git + docker CLI:
- Mounts `/var/run/docker.sock` to control sibling containers
- Mounts repo directory as volume
- Runs `watch.sh` in a loop: fetch → compare → rebuild if changed
- Logs all updates with timestamps

### 6. `.env.production` (new, root)

```env
# Database
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>
DB_HOST=postgres
DB_PORT=5432

# Flask
FLASK_SECRET_KEY=<random-key>
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=Lax

# Features
USE_CENTRAL_HISTORIAN=true
REPORT_USE_HISTORIAN=true
DEV_MODE=0

# PLC (configure per site)
# PLC_IP=192.168.23.11
# PLC_RACK=0
# PLC_SLOT=3

# Updater
GITHUB_REPO=husam-hammami/Salalah_config
GITHUB_BRANCH=main
UPDATE_INTERVAL=300
```

### 7. `start.bat` + `stop.bat` (root, for Windows fallback)

Simple batch files:
- `start.bat`: `docker compose up -d --build`
- `stop.bat`: `docker compose down`

### 8. Database Initialization

The `backend/Dockerfile` entrypoint must:
1. Wait for postgres to be ready (healthcheck dependency)
2. Run `python tools/setup/setup_local_db.py` on first boot (creates DB, runs migrations, seeds admin user)
3. Skip if DB already exists (idempotent)

This is handled by a small `entrypoint.sh` wrapper script.

---

## First-Time Setup on Production Server

### Prerequisites
- Ubuntu Server 22.04+ (or any Linux with Docker)
- Network access to PLC (192.168.23.x subnet)
- Internet access (for GitHub pulls)
- SSH access for remote management

### Steps (one time, ~10 minutes)

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Clone repo
git clone https://github.com/husam-hammami/Salalah_config.git
cd Salalah_config

# 3. Configure
cp .env.production.example .env.production
nano .env.production  # Set POSTGRES_PASSWORD, FLASK_SECRET_KEY

# 4. Start everything
docker compose up -d

# 5. Verify
docker compose ps        # All 4 containers running
docker compose logs -f   # Watch startup logs
```

Open browser → `http://server-ip` → Login with admin/admin → Change password.

### After First Setup

You never SSH in again for normal operation. Push to GitHub → updater auto-deploys.

---

## Day-to-Day Workflow

| Action | How |
|--------|-----|
| **Deploy update** | Push to `main` branch on GitHub. Auto-deploys in ~5 min. |
| **Check status** | SSH: `docker compose ps` and `docker compose logs --tail 50` |
| **View update log** | `docker compose logs updater` |
| **Force immediate update** | `docker compose exec updater /app/watch.sh --now` |
| **Restart backend** | `docker compose restart backend` |
| **Backup database** | `docker compose exec postgres pg_dump -U postgres dynamic_db_hercules > backup.sql` |
| **Restore database** | `cat backup.sql | docker compose exec -T postgres psql -U postgres dynamic_db_hercules` |
| **Stop everything** | `docker compose down` (DB data preserved in volume) |
| **Full reset** | `docker compose down -v` (WARNING: deletes DB data) |

---

## Networking Considerations

### PLC Access from Docker

The backend container needs to reach the PLC at `192.168.23.11`. Options:

1. **`network_mode: host`** (simplest) — backend shares the host's network stack, can reach PLC directly. Trade-off: no Docker DNS, must use `127.0.0.1` for postgres.

2. **`macvlan` network** (better) — backend gets its own IP on the plant subnet. More complex setup but cleaner isolation.

3. **Default bridge + host routing** — works if the host can route to the PLC subnet. Docker containers inherit host routing by default for outbound connections.

**Recommendation:** Start with option 1 (`network_mode: host` for backend only). It's the simplest and guaranteed to work. The backend uses the host's network to reach both postgres (localhost) and PLC (192.168.23.x).

### Firewall

```bash
# Only expose port 80 (Nginx) to the plant network
sudo ufw allow 80/tcp
sudo ufw allow 22/tcp  # SSH for remote management
sudo ufw enable
```

---

## Data Safety

### Automatic DB Backups

Add a cron job on the host:
```bash
# Daily backup at 2 AM, keep 30 days
0 2 * * * docker compose -f /path/to/docker-compose.yml exec -T postgres pg_dump -U postgres dynamic_db_hercules | gzip > /backups/hercules_$(date +\%Y\%m\%d).sql.gz
find /backups -name "hercules_*.sql.gz" -mtime +30 -delete
```

### Tag History Retention

The `tag_history` table grows ~86,400 rows/tag/day (1-second interval). For 50 tags = ~4.3M rows/day.

Recommended: Add a cleanup job (SQL or cron) to delete raw data older than 30 days. Hourly archives (`tag_history_archive`) are kept indefinitely.

```sql
-- Run daily via pg_cron or cron job
DELETE FROM tag_history WHERE "timestamp" < NOW() - INTERVAL '30 days';
```

---

## Security Checklist

- [ ] Change default admin password after first login
- [ ] Set strong `POSTGRES_PASSWORD` in `.env.production`
- [ ] Set random `FLASK_SECRET_KEY` in `.env.production`
- [ ] Firewall: only ports 80 + 22 exposed
- [ ] `.env.production` is in `.gitignore` (never committed)
- [ ] GitHub repo is private (contains PLC addresses)
- [ ] Regular DB backups configured

---

## Verification After Deployment

1. **All containers running:** `docker compose ps` shows 4 healthy containers
2. **Frontend loads:** Browser → `http://server-ip` → login page appears
3. **Backend healthy:** `http://server-ip/api/settings/system-status` returns JSON
4. **WebSocket working:** Live Monitor or Report Preview shows updating values
5. **Demo mode works:** Toggle demo on → emulator values flowing
6. **DB recording:** Check `docker compose logs backend | grep Historian` — should show "Wrote X tag values"
7. **Auto-update works:** Push a trivial commit → check `docker compose logs updater` after 5 min
8. **PLC connection (production):** Toggle demo off → configure PLC IP → test tag read
