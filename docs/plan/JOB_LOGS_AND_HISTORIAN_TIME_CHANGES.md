# Job Logs & historian — time, totals, and raw retention

Summary of updates affecting **Job Logs**, **orders API JSON**, **historian windows**, and **`tag_history` retention**.

---

## 1. Order timestamps in API (`backend/orders_report_bp.py`)

- **`_order_ts_for_json` / `_serialize_order_row`**: `start_time`, `end_time`, and `created_at` on order payloads are serialized as **naive ISO** strings (e.g. `2026-04-14T14:18:38`) instead of HTTP-date strings like `Tue, 14 Apr 2026 14:18:38 GMT`.
- **Why**: `GMT` in JSON was parsed as **UTC** in the browser (+4 h shift vs PC wall time). Naive ISO matches PostgreSQL `timestamp without time zone` and the Job Logs display logic.
- **Applied to**: `GET /orders/jobs`, `GET /orders/jobs/<id>` (not template list-only fields).

---

## 2. Job Logs UI — wall time & 12-hour clock (`Frontend/src/Pages/JobLogs/JobLogsPage.jsx`)

- **`stripMisleadingUtcLabel`**: Strips misleading UTC labels — trailing **`Z`**, **`+00:00` / `-00:00`**, and HTTP-date **` GMT` / ` UTC`** — so naive plant times are not interpreted as UTC.
- **`parseOrderWallTime`**: Uses the stripper; **only** inserts `T` between date and time for **`YYYY-MM-DD …`** forms (avoids treating **`Tue`** as an ISO `T`).
- **`formatDateTime`**: Uses **`hour12: true`** for **AM/PM** (with `en-GB` date part).
- **Historian clamp**: Compares **`parseOrderWallTime` / `Date.now()`** instead of mixed **`Date.parse`** on naive vs `Z` strings; clamp still sets **`toParam = new Date().toISOString()`** (true “now” UTC).

---

## 3. Historian query window — archive end bucket (`Frontend/src/Pages/JobLogs/JobLogsPage.jsx`)

- **`historianOrderWallParams`** for **`/api/historian/by-tags`**:
  - **`from`** = **exact order `start_time`** (`toHistorianWallTimeParam`) — **not** floored to the hour, so `first` does not use an archive row for time **before** the order (flooring `from` had inflated deltas, e.g. ~64k vs ~44k).
  - **`to`** = **start of the local hour after** `end_time` (so `archive_hour <= to` includes the bucket that contains the order end, e.g. **21:00** for **20:54**).
- **Why**: `tag_history_archive` is hourly; a strict `to` at **20:54** dropped the **21:00** row and shrank totals (~24k); expanding **only `to`** fixes that without pulling in pre-start production.

---

## 4. Raw `tag_history` retention (`backend/workers/dynamic_archive_worker.py`)

- **Removed**: Hourly bulk delete of universal rows:  
  `DELETE FROM tag_history WHERE layout_id IS NULL AND "timestamp" < archive_hour` (“keep last hour”).
- **Added**: Prune only rows older than **`TAG_HISTORY_RAW_RETENTION_DAYS`** (default **`365`**):  
  `timestamp < CURRENT_TIMESTAMP - (N * INTERVAL '1 day')`.
- **`TAG_HISTORY_RAW_RETENTION_DAYS=0`**: Skips pruning (raw rows are not deleted by this path; disk use grows).
- Pruning runs in the same archive lock path **after** hourly archive insert (or rollback when there is nothing to insert), so it still runs each cycle.

---

## 5. Behaviour you should know

| Topic | Behaviour |
|--------|-----------|
| **`tag_history`** | Universal historian (`layout_id IS NULL`) keeps **~1 year** of second-level rows by default; older rows are deleted. Hourly aggregates remain in **`tag_history_archive`**. |
| **Job Logs tag table** | Uses **`first`** + **`last`** from **`/api/historian/by-tags`**; backend may read **`tag_history`** first, then fall back to **`tag_history_archive`** if the raw window is empty. |
| **Env vars** | **`TAG_HISTORY_RAW_RETENTION_DAYS`** (raw prune, default 365). Existing **`TAG_ARCHIVE_RETENTION_DAYS`** still applies to archive rollup/retention elsewhere in the same worker. |

---

## Files touched (checklist)

| File | Area |
|------|------|
| `backend/orders_report_bp.py` | Order JSON timestamps |
| `backend/workers/dynamic_archive_worker.py` | Raw `tag_history` retention vs hourly delete |
| `Frontend/src/Pages/JobLogs/JobLogsPage.jsx` | Wall time parse, 12h display, historian window, clamp |

Restart **backend** after worker changes; **rebuild / hard-refresh** the frontend after UI changes.
