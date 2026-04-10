# Job Logs / Order Report — Implementation Plan

This document describes **goals**, **storage** (no new tables for tag values), **phased implementation**, and **what to change in code** for a Mill-A style Job Logs experience: order list + detail driven by **`dynamic_orders`** + **`tag_history`**.

---

## Bottom line (agreed architecture)

| Layer | Storage | Notes |
|-------|---------|--------|
| **Orders (optional per layout)** | **`dynamic_orders`** (existing) | One shared table for all lines; **`layout_id`** distinguishes Mill-A vs Mill-B. **`order_name`**, **`start_time`**, **`end_time`** live here. |
| **All tag samples** | **`tag_history`** / **`tag_history_archive`** (existing) | Single plant historian; **no** duplicate tag tables for Job Logs. |
| **Per-layout order tracking** | **Configuration only** | If a layout has **`order_status_tag_name`** (and related fields) set → that line gets orders in **`dynamic_orders`**. If empty / disabled → **no** automatic orders for that line. |
| **Extra tables for tag values** | **Not in scope** | **Do not** add **`order_job_summary`** or other tables to store tag snapshots for this feature. |

**How detail views get metrics:** use **`dynamic_orders`** for the **time window** `[start_time, end_time)`, then query **`tag_history`** via existing **`GET /historian/by-tags`** (or equivalent) with **`from`/`to`** — no `order_name` column required on each tag row if the window is correct.

---

## 1. Goals

| Goal | How we meet it |
|------|----------------|
| **Optional orders per line** | User configures **`live_monitor_layouts`** order fields only where needed. |
| **Stable order identity** | **`dynamic_orders.order_name`** + **`order_prefix`** / counter (`DynamicOrderTracker`). |
| **Job list (last N orders)** | Query **`dynamic_orders`** `WHERE layout_id = ?` (+ optional time filters). |
| **Detail (produced, yield, setpoints, …)** | **`tag_history`** aggregated over the selected order’s **start/end**; tag list from layout / tag group / Report Builder config. |
| **Time filters (shift, custom)** | Filter **`dynamic_orders`** by overlapping **`from`/`to`**; detail still uses per-order window or filtered range. |
| **No new tag-storage tables** | All process values remain in **`tag_history`** only. |

---

## 2. Current state (facts from code)

### 2.1 Tables we use (no new tag tables)

- **`dynamic_orders`** — `layout_id`, `order_name`, `order_number`, `start_time`, `end_time`, `status`, `duration_seconds` (`backend/migrations/add_dynamic_monitoring_tables.sql`).
- **`dynamic_order_counters`** — per-layout counters.
- **`live_monitor_layouts`** — `order_status_tag_name`, `order_prefix`, `order_start_value`, `order_stop_value`, `is_published`.
- **`tag_history` / `tag_history_archive`** — shared historian (`backend/migrations/create_tag_history_tables.sql`).

### 2.2 How orders are created today

- **`DynamicOrderTracker`** (`backend/utils/order_tracker.py`) writes **`dynamic_orders`** on START/STOP.
- Invoked from **`dynamic_monitor_worker`** (`backend/workers/dynamic_monitor_worker.py`) for layouts in **`dynamic_monitor_registry`** (requires **publish** → per-layout `*_monitor_logs` tables are created today).

### 2.3 Historian for Job Logs detail

- **`historian_worker`** inserts **`tag_history`** with **`layout_id`/`order_name` NULL** (universal historian).
- **`GET /historian/by-tags`** (`backend/historian_bp.py`) queries by **tag + time range** — **fits** “order window from **`dynamic_orders`** + slice **`tag_history`**.”
- **`GET /historian/history`** filters by **`layout_id`** on rows — **not** aligned with universal NULL **`layout_id`** until historian changes (optional later).

---

## 3. Data flow (conceptual)

```
PLC → TagValueCache → historian_worker → tag_history (all tags, every second)
                    → dynamic_monitor_worker + DynamicOrderTracker → dynamic_orders
                         (only for layouts with order config + active monitor registry)

Job Logs UI:
  layout_id → SELECT dynamic_orders …
  selected order → [start_time, end_time) → GET /historian/by-tags → panels / KPIs
```

---

## 4. Optional: faster job list columns (no new table)

If the grid must show **B1 start/end** or **produced** **without** querying **`tag_history`** on every list load, you may later add **one nullable JSONB column** on **`dynamic_orders`** (e.g. `summary`) filled at **order complete** — still **no** separate **`order_job_summary`** table and **no** duplicate tag storage. **Skip** until performance requires it.

---

## 5. Optional: no per-layout `*_monitor_logs` tables

Today, **orders** are tied to **published** layouts that register **monitor tables**. To **only** fill **`dynamic_orders`** without those tables, a future **order-only worker** + **`order_tracker._get_next_order_number`** changes are needed (see older notes in git history). **Not** required for Phase 1 if you accept current publish + **`dynamic_monitor_worker`**.

---

## 6. Optional: `tag_history.order_name` / `layout_id`

**Not required** for Job Logs if reports use **time windows** from **`dynamic_orders`**. Populate in **`historian_worker`** only if you want **`WHERE order_name = …`** on **`tag_history`** directly.

---

## 7. APIs to add or extend

