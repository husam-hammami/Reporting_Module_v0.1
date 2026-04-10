"""
Report Order Worker — Order tracking driven by report_builder_templates.

Reads order tracking config (order_status_tag_name, order_prefix, start/stop values)
from report_builder_templates. Uses TagValueCache for PLC values and writes to
dynamic_orders / dynamic_order_counters using template_id (not layout_id).

Runs every 1 second. Only processes templates that have order_status_tag_name set.
"""

import logging
import time
import datetime
import eventlet
from contextlib import closing
from psycopg2.extras import RealDictCursor

from utils.tag_value_cache import get_tag_value_cache

logger = logging.getLogger(__name__)

_order_trackers = {}

_template_config_cache = {}
_template_config_cache_ts = 0
_TEMPLATE_CONFIG_CACHE_TTL = 30


class TemplateOrderTracker:
    """Tracks orders for a report template based on a PLC status tag."""

    def __init__(self, template_id, template_name, status_tag_name, order_prefix,
                 start_value=1, stop_value=0, db_connection_func=None):
        self.template_id = template_id
        self.template_name = template_name
        self.status_tag_name = status_tag_name
        self.order_prefix = order_prefix or template_name.upper().replace(' ', '-').replace('_', '-')
        self.start_value = start_value
        self.stop_value = stop_value
        self.db_connection_func = db_connection_func

        self.current_order_name = None
        self.current_order_number = None
        self.is_running = False
        self.last_status_value = None
        self.session_started = None

        self._load_counter()

    def _load_counter(self):
        if not self.db_connection_func:
            return
        try:
            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""
                    SELECT current_counter, last_order_name
                    FROM dynamic_order_counters
                    WHERE template_id = %s
                """, (self.template_id,))
                row = cur.fetchone()
                if row:
                    self.current_order_number = self._next_number()
                else:
                    self.current_order_number = 1
                    cur.execute("""
                        INSERT INTO dynamic_order_counters
                        (template_id, layout_name, current_counter)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (self.template_id, self.template_name, 0))
                    conn.commit()

                running = cur if row else conn.cursor(cursor_factory=RealDictCursor)
                running.execute("""
                    SELECT id, order_name, order_number, start_time
                    FROM dynamic_orders
                    WHERE template_id = %s AND status = 'running'
                    ORDER BY start_time DESC LIMIT 1
                """, (self.template_id,))
                active = running.fetchone()
                if active:
                    self.current_order_name = active['order_name']
                    self.current_order_number = active['order_number']
                    self.is_running = True
                    self.session_started = active['start_time']
                    self.last_status_value = self.start_value
        except Exception as e:
            logger.error("[ReportOrderWorker] Error loading counter for template %s: %s",
                         self.template_id, e, exc_info=True)
            self.current_order_number = 1

    def _next_number(self):
        if not self.db_connection_func:
            return 1
        try:
            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT MAX(order_number) FROM dynamic_orders WHERE template_id = %s
                """, (self.template_id,))
                mx = cur.fetchone()[0] or 0
                return mx + 1
        except Exception:
            return 1

    def check_trigger(self, tag_values):
        if not self.status_tag_name:
            return None
        current = tag_values.get(self.status_tag_name)
        if current is None:
            return None
        try:
            current = int(float(current))
        except (ValueError, TypeError):
            return None

        if self.last_status_value != self.start_value and current == self.start_value:
            self.last_status_value = current
            return "START"
        if self.last_status_value != self.stop_value and current == self.stop_value:
            self.last_status_value = current
            return "STOP"
        if current not in (self.start_value, self.stop_value):
            return None
        self.last_status_value = current
        return None

    def start_new_order(self):
        if not self.db_connection_func:
            return
        try:
            self.current_order_number = self._next_number()
            self.current_order_name = f"{self.order_prefix}{self.current_order_number}"
            self.is_running = True
            self.session_started = datetime.datetime.now()

            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO dynamic_order_counters
                    (template_id, layout_name, current_counter, last_order_name, last_updated)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (template_id) WHERE template_id IS NOT NULL
                    DO UPDATE SET
                        current_counter = EXCLUDED.current_counter,
                        last_order_name = EXCLUDED.last_order_name,
                        last_updated = EXCLUDED.last_updated
                """, (self.template_id, self.template_name,
                      self.current_order_number, self.current_order_name,
                      datetime.datetime.now()))

                cur.execute("""
                    INSERT INTO dynamic_orders
                    (template_id, order_name, order_number, start_time, status)
                    VALUES (%s, %s, %s, %s, %s)
                """, (self.template_id, self.current_order_name,
                      self.current_order_number, self.session_started, 'running'))
                conn.commit()

            logger.info("[ReportOrderWorker] Order Started: %s (template: %s)",
                        self.current_order_name, self.template_name)
        except Exception as e:
            logger.error("[ReportOrderWorker] Error starting order: %s", e, exc_info=True)

    def complete_order(self):
        if not self.current_order_name:
            return
        try:
            end_time = datetime.datetime.now()
            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor()
                cur.execute("""
                    UPDATE dynamic_orders
                    SET end_time = %s,
                        status = 'completed',
                        duration_seconds = EXTRACT(EPOCH FROM (%s - start_time))
                    WHERE template_id = %s AND order_name = %s AND status = 'running'
                """, (end_time, end_time, self.template_id, self.current_order_name))
                conn.commit()

            logger.info("[ReportOrderWorker] Order Completed: %s (template: %s)",
                        self.current_order_name, self.template_name)

            self.current_order_name = None
            self.is_running = False
        except Exception as e:
            logger.error("[ReportOrderWorker] Error completing order: %s", e, exc_info=True)

    def get_current_order(self):
        return self.current_order_name


