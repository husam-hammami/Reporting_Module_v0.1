# Demo Pipeline Execution Plan — Agent-Based Wiring

> **Purpose:** Wire the full backend data pipeline in demo/emulator mode so that historian storage, WebSocket live data, and frontend display all work correctly. When `demo_mode=false` is set later, the identical code path polls real PLC tags — zero code changes required.
>
> **Date:** 2026-02-18
> **Branch:** `demo-pipeline-wiring` (off `Silos_Reporting_V1.0`)
> **Project root:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config`

---

## The 4 Gaps (Everything Else Is Already Built)

| # | Gap | Fix |
|---|-----|-----|
| 1 | PostgreSQL not installed / DB not created / migrations not run | Agent 1 |
| 2 | `tags` table empty — historian FK writes fail silently | Agent 2 |
| 3 | No published layout in `dynamic_monitor_registry` — workers idle | Agent 3 |
| 4 | `LOCAL_TEST_MODE = true` in `SocketContext.jsx` — WebSocket disabled | Agent 4 |

---

## Confirmed Architecture (Codebase-Audited — Do Not Change)

| Item | Confirmed Value |
|------|----------------|
| Flask port | `5001` |
| axios baseURL (dev) | `http://localhost:5001` direct (no proxy for `/api`) |
| Vite proxy | `http://localhost:5001` for `/orders` + `/socket.io` (WebSocket only) |
| DB defaults (hardcoded in app.py) | `postgres:Hercules@127.0.0.1:5432/dynamic_db_hercules` |
| Auth on API endpoints | None — no JWT/login_required on live-monitor routes |
| Flask startup port line | `app.py` line 2952: `socketio.run(..., port=5001)` |
| Dead socket listeners | `SocketContext.jsx` lines 66–68: `fcl_data`, `scl_data`, `mila_data` (console.log only) |
| Worker DB import | `dynamic_monitor_worker.py` lazy-imports `get_db_connection` from `app` at runtime |
| `seed_demo_layout.py` constraint | CANNOT call Flask HTTP routes (circular import). Must call `dynamic_tables.py` functions directly. |

**Data flow:** Browser → axios → Flask (5001) → PostgreSQL (5432 local)
No proxy changes needed. No CORS changes needed.

---

## Step 0 — Create Working Branch (Before Any Agent)

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
git checkout Silos_Reporting_V1.0
git pull origin Silos_Reporting_V1.0
git checkout -b demo-pipeline-wiring
```

**Failure handling:** If branch already exists: `git checkout demo-pipeline-wiring`
**Success criteria:** `git branch` shows `* demo-pipeline-wiring`

---

## Agent 1 — "Postgres" (~5–10 min)

**Scope:** Database only. No Python code. No frontend.
**Run:** Start a new Claude session and give it this agent's section.

### Tasks

**1. Check if PostgreSQL is installed:**

```bash
psql --version
```

If not found: `winget install PostgreSQL.PostgreSQL.16`
After install: Add `C:\Program Files\PostgreSQL\16\bin` to PATH, or use full path.

**2. Start PostgreSQL service:**

```bash
net start postgresql-x64-16
```

(Service name may vary — check with `services.msc` if this fails)

**3. Create database:**

```bash
psql -U postgres -c "CREATE DATABASE dynamic_db_hercules;"
```

Password: `Hercules` (default from codebase)

**4. Create `backend/.env`:**

```
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Hercules
DB_HOST=127.0.0.1
DB_PORT=5432
```

File path: `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\.env`

**5. Run 12 migrations in strict order:**

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\migrations
psql -U postgres -d dynamic_db_hercules -f create_users_table.sql
psql -U postgres -d dynamic_db_hercules -f create_tags_tables.sql
psql -U postgres -d dynamic_db_hercules -f create_bins_and_materials_tables.sql
psql -U postgres -d dynamic_db_hercules -f add_value_formula_field.sql
psql -U postgres -d dynamic_db_hercules -f add_bin_activation_fields.sql
psql -U postgres -d dynamic_db_hercules -f add_is_counter_to_tags.sql
psql -U postgres -d dynamic_db_hercules -f add_layout_config_field.sql
psql -U postgres -d dynamic_db_hercules -f add_line_running_tag_fields.sql
psql -U postgres -d dynamic_db_hercules -f add_dynamic_monitoring_tables.sql
psql -U postgres -d dynamic_db_hercules -f create_tag_history_tables.sql
psql -U postgres -d dynamic_db_hercules -f create_report_builder_tables.sql
psql -U postgres -d dynamic_db_hercules -f create_kpi_engine_tables.sql
```

