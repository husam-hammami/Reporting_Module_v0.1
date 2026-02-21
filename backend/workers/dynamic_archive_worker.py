"""
Dynamic Archive Worker

Archives data every hour for all published layouts.
Aggregates second-by-second data into hourly summaries.
Also aggregates universal historian rows (layout_id IS NULL) into tag_history_archive.
"""

import logging
import os
import eventlet
import datetime
import json
from collections import defaultdict
from contextlib import closing
from psycopg2.extras import RealDictCursor
import pytz

logger = logging.getLogger(__name__)


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
            from utils.dynamic_tables import get_active_monitors

            # Use Dubai timezone for archive timestamp
            dubai_tz = pytz.timezone('Asia/Dubai')
            archive_time = datetime.datetime.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)
            archive_hour = archive_time.replace(minute=0, second=0, microsecond=0)

            use_central_historian = os.getenv('USE_CENTRAL_HISTORIAN', 'true').lower() == 'true'
            hour_start = archive_hour - datetime.timedelta(hours=1)

            # Per-layout archiving (Live Monitor tables + per-layout historian)
            monitors = get_active_monitors(get_db_connection)
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

            # Universal historian aggregation (layout_id IS NULL rows from historian_worker)
            if use_central_historian:
                try:
                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        cursor.execute("""
                            SELECT tag_id, BOOL_OR(is_counter) AS is_counter,
                                   CASE WHEN BOOL_OR(is_counter) THEN SUM(COALESCE(value_delta, 0))::double precision ELSE AVG(value)::double precision END AS agg_value,
                                   CASE WHEN BOOL_OR(is_counter) THEN SUM(COALESCE(value_delta, 0))::double precision ELSE NULL END AS agg_delta
                            FROM tag_history
                            WHERE layout_id IS NULL AND "timestamp" >= %s AND "timestamp" < %s
                            GROUP BY tag_id
                        """, (hour_start, archive_hour))
                        agg_rows = cursor.fetchall()
                        if agg_rows:
                            hist_rows = []
                            for r in agg_rows:
                                tag_id = r['tag_id']
                                is_counter = bool(r.get('is_counter', False))
                                agg_value = float(r['agg_value']) if r.get('agg_value') is not None else 0.0
                                agg_delta = float(r['agg_delta']) if r.get('agg_delta') is not None else None
                                hist_rows.append((None, tag_id, agg_value, None, agg_delta, is_counter, 'GOOD', archive_hour, None))
                            cursor.executemany(
                                """INSERT INTO tag_history_archive (layout_id, tag_id, value, value_raw, value_delta, is_counter, quality_code, archive_hour, order_name)
                                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                                hist_rows
                            )
                            conn.commit()
                            logger.info(f"[Historian] Archived {len(hist_rows)} universal tag aggregates | {archive_hour}")
                except Exception as hist_err:
                    logger.warning(f"[Historian] Universal archive aggregation failed: {hist_err}")

            # Wait until next hour
            now = datetime.datetime.now()
            next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
            wait_seconds = (next_hour - now).total_seconds()
            logger.info(f"⏰ [Dynamic Archive] Next archive at {next_hour.strftime('%H:%M:%S')} (sleeping {wait_seconds:.0f}s)")
            eventlet.sleep(wait_seconds)

        except Exception as e:
            logger.error(f"❌ Dynamic archive worker error: {e}", exc_info=True)
            eventlet.sleep(60)  # Wait 1 minute on error
