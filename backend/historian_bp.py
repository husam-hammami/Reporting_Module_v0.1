"""
Historian Blueprint (Phase 3 — Single Historian Migration)

Report/history API reading from tag_history and tag_history_archive.
Use env REPORT_USE_HISTORIAN=true to prefer historian for report consumers.

Endpoints:
  GET /historian/history      — raw per-sample data (layout_id required, backward compat)
  GET /historian/archive      — hourly aggregated data (layout_id required, backward compat)
  GET /historian/by-tags      — tag-name-based query (no layout_id, for Report Builder)
  GET /historian/time-series  — time-series arrays for chart rendering (auto-downsampled)
"""

import logging
import sys
from contextlib import closing
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

historian_bp = Blueprint("historian_bp", __name__)

_cached_get_db_connection = None


def _pick_value(row):
    """
    For tag_history / tag_history_archive rows, choose the right value column:
      - String rows  (value IS NULL, value_text IS NOT NULL) → return value_text.
      - Numeric rows                                          → return value (DOUBLE PRECISION).
    """
    if row is None:
        return None
    try:
        v = row["value"]
    except (KeyError, TypeError):
        v = None
    try:
        vt = row["value_text"]
    except (KeyError, TypeError):
        vt = None
    if v is None and vt is not None and vt != "":
        return vt
    return v


def _parse_iso_to_naive_local(iso_str):
    """
    Parse an ISO timestamp string and return a naive datetime in the server's local time.
    Handles:
      - '2026-02-20T00:00:00.000Z' (UTC) → converted to local time
      - '2026-02-20T00:00:00+04:00' (explicit tz) → converted to local time
      - '2026-02-20T00:00:00' (naive) → used as-is (assumed local)
    This ensures the query matches tag_history.timestamp (stored as naive local time).
    """
    if not iso_str:
        return iso_str
    s = iso_str.strip()
    try:
        # Python's fromisoformat doesn't handle 'Z' suffix before 3.11
        if s.endswith('Z') or s.endswith('z'):
            s = s[:-1] + '+00:00'
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            # Convert from UTC (or whatever tz) to local system time, then strip tz
            dt = dt.astimezone().replace(tzinfo=None)
        return dt.isoformat()
    except (ValueError, TypeError):
        # Can't parse, return original and let PostgreSQL handle it
        return iso_str


def _get_db_connection():
    """Get database connection, avoiding circular imports (same pattern as live_monitor_bp)."""
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


def _report_use_historian():
    """Feature flag: use historian for report/history reads (default True). When False, return 503 so callers use legacy layout tables."""
    import os
    val = (request.args.get("use_historian") or request.headers.get("X-Report-Use-Historian") or
           os.environ.get("REPORT_USE_HISTORIAN", "true"))
    return str(val).lower() in ("1", "true", "yes")


@historian_bp.route("/historian/history", methods=["GET"])
@login_required
def get_history():
    """
    Get raw (per-sample) tag history from tag_history.
    Query params: layout_id (required), from (required ISO timestamp), to (required), tag_ids (optional comma list).
    Returns rows with tag_id, tag_name, value, timestamp, unit, quality_code, order_name.
    Controlled by REPORT_USE_HISTORIAN (env); when false returns 503 so callers can use legacy.
    """
    if not _report_use_historian():
        return jsonify({"error": "Historian reports disabled (REPORT_USE_HISTORIAN=false)", "use_legacy": True}), 503
    layout_id = request.args.get("layout_id", type=int)
    from_ts = _parse_iso_to_naive_local(request.args.get("from"))
    to_ts = _parse_iso_to_naive_local(request.args.get("to"))
    tag_ids_param = request.args.get("tag_ids")

    if layout_id is None:
        return jsonify({"error": "layout_id is required"}), 400
    if not from_ts or not to_ts:
        return jsonify({"error": "from and to (ISO timestamps) are required"}), 400

    tag_ids = None
    if tag_ids_param:
        try:
            tag_ids = [int(x.strip()) for x in tag_ids_param.split(",") if x.strip()]
        except ValueError:
            return jsonify({"error": "tag_ids must be comma-separated integers"}), 400

    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            # tag_history JOIN tags for tag_name, unit
            sql = """
                SELECT h.tag_id, t.tag_name, t.unit, h.value, h.value_text, h.timestamp, h.quality_code, h.order_name
                FROM tag_history h
                JOIN tags t ON t.id = h.tag_id
                WHERE h.layout_id = %s AND h.timestamp >= %s::timestamp AND h.timestamp <= %s::timestamp
            """
            params = [layout_id, from_ts, to_ts]
            if tag_ids:
                sql += " AND h.tag_id = ANY(%s)"
                params.append(tag_ids)
            sql += " ORDER BY h.timestamp, h.tag_id"

            cur.execute(sql, params)
            rows = cur.fetchall()

        out = [dict(r) for r in rows]
        return jsonify({"data": out, "source": "historian"}), 200
    except Exception as e:
        logger.exception("historian/history failed: %s", e)
        return jsonify({"error": str(e)}), 500


