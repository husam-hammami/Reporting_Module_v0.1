"""SEC + Yield backfill — one-shot, runs in a worker thread post-boot.

Plan §16.3 — moved off startup so it cannot block Electron splash (15-s timeout).

Walks tag_history_archive backwards in 1-hour increments, calling
ai_money.sec.refresh_hour() for each, until either:
  - asset_sec_hourly already covers that hour
  - we've gone back BACKFILL_DAYS (default 30)

Spawned by app.py once after the dynamic_archive_worker starts. Uses eventlet,
yields between hours so it doesn't starve other workers.
"""

import datetime
import logging

import eventlet

logger = logging.getLogger(__name__)


def _is_already_backfilled(get_db_connection):
    """Returns True if asset_sec_hourly has any rows already (skip backfill)."""
    try:
        from contextlib import closing
        with closing(get_db_connection()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor()
            cur.execute("SELECT 1 FROM asset_sec_hourly LIMIT 1")
            return cur.fetchone() is not None
    except Exception:
        # Table not present yet (migration didn't run) — skip
        return True


def run_backfill(days=30):
    """One-shot backfill. Safe to call repeatedly — refresh_hour is idempotent."""
    try:
        from app import get_db_connection
        if _is_already_backfilled(get_db_connection):
            logger.info("[ROI/SEC backfill] asset_sec_hourly already populated — skipping.")
            return 0

        from ai_money import sec as ai_sec
        now = datetime.datetime.now()
        # Round to top of current hour (= end-of-bucket of last completed hour)
        end_of_last = now.replace(minute=0, second=0, microsecond=0)
        # Iterate hour buckets backwards, oldest first so the worker's UI feels alive sooner.
        hours = list(range(1, days * 24 + 1))
        hours.reverse()
        ok = 0
        for h in hours:
            hour_start = end_of_last - datetime.timedelta(hours=h)
            try:
                ai_sec.refresh_hour(hour_start, write=True)
                ok += 1
            except Exception as e:
                logger.debug("[ROI/SEC backfill] %s skipped: %s", hour_start, e)
            # Yield every 4 hours of work so other eventlet workers run
            if ok % 4 == 0:
                eventlet.sleep(0)
        logger.info("[ROI/SEC backfill] Wrote %d hours of SEC history.", ok)
        return ok
    except Exception as e:
        logger.warning("[ROI/SEC backfill] Failed (non-fatal): %s", e)
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