| Endpoint | Purpose |
|----------|---------|
| **`GET /api/orders/jobs`** | `layout_id`, `limit`, optional `from`/`to` — list **`dynamic_orders`** for Job Logs table. |
| **`GET /api/orders/jobs/<id>`** | Single order by primary key (or by `layout_id` + `order_name` query params). |
| Reuse **`GET /historian/by-tags`** | Detail: **`from`**/**`to`** = order **`start_time`** / **`end_time`**, **`tag_names`** = line’s tags. |

New blueprint (e.g. **`orders_report_bp.py`**) + register in **`app.py`**; align auth with **`historian_bp`**.

---

## 8. Frontend

- **Line selector** → **`layout_id`** (layouts that have order tracking configured).
- **Jobs table** → **`GET /api/orders/jobs`**.
- **Row select** → load **`/historian/by-tags`** for **[start, end)** + tag list for that layout.
- New page (e.g. **`Frontend/src/Pages/JobLogs.jsx`**) + routes + nav.

---

## 9. Implementation phases

### Phase 1 — Core read path (minimum viable Job Logs)

**Goal:** List and drill-down using **only** **`dynamic_orders`** + **`tag_history`** (via historian); **no** new database tables.

| Step | What to update |
|------|----------------|
| 1 | **Backend:** Implement **`GET /api/orders/jobs`** and **`GET /api/orders/jobs/<id>`** reading **`dynamic_orders`** (filter **`layout_id`**, optional date range, **`LIMIT`**). |
| 2 | **Frontend:** Job Logs page — table bound to list API; detail panel calls **`/historian/by-tags`** with **`from`/`to`** from selected order and configured **tag names** per layout. |
| 3 | **Configuration:** Document that orders appear only when **`order_status_tag_name`** (and publish/monitor pipeline) is active for that layout — **`docs/12-SHIFTS-AND-ORDERS.md`** cross-link. |

**Prerequisite:** Existing **`dynamic_monitor_worker`** + published layout so **`dynamic_orders`** rows are created (current behavior).

---

### Phase 2 — UX and tag discovery (still no new tables)

**Goal:** Easier tag lists per line and polished filters.

| Step | What to update |
|------|----------------|
| 1 | Resolve **which tag names** to pass to **`/historian/by-tags`** from **layout sections**, **tag groups**, or a small **config** endpoint (reuse existing layout/tag APIs where possible). |
| 2 | **Time filters** in UI: pass **`from`/`to`** into jobs list API (orders overlapping range) and/or constrain detail. |

---

### Phase 3 — Optional performance: `summary` JSONB on `dynamic_orders` only

**Goal:** Faster list columns (e.g. B1 start/end on the grid) **without** querying **`tag_history`** for every row.

| Step | What to update |
|------|----------------|
| 1 | **Migration:** `ALTER TABLE dynamic_orders ADD COLUMN IF NOT EXISTS summary JSONB;` (**one** column; **not** a new tag table). |
| 2 | **`order_tracker.complete_order`** (or async job): optional SQL over **`tag_history`** for that order window to fill **`summary`**. |
| 3 | **List API:** return **`summary`** when present. |

**Skip** this phase until the list view is slow or columns are required on the grid.

---

### Phase 4 — Optional infrastructure

| Track | What to update |
|-------|----------------|
| **A — Order-only worker** | If you must **avoid** per-layout `*_monitor_logs`: new worker + **`_get_next_order_number`** decoupled from monitor tables; optional publish behavior change. |
| **B — Historian `order_name`** | **`historian_worker`** sets **`tag_history.order_name`** when you need SQL filters by order on raw history. |

---

## 10. Files likely to change (by phase)

| Phase | Area | Files (typical) |
|-------|------|-------------------|
| 1 | Order APIs | New `backend/orders_report_bp.py` (or similar); `backend/app.py` register blueprint |
| 1 | Frontend | `Frontend/src/Pages/JobLogs.jsx` (new), `Frontend/src/Routes/AppRoutes.jsx`, navbar |
| 2 | Tag resolution | `backend/live_monitor_bp.py` or layout helpers; optional small config |
| 3 | Summary | New migration SQL under `backend/migrations/`; `backend/utils/order_tracker.py` |
| 4 | Workers | `backend/workers/order_tracking_worker.py` (new, if A); `backend/workers/historian_worker.py` (if B) |

---

## 11. What we are **not** doing (this plan)

- **No** **`order_job_summary`** (or other) table for tag snapshots.
- **No** duplicate tag-value storage beyond **`tag_history`** for Job Logs metrics.
- **No** requirement that **`tag_history.order_name`** is populated for the main UX (time slice from **`dynamic_orders`** is enough).

---

## 12. Quick reference

| Question | Answer |
|----------|--------|
| Where is **order_name** stored? | **`dynamic_orders.order_name`**, scoped by **`layout_id`**. |
| Where are **tag values** stored? | **`tag_history`** (and archive for long ranges). |
| How do I turn orders **off** for a line? | Clear / omit **order** fields on that **`live_monitor_layouts`** row (and unpublish or disable monitor as appropriate). |
| Fastest path to Job Logs? | **Phase 1** — list + **`by-tags`** detail. |

---

*Aligned with `add_dynamic_monitoring_tables.sql`, `create_tag_history_tables.sql`, `order_tracker.py`, `dynamic_monitor_worker.py`, `historian_worker.py`, `historian_bp.py`.*