@historian_bp.route("/historian/archive", methods=["GET"])
@login_required
def get_archive():
    """
    Get hourly aggregated tag history from tag_history_archive.
    Query params: layout_id (required), from (required), to (required), tag_ids (optional comma list).
    Returns rows with tag_id, tag_name, value, archive_hour, unit, order_name.
    Controlled by REPORT_USE_HISTORIAN (env); when false returns 503 so callers can use legacy.
    """
    if not _report_use_historian():
        return jsonify({"error": "Historian reports disabled (REPORT_USE_HISTORIAN=false)", "use_legacy": True}), 503
    layout_id = request.args.get("layout_id", type=int)
    from_ts = _parse_iso_to_naive_local(request.args.get("from"))
    to_ts = _parse_iso_to_naive_local(request.args.get("to"))
    tag_ids_param = request.args.get("tag_ids")

    if layout_id is None:
        return jsonify({"error": "layout_id is required"}), 400
    if not from_ts or not to_ts:
        return jsonify({"error": "from and to (ISO timestamps) are required"}), 400

    tag_ids = None
    if tag_ids_param:
        try:
            tag_ids = [int(x.strip()) for x in tag_ids_param.split(",") if x.strip()]
        except ValueError:
            return jsonify({"error": "tag_ids must be comma-separated integers"}), 400

    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            sql = """
                SELECT a.tag_id, t.tag_name, t.unit, a.value, a.value_text, a.archive_hour, a.order_name, a.quality_code
                FROM tag_history_archive a
                JOIN tags t ON t.id = a.tag_id
                WHERE a.layout_id = %s AND a.archive_hour >= %s::timestamp AND a.archive_hour <= %s::timestamp
            """
            params = [layout_id, from_ts, to_ts]
            if tag_ids:
                sql += " AND a.tag_id = ANY(%s)"
                params.append(tag_ids)
            sql += " ORDER BY a.archive_hour, a.tag_id"

            cur.execute(sql, params)
            rows = cur.fetchall()

            # Fallback: if no rows in range (e.g. client date/timezone mismatch), return latest archive data for this layout
            if not rows:
                fallback_sql = """
                    SELECT a.tag_id, t.tag_name, t.unit, a.value, a.value_text, a.archive_hour, a.order_name, a.quality_code
                    FROM tag_history_archive a
                    JOIN tags t ON t.id = a.tag_id
                    WHERE a.layout_id = %s
                    ORDER BY a.archive_hour DESC, a.tag_id
                    LIMIT 500
                """
                cur.execute(fallback_sql, (layout_id,))
                rows = cur.fetchall()

        out = [dict(r) for r in rows]
        return jsonify({"data": out, "source": "historian_archive"}), 200
    except Exception as e:
        logger.exception("historian/archive failed: %s", e)
        return jsonify({"error": str(e)}), 500


