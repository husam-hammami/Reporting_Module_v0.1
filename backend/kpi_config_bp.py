"""
KPI Config Blueprint (KPI_ENGINE_PLAN.md Phase 2)

CRUD for kpi_config and kpi_tag_mapping; KPI values (current + historical).
"""

import json
import logging
import sys
from contextlib import closing

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from utils.kpi_engine import (
    calculate_current_kpis,
    calculate_historical_kpis,
    get_kpi_configs_with_mappings,
)

logger = logging.getLogger(__name__)

kpi_config_bp = Blueprint("kpi_config_bp", __name__)

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
    return _cached_get_db_connection


# ---------- List & Get ----------


@kpi_config_bp.route("/kpi-config", methods=["GET"])
def list_kpi_configs():
    """
    GET /api/kpi-config?layout_id=1
    Returns list of KPI configs with tag mappings. If layout_id omitted, returns all.
    """
    layout_id = request.args.get("layout_id", type=int)
    try:
        get_db = _get_db_connection()
        configs = get_kpi_configs_with_mappings(get_db, layout_id=layout_id)
        return jsonify({"status": "success", "kpis": configs}), 200
    except Exception as e:
        logger.exception("list_kpi_configs failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@kpi_config_bp.route("/kpi-config/<int:kpi_id>", methods=["GET"])
def get_kpi_config(kpi_id):
    """GET /api/kpi-config/<id> — one KPI with mappings."""
    try:
        get_db = _get_db_connection()
        configs = get_kpi_configs_with_mappings(get_db, layout_id=None, active_only=False)
        found = next((c for c in configs if c["id"] == kpi_id), None)
        if not found:
            return jsonify({"status": "error", "message": "KPI not found"}), 404
        return jsonify({"status": "success", "kpi": found}), 200
    except Exception as e:
        logger.exception("get_kpi_config failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500


# ---------- Create ----------


@kpi_config_bp.route("/kpi-config", methods=["POST"])
def create_kpi_config():
    """
    POST /api/kpi-config
    Body: { kpi_name, layout_id?, formula_expression, aggregation_type?, unit?, tag_mappings: [{ alias_name, tag_id }] }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "JSON body required"}), 400
        kpi_name = data.get("kpi_name")
        formula_expression = data.get("formula_expression")
        if not kpi_name or not formula_expression:
            return jsonify({"status": "error", "message": "kpi_name and formula_expression are required"}), 400

        layout_id = data.get("layout_id")
        aggregation_type = data.get("aggregation_type") or "instant"
        unit = data.get("unit") or ""
        tag_mappings = data.get("tag_mappings") or []

        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                INSERT INTO kpi_config (kpi_name, layout_id, formula_expression, aggregation_type, unit)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, kpi_name, layout_id, formula_expression, aggregation_type, unit, is_active, created_at, updated_at
                """,
                (kpi_name, layout_id, formula_expression, aggregation_type, unit),
            )
            row = cur.fetchone()
            kpi_id = row["id"]

            for m in tag_mappings:
                alias_name = m.get("alias_name")
                tag_id = m.get("tag_id")
                if alias_name is not None and tag_id is not None:
                    cur.execute(
                        "INSERT INTO kpi_tag_mapping (kpi_id, tag_id, alias_name) VALUES (%s, %s, %s)",
                        (kpi_id, tag_id, alias_name),
                    )
            conn.commit()

        configs = get_kpi_configs_with_mappings(get_db, layout_id=None, active_only=False)
        created = next((c for c in configs if c["id"] == kpi_id), None)
        return jsonify({"status": "success", "kpi": created or dict(row)}), 201
    except Exception as e:
        logger.exception("create_kpi_config failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500


# ---------- Update ----------


@kpi_config_bp.route("/kpi-config/<int:kpi_id>", methods=["PUT"])
def update_kpi_config(kpi_id):
    """
    PUT /api/kpi-config/<id>
    Body: { kpi_name?, layout_id?, formula_expression?, aggregation_type?, unit?, tag_mappings?: [{ alias_name, tag_id }] }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "JSON body required"}), 400

        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT id FROM kpi_config WHERE id = %s", (kpi_id,))
            if not cur.fetchone():
                return jsonify({"status": "error", "message": "KPI not found"}), 404

            updates = []
            params = []
            for key in ("kpi_name", "layout_id", "formula_expression", "aggregation_type", "unit"):
                if key in data:
                    updates.append(f"{key} = %s")
                    params.append(data[key])
            if updates:
                params.append(kpi_id)
                cur.execute(
                    "UPDATE kpi_config SET " + ", ".join(updates) + ", updated_at = NOW() WHERE id = %s",
                    params,
                )

            if "tag_mappings" in data:
                cur.execute("DELETE FROM kpi_tag_mapping WHERE kpi_id = %s", (kpi_id,))
                for m in data["tag_mappings"] or []:
                    alias_name = m.get("alias_name")
                    tag_id = m.get("tag_id")
                    if alias_name is not None and tag_id is not None:
                        cur.execute(
                            "INSERT INTO kpi_tag_mapping (kpi_id, tag_id, alias_name) VALUES (%s, %s, %s)",
                            (kpi_id, tag_id, alias_name),
                        )
            conn.commit()

        configs = get_kpi_configs_with_mappings(get_db, layout_id=None, active_only=False)
        updated = next((c for c in configs if c["id"] == kpi_id), None)
        return jsonify({"status": "success", "kpi": updated}), 200
    except Exception as e:
        logger.exception("update_kpi_config failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500


# ---------- Delete ----------


@kpi_config_bp.route("/kpi-config/<int:kpi_id>", methods=["DELETE"])
def delete_kpi_config(kpi_id):
    """DELETE /api/kpi-config/<id> — cascade deletes mappings and kpi_history."""
    try:
        get_db = _get_db_connection()
        with closing(get_db()) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM kpi_config WHERE id = %s RETURNING id", (kpi_id,))
            if not cur.fetchone():
                return jsonify({"status": "error", "message": "KPI not found"}), 404
            conn.commit()
        return jsonify({"status": "success", "message": "KPI deleted"}), 200
    except Exception as e:
        logger.exception("delete_kpi_config failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500


# ---------- KPI Values (current + historical) ----------


@kpi_config_bp.route("/kpi-config/values", methods=["GET"])
def get_kpi_values_current():
    """
    GET /api/kpi-config/values?layout_id=1
    Returns current (instant) KPI values using latest snapshot from tag_history.
    """
    layout_id = request.args.get("layout_id", type=int)
    if layout_id is None:
        return jsonify({"status": "error", "message": "layout_id is required"}), 400
    try:
        get_db = _get_db_connection()
        results = calculate_current_kpis(get_db, layout_id)
        return jsonify({"status": "success", "values": results}), 200
    except Exception as e:
        logger.exception("get_kpi_values_current failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@kpi_config_bp.route("/kpi-config/values/historical", methods=["GET"])
def get_kpi_values_historical():
    """
    GET /api/kpi-config/values/historical?layout_id=1&from=...&to=...
    Returns aggregated KPI values over the time range (tag_history_archive by default).
    """
    layout_id = request.args.get("layout_id", type=int)
    from_ts = request.args.get("from")
    to_ts = request.args.get("to")
    use_archive = request.args.get("use_archive", "true").lower() in ("1", "true", "yes")

    if layout_id is None:
        return jsonify({"status": "error", "message": "layout_id is required"}), 400
    if not from_ts or not to_ts:
        return jsonify({"status": "error", "message": "from and to (ISO timestamps) are required"}), 400
    try:
        get_db = _get_db_connection()
        results = calculate_historical_kpis(get_db, layout_id, from_ts, to_ts, use_archive=use_archive)
        return jsonify({"status": "success", "values": results}), 200
    except Exception as e:
        logger.exception("get_kpi_values_historical failed: %s", e)
        return jsonify({"status": "error", "message": str(e)}), 500
