# Single Historian Migration Plan — Task Design & Code References

**Goal:** Move from "one live + one archive table per layout" to a single plant-wide historian (`tag_history` / `tag_history_archive`) while keeping tags, tag groups, reports, and live monitor unchanged.

**Principle:** Phased migration with dual-write, then validate, then switch reads, then remove old tables. No big-bang cutover.

---

## Current Architecture (Code References)

| Concept | Where It Lives | Exact Reference |
|--------|----------------|------------------|
| Layout = "Mill" | `live_monitor_layouts` | Table in DB; no separate `mills` table. `layout_id` is the mill key. |
| Per-layout live table | Created on publish | `backend/utils/dynamic_tables.py` → `create_dynamic_monitor_tables()` (lines 26–215). Returns `live_table`, `archive_table` (e.g. `mila_monitor_logs`, `mila_monitor_logs_archive`). |
| Per-layout archive table | Same | Same function; archive schema at lines 178–194. |
| Registry of layout → tables | `dynamic_monitor_registry` | `backend/utils/dynamic_tables.py` → `register_dynamic_monitor()` (226–261), `get_active_monitors()` (264–272). |
| Publish = create tables + register | API | `backend/live_monitor_bp.py` → publish flow: ~lines 892–934. Calls `create_dynamic_monitor_tables()`, then `register_dynamic_monitor()`. |
| Write live data (every second) | Worker | `backend/workers/dynamic_monitor_worker.py` → loop over `get_active_monitors()`, then **INSERT** at lines 246–256 into `live_table`. Writes `layout_id`, `order_name`, **sections_data** (JSONB), `line_running`, `created_at`. **Note:** Worker has `tag_values` (raw dict from `read_all_tags`) at line 143; current INSERT uses resolved `sections_data`, not raw tag_values. |
| Archive hourly | Worker | `backend/workers/dynamic_archive_worker.py` → reads from `live_table` (59–64), aggregates, **INSERT** into `archive_table` (119–136), **DELETE** from `live_table` (138–141). Uses `tag_values` JSONB from rows. |
| Order next number (live + archive) | Helper | `backend/utils/order_tracker.py` → uses `live_table_name` and `archive_table_name` from registry (84–85, 93–108). |
| Tags config | DB + API | `backend/migrations/create_tags_tables.sql` → `tags` (id, tag_name, db_number, offset, data_type, ...). `backend/tags_bp.py` → CRUD. |

**Important:** Current live rows store **section-resolved data** (e.g. sender/receiver rows), not raw tag name → value. For a **tag historian** we need **raw tag values**. The worker already has `tag_values` (dict of tag_name → value) before building `sections_data`; dual-write will use that.

---

## Target Architecture