@historian_bp.route("/historian/by-tags", methods=["GET"])
@login_required
def get_by_tags():
    """
    Get historical tag values by tag names (no layout_id required).
    Used by Report Builder's ReportViewer for historical time presets.

    Query params:
      tag_names or tags (required): comma-separated tag names
      from (required): ISO timestamp
      to (required): ISO timestamp
      aggregation (optional): last|avg|min|max|sum|delta|count|auto (default: last)
        - auto: counter tags (is_counter=true) → SUM(value_delta), others → last value

    Returns: { data: { tagName: value, ... }, source: "historian" }
    """
    tag_names_param = request.args.get("tag_names") or request.args.get("tags")
    from_ts = _parse_iso_to_naive_local(request.args.get("from"))
    to_ts = _parse_iso_to_naive_local(request.args.get("to"))
    aggregation = request.args.get("aggregation", "last").lower()

    if not tag_names_param:
        return jsonify({"error": "tag_names is required (comma-separated)"}), 400
    if not from_ts or not to_ts:
        return jsonify({"error": "from and to (ISO timestamps) are required"}), 400
    if aggregation not in ("last", "first", "avg", "min", "max", "sum", "delta", "count", "auto"):
        return jsonify({"error": "aggregation must be one of: last, first, avg, min, max, sum, delta, count, auto"}), 400

    tag_names = [n.strip() for n in tag_names_param.split(",") if n.strip()]
    if not tag_names:
        return jsonify({"error": "tag_names must contain at least one tag name"}), 400

    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            # Resolve tag names to IDs (+ is_counter for auto mode)
            cur.execute("SELECT id, tag_name, COALESCE(is_counter, false) AS is_counter FROM tags WHERE tag_name = ANY(%s) AND is_active = true", (tag_names,))
            tag_rows = cur.fetchall()
            tag_map = {row["tag_name"]: row["id"] for row in tag_rows}
            counter_ids = {row["id"] for row in tag_rows if row["is_counter"]}

            if not tag_map:
                return jsonify({"data": {}, "source": "historian", "message": "No matching tags found"}), 200

            tag_ids = list(tag_map.values())
            id_to_name = {v: k for k, v in tag_map.items()}

            result = {}

            if aggregation == "auto":
                # Smart aggregation using tag_history_archive (hourly):
                #   counter tags → SUM(value_delta), others → last value
                non_counter_ids = [tid for tid in tag_ids if tid not in counter_ids]
                counter_id_list = [tid for tid in tag_ids if tid in counter_ids]

                # Non-counters: last value from tag_history_archive (numeric or text)
                if non_counter_ids:
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value, a.value_text
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour DESC
                    """, (non_counter_ids, from_ts, to_ts))
                    for row in cur.fetchall():
                        name = id_to_name.get(row["tag_id"])
                        picked = _pick_value(row)
                        if name and picked is not None:
                            result[name] = picked

                # Counters: last − first from tag_history_archive value column.
                # SUM(value_delta) is unreliable when value_delta is NULL after archiving.
                if counter_id_list:
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour ASC
                    """, (counter_id_list, from_ts, to_ts))
                    counter_first = {row["tag_id"]: row["value"] for row in cur.fetchall()}
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour DESC
                    """, (counter_id_list, from_ts, to_ts))
                    for row in cur.fetchall():
                        name = id_to_name.get(row["tag_id"])
                        first = counter_first.get(row["tag_id"])
                        if name and first is not None and row["value"] is not None:
                            result[name] = float(row["value"]) - float(first)

            elif aggregation == "last":
                cur.execute("""
                    SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value, h.value_text
                    FROM tag_history h
                    WHERE h.tag_id = ANY(%s)
                      AND h."timestamp" >= %s::timestamp
                      AND h."timestamp" <= %s::timestamp
                    ORDER BY h.tag_id, h."timestamp" DESC
                """, (tag_ids, from_ts, to_ts))
                for row in cur.fetchall():
                    name = id_to_name.get(row["tag_id"])
                    if name:
                        result[name] = _pick_value(row)
            elif aggregation == "first":
                cur.execute("""
                    SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value, h.value_text
                    FROM tag_history h
                    WHERE h.tag_id = ANY(%s)
                      AND h."timestamp" >= %s::timestamp
                      AND h."timestamp" <= %s::timestamp
                    ORDER BY h.tag_id, h."timestamp" ASC
                """, (tag_ids, from_ts, to_ts))
                for row in cur.fetchall():
                    name = id_to_name.get(row["tag_id"])
                    if name:
                        result[name] = _pick_value(row)
            elif aggregation == "delta":
                cur.execute("""
                    SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value
                    FROM tag_history h
                    WHERE h.tag_id = ANY(%s)
                      AND h."timestamp" >= %s::timestamp
                      AND h."timestamp" <= %s::timestamp
                    ORDER BY h.tag_id, h."timestamp" ASC
                """, (tag_ids, from_ts, to_ts))
                first_vals = {row["tag_id"]: row["value"] for row in cur.fetchall()}
                cur.execute("""
                    SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value
                    FROM tag_history h
                    WHERE h.tag_id = ANY(%s)
                      AND h."timestamp" >= %s::timestamp
                      AND h."timestamp" <= %s::timestamp
                    ORDER BY h.tag_id, h."timestamp" DESC
                """, (tag_ids, from_ts, to_ts))
                for row in cur.fetchall():
                    name = id_to_name.get(row["tag_id"])
                    first = first_vals.get(row["tag_id"])
                    if name and first is not None and row["value"] is not None:
                        result[name] = float(row["value"]) - float(first)
            else:
                agg_fn = {"avg": "AVG", "min": "MIN", "max": "MAX", "sum": "SUM", "count": "COUNT"}[aggregation]
                cur.execute(f"""
                    SELECT h.tag_id, {agg_fn}(h.value) AS agg_value
                    FROM tag_history h
                    WHERE h.tag_id = ANY(%s)
                      AND h."timestamp" >= %s::timestamp
                      AND h."timestamp" <= %s::timestamp
                    GROUP BY h.tag_id
                """, (tag_ids, from_ts, to_ts))
                for row in cur.fetchall():
                    name = id_to_name.get(row["tag_id"])
                    if name:
                        result[name] = row["agg_value"]

            # Fallback to tag_history_archive for tags MISSING from result.
            # Previous logic used `if not result` which skipped archive when
            # even one tag had data — leaving other tags silently empty.
            found_names = set(result.keys())
            all_names = set(id_to_name.values())
            missing_names = all_names - found_names
            if missing_names and aggregation != "auto":
                missing_ids = [tid for tid, nm in id_to_name.items() if nm in missing_names]
                if aggregation == "last":
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value, a.value_text
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour DESC
                    """, (missing_ids, from_ts, to_ts))
                    for row in cur.fetchall():
                        name = id_to_name.get(row["tag_id"])
                        picked = _pick_value(row)
                        if name and picked is not None:
                            result[name] = picked
                elif aggregation == "first":
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value, a.value_text
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour ASC
                    """, (missing_ids, from_ts, to_ts))
                    for row in cur.fetchall():
                        name = id_to_name.get(row["tag_id"])
                        picked = _pick_value(row)
                        if name and picked is not None:
                            result[name] = picked
                elif aggregation == "delta":
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour ASC
                    """, (missing_ids, from_ts, to_ts))
                    arch_first = {row["tag_id"]: row["value"] for row in cur.fetchall()}
                    cur.execute("""
                        SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        ORDER BY a.tag_id, a.archive_hour DESC
                    """, (missing_ids, from_ts, to_ts))
                    for row in cur.fetchall():
                        name = id_to_name.get(row["tag_id"])
                        first = arch_first.get(row["tag_id"])
                        if name and first is not None and row["value"] is not None:
                            result[name] = float(row["value"]) - float(first)
                else:
                    agg_fn = {"avg": "AVG", "min": "MIN", "max": "MAX", "sum": "SUM", "count": "COUNT"}[aggregation]
                    cur.execute(f"""
                        SELECT a.tag_id, {agg_fn}(a.value) AS agg_value
                        FROM tag_history_archive a
                        WHERE a.tag_id = ANY(%s)
                          AND a.archive_hour >= %s::timestamp
                          AND a.archive_hour <= %s::timestamp
                        GROUP BY a.tag_id
                    """, (missing_ids, from_ts, to_ts))
                    for row in cur.fetchall():
                        name = id_to_name.get(row["tag_id"])
                        if name and row["agg_value"] is not None:
                            result[name] = row["agg_value"]

        return jsonify({"data": result, "source": "historian", "tags_requested": len(tag_names), "tags_found": len(result)}), 200
    except Exception as e:
        logger.exception("historian/by-tags failed: %s", e)
        return jsonify({"error": str(e)}), 500


