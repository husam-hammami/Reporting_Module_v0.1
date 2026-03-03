"""
Dynamic Monitor Worker

Stores data every second for all published layouts.
Status codes are only used for order tracking (1=start, 0=stop).
Data is stored continuously regardless of status code.

Note: Historian recording is handled by historian_worker.py (independent).

PERFORMANCE: Reads from TagValueCache (shared poller) instead of calling
read_all_tags() independently. Caches layout config to avoid DB queries per cycle.
"""

import logging
import eventlet
import datetime
import json
import time
from contextlib import closing
from psycopg2.extras import RealDictCursor
from utils.tag_value_cache import get_tag_value_cache
from utils.order_tracker import DynamicOrderTracker
from utils.kpi_engine import get_kpi_tag_names_for_layout

logger = logging.getLogger(__name__)

# Store order trackers per layout
order_trackers = {}

# ── Layout config cache (avoids querying DB every second) ─────────────────────
_layout_config_cache = {}       # {layout_id: layout_dict}
_layout_config_cache_ts = 0
_LAYOUT_CONFIG_CACHE_TTL = 30   # seconds

# ── Monitor tag map cache ─────────────────────────────────────────────────────
_monitor_tag_map_cache = {}     # {layout_id: set_of_tags}
_monitor_tag_map_cache_ts = 0
_MONITOR_TAG_MAP_CACHE_TTL = 30  # seconds


def _get_cached_layout_config(layout_id, db_connection_func):
    """Get layout configuration, cached for 30 seconds."""
    global _layout_config_cache, _layout_config_cache_ts

    now = time.time()
    if (now - _layout_config_cache_ts) < _LAYOUT_CONFIG_CACHE_TTL and layout_id in _layout_config_cache:
        return _layout_config_cache[layout_id]

    # Cache miss or expired — refresh all published layouts at once
    with closing(db_connection_func()) as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, layout_name, order_status_tag_name, order_prefix
            FROM live_monitor_layouts
            WHERE is_published = TRUE
        """)
        layouts = cursor.fetchall()

    _layout_config_cache = {row['id']: dict(row) for row in layouts}
    _layout_config_cache_ts = now
    return _layout_config_cache.get(layout_id)


def _get_cached_monitor_tag_map(monitors, db_connection_func):
    """Get per-layout tag sets, cached for 30 seconds."""
    global _monitor_tag_map_cache, _monitor_tag_map_cache_ts

    now = time.time()
    if (now - _monitor_tag_map_cache_ts) < _MONITOR_TAG_MAP_CACHE_TTL:
        return _monitor_tag_map_cache

    from utils.layout_tag_extractor import get_layout_tags

    tag_map = {}
    for monitor in monitors:
        layout_id = monitor['layout_id']
        try:
            required_tags = get_layout_tags(layout_id, db_connection_func)
            kpi_tags = get_kpi_tag_names_for_layout(db_connection_func, layout_id)
            combined = (required_tags or set()) | (kpi_tags or set())
            tag_map[layout_id] = combined if combined else None
        except Exception as e:
            logger.error("[DynMonitor] Error extracting tags for layout %s: %s", layout_id, e)
            tag_map[layout_id] = None

    _monitor_tag_map_cache = tag_map
    _monitor_tag_map_cache_ts = now
    return _monitor_tag_map_cache


def invalidate_layout_config_cache():
    """Call when layout config changes (e.g., from Settings API)."""
    global _layout_config_cache, _layout_config_cache_ts
    global _monitor_tag_map_cache, _monitor_tag_map_cache_ts
    _layout_config_cache = {}
    _layout_config_cache_ts = 0
    _monitor_tag_map_cache = {}
    _monitor_tag_map_cache_ts = 0


def get_order_tracker(layout_id, layout_name, db_connection_func):
    """Get or create order tracker for a layout"""
    if layout_id not in order_trackers:
        # Get layout configuration
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT order_status_tag_name, order_prefix,
                       order_start_value, order_stop_value
                FROM live_monitor_layouts
                WHERE id = %s AND is_published = TRUE
            """, (layout_id,))

            layout = cursor.fetchone()
            if not layout:
                return None

            layout_dict = dict(layout)

            # Create order tracker if status tag is configured
            if layout_dict.get('order_status_tag_name'):
                order_trackers[layout_id] = DynamicOrderTracker(
                    layout_id=layout_id,
                    layout_name=layout_name,
                    status_tag_name=layout_dict['order_status_tag_name'],
                    order_prefix=layout_dict.get('order_prefix') or layout_name.upper().replace(' ', '-'),
                    start_value=layout_dict.get('order_start_value', 1),
                    stop_value=layout_dict.get('order_stop_value', 0),
                    db_connection_func=db_connection_func
                )
            else:
                # No order tracking configured
                order_trackers[layout_id] = None

    return order_trackers.get(layout_id)


