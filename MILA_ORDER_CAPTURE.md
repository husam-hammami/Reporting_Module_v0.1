# Mill-A (MILA): order name, job status, and start/end capture

This document describes how **automatic order names** are created, how the **PLC job status** drives order lifecycle, and how **start/end times** and **totalizer snapshots** are stored. Implementation lives primarily in `backend/app.py` (`mila_realtime_monitor`).

---

## 1. Data source and loop

- The Mill-A monitor runs in a **~1 second loop** (`mila_realtime_monitor`).
- Each iteration it **GETs** `http://localhost:5000/orders/plc/db499-db2099-monitor`.
- PLC data used for orders:
  - **`DB2099.job_status`** — treated as an integer: **`1` = order active**, **`0` = order done** (see comments in code: Bool converted to Int).
  - **`bran_receiver`** (and related fields) come from the same JSON response for weights and snapshots.

Wall-clock time for logging is **Asia/Dubai**, naive `TIMESTAMP` (UTC converted to Dubai and stored without tz).

---

## 2. Order name format and counter

- Order names are **`MILA` + sequential number**, e.g. `MILA790`, `MILA791`.
- **`mila_order_counter`** is initialized from the database via **`get_next_order_number("MILA", "mila_monitor_logs", "mila_monitor_logs_archive")`**:
  - Scans **live** and **archive** tables for existing `order_name` values matching `MILA<number>`.
  - Takes the **max** numeric suffix and returns **max + 1** for the next order.
- When a **new** order is created (see job status below), the code sets:
  - `mila_current_order_name = f"MILA{mila_order_counter}"` then increments `mila_order_counter`.

**UI note:** Job Logs and similar screens often **display** `Mill-A790` by replacing `MILA` with `Mill-A` for readability; the **database value** remains `MILA…`.

---

## 3. Job status code and order lifecycle

| `job_status` (DB2099) | Meaning (in app) | What happens |
|----------------------|-------------------|----------------|
| **`1`** | Order active | If there is **no** current order / no session start yet, the app **starts a new order**: assigns `MILA{n}`, sets session start time, clears end time, captures **B1** and **JSON totalizer** “start” snapshots. |
| **`0`** | Order done | If an order is **currently** active, the app sets **session end time**, captures **B1** and **JSON totalizer** “end” snapshots, marks **order ending** for this loop iteration. |

Important behaviors:

- **Every loop** still **INSERTs** a row into `mila_monitor_logs` (when DB insert runs), tracking process data continuously.
- **Order boundaries** are applied **before** that insert when `job_status` transitions as above.
- On the **first loop** where **`job_status == 0`** after an active order, **`mila_session_ended`** is set to **`now`**, and **`mila_order_ending`** is true so that **after** the INSERT the in-memory order state is **cleared** (next order can start cleanly on a future `job_status == 1`).

---

## 4. Start and end **times** (database columns)

Two session fields mirror the order window:

| Field | Meaning |
|--------|---------|
| **`order_start_time`** | Set from **`mila_session_started`** on each inserted row while the order is active. Updated when the order **starts** (`job_status == 1` new order). |
| **`order_end_time`** | Set from **`mila_session_ended`**. Stays `NULL` during the order; set to **`now`** when **`job_status == 0`** signals completion (same loop as final snapshots). |

So **start** = first moment the session was opened for that order name; **end** = PLC-reported completion time on the transition to `0`.

Reports and summaries use these columns (with fallbacks to `created_at` where needed) so times reflect **real order boundaries**, not only archive batch times. (See also `docs/MILA_ORDER_TIME_FIX.md` for the archive/summary behavior.)

---

## 5. What is captured at start vs end (snapshots)

On **order start** (`job_status == 1`, new order):

- **`mila_b1_scale_at_order_start`** — B1 scale (kg) from PLC `bran_receiver.b1`.
- **`mila_totalizers_at_order_start`** — JSON object of all formatted bran/F2 scale totalizers (same keys as `bran_receiver_formatted` in code).

On **order end** (`job_status == 0`):

- **`mila_b1_scale_at_order_end`**
- **`mila_totalizers_at_order_end`**

These are stored on **each live row** for the active order (repeated values on every second), and are **aggregated** when rows move to **`mila_monitor_logs_archive`** (min/max style merge per key for JSON, analogous patterns for B1).

---

## 6. Clearing state after order end

After the INSERT on the loop where the order ends (`mila_order_ending`):

- `mila_current_order_name`, `mila_session_started`, `mila_session_ended` cleared.
- B1 and JSON totalizer snapshot globals cleared.

---

## 7. Related files

| Area | Location |
|------|----------|
| Monitor loop, naming, job_status, INSERT | `backend/app.py` — `mila_realtime_monitor`, `get_next_order_number` |
| Migrations for `order_start_time` / `order_end_time` / snapshots | `backend/migrate_db.py` |
| Summary API (order times + totalizers in response) | `backend/orders_bp.py` — `get_mila_archive_summary` |
| Job Logs UI | `frontend/src/Pages/JobLogs.jsx` |

---

## 8. FCL / SCL / FTRA (short comparison)

Other lines use the **same idea**: prefix + counter from DB (`FCL`, `SCL`, …), **`job_status`** (or line running rules) to open/close orders, and **`order_start_time` / `order_end_time`** on monitor rows. Details differ per line; Mill-A is driven specifically by **`DB2099.job_status`** as above.
