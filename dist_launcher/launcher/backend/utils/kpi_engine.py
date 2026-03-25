"""
KPI Calculation Engine (KPI_ENGINE_PLAN.md Phase 2).

Loads kpi_config + kpi_tag_mapping, fetches historian data, aggregates by tag,
builds alias_name -> value (or tag_name -> value when no mappings), evaluates formula.
Supports current (latest snapshot) and historical (aggregated over range).
When kpi_tag_mapping is empty, formula variables are treated as tag names (no alias).
"""

import logging
import re
from contextlib import closing
from typing import Any, Callable, Dict, List, Optional, Tuple

from psycopg2.extras import RealDictCursor

from utils.kpi_formula import safe_evaluate
from utils.tag_reader import read_all_tags

logger = logging.getLogger(__name__)

# Match valid formula identifiers (variable names): letter or underscore, then alphanumeric/underscore
_FORMULA_IDENTIFIER_RE = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b")


def extract_formula_identifiers(expression: str) -> List[str]:
    """Extract variable-like identifiers from a formula (e.g. 'flowrate/2' -> ['flowrate'])."""
    if not expression or not expression.strip():
        return []
    seen = set()
    out = []
    for m in _FORMULA_IDENTIFIER_RE.finditer(expression):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def resolve_tag_names_to_ids(get_db: Callable, tag_names: List[str]) -> Dict[str, int]:
    """Resolve tag_name -> tag_id via tags table. Returns { tag_name: tag_id } for found tags."""
    if not tag_names:
        return {}
    try:
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                "SELECT id, tag_name FROM tags WHERE is_active = TRUE AND tag_name = ANY(%s)",
                (list(tag_names),),
            )
            rows = cur.fetchall()
            return {r["tag_name"]: int(r["id"]) for r in rows}
    except Exception as e:
        logger.exception("resolve_tag_names_to_ids failed: %s", e)
        return {}


def get_kpi_configs_with_mappings(
    get_db: Callable,
    layout_id: Optional[int] = None,
    active_only: bool = True,
) -> List[Dict[str, Any]]:
    """
    Load kpi_config rows with their kpi_tag_mapping (alias_name -> tag_id).
    If layout_id is None, return plant-wide KPIs (layout_id IS NULL) and KPIs for all layouts.
    Returns list of dicts: id, kpi_name, layout_id, formula_expression, aggregation_type, unit, mappings [{alias_name, tag_id}, ...].
    """
    try:
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            sql = """
                SELECT id, kpi_name, layout_id, formula_expression, aggregation_type, unit, is_active
                FROM kpi_config
                WHERE 1=1
            """
            params = []
            if active_only:
                sql += " AND is_active = TRUE"
            if layout_id is not None:
                sql += " AND (layout_id IS NULL OR layout_id = %s)"
                params.append(layout_id)
            sql += " ORDER BY layout_id NULLS FIRST, id"
            cur.execute(sql, params)
            rows = cur.fetchall()

            out = []
            for r in rows:
                cur2 = conn.cursor(cursor_factory=RealDictCursor)
                cur2.execute(
                    """
                    SELECT alias_name, tag_id FROM kpi_tag_mapping WHERE kpi_id = %s
                    """,
                    (r["id"],),
                )
                mappings = [dict(m) for m in cur2.fetchall()]
                out.append(
                    {
                        "id": r["id"],
                        "kpi_name": r["kpi_name"],
                        "layout_id": r["layout_id"],
                        "formula_expression": r["formula_expression"],
                        "aggregation_type": r["aggregation_type"] or "instant",
                        "unit": r["unit"],
                        "mappings": mappings,
                    }
                )
            return out
    except Exception as e:
        logger.exception("get_kpi_configs_with_mappings failed: %s", e)
        return []


def get_kpi_tag_names_for_layout(
    get_db: Callable,
    layout_id: int,
) -> set:
    """
    Return the set of tag names used by any KPI configured for this layout.
    Used so the monitor worker can include these tags in tag_history without
    requiring them to appear in layout tables.
    """
    tag_names = set()
    try:
        configs = get_kpi_configs_with_mappings(get_db, layout_id=layout_id)
        tag_ids_from_mappings = set()
        for c in configs:
            mappings = c.get("mappings") or []
            if mappings:
                for m in mappings:
                    tid = m.get("tag_id")
                    if tid is not None:
                        tag_ids_from_mappings.add(int(tid))
            else:
                identifiers = extract_formula_identifiers(c.get("formula_expression") or "")
                tag_names.update(identifiers)
        if tag_ids_from_mappings:
            with closing(get_db()) as conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(
                    "SELECT tag_name FROM tags WHERE is_active = TRUE AND id = ANY(%s)",
                    (list(tag_ids_from_mappings),),
                )
                for row in cur.fetchall():
                    if row.get("tag_name"):
                        tag_names.add(row["tag_name"])
        return tag_names
    except Exception as e:
        logger.exception("get_kpi_tag_names_for_layout failed: %s", e)
        return set()


