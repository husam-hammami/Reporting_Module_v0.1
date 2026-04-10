# Job Logs & Report-Template Orders — Progress Log

Chronological record of implementation, incidents, and fixes. For architecture and endpoints, see [JOB_LOGS_ORDER_REPORT_PLAN.md](./JOB_LOGS_ORDER_REPORT_PLAN.md).

---

## Goals (agreed)

- Drive **order tracking** from **`report_builder_templates`** (Paginated Report Builder), not `live_monitor_layouts`.
- Store orders in **`dynamic_orders`** / **`dynamic_order_counters`** with **`template_id`**.
- **Job Logs** UI: pick template → list jobs → select order → show tag values for the order time window via **`/api/historian/by-tags`**.

---

## Database & migrations

| Item | Notes |
|------|--------|
| **`add_order_tracking_to_report_templates.sql`** | Adds `order_*` columns on `report_builder_templates`; `template_id` on `dynamic_orders` / `dynamic_order_counters`; indexes; **`ALTER ... layout_id DROP NOT NULL`** so template-only rows can insert without a Live Monitor layout. |
| **Registration** | Listed in `backend/app.py` `migration_order` and `backend/init_db.py` `MIGRATION_ORDER`. |
| **Startup migrations (`app.py`)** | Switched from naive `split(';')` + silent swallow to **whole-file `execute`** per migration (aligned with `init_db.py`), with **warning logs** on failure so missing columns are visible. |
| **Incident: `template_id` missing** | DB never applied migration (or old exe without SQL). Symptom: **500** on `GET /api/orders/jobs`. Fix: run migration on the DB the app uses; verify with `information_schema.columns`. |

---

## Backend

| Item | Notes |
|------|--------|
| **`orders_report_bp.py`** | Job list/detail/layout-tags use **`template_id`** and `report_builder_templates`. |
| **`report_order_worker.py`** | Polls templates with `order_status_tag_name`; writes **`dynamic_orders`** / **`dynamic_order_counters`** using **`template_id`**; uses `TagValueCache`; `ON CONFLICT (template_id) WHERE template_id IS NOT NULL` on counters. |
| **`report_builder_bp.py`** | Persists order fields on templates. |
| **Historian** | `GET /historian/by-tags` with **`aggregation=auto`** reads **`tag_history_archive`** (hourly); live samples may still be in **`tag_history`** until archive catches up. |

---

## Frontend

| Item | Notes |
|------|--------|
| **`JobLogsPage.jsx`** | Uses **`template_id`** for jobs; detail panel calls **`layout-tags`** then **`by-tags`**. |
| **Fix: empty tag values / inverted window** | Some APIs sent **`start_time` with a trailing `Z`** while the DB value is **naive local wall time**. Browsers then treated **`from`** as UTC and **`to`** as UTC “now”, producing **`from > to`** (e.g. `17:27Z` vs `13:39Z` on UTC+4 machines). Historian returned **empty `data`**. **Fix:** strip trailing **`Z`/`z`** on **`start_time` / `end_time`** before query params; keep **`toISOString()`** for running-job **`to`**; **clamp** `to` to **now** if `from` is still after `to`. |

---

## Operations checklist

1. **Same DB as the app** — confirm `POSTGRES_DB` / port match where you run `\dt` / migrations.
2. **Migrations applied** — `template_id` on `dynamic_orders`; `layout_id` nullable on orders/counters.
3. **Status tag** — must be a real **`tags.tag_name`** (e.g. `mil_b_order_active`); **`MIL_B_Status`** is not a tag row unless you create it.
4. **Tag values panel** — if **`auto`** is still empty for a **very new** running job, data may only be in **`tag_history`**; archive fills on schedule; optional follow-up is to use **`last`** for running jobs or extend **`auto`** with a live fallback.

---

## Files touched (cumulative)

- `backend/migrations/add_order_tracking_to_report_templates.sql`
- `backend/app.py` (migrations + worker spawn)
- `backend/init_db.py`
- `backend/orders_report_bp.py`
- `backend/report_builder_bp.py`
- `backend/workers/report_order_worker.py`
- `backend/historian_bp.py` (unchanged for this log; behavior documented above)
- `Frontend/src/Pages/JobLogs/JobLogsPage.jsx`
- `Frontend/src/Pages/ReportBuilder/PaginatedReportBuilder.jsx`
- `docs/JOB_LOGS_ORDER_REPORT_PLAN.md`, `docs/JOB_LOGS_PROGRESS.md` (this file)

---

*Last updated: Job Logs historian `from`/`to` timezone handling and progress documentation.*