def dynamic_monitor_worker():
    """Dynamic monitor worker - stores data every second for all published layouts.

    PERFORMANCE: Reads from TagValueCache instead of independent PLC reads.
    Caches layout config and tag maps for 30 seconds to avoid DB queries per cycle.
    """
    logger.info("[DynMonitor] Starting dynamic monitor worker")
    cache = get_tag_value_cache()

    # Log initial state once
    try:
        from app import get_db_connection
        from utils.dynamic_tables import get_active_monitors

        initial_monitors = get_active_monitors(get_db_connection)
        logger.info("[DynMonitor] Initial check: %d active monitor(s)", len(initial_monitors))
        for m in initial_monitors:
            logger.info("  - %s (ID: %s, Table: %s)", m['layout_name'], m['layout_id'], m['live_table_name'])
    except Exception as e:
        logger.warning("[DynMonitor] Could not check initial monitors: %s", e)

    while True:
        try:
            from app import get_db_connection
            from utils.dynamic_tables import get_active_monitors

            # Get all active monitors
            monitors = get_active_monitors(get_db_connection)

            if not monitors:
                if int(time.time()) % 60 == 0:
                    logger.debug("[DynMonitor] No active monitors found. Waiting...")
                eventlet.sleep(5)
                continue

            if int(time.time()) % 30 == 0:
                logger.info("[DynMonitor] Processing %d active monitor(s)", len(monitors))

            loop_start_time = time.time()

            # Get per-layout tag map (cached 30s)
            monitor_tag_map = _get_cached_monitor_tag_map(monitors, get_db_connection)

            # Read from shared cache instead of independent PLC read
            tag_values = cache.get_values()
            if not tag_values:
                logger.debug("[DynMonitor] Cache empty or stale, waiting...")
                eventlet.sleep(1)
                continue

            logger.debug("[DynMonitor] Read %d tag values from cache", len(tag_values))

            # Process each active monitor
            for monitor in monitors:
                try:
                    layout_id = monitor['layout_id']
                    layout_name = monitor['layout_name']
                    live_table = monitor['live_table_name']

                    # Get layout configuration (cached 30s)
                    layout_dict = _get_cached_layout_config(layout_id, get_db_connection)
                    if not layout_dict:
                        continue

                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)

                        # Filter tag_values to only include tags used by this layout
                        layout_tags = monitor_tag_map.get(layout_id)
                        if layout_tags:
                            filtered_tag_values = {
                                tag_name: tag_values.get(tag_name)
                                for tag_name in layout_tags
                                if tag_name in tag_values
                            }
                        else:
                            filtered_tag_values = tag_values

                        # Get order tracker
                        order_tracker = get_order_tracker(
                            layout_id,
                            layout_dict['layout_name'],
                            get_db_connection
                        )

                        # Check order trigger if tracker exists
                        order_name = None
                        if order_tracker:
                            order_event = order_tracker.check_trigger(tag_values)

                            if order_event == "START":
                                order_tracker.start_new_order()
                            elif order_event == "STOP":
                                order_tracker.complete_order()

                            order_name = order_tracker.get_current_order()

                        # Resolve section-based data
                        from utils.section_data_resolver import get_layout_sections_data

                        sections_data = {}
                        try:
                            sections_data = get_layout_sections_data(
                                layout_id,
                                tag_values,
                                get_db_connection
                            )

                            if not sections_data:
                                logger.debug("[DynMonitor] No section data for layout %s (ID: %s)", layout_name, layout_id)
                            else:
                                logger.debug("[DynMonitor] Resolved %d section(s) for %s", len(sections_data), layout_name)

                        except Exception as resolve_error:
                            logger.error("[DynMonitor] Error resolving sections for %s: %s", layout_name, resolve_error, exc_info=True)
                            sections_data = {}

                        # Store section-based data in JSONB format
                        try:
                            cursor.execute(f"""
                                INSERT INTO {live_table} (
                                    layout_id, order_name, tag_values,
                                    line_running, created_at
                                ) VALUES (%s, %s, %s::jsonb, %s, %s)
                            """, (
                                layout_id,
                                order_name,
                                json.dumps(sections_data),
                                order_name is not None,
                                datetime.datetime.now()
                            ))

                            conn.commit()
                            logger.debug("[DynMonitor] Stored data for %s | Order: %s | Sections: %d",
                                         layout_name, order_name, len(sections_data))
                        except Exception as insert_error:
                            logger.error("[DynMonitor] Insert error for %s: %s", layout_name, insert_error, exc_info=True)
                            conn.rollback()
                            raise

                except Exception as e:
                    logger.error("[DynMonitor] Error processing %s: %s", monitor.get('layout_name'), e, exc_info=True)

            # Dynamic sleep to maintain 1-second cycle
            elapsed = time.time() - loop_start_time
            sleep_time = max(0, 1.0 - elapsed)
            if sleep_time < 0.1:
                logger.warning("[DynMonitor] Loop took %.3fs (>900ms), cycle overrun", elapsed)
            eventlet.sleep(sleep_time)

        except Exception as e:
            logger.error("[DynMonitor] Worker error: %s", e, exc_info=True)
            eventlet.sleep(5)

