# Hercules Reporting Module — Deployment Plan
**Date:** 2026-02-18
**Branch:** Silos_Reporting_V1.0
**Prepared by:** Claude (AI Assistant)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Status](#current-system-status)
3. [Critical Blockers](#critical-blockers)
4. [Agent Task Directory](#agent-task-directory)
5. [Deployment Phases](#deployment-phases)
6. [Environment Setup](#environment-setup)
7. [Sanity Test](#sanity-test)
8. [Known Technical Debt](#known-technical-debt)

---

## Executive Summary

The Hercules Reporting Module is architecturally sound and feature-rich. The demo/emulator path works end-to-end today. The **real PLC path** has 5 specific blockers that must be resolved before production deployment. Blockers 1–3 are small fixes suitable for parallel Claude Code agents. Blockers 4–5 are larger scope (Phase 3).

---

## Current System Status

| Area | Status | Notes |
|------|--------|-------|
| Tag CRUD (create/edit/delete) | Ready | UI + backend fully functional |
| PLC address validation | Ready | DB#.offset format enforced |
| Tag source types (PLC, Formula, Mapping, Manual) | Ready | All 4 types implemented |
| Tag Groups | Ready | API + UI functional |
| Report Builder canvas | Ready | Drag-drop, widget library, autosave |
| Report Viewer (live display) | Ready | Grid layout, time presets |
| Live Monitor layouts | Ready | Tables, KPI cards, charts |
| Demo / Emulator mode | Ready | 70+ simulated tags, fully functional |
| Historian read queries | Ready | Basic archive queries work |
| User authentication | Ready | Bearer token flow |

---

## Critical Blockers

### Blocker 1: WebSocket Connection Disabled
**File:** `Frontend/src/Context/SocketContext.jsx`
**Problem:** `LOCAL_TEST_MODE = true` disables the Socket.IO client entirely.
**Impact:** No live tag data reaches Report Builder or Report Viewer from the real backend.
**Effort:** 1 line change.

### Blocker 2: No Automated Tag Polling
**Files:** `backend/scheduler.py`, new `backend/utils/tag_cache.py`
**Problem:** `read_all_tags()` exists and works on demand, but no scheduled job calls it automatically. Tags are never polled unless an API call explicitly requests them.
**Impact:** Live tag values in reports will be stale unless a user manually triggers a read.
**Effort:** ~40 lines across 2 files.

### Blocker 3: Live Tag Route May Not Serve Custom Tags
**File:** `backend/live_monitor_bp.py`
**Problem:** The frontend fetches live tag values from `/api/live-monitor/tags?tags=tag1,tag2,...`. This route must serve any user-defined tag, not just hardcoded monitor tags.
**Effort:** Audit + minor fix.

### Blocker 4: PLC Protocol Limited to Siemens S7
**Files:** `backend/orders_bp.py`, `backend/utils/tag_reader.py`
**Problem:** The entire PLC layer uses `python-snap7`. No OPC-UA, Modbus TCP/RTU support.
**Impact:** Only Siemens S7/S7-1200/S7-1500 PLCs can be connected.
**Effort:** High — new protocol adapters if non-Siemens support is needed. Phase 3.

### Blocker 5: ReportGenerator Not Implemented
**File:** `Frontend/src/Pages/Reports/ReportGenerator.jsx`
**Problem:** Uses hardcoded mock data. PDF/Excel export shows a placeholder alert.
**Impact:** Generating historical/scheduled reports and exporting is not functional.
**Effort:** High — significant backend + frontend work. Phase 3.

---

## Agent Task Directory

**How to use:** Tell the agent: *"Your name is [Agent Name]. Find your task in `docs/Deployment_Plan_Feb_18.md` and execute it."*

### Dependency Map

```
Reza  (WebSocket enable)        ← no deps, run in parallel
Nour  (Tag polling scheduler)   ← no deps, run in parallel
Sami  (Live tag HTTP endpoint)  ← no deps, run in parallel
Layla (Demo mode reset)         ← no deps, run in parallel
Tariq (Wire cache to endpoint)  ← depends on Nour finishing first
```

Tasks for Reza, Nour, Sami, and Layla are **fully parallel-safe** — they touch different files.

---

### Agent: Reza — Enable WebSocket
**Area:** `Frontend/src/Context/SocketContext.jsx` ONLY
**Depends on:** Nothing

**Objective:** Enable the WebSocket connection in the frontend. Line 6 has `const LOCAL_TEST_MODE = true;` which disables the entire Socket.IO connection. Change it to `false`.

**Scope:** The socket URL logic, reconnection config, and event listeners are already implemented correctly — they just need to be enabled.

**Constraints:**
- Do not change the socket URL logic or reconnection settings unless clearly broken
- Do not touch any other file

**Success:** On app load, browser console shows a socket connection attempt. Either a successful connect or a clean retry/failure — both are correct depending on whether the backend is running.

---

### Agent: Nour — Tag Polling Scheduler
**Area:** `backend/scheduler.py` + new `backend/utils/tag_cache.py`
**Depends on:** Nothing

**Objective:** Create a lightweight tag cache that refreshes every 5 seconds via APScheduler, so HTTP polling requests can be served from memory instead of hitting the PLC directly.

**Steps:**
1. Read `backend/scheduler.py` (existing scheduler with 5 jobs)
2. Read `backend/utils/tag_reader.py` to confirm `read_all_tags(tag_names=None, db_connection_func=None) -> dict`
3. Create `backend/utils/tag_cache.py` with:
   - Module-level dict: `LATEST_TAG_VALUES = {}`
   - Function: `update_tag_cache()` — calls `read_all_tags()`, updates dict in-place (`.clear()` then `.update()`)
   - Function: `get_cached_tag_values(tag_names=None)` — returns filtered or full copy
4. In `scheduler.py`, import and add: `scheduler.add_job(update_tag_cache, 'interval', seconds=5, id='tag_cache_refresh')`

**Constraints:**
- Do not modify `app.py`, `live_monitor_bp.py`, `tags_bp.py`, or any other existing file
- `update_tag_cache()` must handle exceptions silently (try/except, log warning) — PLC read error must never crash the scheduler
- `LATEST_TAG_VALUES` must be updated in-place (not reassigned) to keep references stable across threads

**Success:** When backend starts, scheduler log shows tag cache refresh firing every 5 seconds. `LATEST_TAG_VALUES` is populated with current tag values.

---

### Agent: Sami — Live Tag HTTP Endpoint
**Area:** `backend/live_monitor_bp.py` ONLY
**Depends on:** Nothing (optionally enhanced after Nour finishes)

**Objective:** Verify the `GET /api/live-monitor/tags` endpoint correctly reads and returns values for any user-defined tag. Fix it if it doesn't. Optionally wire to tag cache if `tag_cache.py` exists.

**Audit checklist:**
1. Confirm it calls `read_all_tags(tag_names=...)` from `utils/tag_reader.py`
2. Confirm response format: `{ "status": "ok", "timestamp": "...", "tag_values": { ... } }`
3. If endpoint only serves layout-specific tags or ignores `?tags=` param — fix it

**Optional enhancement** (only if `tag_cache.py` exists):
- Try `get_cached_tag_values(tag_names)` first; fall back to `read_all_tags()` if cache is empty

**Constraints:**
- Do not change the route URL, HTTP method, or blueprint registration
- Do not touch any other file

**Success:** `GET /api/live-monitor/tags?tags=SomeTag` returns the current PLC value for that tag regardless of which layout it belongs to.

---

### Agent: Layla — Reset Demo Mode
**Area:** `backend/config/demo_mode.json` ONLY
**Depends on:** Nothing

**Objective:** Set demo_mode to false so the system connects to a real PLC.

**Change:** `{"demo_mode": true}` → `{"demo_mode": false}`

**Note:** If the PLC is unreachable at deployment time, tag reads will return null values gracefully — the server will not crash.

---

### Agent: Tariq — Wire Tag Cache to Tags Endpoint
**Area:** `backend/tags_bp.py` ONLY
**Depends on:** Nour must finish first (creates `tag_cache.py`)

**Objective:** Wire the `POST /api/tags/get-values` endpoint to try the tag cache first before falling back to a direct PLC read.

**Steps:**
1. Read `tags_bp.py` lines 315–432 (the `get_tag_values` endpoint)
2. Read `backend/utils/tag_cache.py`
3. Replace direct `read_all_tags()` call with: try cache first → fall back to direct read → apply existing bin activation filtering

**Constraints:**
- The fallback to `read_all_tags()` is mandatory — never fail if cache is empty
- Do not remove the bin activation filtering logic
- Do not change the response format
- Touch `tags_bp.py` only

**Success:** On warm cache, endpoint returns tag values from memory without a PLC call. On cold start, falls back to direct PLC read transparently.

---

## Deployment Phases

### Phase 1 — Minimum Viable Deployment (Real PLC, Live View)
1. Fix WebSocket — Blocker 1 (Agent Reza)
2. Add tag polling scheduler — Blocker 2 (Agent Nour)
3. Verify live tag route — Blocker 3 (Agent Sami)
4. Reset demo mode (Agent Layla)
5. Wire cache to endpoint (Agent Tariq)
6. Set backend `.env` with real DB credentials and PLC IP
7. Run database migrations
8. Start backend: `python app.py`
9. Build frontend: `npm run build`
10. Serve via nginx or `npm run preview`

### Phase 2 — Stability & Reliability
11. Add error boundaries for failed PLC connections in UI
12. Configure nginx for production static serving
13. Set up PostgreSQL backup schedule
14. Write Docker Compose (currently empty — 0 bytes)
15. Enable HTTPS (SSL certificate)

### Phase 3 — Full Feature Completion
16. Implement ReportGenerator with archive queries (Blocker 5)
17. Add PDF/Excel export
18. Integrate `value_formula` field in tag reader
19. Implement bin activation logic (`is_bin_tag`, `activation_condition`)
20. Add OPC-UA / Modbus support if required (Blocker 4)

---

## Environment Setup

### Backend (`backend/.env`)
```
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your password>
DB_HOST=127.0.0.1
DB_PORT=5432
PLC_IP=192.168.23.11
PLC_RACK=0
PLC_SLOT=3
SECRET_KEY=<random secret>
```

### Frontend (`Frontend/.env.local`)
```
VITE_API_URL=http://<backend-host>:5000
```

### Database Migrations
Run all SQL files in `backend/migrations/` in order against the PostgreSQL database.

### Demo Mode
After deployment, verify demo mode is OFF:
- Check `backend/config/demo_mode.json` — should be `{"demo_mode": false}`
- Or toggle via Settings > Demo Mode in the UI

---

## Sanity Test (After All Tasks Complete)

1. Start backend: `python app.py` from `backend/`
2. Confirm in console: scheduler starts, `tag_cache_refresh` job fires every 5 seconds
3. Start frontend: `npm run dev` from `Frontend/`
4. Open browser DevTools > Console > confirm socket connection attempt
5. Navigate to **Settings > Tags** > create a PLC tag (e.g., `DB2099.0`, type `REAL`)
6. Click **"Test Tag"** > should return a numeric value (not an error)
7. Go to **Report Builder** > new report > add KPI widget > assign that tag
8. Open **Report Viewer** > widget shows a value and updates every ~5 seconds
9. Check console: socket connect attempt visible (success or retried error — both correct)

**Troubleshooting:**
- If step 6 fails → PLC connection issue (check IP, rack, slot, snap7 lib installed)
- If step 8 fails but step 6 works → WebSocket or polling issue (Blockers 1–3)

---

## Known Technical Debt (Not Blocking)

| Item | Location | Priority |
|------|----------|----------|
| DynamicTableSection is 1744 lines with complex pattern matching | `Frontend/src/Components/LiveMonitor/DynamicTableSection.jsx` | Medium |
| No TypeScript — type mismatches between widget config and renderer | All Frontend files | Low |
| Docker Compose is empty | `docker-compose.yml` | Medium |
| No API documentation (Swagger/OpenAPI) | Backend | Low |
| 5-second REST polling fallback is bandwidth-intensive at scale | Frontend | Low |
| Multiple socket event names (`live_tag_data`, `live_data`, `plc_data`) — unclear canonical name | Frontend/Backend | Low |

---

*Consolidated from three separate deployment documents on 2026-02-18.*
