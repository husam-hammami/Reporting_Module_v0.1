"""
Report Order Worker — Order tracking driven by report_builder_templates.

Uses TagValueCache for PLC values and writes dynamic_orders /
dynamic_order_counters with template_id (layout_id NULL for new rows).
"""

import datetime
import logging
import time
from contextlib import closing

import eventlet
from psycopg2.extras import RealDictCursor

from utils.tag_value_cache import get_tag_value_cache

logger = logging.getLogger(__name__)

# pg_advisory_xact_lock(classid, objid) — serialize next-order allocation per template_id
_ADV_LOCK_CLASS_ID = 88142342

_order_trackers = {}
_template_config_cache = []
_template_config_cache_ts = 0.0
_TEMPLATE_CONFIG_CACHE_TTL = 30.0


class TemplateOrderTracker:
    """Tracks orders for a report template from a PLC status tag."""

    def __init__(
        self,
        template_id,
        template_name,
        status_tag_name,
        order_prefix,
        start_value=1,
        stop_value=0,
        db_connection_func=None,
    ):
        self.template_id = int(template_id) if template_id is not None else None
        self.template_name = template_name
        self.status_tag_name = status_tag_name
        self.order_prefix = (
            order_prefix
            or template_name.upper().replace(" ", "-").replace("_", "-")
        )
        self.start_value = int(start_value) if start_value is not None else 1
        self.stop_value = int(stop_value) if stop_value is not None else 0
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
                cur.execute(
                    """
                    SELECT current_counter, last_order_name
                    FROM dynamic_order_counters
                    WHERE template_id = %s
                    """,
                    (self.template_id,),
                )
                row = cur.fetchone()
                if not row:
                    cur.execute(
                        """
                        INSERT INTO dynamic_order_counters
                        (template_id, layout_name, current_counter)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (template_id) WHERE template_id IS NOT NULL
                        DO NOTHING
                        """,
                        (self.template_id, self.template_name, 0),
                    )
                    conn.commit()

                cur.execute(
                    """
                    SELECT id, order_name, order_number, start_time
                    FROM dynamic_orders
                    WHERE template_id = %s AND status = 'running'
                    ORDER BY start_time DESC LIMIT 1
                    """,
                    (self.template_id,),
                )
                active = cur.fetchone()
                if active:
                    self.current_order_name = active["order_name"]
                    self.current_order_number = active["order_number"]
                    self.is_running = True
                    self.session_started = active["start_time"]
                    self.last_status_value = self.start_value
                else:
                    self.current_order_number = self._next_number()
        except Exception as e:
            logger.error(
                "[ReportOrderWorker] Error loading counter for template %s: %s",
                self.template_id,
                e,
                exc_info=True,
            )
            self.current_order_number = 1

    def _next_number(self):
        """Next order_number for this template (read-only). Prefer start_new_order's transactional path."""
        if not self.db_connection_func or self.template_id is None:
            return 1
        try:
            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT COALESCE(MAX(order_number), 0) AS mx
                    FROM dynamic_orders
                    WHERE template_id = %s
                    """,
                    (self.template_id,),
                )
                row = cur.fetchone()
                mx = int(row["mx"]) if row is not None else 0
                try:
                    conn.rollback()
                except Exception:
                    pass
                return int(mx) + 1
        except Exception as e:
            logger.error(
                "[ReportOrderWorker] _next_number failed template_id=%s: %s",
                self.template_id,
                e,
                exc_info=True,
            )
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
        if not self.db_connection_func or self.template_id is None:
            return
        try:
            self.session_started = datetime.datetime.now()

            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor()
                try:
                    # One transaction: lock → MAX → insert counter row → insert order.
                    # Avoids duplicate FCL1 when pool/txn timing made a separate _next_number
                    # miss rows that only existed on another connection.
                    cur.execute(
                        "SELECT pg_advisory_xact_lock(%s, %s)",
                        (_ADV_LOCK_CLASS_ID, self.template_id),
                    )
                    cur.execute(
                        """
                        SELECT COALESCE(MAX(order_number), 0) AS mx
                        FROM dynamic_orders
                        WHERE template_id = %s
                        """,
                        (self.template_id,),
                    )
                    row = cur.fetchone()
                    mx = int(row["mx"]) if row is not None else 0
                    self.current_order_number = mx + 1
                    self.current_order_name = (
                        f"{self.order_prefix}{self.current_order_number}"
                    )
                    self.is_running = True

                    cur.execute(
                        """
                        INSERT INTO dynamic_order_counters
                        (template_id, layout_name, current_counter, last_order_name, last_updated)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (template_id) WHERE template_id IS NOT NULL
                        DO UPDATE SET
                            current_counter = EXCLUDED.current_counter,
                            last_order_name = EXCLUDED.last_order_name,
                            last_updated = EXCLUDED.last_updated
                        """,
                        (
                            self.template_id,
                            self.template_name,
                            self.current_order_number,
                            self.current_order_name,
                            datetime.datetime.now(),
                        ),
                    )
                    cur.execute(
                        """
                        INSERT INTO dynamic_orders
                        (template_id, order_name, order_number, start_time, status)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            self.template_id,
                            self.current_order_name,
                            self.current_order_number,
                            self.session_started,
                            "running",
                        ),
                    )
                    conn.commit()
                except Exception:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    raise

            logger.info(
                "[ReportOrderWorker] Order started: %s (template %s)",
                self.current_order_name,
                self.template_name,
            )
        except Exception as e:
            logger.error(
                "[ReportOrderWorker] Error starting order: %s", e, exc_info=True
            )

    def complete_order(self):
        if not self.current_order_name:
            return
        try:
            end_time = datetime.datetime.now()
            with closing(self.db_connection_func()) as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    UPDATE dynamic_orders
                    SET end_time = %s,
                        status = 'completed',
                        duration_seconds = EXTRACT(EPOCH FROM (%s - start_time))
                    WHERE template_id = %s AND order_name = %s AND status = 'running'
                    """,
                    (end_time, end_time, self.template_id, self.current_order_name),
                )
                conn.commit()

            logger.info(
                "[ReportOrderWorker] Order completed: %s (template %s)",
                self.current_order_name,
                self.template_name,
            )
            self.current_order_name = None
            self.is_running = False
        except Exception as e:
            logger.error(
                "[ReportOrderWorker] Error completing order: %s", e, exc_info=True
            )


def _get_db_connection_func():
    import sys

    for mod_name in ("app", "__main__"):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            fn = getattr(mod, "get_db_connection", None)
            if fn is not None:
                return fn
    raise RuntimeError("Could not get database connection function")


def _get_order_templates(db_func):
    global _template_config_cache, _template_config_cache_ts
    now = time.time()
    if (
        now - _template_config_cache_ts < _TEMPLATE_CONFIG_CACHE_TTL
        and _template_config_cache
    ):
        return _template_config_cache

    with closing(db_func()) as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT id, name, order_status_tag_name, order_prefix,
                   order_start_value, order_stop_value
            FROM report_builder_templates
            WHERE is_active = TRUE
              AND order_status_tag_name IS NOT NULL
              AND order_status_tag_name != ''
            """
        )
        rows = [dict(r) for r in cur.fetchall()]

    _template_config_cache = rows
    _template_config_cache_ts = now
    return rows