def get_latest_tag_values(
    get_db: Callable,
    layout_id: int,
    tag_ids: List[int],
) -> Dict[int, float]:
    """
    Get latest value per tag from tag_history for the given layout.
    Returns {tag_id: value}. Uses DISTINCT ON (tag_id) ... ORDER BY tag_id, timestamp DESC.
    """
    if not tag_ids:
        return {}
    try:
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                SELECT DISTINCT ON (tag_id) tag_id, value
                FROM tag_history
                WHERE layout_id = %s AND tag_id = ANY(%s)
                ORDER BY tag_id, "timestamp" DESC
                """,
                (layout_id, tag_ids),
            )
            rows = cur.fetchall()
            return {int(r["tag_id"]): float(r["value"]) for r in rows}
    except Exception as e:
        logger.exception("get_latest_tag_values failed: %s", e)
        return {}


def get_current_tag_values_from_plc(
    get_db: Callable,
    layout_id: int,
) -> Dict[int, float]:
    """
    Get current tag values from PLC for all tags used by KPIs for this layout.
    Used for live KPI display so values show without requiring tag_history or publish.
    Returns {tag_id: value}. Uses 0.0 for missing or failed reads.
    """
    tag_names = get_kpi_tag_names_for_layout(get_db, layout_id)
    if not tag_names:
        return {}
    try:
        plc_values = read_all_tags(tag_names=list(tag_names), db_connection_func=get_db)
        name_to_id = resolve_tag_names_to_ids(get_db, list(tag_names))
        result = {}
        for name, tid in name_to_id.items():
            v = plc_values.get(name)
            if v is None:
                result[tid] = 0.0
            elif isinstance(v, (int, float)):
                result[tid] = float(v)
            else:
                try:
                    result[tid] = float(v)
                except (TypeError, ValueError):
                    result[tid] = 0.0
        return result
    except Exception as e:
        logger.exception("get_current_tag_values_from_plc failed: %s", e)
        return {}


def get_aggregated_tag_values(
    get_db: Callable,
    layout_id: int,
    tag_ids: List[int],
    from_ts: str,
    to_ts: str,
    use_archive: bool = True,
) -> Tuple[Dict[int, float], Dict[int, bool]]:
    """
    Get aggregated value per tag over the time range.
    If use_archive: use tag_history_archive (hourly), aggregate SUM(value_delta) for counters, AVG(value) otherwise.
    Else: use tag_history raw, same logic.
    Returns (tag_id -> value, tag_id -> is_counter).
    """
    if not tag_ids:
        return {}, {}

    try:
        with closing(get_db()) as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            if use_archive:
                cur.execute(
                    """
                    SELECT a.tag_id, BOOL_OR(a.is_counter) AS is_counter,
                           CASE WHEN BOOL_OR(a.is_counter) THEN SUM(COALESCE(a.value_delta, 0)) ELSE AVG(a.value) END AS agg_value
                    FROM tag_history_archive a
                    WHERE a.layout_id = %s AND a.tag_id = ANY(%s)
                      AND a.archive_hour >= %s::timestamp AND a.archive_hour <= %s::timestamp
                    GROUP BY a.tag_id
                    """,
                    (layout_id, tag_ids, from_ts, to_ts),
                )
            else:
                cur.execute(
                    """
                    SELECT h.tag_id, BOOL_OR(h.is_counter) AS is_counter,
                           CASE WHEN BOOL_OR(h.is_counter) THEN SUM(COALESCE(h.value_delta, 0)) ELSE AVG(h.value) END AS agg_value
                    FROM tag_history h
                    WHERE h.layout_id = %s AND h.tag_id = ANY(%s)
                      AND h."timestamp" >= %s::timestamp AND h."timestamp" <= %s::timestamp
                    GROUP BY h.tag_id
                    """,
                    (layout_id, tag_ids, from_ts, to_ts),
                )

            rows = cur.fetchall()
            values = {}
            is_counter_map = {}
            for r in rows:
                tid = int(r["tag_id"])
                val = r.get("agg_value")
                values[tid] = float(val) if val is not None else 0.0
                is_counter_map[tid] = bool(r.get("is_counter"))
            return values, is_counter_map
    except Exception as e:
        logger.exception("get_aggregated_tag_values failed: %s", e)
        return {}, {}


def alias_values_from_tag_values(
    mappings: List[Dict[str, Any]],
    tag_id_to_value: Dict[int, float],
) -> Dict[str, float]:
    """Build {alias_name: value} from mappings and tag_id -> value."""
    out = {}
    for m in mappings:
        alias = m.get("alias_name")
        tag_id = m.get("tag_id")
        if alias is not None and tag_id is not None:
            out[alias] = tag_id_to_value.get(int(tag_id), 0.0)
    return out


def _build_values_for_config(
    c: Dict[str, Any],
    tag_values: Dict[int, float],
    get_db: Optional[Callable] = None,
) -> Dict[str, float]:
    """Build variable name -> value for one KPI: from mappings (alias) or from formula identifiers (tag names)."""
    mappings = c.get("mappings") or []
    if mappings:
        return alias_values_from_tag_values(mappings, tag_values)
    # No mappings: treat formula variables as tag names
    identifiers = extract_formula_identifiers(c.get("formula_expression") or "")
    if not identifiers or not get_db:
        return {}
    name_to_id = resolve_tag_names_to_ids(get_db, identifiers)
    return {name: tag_values.get(tid, 0.0) for name, tid in name_to_id.items()}


def calculate_current_kpis(
    get_db: Callable,
    layout_id: int,
) -> List[Dict[str, Any]]:
    """
    Calculate current (instant) KPI values from PLC (live); no tag_history or publish required.
    If a KPI has no tag_mappings, formula variables are treated as tag names (e.g. flowrate/2).
    Returns list of {kpi_id, kpi_name, value, unit, formula_expression, aggregation_type}.
    """
    configs = get_kpi_configs_with_mappings(get_db, layout_id=layout_id)
    if not configs:
        return []

    tag_values = get_current_tag_values_from_plc(get_db, layout_id)
    results = []
    for c in configs:
        alias_vals = _build_values_for_config(c, tag_values, get_db)
        value = safe_evaluate(c["formula_expression"], alias_vals)
        results.append(
            {
                "kpi_id": c["id"],
                "kpi_name": c["kpi_name"],
                "value": value,
                "unit": c["unit"],
                "formula_expression": c["formula_expression"],
                "aggregation_type": c["aggregation_type"],
            }
        )
    return results


def calculate_historical_kpis(
    get_db: Callable,
    layout_id: int,
    from_ts: str,
    to_ts: str,
    use_archive: bool = True,
) -> List[Dict[str, Any]]:
    """
    Calculate KPI values over a time range using aggregated historian data.
    If a KPI has no tag_mappings, formula variables are treated as tag names.
    Returns list of {kpi_id, kpi_name, value, unit, formula_expression, aggregation_type}.
    """
    configs = get_kpi_configs_with_mappings(get_db, layout_id=layout_id)
    if not configs:
        return []

    all_tag_ids = []
    for c in configs:
        for m in c.get("mappings") or []:
            tid = m.get("tag_id")
            if tid is not None:
                all_tag_ids.append(int(tid))
        if not (c.get("mappings")):
            identifiers = extract_formula_identifiers(c.get("formula_expression") or "")
            if identifiers:
                name_to_id = resolve_tag_names_to_ids(get_db, identifiers)
                all_tag_ids.extend(name_to_id.values())
    all_tag_ids = list(set(all_tag_ids))

    tag_values, _ = get_aggregated_tag_values(
        get_db, layout_id, all_tag_ids, from_ts, to_ts, use_archive=use_archive
    )
    results = []
    for c in configs:
        alias_vals = _build_values_for_config(c, tag_values, get_db)
        value = safe_evaluate(c["formula_expression"], alias_vals)
        results.append(
            {
                "kpi_id": c["id"],
                "kpi_name": c["kpi_name"],
                "value": value,
                "unit": c["unit"],
                "formula_expression": c["formula_expression"],
                "aggregation_type": c["aggregation_type"],
            }
        )
    return results
