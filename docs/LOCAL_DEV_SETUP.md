# Local Development Setup Guide

## Architecture Overview

The Hercules Reporting Module runs as three services that can be hosted locally or remotely:

```
Frontend (Vite)  ──▶  Flask Backend  ──▶  PostgreSQL
   :5174                 :5000              :5432
```

There are two independent environments:

| Environment | Backend URL | Database |
|---|---|---|
| **Local (your PC)** | `http://localhost:5000` | `localhost:5432 / dynamic_db_hercules` |
| **Remote (VPN)** | `http://100.118.31.61:5000` | Remote server's own PostgreSQL |

The frontend's `.env.local` file controls which backend it talks to. Each backend has its own separate PostgreSQL database.

---

## Prerequisites

- **Node.js** (v18+)
- **Python** (3.10+)
- **PostgreSQL 17** installed locally
- **Git**

---

## 1. Database + Backend Setup

Follow **[LOCAL_DB_SETUP.md](LOCAL_DB_SETUP.md)** to install PostgreSQL and run the automated setup script. It handles everything:

```bash
cd backend
cp .env.example .env          # create your local config
pip install -r requirements.txt
python setup_local_db.py       # creates DB, tables, user, demo data
```

Then start the backend:

```bash
python app.py
```

The Flask server starts on `http://localhost:5000`.

---

## 2. Frontend Setup

```bash
cd Frontend
```

### Install Dependencies

```bash
npm install
```

### Configure API URL

Edit `Frontend/.env.local` to point at the correct backend:

**For local development (backend on your PC):**
```
VITE_API_URL=http://localhost:5000
```

**For remote/VPN development (backend on shared server):**
```
VITE_API_URL=http://100.118.31.61:5000
```

> `.env.local` is gitignored — each developer sets their own target.

### Start the Frontend

```bash
npm run dev
```

Opens on `http://localhost:5174`.

---

## 3. Verify Everything Works

### Backend Health Check

```bash
curl http://localhost:5000/api/live-monitor/tags
```

Should return JSON with tag data.

### Frontend

Open `http://localhost:5174` in your browser. Navigate to:

1. **Live Monitor** — should show tag values updating via REST polling (every 5s)
2. **Report Builder** — create a report, add a KPI card, select a tag, preview it

---

## 4. System Settings (Demo/Production Mode & PLC Config)

The backend exposes three endpoints under `/api/settings/` for managing the system mode and PLC connection:

| Endpoint | Method | Description |
|---|---|---|
| `/api/settings/system-status` | GET | Returns `{ demo_mode, plc_config }` — used by Navbar badge and Settings page |
| `/api/settings/demo-mode` | POST | Toggle between Demo (emulator) and Production (real PLC). Body: `{ "enabled": true/false }` |
| `/api/settings/plc-config` | GET | Returns current PLC config `{ ip, rack, slot }` |
| `/api/settings/plc-config` | POST | Save new PLC config and trigger reconnect. Body: `{ "ip": "...", "rack": 0, "slot": 3 }` |

These are configured from the **Engineering > System** tab in the frontend. The Navbar shows an amber **DEMO** or green **LIVE** badge based on the current mode.

Config files live in `backend/config/`:
- `demo_mode.json` — `{ "enabled": true/false }`
- `plc_config.json` — `{ "ip": "192.168.23.11", "rack": 0, "slot": 3 }`

> **Note:** When pointing `.env.local` at a remote backend, these routes must also exist on that server. If the remote backend hasn't been updated yet, the System settings page will show a "Backend Unreachable" warning and the Navbar badge won't appear.

---

## Switching Between Local and Remote

The **only** thing you change is `Frontend/.env.local`:

| Target | `VITE_API_URL` value | Notes |
|---|---|---|
| Local backend | `http://localhost:5000` | Must have local Flask + PostgreSQL running |
| Remote backend | `http://100.118.31.61:5000` | Must be connected to Tailscale VPN |

After changing `.env.local`, Vite auto-restarts (no manual restart needed).