@historian_bp.route("/historian/row-segments", methods=["POST"])
@login_required
def get_row_segments():
    """
    Compute silo-ID segmentation for one or more paginated table rows.

    POST body (JSON):
    {
      "from": "2026-04-27T05:00:00.000Z",
      "to":   "2026-04-28T05:00:00.000Z",
      "rows": [
        {
          "row_id": "abc123",
          "segment_tag": "G01_DEST",
          "min_segment_seconds": 60,
          "ignore_values": [0],
          "companion_cells": [
            {"tagName": "G01_REAL02",  "aggregation": "delta"},
            {"tagName": "G01_MatName", "aggregation": "last"}
          ]
        }
      ]
    }

    Returns:
    {
      "rows": {
        "abc123": [
          {
            "t_start": "2026-04-27T06:00:00",
            "t_end":   "2026-04-27T08:30:00",
            "silo_id": 101,
            "values": [
              {"tagName": "G01_REAL02",  "agg": "delta", "value": 12.3,    "first": 1000.0, "last": 1012.3},
              {"tagName": "G01_REAL02",  "agg": "first", "value": 1000.0,  "first": 1000.0, "last": 1012.3},
              {"tagName": "G01_REAL02",  "agg": "last",  "value": 1012.3,  "first": 1000.0, "last": 1012.3},
              {"tagName": "G01_MatName", "agg": "last",  "value": "Barley", "first": "Barley", "last": "Barley"}
            ]
          }, ...
        ]
      }
    }
    """
    from segment_engine import compute_row_segments

    body = request.get_json(silent=True) or {}
    from_raw = body.get("from")
    to_raw = body.get("to")
    rows_input = body.get("rows")

    if not from_raw or not to_raw:
        return jsonify({"error": "from and to are required"}), 400
    if not isinstance(rows_input, list) or len(rows_input) == 0:
        return jsonify({"error": "rows must be a non-empty list"}), 400

    from_ts = _parse_iso_to_naive_local(from_raw)
    to_ts = _parse_iso_to_naive_local(to_raw)

    # Convert to datetime objects for segment_engine
    try:
        from datetime import datetime as _dt
        from_dt = _dt.fromisoformat(from_ts) if isinstance(from_ts, str) else from_ts
        to_dt = _dt.fromisoformat(to_ts) if isinstance(to_ts, str) else to_ts
    except Exception:
        return jsonify({"error": "Invalid from/to timestamps"}), 400

    result = {}
    for row_def in rows_input:
        row_id = row_def.get("row_id")
        segment_tag = row_def.get("segment_tag")
        if not row_id or not segment_tag:
            continue

        min_sec = int(row_def.get("min_segment_seconds", 60))
        ignore_values = row_def.get("ignore_values", [0])
        companion_cells = row_def.get("companion_cells", [])
        merge_duplicates = bool(row_def.get("merge_duplicates", True))

        try:
            segments = compute_row_segments(
                segment_tag_name=segment_tag,
                companion_cells=companion_cells,
                from_dt=from_dt,
                to_dt=to_dt,
                min_segment_seconds=min_sec,
                ignore_values=ignore_values,
                merge_duplicates=merge_duplicates,
            )
        except Exception as e:
            logger.exception("row-segments: compute failed for row %s: %s", row_id, e)
            segments = []

        # Serialise datetimes + values list to JSON-friendly form
        serialised = []
        for seg in segments:
            values_out = []
            for entry in seg.get("values", []):
                values_out.append({
                    "tagName": entry.get("tagName"),
                    "agg":     entry.get("agg"),
                    "value":   _serialise_value(entry.get("value")),
                    "first":   _serialise_value(entry.get("first")),
                    "last":    _serialise_value(entry.get("last")),
                })
            serialised.append({
                "t_start": seg["t_start"].isoformat() if hasattr(seg["t_start"], "isoformat") else str(seg["t_start"]),
                "t_end":   seg["t_end"].isoformat()   if hasattr(seg["t_end"],   "isoformat") else str(seg["t_end"]),
                "silo_id": seg["silo_id"],
                "values":  values_out,
            })
        result[row_id] = serialised

    return jsonify({"rows": result}), 200


