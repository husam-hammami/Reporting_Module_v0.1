# Hercules Reporting Module — Quick Start

Get the system running locally in 5 minutes.

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| **PostgreSQL** | 17 | `psql --version` |
| **Python** | 3.10+ | `python --version` |
| **Node.js** | 18+ | `node --version` |
| **npm** | 9+ | `npm --version` |

> **PostgreSQL auth:** Set `pg_hba.conf` to `trust` for local connections, or use password auth with credentials in `backend/.env`.

---

## 1. Clone & checkout

```bash
git clone <repo-url>
cd Reporting_Module_v0.1
```

## 2. Backend setup

```bash
cd backend

# Configure environment
cp .env.example .env
# Edit .env if your PostgreSQL uses a different password/host/port

# Install Python dependencies
pip install -r requirements.txt

# Create database, run migrations, seed demo data
python tools/setup/setup_local_db.py

# Start the backend (port 5000)
python app.py
```

You should see:
```
INFO: Database connection pool created (5-20 connections)
INFO: Starting Flask-SocketIO server...
INFO: Server will listen on: http://0.0.0.0:5000
```

## 3. Frontend setup

Open a **new terminal**:

```bash
cd Frontend

# Install dependencies
npm install

# Start dev server (port 5174)
npm run dev
```

You should see:
```
VITE v6.4.1  ready in 280 ms
➜  Local:   http://localhost:5174/
```

## 4. Open in browser

1. Go to **http://localhost:5174**
2. Login: **admin** / **admin**
3. You'll land on **Report Builder** with demo data

---

## Architecture

```
Frontend (React + Vite)          → http://localhost:5174
    ↓  HTTP + WebSocket
Backend (Flask + SocketIO)       → http://localhost:5000
    ↓  psycopg2
PostgreSQL                       → localhost:5432 / dynamic_db_hercules
```

### Active pages
- **Report Builder** — Design reports with drag-and-drop widgets
- **Reporting** — View reports with live & historical data
- **Engineering** — Tags, Tag Groups, Formulas, Mappings, Email, Shifts, Users, System

### Backend blueprints
| Blueprint | Prefix | Purpose |
|-----------|--------|---------|
| `tags_bp` | `/api` | Tag CRUD, test read, seed, export/import |
| `tag_groups_bp` | `/api` | Tag group CRUD |
| `report_builder_bp` | `/api` | Report template CRUD |
| `live_monitor_bp` | `/api` | Layout CRUD, live tag values |
| `historian_bp` | `/api` | Historical tag data |
| `kpi_config_bp` | `/api` | KPI configuration |

---

## Demo Mode

The system starts in **demo mode** by default — it uses a software emulator instead of a real PLC. All tag values are simulated with realistic time-based patterns.

Toggle via: **Engineering → System → Switch to Production/Demo**

---

## Key files

```
backend/
├── app.py                  # Main Flask app (847 lines)
├── plc_utils.py            # PLC connection utilities
├── scheduler.py            # APScheduler jobs
├── tags_bp.py              # Tags blueprint
├── tag_groups_bp.py        # Tag groups blueprint
├── report_builder_bp.py    # Report builder blueprint
├── live_monitor_bp.py      # Live monitor blueprint
├── historian_bp.py         # Historian blueprint
├── kpi_config_bp.py        # KPI config blueprint
├── workers/                # Background workers
├── utils/                  # Shared utilities (tag_reader, etc.)
├── config/                 # Auto-created JSON configs
├── migrations/             # SQL migration files
├── tools/                  # One-time scripts (migrations, diagnostics, setup)
└── legacy/                 # Archived legacy code (reference only)

Frontend/
├── src/
│   ├── Pages/              # Route pages
│   ├── Components/         # Reusable components
│   ├── Context/            # React contexts
│   ├── API/                # Axios + endpoints
│   ├── Routes/             # Router + providers
│   └── Hooks/              # Custom hooks
└── vite.config.js          # Vite config (port 5174, proxy to 5000)
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `psycopg2` install fails | Install `psycopg2-binary` instead |
| Port 5000 in use | Kill the old process: `netstat -ano \| findstr :5000` |
| Port 5174 in use | Kill the old process or change port in `vite.config.js` |
| CORS errors | Check `ALLOWED_ORIGINS` in `app.py` matches your frontend URL |
| "Bin not found" warnings | Legacy — should not appear. If they do, check `tag_reader.py` |
| Database connection refused | Verify PostgreSQL is running: `pg_isready` |
