# Job Logs / Order Report — Implementation Plan

Order tracking is driven by **`report_builder_templates`** (the same table used by Builder, Dashboards, and Table Reports). No dependency on **`live_monitor_layouts`** for orders.

---

## Architecture (agreed)

| Layer | Storage | Notes |
|-------|---------|--------|
| **Order config** | **`report_builder_templates`** columns: `order_status_tag_name`, `order_prefix`, `order_start_value`, `order_stop_value` | Set per template in the Paginated Report Builder. |
| **Order rows** | **`dynamic_orders`** (existing, shared) | One table for all templates; **`template_id`** column links to `report_builder_templates.id`. |
| **Order counters** | **`dynamic_order_counters`** (existing, shared) | **`template_id`** column for template-based tracking. |
| **All tag samples** | **`tag_history`** / **`tag_history_archive`** (existing) | Single plant historian; no duplicate tag tables. |
| **Extra tables** | **None** | No `order_job_summary`, no per-layout monitor tables for this feature. |

**Detail views:** `dynamic_orders` provides the **time window** `[start_time, end_time)`; query `tag_history` via `GET /historian/by-tags` with `from`/`to`.

---

## How it works

```
PLC → TagValueCache → historian_worker → tag_history (all tags, every second)
                    → report_order_worker → reads report_builder_templates with order config
                                          → TemplateOrderTracker → dynamic_orders (template_id)

Job Logs UI:
  template_id → GET /api/orders/jobs?template_id=X
  selected order → [start_time, end_time) → GET /historian/by-tags → detail panels
```

---

## Configuration

1. Open **Builder** → edit a paginated report (e.g. MIL-B).
2. In the left panel, expand **Order Tracking** card.
3. Set:
   - **Status Tag** — the numeric PLC tag (0/1 or custom start/stop).
   - **Order Prefix** — e.g. `MILB` → generates `MILB1`, `MILB2`, …
   - **Start Value** / **Stop Value** — defaults `1` / `0`.
4. **Save**. The `report_order_worker` picks it up within 30 seconds (config cache TTL).
5. When the PLC tag transitions → orders appear in **Job Logs**.

Leave **Status Tag** empty to disable order tracking for that template.

---

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/orders/layouts` | Report templates with order tracking configured |
| `GET /api/orders/jobs?template_id=&limit=&from=&to=` | List orders for Job Logs table |
| `GET /api/orders/jobs/<id>` | Single order detail |
| `GET /api/orders/layout-tags/<template_id>` | Tag names from the template's `layout_config` |
| `GET /api/historian/by-tags` (existing) | Tag values for selected order's time window |

---

## Database changes

### Migration: `add_order_tracking_to_report_templates.sql`

- `ALTER TABLE report_builder_templates ADD COLUMN order_status_tag_name, order_prefix, order_start_value, order_stop_value`
- `ALTER TABLE dynamic_orders ADD COLUMN template_id → report_builder_templates(id)`
- `ALTER TABLE dynamic_order_counters ADD COLUMN template_id → report_builder_templates(id)`

No new tables. Existing `dynamic_orders` rows with `layout_id` (from older Live Monitor path) are unaffected.

---

## Files changed

| Area | Files |
|------|--------|
| Migration | `backend/migrations/add_order_tracking_to_report_templates.sql` (new) |
| Migration registry | `backend/app.py`, `backend/init_db.py` |
| Order APIs | `backend/orders_report_bp.py` (rewritten for `template_id`) |
| Report Builder API | `backend/report_builder_bp.py` (GET/PUT include order columns) |
| Order worker | `backend/workers/report_order_worker.py` (new) |
| Worker spawn | `backend/app.py` (spawns `report_order_worker`) |
| Builder UI | `Frontend/src/Pages/ReportBuilder/PaginatedReportBuilder.jsx` (`OrderTrackingCard`) |
| Job Logs page | `Frontend/src/Pages/JobLogs/JobLogsPage.jsx` (uses `template_id`) |
| Navbar | `Frontend/src/Data/Navbar.js` (Job Logs entry) |
| Routes | `Frontend/src/Routes/AppRoutes.jsx` (Job Logs route) |
| i18n | `Frontend/src/i18n/{en,ar,hi,ur}.json` |

---

## What we are NOT doing

- No `live_monitor_layouts` dependency for order tracking.
- No per-layout `*_monitor_logs` tables.
- No `order_job_summary` table.
- No `tag_history.order_name` population (time-slice from `dynamic_orders` is enough).

---

## Quick reference

| Question | Answer |
|----------|--------|
| Where is order config? | **`report_builder_templates`** columns (set in Paginated Report Builder). |
| Where is order_name stored? | **`dynamic_orders.order_name`**, scoped by **`template_id`**. |
| Where are tag values? | **`tag_history`** (and archive). |
| How to turn orders off? | Clear the **Status Tag** field in the Report Builder. |
| How does the worker find templates? | Queries `report_builder_templates WHERE order_status_tag_name IS NOT NULL`. |
