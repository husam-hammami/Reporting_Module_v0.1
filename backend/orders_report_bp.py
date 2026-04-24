"""
Orders Report Blueprint — Job Logs API

Reads from report_builder_templates (for layout list) and
dynamic_orders (for order rows, scoped by template_id).
Detail data comes from tag_history via the existing historian endpoints
(client passes start_time/end_time as from/to).

Endpoints:
  GET /orders/layouts           — report templates with order tracking configured
  GET /orders/jobs              — list orders for a template (paginated, time-filterable)
  GET /orders/jobs/<id>         — single order by primary key
  GET /orders/layout-tags/<id>  — Job Logs tag list (optional layout_config.jobLogsDetailTags whitelist)
"""

import datetime
import logging
import sys
import json
from contextlib import closing
from flask import Blueprint, jsonify, request
from flask_login import login_required
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

orders_report_bp = Blueprint("orders_report_bp", __name__)

_cached_get_db_connection = None


def _order_ts_for_json(value):
    """
    Serialize order timestamps as naive ISO local wall time (no Z / no HTTP GMT).
    Matches PostgreSQL `timestamp without time zone` + Job Logs `parseOrderWallTime`.
    """
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        if value.tzinfo is not None:
            value = value.astimezone().replace(tzinfo=None)
        if value.microsecond:
            value = value.replace(microsecond=0)
        return value.isoformat(sep="T")
    return value


def _serialize_order_row(row):
    d = dict(row)
    for key in ("start_time", "end_time", "created_at"):
        if key in d:
            d[key] = _order_ts_for_json(d[key])
    return d


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


def _parse_layout_config_dict(layout_config):
    """Return layout_config as a dict, or {} if missing/invalid."""
    if not layout_config:
        return {}
    if isinstance(layout_config, str):
        try:
            layout_config = json.loads(layout_config)
        except (json.JSONDecodeError, TypeError):
            return {}
    if not isinstance(layout_config, dict):
        return {}
    return layout_config


def _job_logs_detail_tags_whitelist(layout_config):
    """
    Optional ordered whitelist stored at layout_config.jobLogsDetailTags (array of strings).
    When non-empty, Job Logs / layout-tags returns only these names (deduped, order preserved).
    When missing or empty, callers should fall back to full layout extraction.
    """
    lc = _parse_layout_config_dict(layout_config)
    raw = lc.get('jobLogsDetailTags')
    if not isinstance(raw, list) or len(raw) == 0:
        return None
    out = []
    seen = set()
    for x in raw:
        if not isinstance(x, str):
            continue
        t = x.strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out if out else None


def _extract_tag_names_from_layout_config(layout_config):
    """Extract all tag names referenced in a report template's layout_config JSON."""
    layout_config = _parse_layout_config_dict(layout_config)
    if not layout_config:
        return []

    tag_names = set()

    for section in layout_config.get('paginatedSections', []):
        if section.get('statusTagName'):
            tag_names.add(section['statusTagName'])

        for row in section.get('rows', []):
            for cell in row.get('cells', []):
                if cell.get('sourceType') == 'tag' and cell.get('tagName'):
                    tag_names.add(cell['tagName'])

    for widget in layout_config.get('widgets', []):
        if widget.get('tagName'):
            tag_names.add(widget['tagName'])
        for item in widget.get('items', []):
            if item.get('tagName'):
                tag_names.add(item['tagName'])

    return sorted(tag_names)


@orders_report_bp.route("/orders/layouts", methods=["GET"])
@login_required
def get_order_layouts():
    """Return report templates that have order tracking configured."""
    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT id, name, status,
                       order_status_tag_name, order_prefix,
                       order_start_value, order_stop_value
                FROM report_builder_templates
                WHERE is_active = TRUE
                  AND order_status_tag_name IS NOT NULL
                  AND order_status_tag_name != ''
                ORDER BY name
            """)
            rows = [dict(r) for r in cur.fetchall()]
        return jsonify({"data": rows}), 200
    except Exception as e:
        logger.exception("orders/layouts failed: %s", e)
        return jsonify({"error": str(e)}), 500


@orders_report_bp.route("/orders/jobs", methods=["GET"])
@login_required
def get_order_jobs():
    """
    List orders for a given report template.

    Query params:
      template_id (required): integer — report_builder_templates.id
      limit (optional): max rows, default 100
      offset (optional): pagination offset, default 0
      from (optional): ISO timestamp — only orders overlapping this start
      to (optional): ISO timestamp — only orders overlapping this end
      status (optional): 'running' | 'completed'
    """
    template_id = request.args.get("template_id", type=int)
    if template_id is None:
        return jsonify({"error": "template_id is required"}), 400

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
                SELECT id, template_id, order_name, order_number,
                       start_time, end_time, status, duration_seconds,
                       created_at
                FROM dynamic_orders
                WHERE template_id = %s
            """
            params = [template_id]

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
            rows = [_serialize_order_row(r) for r in cur.fetchall()]

            cur.execute(
                "SELECT COUNT(*) AS total FROM dynamic_orders WHERE template_id = %s",
                (template_id,),
            )
            total = cur.fetchone()["total"]

        return jsonify({"data": rows, "total": total, "limit": limit, "offset": offset}), 200
    except Exception as e:
        logger.exception("orders/jobs failed: %s", e)
        return jsonify({"error": str(e)}), 500


@orders_report_bp.route("/orders/layout-tags/<int:template_id>", methods=["GET"])
@login_required
def get_layout_tag_names(template_id):
    """
    Return tag names used for Job Logs historian queries.

    If layout_config.jobLogsDetailTags is a non-empty array, returns that list only
    (order preserved). Otherwise returns every tag referenced in paginatedSections and widgets.
    """
    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                "SELECT layout_config FROM report_builder_templates WHERE id = %s",
                (template_id,),
            )
            row = cur.fetchone()
        if not row:
            return jsonify({"error": "Template not found"}), 404
        lc = row["layout_config"]
        whitelist = _job_logs_detail_tags_whitelist(lc)
        if whitelist is not None:
            tag_names = whitelist
        else:
            tag_names = _extract_tag_names_from_layout_config(lc)
        return jsonify({"data": tag_names}), 200
    except Exception as e:
        logger.exception("orders/layout-tags/%s failed: %s", template_id, e)
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
                SELECT o.id, o.template_id, o.order_name, o.order_number,
                       o.start_time, o.end_time, o.status, o.duration_seconds,
                       o.created_at,
                       t.name AS template_name, t.order_prefix
                FROM dynamic_orders o
                JOIN report_builder_templates t ON t.id = o.template_id
                WHERE o.id = %s
            """, (order_id,))
            row = cur.fetchone()

        if not row:
            return jsonify({"error": "Order not found"}), 404
        return jsonify({"data": _serialize_order_row(row)}), 200
    except Exception as e:
        logger.exception("orders/jobs/<id> failed: %s", e)
        return jsonify({"error": str(e)}), 500