def _sync_trackers(templates, db_func):
    global _order_trackers
    active_ids = {t["id"] for t in templates}
    for t in templates:
        tid = t["id"]
        if tid not in _order_trackers:
            _order_trackers[tid] = TemplateOrderTracker(
                tid,
                t["name"],
                t["order_status_tag_name"],
                t.get("order_prefix") or "",
                t.get("order_start_value", 1),
                t.get("order_stop_value", 0),
                db_func,
            )
        else:
            tr = _order_trackers[tid]
            tr.template_name = t["name"]
            tr.status_tag_name = t["order_status_tag_name"]
            tr.order_prefix = t.get("order_prefix") or ""
            tr.start_value = int(t.get("order_start_value", 1) or 1)
            tr.stop_value = int(
                t["order_stop_value"]
                if t.get("order_stop_value") is not None
                else 0
            )
    for tid in list(_order_trackers.keys()):
        if tid not in active_ids:
            del _order_trackers[tid]


def report_order_worker():
    logger.info("[ReportOrderWorker] Loop started")
    while True:
        try:
            db_func = _get_db_connection_func()
            templates = _get_order_templates(db_func)
            _sync_trackers(templates, db_func)

            cache = get_tag_value_cache()
            values = cache.get_values()
            if values:
                for tr in list(_order_trackers.values()):
                    action = tr.check_trigger(values)
                    if action == "START" and not tr.is_running:
                        tr.start_new_order()
                    elif action == "STOP" and tr.is_running:
                        tr.complete_order()
        except Exception as e:
            logger.error("[ReportOrderWorker] Loop error: %s", e, exc_info=True)

        eventlet.sleep(1.0)