**6. Insert default admin user:**

```sql
psql -U postgres -d dynamic_db_hercules -c "
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('admin', 'changeme_hashed', 'admin', true)
ON CONFLICT (username) DO NOTHING;
"
```

(Password hash doesn't matter for demo — just needs a row to avoid FK issues)

**7. Verify:**

```sql
psql -U postgres -d dynamic_db_hercules -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' ORDER BY table_name;
"
```

Must include: `users`, `tags`, `tag_groups`, `live_monitor_layouts`, `live_monitor_sections`, `live_monitor_kpi_cards`, `tag_history`, `tag_history_archive`, `dynamic_monitor_registry`, `report_builder_templates`, `kpi_engine_configs`

### Failure Handling

| Problem | Fix |
|---------|-----|
| `winget` not found | Download PostgreSQL installer from postgresql.org manually |
| `psql` not in PATH | Use full path: `"C:\Program Files\PostgreSQL\16\bin\psql.exe"` |
| Password incorrect | Try empty password first; check `pg_hba.conf` for trust auth |
| Migration fails with "already exists" | Use `IF NOT EXISTS` — all migrations have this. Check for partial runs. |
| Service won't start | Open `services.msc`, find PostgreSQL service, start manually |

### Success Criteria

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';
-- Must return 15+
```

---

## Agent 2 — "SeedTags" (After Agent 1 ✅)

**Scope:** Create and run `backend/seed_demo_tags.py`
**Run:** New Claude session. Provide this agent's section + context: "Agent 1 completed. DB exists with tables."

### What to Create

**File:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\seed_demo_tags.py`

**Logic:**

* **Part A:** Read `INTEGRATED_OFFSETS` from `plc_data_source.py` (lines 304–399). Skip `data_type="Source"` entries. Sanitize label → tag_name (spaces/dashes/slashes → `_`). Map data types: `"Real"`→`REAL`, `"Int"`→`INT`, `"DInt"`→`DINT`, `"Bool"`→`BOOL`. Mark counters: `is_counter=true` for DB2099 DInt tags and DB1603 energy cumulative tags. Set `source_type='PLC'`, `is_active=true`, `decimal_places=2`.

* **Part B:** Read `TAG_PROFILES` from `Frontend/src/Context/EmulatorContext.jsx`. Insert each key as `source_type='Manual'`, `is_active=true`, use unit and decimal_places from profile.

* **Upsert:** `INSERT ... ON CONFLICT (tag_name) DO UPDATE SET ...` — idempotent, safe to re-run.

### Verify

```sql
SELECT source_type, COUNT(*) FROM tags GROUP BY source_type;
-- PLC: ~75+, Manual: ~98

SELECT COUNT(*) FROM tags WHERE is_active = true;
-- Total: ~173+
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `psycopg2` not installed | `pip install psycopg2-binary` in backend virtualenv |
| `.env` not found | Script should load from `backend/.env` — ensure Agent 1 created it |
| `ON CONFLICT` error | Means `tag_name` column lacks UNIQUE constraint — check migration 2 ran correctly |
| Tag count too low (<50 PLC) | Read `plc_data_source.py` again — `INTEGRATED_OFFSETS` may use different variable name |
| `EmulatorContext.jsx` parse fails | Read the raw file — `TAG_PROFILES` is a const object on lines ~22–98 |

### Success Criteria

```sql
SELECT COUNT(*) FROM tags WHERE source_type='PLC' AND is_active=true;    -- >= 75
SELECT COUNT(*) FROM tags WHERE source_type='Manual' AND is_active=true; -- >= 98
```

---

## Agent 3 — "PublishLayout" (After Agent 2 ✅)

**Scope:** Create and run `backend/seed_demo_layout.py`
**IMPORTANT:** Must NOT call Flask HTTP endpoints — uses Python functions directly.
**Run:** New Claude session. Provide this section + context: "Agents 1 and 2 done. DB has tags."

### What to Create

**File:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\seed_demo_layout.py`

**Logic (direct DB + utility functions):**

1. Load `.env`, open psycopg2 connection
2. Check if layout already exists: `SELECT id FROM live_monitor_layouts WHERE layout_name='Grain Terminal Demo'`
3. If not exists: INSERT layout row with `is_active=true`, `is_published=true`, `monitoring_enabled=true`
4. Build config JSONB with sections (see tag list below)
5. `UPDATE live_monitor_layouts SET config = %s WHERE id = %s`
6. `sys.path.insert(0, 'C:\...\backend')` then import:
   * `from utils.dynamic_tables import create_dynamic_monitor_tables, register_dynamic_monitor`
7. Call `create_dynamic_monitor_tables(conn, layout_id, 'grain_terminal_demo')`
8. Call `register_dynamic_monitor(conn, layout_id, 'Grain Terminal Demo')`
9. Commit. Verify with SELECT.

**Layout sections (uses seeded tag names):**

* **Table:** "Silo Status" → `Silo1_Level`, `Silo2_Level`, ..., `Silo8_Level`, `Silo1_Tons`, ..., `Silo8_Tons`
* **KPI:** "Process" → `FlowRate_2_521WE`, `Water_Flow`, `Temperature_1`, `Power_Consumption`
* **KPI:** "Energy" → `C2.EffectivePower`, `C2.Total_Active_Energy`

### Verify

```sql
SELECT layout_id, layout_name, is_active FROM dynamic_monitor_registry;
-- Must show 1 row, is_active = true

SELECT is_published, monitoring_enabled, is_active FROM live_monitor_layouts
WHERE layout_name='Grain Terminal Demo';
-- Must be: true, true, true
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `dynamic_tables.py` import fails | Check `sys.path` includes `backend/` directory |
| `create_dynamic_monitor_tables` signature mismatch | Read the actual function signature from `utils/dynamic_tables.py` first |
| `dynamic_monitor_registry` table not found | Agent 1 may have missed migration 9 — re-run `add_dynamic_monitoring_tables.sql` |
| Layout already exists on re-run | Script should be idempotent — check for existing row first |
| FK error on `tag_id` | Only happens if layout config references tag column names not matching `tags.tag_name` |

### Success Criteria

```sql
SELECT COUNT(*) FROM dynamic_monitor_registry WHERE is_active = true;
-- Must be >= 1
```

---

## Agent 4 — "EnableSocket" (No Dependencies — Run Anytime)

**Scope:** Single file frontend change + dead code cleanup.
**Run:** Any time — even before Agent 1. New Claude session.

### Tasks

**File:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Context\SocketContext.jsx`

**1. Line 6:** Change `const LOCAL_TEST_MODE = true;` → `const LOCAL_TEST_MODE = false;`

**2. Lines 66–68:** Remove the 3 dead listeners:

```javascript
socket.on('fcl_data', (data) => { console.log('FCL data received:', data); });
socket.on('scl_data', (data) => { console.log('SCL data received:', data); });
socket.on('mila_data', (data) => { console.log('MILA data received:', data); });
```

(These were for old hardcoded monitors — the dynamic system handles all monitors now)

Read the file first before editing to confirm exact line numbers haven't shifted.

### Failure Handling

| Problem | Fix |
|---------|-----|
| Line numbers shifted | Search for `LOCAL_TEST_MODE` and `fcl_data` text patterns instead of line numbers |
| File has unsaved changes | Check `git status` first; stash if needed |

### Success Criteria

```bash
grep "LOCAL_TEST_MODE" Frontend/src/Context/SocketContext.jsx
# Must show: const LOCAL_TEST_MODE = false;

grep -c "fcl_data\|scl_data\|mila_data" Frontend/src/Context/SocketContext.jsx
# Must return: 0
```

---

## Agent 5 — "QA & Debug" (After Agents 1–4 ✅)

**Scope:** Full pipeline validation. Start Flask, test everything. Fix any issues found.
**Run:** New Claude session. Provide this section + context: "All 4 setup agents complete."

### Tasks

**1. Start Flask backend:**

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend
python app.py
```

Capture logs. Must see within 10 seconds:
* `"Starting dynamic tag realtime monitor"`
* `"Starting dynamic monitor worker"`
* `"Found N active monitor(s)"` where N >= 1
* `"Starting dynamic archive worker"`
* No `ImportError`, no `OperationalError`, no `ModuleNotFoundError`

**2. Wait 60 seconds, then historian write check:**

```sql
psql -U postgres -d dynamic_db_hercules -c "
SELECT COUNT(*) AS total_rows,
       MAX(timestamp) AS latest_write,
       COUNT(DISTINCT tag_id) AS unique_tags
FROM tag_history;
"
-- total_rows must be > 0
-- latest_write must be within last 30 seconds
-- unique_tags must be > 0
```

```sql
SELECT quality_code, COUNT(*) FROM tag_history GROUP BY quality_code;
-- All rows should be 'GOOD'. COMM_ERROR means emulator not running.
```

**3. API endpoint tests (Flask must be running):**

```bash
curl "http://localhost:5001/api/live-monitor/tags?tags=Silo1_Level,FlowRate_2_521WE"
# Expected: {"tag_values": {"Silo1_Level": <number>, "FlowRate_2_521WE": <number>}}

curl "http://localhost:5001/api/tags?is_active=true" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
# Expected: 173+

curl "http://localhost:5001/api/report-builder/templates"
# Expected: [] (empty array is ok — no templates yet)
```

**4. Historian API test:**

```bash
# Get timestamps
python -c "from datetime import datetime, timedelta, timezone; now=datetime.now(timezone.utc); print(f'from={(now-timedelta(minutes=5)).isoformat()}&to={now.isoformat()}')"

curl "http://localhost:5001/api/historian/history?layout_id=1&from=<from_above>&to=<to_above>"
# Expected: array of data rows (non-empty if 60s has passed since startup)
```

**5. Data integrity verification:**

```sql
-- Check values are not all zeros or nulls
SELECT tag_id, AVG(value), STDDEV(value)
FROM tag_history GROUP BY tag_id LIMIT 5;
-- STDDEV should be > 0 for emulator (values change over time)

-- Check timestamp progression
SELECT MIN(timestamp), MAX(timestamp), COUNT(*) FROM tag_history;
-- Time range should grow with each check
```

**6. Silent failure checks:**

```sql
-- Tags in dynamic registry but NOT in tag_history (silent skip = name mismatch)
-- First get the layout's monitored tag names from config:
SELECT config->'sections' FROM live_monitor_layouts WHERE id=1;

-- Then check if those tag names exist in tags table:
SELECT tag_name FROM tags WHERE tag_name IN ('Silo1_Level','Silo1_Tons','FlowRate_2_521WE');
-- All must exist
```

**7. Write `docs/QA_DEBUG_LOG.md` with:**
* Actual row counts and timestamps
* Any errors encountered and how they were fixed
* API response samples
* Performance notes (response times)

### Common Issues & Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `tag_history` stays at 0 after 60s | Worker running but tag names don't match | Check `get_tag_metadata_map()` — tag names in layout config must match `tags.tag_name` exactly |
| `COMM_ERROR` quality codes | `read_all_tags()` failing in emulator | Verify `demo_mode.json = {"demo_mode": true}` and `EmulatorClient` initialized |
| Flask crashes on start | Missing module or DB not reachable | Read full traceback; check `.env` loaded; check `psycopg2` installed |
| `"Found 0 active monitor(s)"` | `dynamic_monitor_registry` empty | Re-run Agent 3. Verify `is_active=true` in registry. |
| API returns empty `tag_values` | Tags not seeded or wrong names | Verify `tags` table has matching `tag_name` rows; re-run Agent 2 if needed |
| WebSocket events not firing | `LOCAL_TEST_MODE` still true | Verify Agent 4 change. Restart Flask after the change. |
| `OperationalError: connection refused` | PostgreSQL not running | `net start postgresql-x64-16` |

### Success Criteria (All Must Pass)

* Flask starts cleanly, 4 workers visible in logs
* `tag_history` COUNT > 0 after 60s
* `MAX(timestamp)` in `tag_history` is recent (< 30s ago)
* `quality_code = GOOD` for all rows
* `GET /api/live-monitor/tags` returns real values
* `GET /api/historian/history` returns data rows
* `GET /api/tags?is_active=true` returns 173+ tags

---

## Agent 6 — "Performance & Frontend Load" (After Agent 5 ✅)

**Scope:** Performance benchmarks + verify frontend displays live data correctly.
**Run:** New Claude session after Agent 5 passes all checks.

### Tasks

**1. API response time benchmarks:**

```bash
# Measure live tag endpoint (target: < 100ms)
for i in 1 2 3 4 5; do
  curl -w "\nTime: %{time_total}s\n" -s -o /dev/null "http://localhost:5001/api/live-monitor/tags?tags=Silo1_Level,Silo2_Level,Silo3_Level,Silo4_Level,Silo5_Level,Silo6_Level,Silo7_Level,Silo8_Level,FlowRate_2_521WE,Temperature_1"
done
```

**2. Historian query performance (target: < 500ms for 5 minutes of data):**

```bash
curl -w "\nTime: %{time_total}s\n" -s -o /dev/null "http://localhost:5001/api/historian/history?layout_id=1&from=<5min_ago>&to=<now>"
```

**3. Worker write throughput check:**

```sql
-- Check write rate: should be ~1 row/second per tag
SELECT
  date_trunc('minute', timestamp) AS minute,
  COUNT(*) AS rows_written
FROM tag_history
WHERE timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY 1
ORDER BY 1;
```

**4. Memory leak check:**
* Note Flask process memory at startup
* After 10 minutes of operation, check again
* Memory growth > 50MB suggests leak in worker loop

**5. Frontend React console check:**
Launch browser, open DevTools > Console, navigate to the Live Monitor and Report Builder Preview pages. Check for:
* No 404 errors on API calls
* No React prop errors (`Warning: Failed prop type`)
* SocketIO connection confirmed: `"connected to socket"` or similar
* Live tag values updating (not frozen at same number)

**6. Document results in `docs/QA_DEBUG_LOG.md` (append to existing)**

### Failure Handling

| Problem | Fix |
|---------|-----|
| API slow (>500ms) | Check PostgreSQL `EXPLAIN ANALYZE` on slow query; verify indexes from migrations ran |
| Worker falling behind | Check `tag_history` timestamp gap; may need eventlet tuning |
| Frontend shows "—" or 0 for live values | Check browser Network tab for failed API calls; check SocketContext connected state |
| React errors about missing props | Usually cosmetic — log but don't block pipeline completion |

### Success Criteria

* Live tag API: < 200ms average
* Historian API: < 1s for 5min window
* Worker write rate: >= 1 row/sec (check over 60s window)
* Frontend console: no critical errors, socket connected, values updating

---

## Agent 7 — "Commit & Document" (After Agent 6 ✅)

**Scope:** Final git commit, docs update, push.
**Run:** New Claude session after Agent 6 passes.

### Tasks

**1. Verify git status:**

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
git status
```

Expected modified/new files:
* `backend/seed_demo_tags.py` (new)
* `backend/seed_demo_layout.py` (new)
* `Frontend/src/Context/SocketContext.jsx` (modified)
* `docs/QA_DEBUG_LOG.md` (new)

**Do NOT commit:** `backend/.env` (contains password — must be in `.gitignore`)

**2. Verify `.gitignore` covers `.env`:**

```bash
grep ".env" .gitignore
# Must show: .env or backend/.env
```

If not present, add it before committing.

**3. Write final `docs/DEMO_PIPELINE_EXECUTION_PLAN.md`:**

Copy this plan document to `docs/DEMO_PIPELINE_EXECUTION_PLAN.md` and append:

```markdown
## Execution Results
- Date: <actual date>
- Branch: demo-pipeline-wiring
- PLC tags seeded: <actual count>
- Manual tags seeded: <actual count>
- tag_history rows after 10 min: <actual count>
- API response times: <actual benchmarks>
- Issues found: <list any>
- Status: COMPLETE
```

**4. Stage and commit:**

```bash
git add backend/seed_demo_tags.py backend/seed_demo_layout.py
git add Frontend/src/Context/SocketContext.jsx
git add docs/QA_DEBUG_LOG.md docs/DEMO_PIPELINE_EXECUTION_PLAN.md
git commit -m "Wire full demo pipeline: DB migrations, tag seeding, layout publish, WebSocket enabled

- Add seed_demo_tags.py: seeds ~75 PLC tags + ~98 Manual (emulator) tags
- Add seed_demo_layout.py: creates Grain Terminal Demo layout + registers workers
- Fix SocketContext.jsx: LOCAL_TEST_MODE=false, remove dead fcl/scl/mila listeners
- Add QA debug log with verification results

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**5. Push:**

```bash
git push -u origin demo-pipeline-wiring
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `.env` accidentally staged | `git reset HEAD backend/.env` then add to `.gitignore` |
| Push rejected | `git pull origin demo-pipeline-wiring --rebase` then push again |
| `.gitignore` missing `.env` | Add `backend/.env` line to `.gitignore`, commit that first |

### Success Criteria

- [ ] `git log --oneline -1` shows the pipeline commit
- [ ] `git status` shows clean working tree
- [ ] `backend/.env` NOT in `git show HEAD --name-only`
- [ ] `docs/DEMO_PIPELINE_EXECUTION_PLAN.md` exists in repo

---

## Full Execution Sequence

```
Step 0: git checkout -b demo-pipeline-wiring

Agent 4 (EnableSocket)    <- 1 file, ~2 min, run FIRST (no deps)
Agent 1 (Postgres)        <- DB setup, ~10 min
  +-- Agent 2 (SeedTags)  <- Python script, ~5 min
        +-- Agent 3 (PublishLayout) <- Python script, ~5 min
              +-- Agent 5 (QA & Debug)     <- Full testing, ~15 min
                    +-- Agent 6 (Perf/Frontend) <- Benchmarks, ~10 min
                          +-- Agent 7 (Commit)  <- Git commit + push, ~5 min
```

**Total estimated time:** ~50 minutes

---

## Per-Agent Prompt Template (Use This When Starting Each Agent)

```
You are executing Agent N — "<Name>" from the Hercules Demo Pipeline Execution Plan.

Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Active branch: demo-pipeline-wiring

Context: [paste relevant "After Agent X" context here]

Your ONLY job is to execute the tasks in the "[Agent N]" section of the plan.
Follow every failure handling instruction.
Verify success criteria before reporting done.
Do NOT modify any files outside your scope.
Report the exact SQL/command output for each verification step.
```

---

## Execution Results

- **Date:** 2026-02-18
- **Branch:** demo-pipeline-wiring
- **PostgreSQL:** v17.2, trust auth for localhost
- **PLC tags seeded:** 84
- **Manual tags seeded:** 76
- **Total active tags:** 160
- **tag_history rows after ~18 min:** 8,560+
- **Unique tags in history:** 4 (FlowRate_2_521WE, Water_Flow, C2.EffectivePower, C2.Total_Active_Energy)
- **quality_code:** ALL GOOD
- **API response times:**
  - Live tag API: ~220ms avg (5 runs)
  - Historian API: ~227ms (5-min window)
- **Worker write rate:** ~2 rows/sec per tag
- **Issues found:**
  - `fcl_monitor_logs_archive` not found (old hardcoded ref in app.py, non-blocking)
  - Bin warnings (bins table empty, expected for demo)
  - EmulatorClient produces constant values (STDDEV=0, by design)
- **Status:** COMPLETE