def _serialise_value(v):
    """Convert a DB value to JSON-serialisable form.
    Numbers (including Decimal) → int if whole, else float.
    Strings remain as strings.
    """
    if v is None:
        return None
    # Already a string: keep as-is
    if isinstance(v, str):
        return v
    # Already an int/float: normalise (Decimal → float)
    if isinstance(v, (int, float)):
        try:
            return int(v) if float(v) == int(float(v)) else float(v)
        except (TypeError, ValueError):
            return v
    # psycopg2 may return Decimal; try float
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return str(v)


@historian_bp.route("/historian/time-series", methods=["GET"])
@login_required
def get_time_series():
    """
    Get raw time-series data for chart rendering (array of {t, v} per tag).
    Used by Report Builder charts in historical (non-live) mode.

    Query params:
      tag_names (required): comma-separated tag names
      from (required): ISO timestamp
      to (required): ISO timestamp
      max_points (optional): max data points per tag (default 500)

    Returns: { data: { tagName: [{t: epoch_ms, v: number}, ...], ... } }
    """
    tag_names_param = request.args.get("tag_names") or request.args.get("tags")
    from_ts = _parse_iso_to_naive_local(request.args.get("from"))
    to_ts = _parse_iso_to_naive_local(request.args.get("to"))
    max_points = request.args.get("max_points", 500, type=int)

    if not tag_names_param:
        return jsonify({"error": "tag_names is required (comma-separated)"}), 400
    if not from_ts or not to_ts:
        return jsonify({"error": "from and to (ISO timestamps) are required"}), 400

    tag_names = [n.strip() for n in tag_names_param.split(",") if n.strip()]
    if not tag_names:
        return jsonify({"error": "tag_names must contain at least one tag name"}), 400

    max_points = max(10, min(max_points, 5000))  # clamp to [10, 5000]

    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            # Resolve tag names to IDs
            cur.execute("SELECT id, tag_name FROM tags WHERE tag_name = ANY(%s) AND is_active = true", (tag_names,))
            tag_map = {row["tag_name"]: row["id"] for row in cur.fetchall()}

            if not tag_map:
                return jsonify({"data": {}, "source": "historian_ts", "message": "No matching tags found"}), 200

            tag_ids = list(tag_map.values())
            id_to_name = {v: k for k, v in tag_map.items()}

            result = {}

            # First try: raw tag_history (per-sample data) — numeric only (charts can't plot strings)
            # Count total rows to decide if downsampling is needed
            cur.execute("""
                SELECT COUNT(*) AS cnt
                FROM tag_history h
                WHERE h.tag_id = ANY(%s)
                  AND h."timestamp" >= %s::timestamp
                  AND h."timestamp" <= %s::timestamp
                  AND h.value IS NOT NULL
            """, (tag_ids, from_ts, to_ts))
            total_count = cur.fetchone()["cnt"]

            if total_count > 0:
                if total_count <= max_points * len(tag_ids):
                    # Few enough rows — return raw data
                    cur.execute("""
                        SELECT h.tag_id, h.value,
                               EXTRACT(EPOCH FROM h."timestamp") * 1000 AS t_ms
                        FROM tag_history h
                        WHERE h.tag_id = ANY(%s)
                          AND h."timestamp" >= %s::timestamp
                          AND h."timestamp" <= %s::timestamp
                          AND h.value IS NOT NULL
                        ORDER BY h."timestamp"
                    """, (tag_ids, from_ts, to_ts))
                else:
                    # Too many rows — downsample by bucketing into intervals
                    # Calculate bucket interval: total_seconds / max_points
                    cur.execute("""
                        WITH bounds AS (
                            SELECT EXTRACT(EPOCH FROM (%s::timestamp - %s::timestamp)) AS range_secs
                        )
                        SELECT h.tag_id,
                               AVG(h.value) AS value,
                               AVG(EXTRACT(EPOCH FROM h."timestamp")) * 1000 AS t_ms
                        FROM tag_history h, bounds
                        WHERE h.tag_id = ANY(%s)
                          AND h."timestamp" >= %s::timestamp
                          AND h."timestamp" <= %s::timestamp
                          AND h.value IS NOT NULL
                        GROUP BY h.tag_id,
                                 FLOOR(EXTRACT(EPOCH FROM h."timestamp") / GREATEST(1, bounds.range_secs / %s))
                        ORDER BY t_ms
                    """, (to_ts, from_ts, tag_ids, from_ts, to_ts, max_points))

                for row in cur.fetchall():
                    name = id_to_name.get(row["tag_id"])
                    if name and row["value"] is not None and row["t_ms"] is not None:
                        if name not in result:
                            result[name] = []
                        result[name].append({"t": round(row["t_ms"]), "v": float(row["value"])})

            # Fallback: if no data from tag_history, try tag_history_archive (hourly) — numeric only
            if not result:
                cur.execute("""
                    SELECT a.tag_id, a.value,
                           EXTRACT(EPOCH FROM a.archive_hour) * 1000 AS t_ms
                    FROM tag_history_archive a
                    WHERE a.tag_id = ANY(%s)
                      AND a.archive_hour >= %s::timestamp
                      AND a.archive_hour <= %s::timestamp
                      AND a.value IS NOT NULL
                    ORDER BY a.archive_hour
                """, (tag_ids, from_ts, to_ts))
                for row in cur.fetchall():
                    name = id_to_name.get(row["tag_id"])
                    if name and row["value"] is not None and row["t_ms"] is not None:
                        if name not in result:
                            result[name] = []
                        result[name].append({"t": round(row["t_ms"]), "v": float(row["value"])})

        return jsonify({"data": result, "source": "historian_ts", "tags_requested": len(tag_names), "tags_found": len(result)}), 200
    except Exception as e:
        logger.exception("historian/time-series failed: %s", e)
        return jsonify({"error": str(e)}), 500
