"""SEC + Yield backfill — one-shot, runs in a worker thread post-boot.

Plan §16.3 — moved off startup so it cannot block Electron splash (15-s timeout).

Walks tag_history_archive backwards in 1-hour increments, calling
ai_money.sec.refresh_hour() and ai_money.yield_drift.refresh_hour() for each,
until either:
  - the target table already covers that hour
  - we've gone back BACKFILL_DAYS (default 30)

The yield path was missing in the original module (the writer didn't exist
until 2026-04-30). Now both run in the same hour loop so the eventlet sleep
budget is shared and PostgreSQL doesn't see two concurrent backfill passes.

Spawned by app.py once after the dynamic_archive_worker starts. Uses eventlet,
yields between hours so it doesn't starve other workers.
"""

import datetime
import logging

import eventlet

logger = logging.getLogger(__name__)


def _table_has_rows(get_db_connection, table):
    """Returns True if `table` has any rows already (skip backfill of that table)."""
    try:
        from contextlib import closing
        with closing(get_db_connection()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor()
            cur.execute(f"SELECT 1 FROM {table} LIMIT 1")
            return cur.fetchone() is not None
    except Exception:
        # Table not present yet (migration didn't run) — skip
        return True


def run_backfill(days=30):
    """One-shot backfill for SEC + yield. Safe to call repeatedly — refresh_hour
    is idempotent (UPSERTs).

    Both passes share the same hour loop. Each hour we refresh SEC, then yield,
    then yield to the eventlet scheduler. If either table is already populated
    we skip its pass independently — useful when the SEC backfill ran in a
    prior version (before yield_drift existed) but yield was empty.
    """
    try:
        from app import get_db_connection
        sec_done = _table_has_rows(get_db_connection, 'asset_sec_hourly')
        yld_done = _table_has_rows(get_db_connection, 'asset_yield_hourly')
        if sec_done and yld_done:
            logger.info("[ROI backfill] both tables populated — skipping.")
            return 0

        ai_sec = None
        ai_yield = None
        if not sec_done:
            from ai_money import sec as _sec
            ai_sec = _sec
        if not yld_done:
            from ai_money import yield_drift as _yld
            ai_yield = _yld

        now = datetime.datetime.now()
        end_of_last = now.replace(minute=0, second=0, microsecond=0)
        hours = list(range(1, days * 24 + 1))
        hours.reverse()
        sec_ok = yld_ok = 0
        for idx, h in enumerate(hours):
            hour_start = end_of_last - datetime.timedelta(hours=h)
            if ai_sec is not None:
                try:
                    ai_sec.refresh_hour(hour_start, write=True)
                    sec_ok += 1
                except Exception as e:
                    logger.debug("[ROI/SEC backfill] %s skipped: %s", hour_start, e)
            if ai_yield is not None:
                try:
                    ai_yield.refresh_hour(hour_start, write=True)
                    yld_ok += 1
                except Exception as e:
                    logger.debug("[ROI/Yield backfill] %s skipped: %s", hour_start, e)
            # Yield every 4 hours of work so other eventlet workers run
            if idx % 4 == 0:
                eventlet.sleep(0)
        if ai_sec is not None:
            logger.info("[ROI/SEC backfill] Wrote %d hours of SEC history.", sec_ok)
        if ai_yield is not None:
            logger.info("[ROI/Yield backfill] Wrote %d hours of yield history.", yld_ok)
        return sec_ok + yld_ok
    except Exception as e:
        logger.warning("[ROI backfill] Failed (non-fatal): %s", e)
        return 0


def spawn(delay_seconds=60):
    """Spawn backfill in an eventlet greenthread after `delay_seconds`.

    Called from app.py once at boot, AFTER the dynamic_archive_worker greenthread
    has been spawned. Default 60-second delay lets PG settle and the live worker
    take its first hour boundary.
    """
    def _delayed():
        eventlet.sleep(delay_seconds)
        run_backfill(days=30)
    eventlet.spawn(_delayed)
