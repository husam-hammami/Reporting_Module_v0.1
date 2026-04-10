"""
Orders Report Blueprint — Job Logs API

Reads from dynamic_orders (shared table, scoped by layout_id).
Detail data comes from tag_history via the existing historian endpoints
(client passes start_time/end_time as from/to).

Endpoints:
  GET /orders/jobs           — list orders for a layout (paginated, time-filterable)
  GET /orders/jobs/<id>      — single order by primary key
  GET /orders/layouts        — layouts that have order tracking configured
"""

import logging
import sys
from contextlib import closing
from flask import Blueprint, jsonify, request
from flask_login import login_required
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

orders_report_bp = Blueprint("orders_report_bp", __name__)

_cached_get_db_connection = None


def _get_db_connection():
    global _cached_get_db_connection
    if _cached_get_db_connection is not None:
        return _cached_get_db_connection
    if "app" not in sys.modules:
        raise ImportError("app module not in sys.modules")
    app_module = sys.modules["app"]
    get_db_connection = getattr(app_module, "get_db_connection", None)
    if get_db_connection is None or not callable(get_db_connection):
        raise ImportError("get_db_connection not available on app module")
    _cached_get_db_connection = get_db_connection
    return get_db_connection


@orders_report_bp.route("/orders/layouts", methods=["GET"])
@login_required
def get_order_layouts():
    """Return layouts that have order tracking configured (order_status_tag_name is set)."""
    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT id, layout_name, order_status_tag_name, order_prefix,
                       order_start_value, order_stop_value, is_published
                FROM live_monitor_layouts
                WHERE is_active = TRUE
                  AND order_status_tag_name IS NOT NULL
                  AND order_status_tag_name != ''
                ORDER BY layout_name
            """)
            layouts = [dict(r) for r in cur.fetchall()]
        return jsonify({"data": layouts}), 200
    except Exception as e:
        logger.exception("orders/layouts failed: %s", e)
        return jsonify({"error": str(e)}), 500


@orders_report_bp.route("/orders/jobs", methods=["GET"])
@login_required
def get_order_jobs():
    """
    List orders for a given layout.

    Query params:
      layout_id (required): integer
      limit (optional): max rows, default 100
      offset (optional): pagination offset, default 0
      from (optional): ISO timestamp — only orders overlapping this start
      to (optional): ISO timestamp — only orders overlapping this end
      status (optional): 'running' | 'completed'
    """
    layout_id = request.args.get("layout_id", type=int)
    if layout_id is None:
        return jsonify({"error": "layout_id is required"}), 400

    limit = request.args.get("limit", 100, type=int)
    offset = request.args.get("offset", 0, type=int)
    from_ts = request.args.get("from")
    to_ts = request.args.get("to")
    status_filter = request.args.get("status")

    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            sql = """
                SELECT id, layout_id, order_name, order_number,
                       start_time, end_time, status, duration_seconds,
                       created_at
                FROM dynamic_orders
                WHERE layout_id = %s
            """
            params = [layout_id]

            if from_ts:
                sql += " AND (end_time IS NULL OR end_time >= %s::timestamp)"
                params.append(from_ts)
            if to_ts:
                sql += " AND start_time <= %s::timestamp"
                params.append(to_ts)
            if status_filter:
                sql += " AND status = %s"
                params.append(status_filter)

            sql += " ORDER BY start_time DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]

            cur.execute(
                "SELECT COUNT(*) AS total FROM dynamic_orders WHERE layout_id = %s",
                (layout_id,),
            )
            total = cur.fetchone()["total"]

        return jsonify({"data": rows, "total": total, "limit": limit, "offset": offset}), 200
    except Exception as e:
        logger.exception("orders/jobs failed: %s", e)
        return jsonify({"error": str(e)}), 500


@orders_report_bp.route("/orders/layout-tags/<int:layout_id>", methods=["GET"])
@login_required
def get_layout_tag_names(layout_id):
    """Return all tag names configured on a layout (for detail queries)."""
    try:
        get_db = _get_db_connection()
        from utils.layout_tag_extractor import get_layout_tags
        tag_names = get_layout_tags(layout_id, get_db)
        return jsonify({"data": sorted(tag_names) if tag_names else []}), 200
    except Exception as e:
        logger.exception("orders/layout-tags/%s failed: %s", layout_id, e)
        return jsonify({"error": str(e)}), 500


@orders_report_bp.route("/orders/jobs/<int:order_id>", methods=["GET"])
@login_required
def get_order_job_detail(order_id):
    """Single order by primary key."""
    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT o.id, o.layout_id, o.order_name, o.order_number,
                       o.start_time, o.end_time, o.status, o.duration_seconds,
                       o.created_at,
                       l.layout_name, l.order_prefix
                FROM dynamic_orders o
                JOIN live_monitor_layouts l ON l.id = o.layout_id
                WHERE o.id = %s
            """, (order_id,))
            row = cur.fetchone()

        if not row:
            return jsonify({"error": "Order not found"}), 404
        return jsonify({"data": dict(row)}), 200
    except Exception as e:
        logger.exception("orders/jobs/<id> failed: %s", e)
        return jsonify({"error": str(e)}), 500