The `axios.js` module reads `VITE_API_URL` at startup. When set explicitly to a remote URL, the automatic localhost fallback is **disabled** — the frontend will only talk to the specified server.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `FATAL: password authentication failed` | pg_hba.conf still using scram-sha-256 | Change to `trust` and restart PostgreSQL |
| `AxiosError: Network Error` on frontend | Backend not running or .env.local pointing to wrong URL | Check backend is running; verify VITE_API_URL |
| `Port 5174 already in use` | Old Vite process still running | Kill the process: `netstat -ano \| findstr :5174` then `taskkill /PID <pid> /F` |
| `Port 5000 already in use` | Old Flask process still running | Kill the process or restart terminal |
| Tags showing but no historian data | Demo seeds not run | Run `python seed_demo_tags.py` and `python seed_demo_layout.py` |
| WebSocket not connecting | CORS or proxy config | REST polling (`/api/live-monitor/tags` every 5s) works as fallback — no data loss |

---

## UI/UX Improvements (Plan A + Plan B-1 + Plan B-2)

### New API Routes (Plan A)

| Endpoint | Method | Auth Required | Description |
|----------|--------|--------------|-------------|
| `/api/settings/smtp-config` | GET | @login_required | Returns SMTP config (password masked) |
| `/api/settings/smtp-config` | POST | @login_required | Save SMTP configuration |
| `/api/settings/smtp-test` | POST | @login_required | Send test email |
| `/api/settings/shifts` | GET | @login_required | Returns shift schedule |
| `/api/settings/shifts` | POST | @login_required | Save shift schedule |
| `/update-user/<id>` | PUT | admin only | Update user's username/role |
| `/change-password/<id>` | POST | admin only | Reset any user's password |
| `/change-own-password` | POST | @login_required | Change own password |

### Updated Auth Guards (Plan A)

- `/add-user` now requires **admin** role (was unprotected)
- `/delete-user/<id>` now requires **admin** role (was @login_required only)

### New Config Files (Plan A — File-Based, Auto-Created)

| File | Purpose | Default Location |
|------|---------|-----------------|
| `backend/config/smtp_config.json` | SMTP email settings | Auto-created with empty defaults |
| `backend/config/shifts_config.json` | Shift schedule | Auto-created with 3 default shifts |

### New Frontend Pages (Plan A)

| Route | Component | Access |
|-------|-----------|--------|
| `/settings/users` | UserManagement.jsx | Admin + Manager |
| `/settings/email` | EmailSettings.jsx | All authenticated |
| `/settings/shifts` | ShiftsSettings.jsx | All authenticated |

### New Frontend Dependencies (Plan B-2)

| Package | Version | Purpose |
|---------|---------|---------|
| `jspdf` | latest | PDF export from Report Builder Preview and Report Viewer |

### Typography Changes (Plan B-1)

- **Body font**: Arial → Inter (Google Fonts CDN)
- **Mono font**: system default → JetBrains Mono (Google Fonts CDN)
- Light mode `:root` CSS variables shifted from warm hues (20/25/60) to cool blue-gray (214)
- Dark mode: **unchanged**

### UI Improvements (Plan B-1)

- **ColumnEditor**: dark mode fixed — hardcoded hex colors replaced with CSS variables
- **MUI Tooltips**: added to all toolbar buttons in Report Builder Canvas, Preview, Navbar, DarkModeButton, WidgetToolbox
- **LiveDataIndicator**: pulsing green dot with seconds counter in Report Builder Preview
- **Silo Widget**: upgraded from flat 2D rectangle to 3D cylindrical vessel with metallic gradient, wave animation, and zone glow effects

### Export Features (Plan B-2)

- **PDF Export**: A4 landscape PDF download from Report Builder Preview and Report Viewer
- **PNG Export**: High-res screenshot download from Report Builder Preview and Report Viewer
- Export dropdown replaces standalone Print button — includes Print / PDF / PNG options
- Exports always use white background regardless of dark mode setting

### Migration Notes

- **No DB schema changes** — users table unchanged
- **SMTP must be configured** via Settings > Email/SMTP before email delivery works
- `report_mailer.py` no longer has hardcoded credentials — configure via UI
- Google Fonts (Inter, JetBrains Mono) loaded via CDN — requires internet on first load, cached after
- Silo widget SVG rewritten — existing silo widgets auto-upgrade, no config changes needed
- `/user` route redirects to `/settings/users` — update bookmarks
- "User" nav item removed from sidebar — user management is in Settings > Users
- Login page no longer has "Create account" — accounts managed by admins via Settings
- Light mode color scheme shifted from warm gray to cool blue-gray
