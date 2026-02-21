"""
Historian Worker — Independent Universal Tag Recorder

Records ALL active PLC tags to tag_history every second.
Runs independently of Live Monitor layouts — data collection
does not require any published layout.

Controlled by env USE_CENTRAL_HISTORIAN (default: true).
"""

import logging
import os
import time
import datetime
import eventlet
from contextlib import closing
from psycopg2.extras import RealDictCursor

from utils.tag_reader import read_all_tags
from utils.historian_helpers import get_tag_metadata_map

logger = logging.getLogger(__name__)

# Last value per tag_id for delta computation (counter tags)
_last_tag_value = {}


def _tag_value_to_float(value):
    """Convert PLC tag value to float for tag_history.value. Returns None to skip."""
    if value is None:
        return None
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    return None


def historian_worker():
    """Universal historian — records all active PLC tags every second."""
    use_central_historian = os.getenv('USE_CENTRAL_HISTORIAN', 'true').lower() == 'true'
    if not use_central_historian:
        logger.info("[Historian] USE_CENTRAL_HISTORIAN=false, historian worker disabled")
        return

    logger.info("[Historian] Starting universal historian worker")

    while True:
        try:
            from app import get_db_connection

            loop_start = time.time()

            # Read ALL active PLC tags
            tag_values = read_all_tags(tag_names=None, db_connection_func=get_db_connection)

            if not tag_values:
                eventlet.sleep(1)
                continue

            tag_meta = get_tag_metadata_map(get_db_connection)
            ts = datetime.datetime.now()

            # Seed _last_tag_value from DB on first run
            if not _last_tag_value:
                try:
                    with closing(get_db_connection()) as seed_conn:
                        seed_cur = seed_conn.cursor(cursor_factory=RealDictCursor)
                        seed_cur.execute("""
                            SELECT DISTINCT ON (tag_id) tag_id, value
                            FROM tag_history
                            ORDER BY tag_id, "timestamp" DESC
                        """)
                        for row in seed_cur.fetchall():
                            _last_tag_value[row["tag_id"]] = float(row["value"])
                except Exception as seed_err:
                    logger.debug(f"[Historian] Seed last values from DB: {seed_err}")

            hist_rows = []
            for tag_name, value in tag_values.items():
                meta = tag_meta.get(tag_name)
                if meta is None:
                    continue
                tag_id = meta["tag_id"]
                is_counter = meta["is_counter"]
                value_float = _tag_value_to_float(value)
                if value_float is None:
                    continue
                value_raw = value_float
                prev = _last_tag_value.get(tag_id)
                if prev is not None:
                    if is_counter and value_float < prev:
                        value_delta = value_float  # counter reset
                    else:
                        value_delta = value_float - prev
                else:
                    value_delta = 0.0
                _last_tag_value[tag_id] = value_float
                hist_rows.append((None, tag_id, value_float, value_raw, value_delta, is_counter, 'GOOD', ts, None))

            if hist_rows:
                with closing(get_db_connection()) as hist_conn:
                    hist_cur = hist_conn.cursor()
                    hist_cur.executemany(
                        """INSERT INTO tag_history (layout_id, tag_id, value, value_raw, value_delta, is_counter, quality_code, "timestamp", order_name)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        hist_rows
                    )
                    hist_conn.commit()
                if int(time.time()) % 30 == 0:
                    logger.info(f"[Historian] Wrote {len(hist_rows)} tag values to tag_history")

            # Sleep to maintain 1-second cycle
            elapsed = time.time() - loop_start
            sleep_time = max(0, 1.0 - elapsed)
            eventlet.sleep(sleep_time)

        except Exception as e:
            logger.error(f"[Historian] Worker error: {e}", exc_info=True)
            eventlet.sleep(5)
