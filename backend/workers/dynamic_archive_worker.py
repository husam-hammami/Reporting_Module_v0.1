"""
Dynamic Archive Worker

Archives data every hour for all published layouts.
Aggregates second-by-second data into hourly summaries.
Also aggregates universal historian rows (layout_id IS NULL) into tag_history_archive.

Uses an advisory lock for the universal historian block so only one process archives
per hour, and INSERT ... ON CONFLICT DO NOTHING to avoid duplicate rows if the
worker runs twice.

Universal raw rows (layout_id IS NULL) in tag_history are pruned only after
TAG_HISTORY_RAW_RETENTION_DAYS (default 365 = 1 year), not after each hour.
Set TAG_HISTORY_RAW_RETENTION_DAYS=0 to disable pruning (disk will grow).
"""

import logging
import os

# Advisory lock ID for universal tag_history_archive writer (one writer per hour)
ARCHIVE_ADVISORY_LOCK_ID = 0x61726368  # 'arch' in hex
import eventlet
import datetime
import json
from collections import defaultdict
from contextlib import closing
from psycopg2.extras import RealDictCursor
import pytz

logger = logging.getLogger(__name__)


def _load_retention_settings(get_db_connection):
    """Load retention settings from system_settings table into env vars."""
    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT key, value FROM system_settings
                WHERE key IN ('TAG_ARCHIVE_RETENTION_DAYS', 'TAG_ARCHIVE_ROLLUP')
            """)
            for row in cursor.fetchall():
                os.environ[row[0]] = row[1]
    except Exception:
        pass  # Table may not exist yet — use env/defaults


def dynamic_archive_worker():
    """Dynamic archive worker - archives data every hour for all published layouts"""

    # Wait until next hour boundary
    now = datetime.datetime.now()
    next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    wait_seconds = (next_hour - now).total_seconds()
    logger.info(f"⏰ [Dynamic Archive] Waiting {wait_seconds:.0f} seconds until {next_hour.strftime('%H:%M:%S')}")
    eventlet.sleep(wait_seconds)

    while True:
        try:
            from app import get_db_connection

            # Use server local time — must match historian_worker (set TZ in Docker for 10/11/12 am display)
            now = datetime.datetime.now()
            archive_hour = now.replace(minute=0, second=0, microsecond=0)
            hour_start = archive_hour - datetime.timedelta(hours=1)
            archive_time = now

            use_central_historian = os.getenv('USE_CENTRAL_HISTORIAN', 'true').lower() == 'true'

            # Run universal historian first so archive/cleanup always run even if per-layout fails
            if use_central_historian:
                try:
                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        cursor.execute("SELECT pg_try_advisory_xact_lock(%s)", (ARCHIVE_ADVISORY_LOCK_ID,))
                        row = cursor.fetchone()
                        got_lock = (row[0] if isinstance(row, (list, tuple)) else list(row.values())[0]) if row else False
                        if got_lock:
                            cursor.execute("""
                                SELECT tag_id, BOOL_OR(is_counter) AS is_counter,
                                       (array_agg(value ORDER BY "timestamp" DESC) FILTER (WHERE value IS NOT NULL))[1]::double precision AS last_value,
                                       CASE WHEN BOOL_OR(is_counter) THEN SUM(COALESCE(value_delta, 0))::double precision ELSE NULL END AS agg_delta,
                                       (array_agg(value_text ORDER BY "timestamp" DESC) FILTER (WHERE value_text IS NOT NULL))[1] AS last_text
                                FROM tag_history
                                WHERE layout_id IS NULL AND "timestamp" >= %s AND "timestamp" < %s
                                GROUP BY tag_id
                            """, (hour_start, archive_hour))
                            agg_rows = cursor.fetchall()
                            logger.info(f"[Historian] Universal archive range {hour_start} – {archive_hour} → {len(agg_rows)} tag aggregates")
                            if agg_rows:
                                insert_sql = """
                                    INSERT INTO tag_history_archive (layout_id, tag_id, value, value_raw, value_delta, is_counter, quality_code, archive_hour, order_name, value_text)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    ON CONFLICT (tag_id, archive_hour) WHERE layout_id IS NULL DO NOTHING
                                """
                                for r in agg_rows:
                                    tag_id = r['tag_id']
                                    is_counter = bool(r.get('is_counter', False))
                                    last_value_raw = r.get('last_value')
                                    last_value = float(last_value_raw) if last_value_raw is not None else None
                                    agg_delta = float(r['agg_delta']) if r.get('agg_delta') is not None else None
                                    last_text = r.get('last_text')
                                    # Skip rows that have neither numeric nor text data (defensive)
                                    if last_value is None and not last_text:
                                        continue
                                    cursor.execute(insert_sql, (None, tag_id, last_value, None, agg_delta, is_counter, 'GOOD', archive_hour, None, last_text))
                                conn.commit()
                                logger.info(f"[Historian] Archived {len(agg_rows)} rows → tag_history_archive | {archive_hour}")
                            else:
                                conn.rollback()

                            raw_retention_days = int(os.getenv('TAG_HISTORY_RAW_RETENTION_DAYS', '365'))
                            if raw_retention_days > 0:
                                cursor.execute(
                                    """
                                    DELETE FROM tag_history
                                    WHERE layout_id IS NULL
                                      AND "timestamp" < (CURRENT_TIMESTAMP - (%s * INTERVAL '1 day'))
                                    """,
                                    (raw_retention_days,),
                                )
                                pruned = cursor.rowcount
                                conn.commit()
                                if pruned:
                                    logger.info(
                                        "[Historian] Pruned %s universal tag_history rows older than %s days",
                                        pruned,
                                        raw_retention_days,
                                    )
                        else:
                            conn.rollback()
                except Exception as hist_err:
                    logger.warning(f"[Historian] Universal archive failed: {hist_err}", exc_info=True)

            # ── Data Retention: roll up hourly → daily for old data ──
            _load_retention_settings(get_db_connection)
            try:
                retention_days = int(os.environ.get('TAG_ARCHIVE_RETENTION_DAYS', 365))
                rollup_enabled = os.environ.get('TAG_ARCHIVE_ROLLUP', 'true').lower() == 'true'
                if retention_days > 0 and rollup_enabled:
                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor()

                        # Step 1: Roll up hourly → daily aggregates.
                        # value_text rolls up as the latest non-null text seen during the day.
                        cursor.execute("""
                            INSERT INTO tag_history_archive
                                (layout_id, tag_id, value, value_raw, value_delta,
                                 is_counter, quality_code, archive_hour, granularity, value_text)
                            SELECT
                                layout_id, tag_id,
                                AVG(value),
                                AVG(value_raw),
                                SUM(value_delta),
                                bool_or(is_counter),
                                'GOOD',
                                DATE_TRUNC('day', archive_hour),
                                'daily',
                                (array_agg(value_text ORDER BY archive_hour DESC) FILTER (WHERE value_text IS NOT NULL))[1]
                            FROM tag_history_archive
                            WHERE (granularity = 'hourly' OR granularity IS NULL)
                              AND archive_hour < NOW() - make_interval(days => %s)
                            GROUP BY layout_id, tag_id, DATE_TRUNC('day', archive_hour)
                            ON CONFLICT DO NOTHING
                        """, (retention_days,))
                        rolled_up = cursor.rowcount

                        # Step 2: Delete the hourly rows that were just rolled up
                        cursor.execute("""
                            DELETE FROM tag_history_archive
                            WHERE (granularity = 'hourly' OR granularity IS NULL)
                              AND archive_hour < NOW() - make_interval(days => %s)
                        """, (retention_days,))
                        purged = cursor.rowcount
                        conn.commit()

                        if rolled_up > 0 or purged > 0:
                            logger.info(f"[Retention] Rolled up {rolled_up} daily aggregates, removed {purged} hourly rows (>{retention_days} days)")
                elif retention_days > 0 and not rollup_enabled:
                    # Rollup disabled — just delete old data
                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor()
                        cursor.execute("""
                            DELETE FROM tag_history_archive
                            WHERE archive_hour < NOW() - make_interval(days => %s)
                        """, (retention_days,))
                        purged = cursor.rowcount
                        conn.commit()
                        if purged > 0:
                            logger.info(f"[Retention] Purged {purged} archive rows older than {retention_days} days (rollup disabled)")
            except Exception as ret_err:
                logger.warning(f"[Retention] Archive rollup/purge failed: {ret_err}")

            # ── Plan 5 — ROI Money Layer: refresh asset_sec_hourly for the just-archived hour
            # Runs after the universal archive completes so the SEC math operates on
            # already-aggregated data. Failures here MUST NOT block the worker.
            try:
                from ai_money import sec as ai_sec
                # archive_hour = top of current hour = end-of-bucket label for the prev-hour data.
                # So the SEC row we just have data for is keyed at archive_hour (= end label).
                # _sum_delta uses (t_from, t_to] semantics, so refresh_hour(archive_hour) reads
                # rows where archive_hour > hour_start AND archive_hour <= hour_start+1h.
                # Adjust: pass hour_start (the beginning of the just-archived bucket) and store
                # the SEC row keyed there for natural "this is the SEC for the 13:00 hour" reads.
                ai_sec.refresh_hour(hour_start, write=True)
                logger.info(f"[ROI/SEC] Refreshed asset_sec_hourly for {hour_start}")
            except Exception as sec_err:
                logger.warning(f"[ROI/SEC] Refresh failed (non-blocking): {sec_err}")

            # Per-layout archiving (Live Monitor tables) — failures here do not block universal archive
            try:
                from utils.dynamic_tables import get_active_monitors
                monitors = get_active_monitors(get_db_connection)
            except Exception as mon_err:
                logger.warning(f"[Dynamic Archive] get_active_monitors failed (universal archive already ran): {mon_err}")
                monitors = []
            for monitor in monitors:
                try:
                    layout_id = monitor['layout_id']
                    live_table = monitor['live_table_name']
                    archive_table = monitor['archive_table_name']
                    order_name = None

                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)

                        # Get logs from previous hour (for legacy archive only)
                        cursor.execute(f"""
                            SELECT * FROM {live_table}
                            WHERE layout_id = %s
                            AND created_at < %s
                            ORDER BY created_at
                        """, (layout_id, archive_hour))

                        rows = cursor.fetchall()

                        if rows:
                            # Aggregate data for legacy archive
                            aggregated_tag_values = {}
                            aggregated_computed = {}
                            per_bin_weights = defaultdict(float)
                            last_row = dict(rows[-1])
                            order_name = last_row.get('order_name')
                            line_running = last_row.get('line_running', False)

                            all_tag_keys = set()
                            for row in rows:
                                row_dict = dict(row)
                                tag_vals = row_dict.get('tag_values', {})
                                if isinstance(tag_vals, str):
                                    tag_vals = json.loads(tag_vals)
                                all_tag_keys.update(tag_vals.keys())

                            for tag_key in all_tag_keys:
                                values = []
                                for row in rows:
                                    row_dict = dict(row)
                                    tag_vals = row_dict.get('tag_values', {})
                                    if isinstance(tag_vals, str):
                                        tag_vals = json.loads(tag_vals)
                                    val = tag_vals.get(tag_key)
                                    if val is not None:
                                        try:
                                            values.append(float(val))
                                        except (ValueError, TypeError):
                                            pass
                                if values:
                                    tag_key_lower = tag_key.lower()
                                    if ('flow' in tag_key_lower or 'weight' in tag_key_lower or
                                        'rate' in tag_key_lower or 'produced' in tag_key_lower):
                                        aggregated_tag_values[tag_key] = sum(values)
                                    else:
                                        aggregated_tag_values[tag_key] = sum(values) / len(values) if values else 0

                            cursor.execute(f"""
                                INSERT INTO {archive_table} (
                                    layout_id, order_name, tag_values, computed_values,
                                    active_sources, per_bin_weights, line_running,
                                    archive_hour, created_at
                                ) VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s)
                            """, (
                                layout_id,
                                order_name,
                                json.dumps(aggregated_tag_values),
                                json.dumps(aggregated_computed),
                                json.dumps({}),
                                json.dumps(per_bin_weights),
                                line_running,
                                archive_hour,
                                archive_time
                            ))
                            cursor.execute(f"""
                                DELETE FROM {live_table}
                                WHERE layout_id = %s
                                AND created_at < %s
                            """, (layout_id, archive_hour))
                            logger.info(f"✅ Archived {len(rows)} records for {monitor['layout_name']} | Archive Hour: {archive_hour}")
                        else:
                            logger.debug(f"ℹ️ No logs to archive for {monitor['layout_name']}")

                        conn.commit()

                        cursor.execute("""
                            UPDATE dynamic_monitor_registry
                            SET last_archive_at = %s
                            WHERE layout_id = %s
                        """, (archive_time, layout_id))
                        conn.commit()

                except Exception as e:
                    logger.error(f"❌ Error archiving {monitor.get('layout_name')}: {e}", exc_info=True)

            # Wait until next hour
            now = datetime.datetime.now()
            next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
            wait_seconds = (next_hour - now).total_seconds()
            logger.info(f"⏰ [Dynamic Archive] Next archive at {next_hour.strftime('%H:%M:%S')} (sleeping {wait_seconds:.0f}s)")
            eventlet.sleep(wait_seconds)

        except Exception as e:
            logger.error(f"❌ Dynamic archive worker error: {e}", exc_info=True)
            eventlet.sleep(60)  # Wait 1 minute on error