def _get_db_connection_func():
    import sys
    for mod_name in ('app', '__main__'):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            fn = getattr(mod, 'get_db_connection', None)
            if fn is not None:
                return fn
    raise RuntimeError("Could not get database connection function")


def _get_order_templates(db_func):
    global _template_config_cache, _template_config_cache_ts
    now = time.time()
    if (now - _template_config_cache_ts) < _TEMPLATE_CONFIG_CACHE_TTL and _template_config_cache:
        return _template_config_cache

    with closing(db_func()) as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, name, order_status_tag_name, order_prefix,
                   order_start_value, order_stop_value
            FROM report_builder_templates
            WHERE is_active = TRUE
              AND order_status_tag_name IS NOT NULL
              AND order_status_tag_name != ''
        """)
        rows = [dict(r) for r in cur.fetchall()]

    _template_config_cache = rows
    _template_config_cache_ts = now
    return rows


def report_order_worker():
    """Order tracking worker driven by report_builder_templates."""
    logger.info("[ReportOrderWorker] Starting order tracking worker (report templates)")
    cache = get_tag_value_cache()

    while True:
        try:
            db_func = _get_db_connection_func()
            templates = _get_order_templates(db_func)

            if not templates:
                eventlet.sleep(5)
                continue

            tag_values = cache.get_values()
            if not tag_values:
                eventlet.sleep(1)
                continue

            for tmpl in templates:
                tid = tmpl['id']

                if tid not in _order_trackers:
                    _order_trackers[tid] = TemplateOrderTracker(
                        template_id=tid,
                        template_name=tmpl['name'],
                        status_tag_name=tmpl['order_status_tag_name'],
                        order_prefix=tmpl.get('order_prefix') or tmpl['name'].upper().replace(' ', '-'),
                        start_value=tmpl.get('order_start_value', 1),
                        stop_value=tmpl.get('order_stop_value', 0),
                        db_connection_func=db_func,
                    )

                tracker = _order_trackers[tid]
                event = tracker.check_trigger(tag_values)
                if event == "START":
                    tracker.start_new_order()
                elif event == "STOP":
                    tracker.complete_order()

            eventlet.sleep(1)

        except Exception as e:
            logger.error("[ReportOrderWorker] Worker error: %s", e, exc_info=True)
            eventlet.sleep(5)