- **One table:** `tag_history` — one row per (layout_id, tag_id, value, timestamp). Optional: `order_id` or `order_name`. See [Enhanced historian schema](#11-create-migration-sql-for-historian-tables) below for production columns (value_raw, value_delta, quality_code, etc.).
- **One archive table:** `tag_history_archive` — same shape, aggregated by hour (and optionally by day). Used for reporting/KPI.
- **No new tables** when a new layout is published; only inserts into these two tables.
- **Config unchanged:** `tags`, `tag_groups`, `live_monitor_layouts`, report templates, Settings → Tags UI.

---

## Phase 1 — Introduce Historian Table + Dual Write

### 1.1 Create migration SQL for historian tables

**New file:** `backend/migrations/create_tag_history_tables.sql`

- Create `tag_history`:
  - `id` BIGSERIAL PRIMARY KEY
  - `layout_id` INTEGER NOT NULL REFERENCES `live_monitor_layouts`(id)
  - `tag_id` INTEGER NOT NULL REFERENCES `tags`(id)
  - `value` DOUBLE PRECISION (or NUMERIC) — stored value for display/reporting; for BOOL store 0/1
  - `value_raw` DOUBLE PRECISION (optional) — raw PLC value before delta/scale; needed for counter reset handling
  - `value_delta` DOUBLE PRECISION (optional) — delta since last sample; use for cumulative counters so KPI survives resets
  - `is_counter` BOOLEAN DEFAULT FALSE — marks cumulative tags; enables reset/overflow handling
  - `quality_code` VARCHAR(20) DEFAULT 'GOOD' — e.g. `GOOD`, `BAD`, `STALE`, `COMM_ERROR` (industrial standard)
  - `timestamp` TIMESTAMP NOT NULL DEFAULT NOW()
  - Optional: `order_name` TEXT
  - Constraint: `UNIQUE(layout_id, tag_id, timestamp)` — prevents duplicate historian rows
  - Indexes: `(layout_id, tag_id, timestamp)`, `(timestamp)` for time-range queries and partitioning later.
- Create `tag_history_archive`:
  - Same columns plus `archive_hour` TIMESTAMP (hour bucket).
  - Indexes: `(layout_id, tag_id, archive_hour)`, `(archive_hour)`.

**Reference:** Existing pattern for live/archive in `backend/utils/dynamic_tables.py` (97–106 for live, 181–194 for archive). New tables are global, no `layout_id` in table name.

**Timestamp source:** Define once: either **PLC time** or **server time**. Never mix both; document in config.

### 1.2 Run migration

**Where:** Same pattern as existing migrations (e.g. `backend/run_dynamic_monitoring_migration.py` that checks and runs `add_dynamic_monitoring_tables.sql`).

**New file:** `backend/run_tag_history_migration.py` (or add step to `check_and_run_migration.py`) to run `create_tag_history_tables.sql` once.

### 1.3 Resolve tag_name → tag_id + Tag metadata cache versioning

**New helper (single place):** Get map `tag_name → tag_id` for all active tags.

- **Suggested file:** `backend/utils/tag_reader.py` (or new `backend/utils/historian_helpers.py`).
- Query: `SELECT id, tag_name FROM tags WHERE is_active = TRUE`.
- Return dict: `{ tag_name: tag_id }`. Cache per worker loop or short TTL to avoid querying every second.

**Tag metadata cache versioning (critical):** Tags can change while the worker is running (new tag, rename, deactivate). Without reload, the worker may write wrong tag_id or miss new tags.
- Add **cache version** or **reload trigger**: e.g. reload map every N seconds, or on `config_updated` WebSocket event, or when INSERT fails with FK violation.
- Document in code: "Tag map is valid at time T; reload after interval or on config change."

**Reference:** Tags table in `backend/migrations/create_tags_tables.sql` (id, tag_name, is_active).

### 1.4 Dual-write in dynamic monitor worker

**File:** `backend/workers/dynamic_monitor_worker.py`

- **Location:** Right after the successful INSERT into `live_table` (after line ~258, before `conn.commit()` at 259), in the same loop over monitors.
- **Logic:**
  1. Keep existing INSERT into `live_table` unchanged (sections_data, order_name, etc.).
  2. Using the same `layout_id` and the **raw** `tag_values` dict (already in scope at line 143 for the monitor; for this layout use `filtered_tag_values` or the full `tag_values` for tags that belong to this layout — see `layout_tags` / `monitor_tag_map`).
  3. Resolve tag_name → tag_id using the helper from 1.3 (batch or cached map).
  4. For each (tag_name, value) in the filtered tag_values, build one row for `tag_history`: `(layout_id, tag_id, value, value_raw, value_delta, is_counter, quality_code, timestamp, order_name)`. **Use a single batch INSERT (executemany or multi-row VALUES)** — never one INSERT per tag per second, or DB load explodes.
- **Important:** Do not remove or change the existing INSERT into `live_table` in this phase. Both writes must succeed; wrap in same transaction if possible, or catch and log historian errors so live storage is not affected.

**Phase 1 feature flag:** Add config e.g. `USE_CENTRAL_HISTORIAN = true/false` (env or DB setting). When false, skip historian write; when true, dual-write. Enables instant rollback and staged rollout.

**Exact code reference:** INSERT into live table at lines 246–256. Variable `filtered_tag_values` at 176–183; `layout_id`, `order_name`, `datetime.datetime.now()` are available. Add a second block that builds rows for `tag_history` and runs an INSERT.

### 1.5 Optional: Dual-write in archive worker to `tag_history_archive`

**File:** `backend/workers/dynamic_archive_worker.py`

- **Location:** After aggregating and inserting into the layout's `archive_table` (after line ~136), before DELETE from live_table.
- **Logic:** From the same aggregated data you already have per tag (`aggregated_tag_values`), resolve tag_name → tag_id, then INSERT into `tag_history_archive` (layout_id, tag_id, value, archive_hour). One row per tag per layout per hour.
- This keeps the new historian archive in sync with the old per-layout archive during the transition.

**Exact code reference:** `aggregated_tag_values` built at 74–111; INSERT into `archive_table` at 119–136. Add a similar block for `tag_history_archive`.

---

## Phase 2 — Validate

- **No code changes.** Run both systems in parallel.
- Compare: for a chosen layout and time range, query (a) the layout's archive table and (b) `tag_history` / `tag_history_archive` and ensure values match (e.g. same tag, same hour, same value).
- **Add automated validation script:** Compare `layout_archive` vs `tag_history_archive` (same layout_id, archive_hour, tag) and log/alert on mismatch. Run periodically during dual-write phase.
- Document in the same MD or in `docs/` how you compared (query examples).

### Phase 2 Implementation (done)

| Task | Description |
|------|-------------|
| **2.1** | **No writer changes.** Dual-write remains as-is; layout archive and historian both written in parallel. No code changes to `dynamic_monitor_worker.py` or `dynamic_archive_worker.py` write paths. |
| **2.2** | **Manual comparison:** See [Phase 2 — Manual comparison steps](#phase-2--manual-comparison-steps) below for example SQL and steps. |
| **2.3** | **Validation script:** `backend/validate_historian_phase2.py` — compares per-layout archive `tag_values` (JSONB) vs `tag_history_archive` (by tag_id → tag_name) for same layout_id and archive_hour; logs mismatches. Run: `cd backend && python validate_historian_phase2.py` (or schedule periodically). |
| **2.4** | **Documentation:** This section and the manual comparison steps below document how comparison is done. |

### Phase 2 — Manual comparison steps

1. **Pick a layout and time range** (e.g. layout_id = 1, one recent archive hour).
2. **Query the layout's archive table** (replace `{archive_table}` with e.g. `mila_monitor_logs_archive` from `dynamic_monitor_registry`):

   ```sql
   SELECT archive_hour, tag_values, order_name
   FROM {archive_table}
   WHERE layout_id = 1 AND archive_hour = '2026-02-05 14:00:00';
   ```

3. **Query the central historian archive** for the same layout and hour:

   ```sql
   SELECT t.tag_name, a.value, a.archive_hour, a.order_name
   FROM tag_history_archive a
   JOIN tags t ON t.id = a.tag_id
   WHERE a.layout_id = 1 AND a.archive_hour = '2026-02-05 14:00:00'
   ORDER BY t.tag_name;
   ```

4. **Compare:** For each tag, the `value` in `tag_history_archive` (joined with `tags.tag_name`) should match the corresponding key in `tag_values` JSONB from the layout archive. Small floating-point differences (e.g. &lt; 0.01) are acceptable depending on aggregation (AVG vs sum).

5. **Optional — raw tag_history (per-second) vs live table:** For a short time range, compare second-level data:

   ```sql
   SELECT t.tag_name, h.value, h.timestamp
   FROM tag_history h
   JOIN tags t ON t.id = h.tag_id
   WHERE h.layout_id = 1 AND h.timestamp BETWEEN '2026-02-05 14:00:00' AND '2026-02-05 14:05:00'
   ORDER BY h.timestamp, t.tag_name;
   ```

---

## Phase 3 — Switch Report / Historical Reads to Historian

### 3.1 New (or refactored) report/history API

- **Suggested file:** `backend/live_monitor_bp.py` or a new blueprint (e.g. `backend/historian_bp.py`) registered in `backend/app.py`.
- **Endpoints (examples):**
  - `GET /api/live-monitor/history?layout_id=&from=&to=&tag_ids=` — read from `tag_history` (and optionally `tag_history_archive` for older ranges).
  - Or a report endpoint that, instead of querying `{layout}_monitor_logs_archive`, queries `tag_history_archive` with `WHERE layout_id = ? AND timestamp BETWEEN ? AND ?`, optionally filtered by tag_id/list.

**Exact reference:** Today legacy archives are read in `backend/orders_bp.py` (e.g. FCL/SCL/MILA archive routes). Dynamic layout archives are not yet read by a report API in the snippets we have; the PRD mentions report_type_id and generic_monitor_logs_archive. So Phase 3 is the moment to introduce report/history reads from `tag_history` / `tag_history_archive` instead of from per-layout tables.

### 3.2 Query pattern

- From `tag_history`: `SELECT tag_id, value, timestamp FROM tag_history WHERE layout_id = %s AND timestamp BETWEEN %s AND %s ORDER BY timestamp`.
- From `tag_history_archive`: same with `archive_hour` and optional aggregation.
- Join with `tags` to get `tag_name`, `unit`, etc., for display.

**Phase 3 feature flag:** Use same `USE_CENTRAL_HISTORIAN` (or `REPORT_USE_HISTORIAN`) so report/history API can switch between layout tables and historian without code deploy.

### Phase 3 Implementation (done)

| Task | Description |
|------|-------------|
| **3.1** | **Historian report/history API:** New blueprint `backend/historian_bp.py` registered in `app.py` at `/api`. |
| **3.2** | **Endpoints:** `GET /api/historian/history` — raw from `tag_history` (layout_id, from, to, optional tag_ids). `GET /api/historian/archive` — hourly from `tag_history_archive` (same params). Both JOIN `tags` for `tag_name`, `unit`; return `data` array and `source` in JSON. |
| **3.3** | **Feature flag:** `REPORT_USE_HISTORIAN` (env, default `true`). When `false`, both endpoints return 503 with `use_legacy: true` so callers can fall back to layout tables. Optional: query param `use_historian` or header `X-Report-Use-Historian` override. |

**Example:** `GET /api/historian/history?layout_id=1&from=2026-02-05T14:00:00&to=2026-02-05T15:00:00` and `GET /api/historian/archive?layout_id=1&from=2026-02-05T00:00:00&to=2026-02-05T23:59:59`.

### Phase 3 — Frontend UI (Dynamic Report)

| Item | Description |
|------|-------------|
| **Page** | `Frontend/src/Pages/DynamicReport.jsx` — same page as Live Monitor / Dynamic Report. |
| **View dropdown** | Added **View:** selector with options: **Live**, **Hourly (last 24h)**, **Daily (last 7 days)**, **Weekly (last 4 weeks)**. Placed in the layout selector card above the layout buttons. |
| **Live** | Current behaviour: tag values from `/api/live-monitor/tags` and WebSocket `live_tag_data`; 5s refresh. |
| **Hourly / Daily / Weekly** | Historical mode: calls `GET /api/historian/archive` with `layout_id`, `from`, `to`. Builds a snapshot (latest value per tag in range) and sets `tagValues` so tables/KPIs/charts show historical data. Live polling and WebSocket are not used in historical mode. |
| **Layout ID** | When fetching historian, layout_id is resolved from `GET /api/live-monitor/layouts` (match by id or layout_name) so the DB layout_id is used even if the page uses a cached layout from localStorage. |
| **Time ranges** | Hourly: last 25 hours (from/to in ISO). Daily: last 7 days. Weekly: last 28 days. |
| **UI feedback** | When historical: shows "Showing historical data" under the layout title; "Historical snapshot" or "Loading..." next to the dropdown; on error or no data, shows message e.g. "No historical data for this period. Data is archived hourly." |
| **Backend fallback** | `historian_bp.py` `/api/historian/archive`: if the time-bounded query returns no rows, returns the latest archive data for the layout (up to 500 rows) so data still shows when client date/timezone differs from server. |

---

## Phase 4 — Stop Writing to Old Layout Tables (Optional: Keep for Rollback)

- **Option A (recommended):** Keep writing to both during a long validation period; then add a feature flag or config (e.g. env) to disable writes to `live_table` / `archive_table` so only historian is written.
- **Option B:** Remove the INSERT into `live_table` in `backend/workers/dynamic_monitor_worker.py` (lines 246–256) and the INSERT/DELETE in `backend/workers/dynamic_archive_worker.py` (119–141) only after Phase 2 and 3 are validated and you are confident in the historian.

**Exact references:**
- `backend/workers/dynamic_monitor_worker.py`: INSERT into `live_table` at 246–256.
- `backend/workers/dynamic_archive_worker.py`: INSERT into `archive_table` at 119–136, DELETE at 138–141.

---

## Phase 5 — Remove Dynamic Table Creation (Final Step)

- **File:** `backend/live_monitor_bp.py` — publish endpoint (~lines 892–934).
  - **Do not** call `create_dynamic_monitor_tables()` when publishing a layout.
  - **Do** still call `register_dynamic_monitor()`, but with **null** or placeholder `live_table_name` / `archive_table_name` (or add a new column like `uses_central_historian TRUE` and keep registry for layout_id → layout_name only). Alternatively, keep the registry for backward compatibility and only stop creating tables.
- **File:** `backend/utils/dynamic_tables.py` — you can leave `create_dynamic_monitor_tables()` in the codebase but unused, or remove it once no layout uses per-layout tables.
- **File:** `backend/utils/order_tracker.py` — today it uses `live_table_name` and `archive_table_name` for next order number (93–108). Switch that logic to query `tag_history` or a small `dynamic_orders` table (you already have `dynamic_orders` in `add_dynamic_monitoring_tables.sql`) so order numbering does not depend on layout-specific tables.

**Exact references:**
- Publish: `live_monitor_bp.py` 896–901 (create_dynamic_monitor_tables), 926–934 (register_dynamic_monitor).
- Order tracker: `backend/utils/order_tracker.py` 84–85, 93–108.

---

## Indexing & Partitioning (Performance)

- **tag_history:** Index on `(layout_id, tag_id, timestamp)` and on `(timestamp)`. For very large data, partition by `timestamp` (e.g. monthly): `tag_history_2026_01`, `tag_history_2026_02`, etc., using PostgreSQL native partitioning.
- **tag_history_archive:** Index on `(layout_id, tag_id, archive_hour)` and on `(archive_hour)`. Same partitioning idea by `archive_hour` if needed.
- **Reference:** Index patterns in `backend/utils/dynamic_tables.py` (e.g. idx on layout_id, created_at, order_name).
- **Very large plants:** Eventually consider TimescaleDB or ClickHouse for time-series; PostgreSQL partitioning is fine initially.

---

## Summary Table — Where to Change What

| Phase | File(s) | What to do |
|-------|---------|------------|
| 1.1 | **New** `backend/migrations/create_tag_history_tables.sql` | Create `tag_history`, `tag_history_archive`, indexes. |
| 1.2 | **New** `backend/run_tag_history_migration.py` (or existing migration runner) | Run the new SQL migration. |
| 1.3 | **New** `backend/utils/historian_helpers.py` or `backend/utils/tag_reader.py` | Helper: tag_name → tag_id map (from `tags`). |
| 1.4 | `backend/workers/dynamic_monitor_worker.py` | After INSERT into `live_table` (~258), add batch INSERT into `tag_history` using `tag_values` and tag_id map. |
| 1.5 | `backend/workers/dynamic_archive_worker.py` | After INSERT into `archive_table` (~136), add INSERT into `tag_history_archive` from `aggregated_tag_values`. |
| 2 | — | Validate: compare layout archive vs tag_history_archive. |
| 3 | **New or existing** `backend/live_monitor_bp.py` or `backend/historian_bp.py` | New (or refactored) report/history API reading from `tag_history` / `tag_history_archive`. |
| 3 UI | `Frontend/src/Pages/DynamicReport.jsx`, `backend/historian_bp.py` | View dropdown (Live / Hourly / Daily / Weekly) on Dynamic Report; historian/archive fetch with layout_id from API; backend fallback for latest archive when range empty. |
| 4 | `backend/workers/dynamic_monitor_worker.py`, `dynamic_archive_worker.py` | Optionally disable or remove INSERT into layout live/archive tables. |
| 5 | `backend/live_monitor_bp.py`, `backend/utils/order_tracker.py`, optionally `dynamic_tables.py` | Stop creating per-layout tables on publish; switch order numbering to historian or `dynamic_orders`. |

---

## Notes

- **Layout = Mill:** No separate `mills` table required; `layout_id` in `tag_history` is the mill/key.
- **Tags:** Already in `tags`; historian stores `tag_id`. Report and Settings → Tags stay as they are.
- **Live UI:** During migration, still fed by PLC/emulator (no UI change). Long-term best practice: **Live UI → historian latest snapshot** so UI and reports show the same values and there is no drift; not mandatory for migration phase.
- **Order name:** Stored in current live row; can be stored in `tag_history` as `order_name` for traceability.

---

## Critical Improvements (Production Safeguards)

### 1. Counter reset handling (cumulative PLC values)

PLC counters can reset to 0, overflow, or restart. Historical KPI will break if you only store raw value.

- **Store delta metadata:** Use `value_raw`, `value_delta`, `is_counter` in `tag_history`. Compute delta in worker (current − previous); on reset/negative delta, treat as reset and store accordingly.
- **Recommended:** Implement delta counter algorithm (industrial-safe: handle reset, overflow, and restarts). Document in historian_helpers or tag_reader.

### 2. Bulk insert strategy

Worker writes every second; if each tag inserts separately, DB load explodes.

- **Pattern:** Batch all rows for one (layout_id, timestamp) into a single `INSERT INTO tag_history (...) VALUES (...), (...), ...` or `executemany`. Never one INSERT per tag per second.

### 3. Write queue / buffer layer

Today: `PLC → Worker → DB`. If DB slows, PLC polling and live monitoring lag.

- **Industrial pattern:** `PLC → Poll → Memory queue → Writer thread → DB`. Polling stays real-time; a separate writer drains the queue. Protects real-time data from DB latency.

### 4. Data retention strategy

Historian tables grow very fast. Define and automate:

| Data | Retention |
|------|-----------|
| Raw (tag_history) | e.g. 90 days |
| Archive hourly (tag_history_archive) | e.g. 2 years |
| Daily summary (optional) | Permanent |

Add retention job (e.g. delete or partition off old raw data) and document in runbook.

### 5. Tag quality field

Store `quality_code` (e.g. `GOOD`, `BAD`, `STALE`, `COMM_ERROR`) per sample. Standard in SCADA historians; use for reporting and alarms.

### 6. Archive worker improvement

During/after migration: aggregate **directly from tag_history** into `tag_history_archive` instead of from layout live tables. Reduces dependency on layout tables and aligns with single historian.

### 7. Monitoring & observability

- Historian write latency (e.g. p95 per batch)
- Row insert count per minute
- Worker health (last successful write, queue depth if using queue)
- Alerts on write failure or backlog

### 8. Security & integrity

- `UNIQUE(layout_id, tag_id, timestamp)` on `tag_history` to prevent duplicate rows (already in schema above).

---

## Data Retention & Compression

- **Retention:** See table in Critical Improvements. Implement partition drop or DELETE job.
- **Compression (optional):** TimescaleDB compression, or PostgreSQL TOAST tuning for large tables. Plan when data volume justifies it.

---

## Optional Enhancements

- **tag_latest_values table:** Store last value per (layout_id, tag_id). Enables faster live dashboard and reduced polling overhead; can be updated by same worker that writes tag_history.
- **Derived KPI engine (future):** Tables `derived_kpi_config` and `kpi_history` for calculated KPIs; brings system to MES-level reporting. Design after historian is stable.

---

## Phase Plan Evaluation

| Phase | Assessment |
|-------|------------|
| Phase 1 — Dual write | ✔ Perfect; add feature flag and batch insert. |
| Phase 2 — Validation | ✔ Perfect; add automated validation script. |
| Phase 3 — Switch reads | ✔ Perfect; add feature flag for report source. |
| Phase 4 — Stop old writes | ✔ Correct timing after validation. |
| Phase 5 — Remove dynamic tables | ✔ Ideal final step. |

---

## Additional Production Safeguards (Checklist)

1. Handle cumulative counter resets (value_raw / value_delta / is_counter).
2. Add tag metadata reload strategy (cache versioning).
3. Implement batch insert for historian (no per-tag INSERT per second).
4. Add queue/buffer layer for write reliability (optional but recommended).
5. Define historian retention and archive policy; automate retention job.
6. Add tag quality/status storage (quality_code).
7. Standardize timestamp source (PLC vs server); document.
8. Add monitoring metrics for historian writes and worker health.
9. Introduce feature flag(s) for rollback and staged rollout.
10. Plan future derived KPI historian (derived_kpi_config, kpi_history).

---

## Final Assessment

- **Architecture:** Technically correct, scalable, low risk, industry-aligned, migration-safe.
- **Rating:** 9/10; with the above safeguards, enterprise-level reliability.
- The system is evolving from **dynamic monitoring tool** into a **full industrial MES / historian platform**; this plan supports that step correctly.

---

## Next-Level Help (Optional)

Possible follow-up designs:

- Delta counter algorithm (industrial-safe version)
- Batch historian insert implementation
- Partition + retention SQL and job
- Derived KPI engine architecture
- High availability historian pattern
- Queue-based polling architecture
- Tag quality model
- SCADA → MES → Historian reference architecture
