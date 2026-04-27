"""
Silo ID Segmentation Engine
============================
Shared helper for computing silo ID change-based row segments from tag_history.

Used by:
  - historian_bp.py  (POST /api/historian/row-segments)
  - distribution_engine.py (_expand_segment_rows for HTML/XLSX output)

Core function: compute_row_segments()
"""

import logging
import sys
from contextlib import closing
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

_cached_get_db_connection = None

# UI companion aggregations that only apply inside silo_segments rows (same row as driver).
# Stored in layout JSON as silo_*; normalized to first/last/delta for history queries.
_SILO_COMPANION_UI_TO_FETCH = {
    "silo_first": "first",
    "silo_last": "last",
    "silo_delta": "delta",
}


def companion_agg_for_fetch(agg: str) -> str:
    """Map silo_* UI aggregations to historian segment fetch aggregations."""
    if not agg:
        return "last"
    key = str(agg).strip().lower()
    return _SILO_COMPANION_UI_TO_FETCH.get(key, str(agg).strip().lower() or "last")


def companion_agg_base_kind(agg: str) -> str:
    """Same as companion_agg_for_fetch — used for merge/identity logic (silo_delta → delta)."""
    return companion_agg_for_fetch(agg)


def _get_db_connection():
    """Lazy-load the get_db_connection factory from app module (avoids circular imports)."""
    global _cached_get_db_connection
    if _cached_get_db_connection is not None:
        return _cached_get_db_connection
    if "app" not in sys.modules:
        raise ImportError("app module not in sys.modules")
    app_module = sys.modules["app"]
    fn = getattr(app_module, "get_db_connection", None)
    if fn is None or not callable(fn):
        raise ImportError("get_db_connection not available on app module")
    _cached_get_db_connection = fn
    return fn


# ── Internal helpers ─────────────────────────────────────────────────────────

def _is_valid_id(value, ignore_values):
    """Return True if value is a valid (non-null, non-zero, numeric) silo ID."""
    if value is None:
        return False
    try:
        n = float(value)
    except (TypeError, ValueError):
        return False
    return n not in ignore_values


def _build_runs(samples, ignore_values):
    """
    Convert ordered (timestamp, value) samples into run-length encoded segments.

    Each run: {"id": numeric_id, "t_start": datetime, "t_end": datetime}
    Consecutive identical valid IDs are merged into one run.
    Invalid IDs (0, null, etc.) close the current run but don't start a new one.
    """
    runs = []
    current_id = None
    current_start = None
    current_end = None

    for ts, raw_value in samples:
        if not _is_valid_id(raw_value, ignore_values):
            if current_id is not None:
                runs.append({"id": current_id, "t_start": current_start, "t_end": current_end})
                current_id = None
                current_start = None
                current_end = None
            continue

        numeric_id = float(raw_value)
        if numeric_id == current_id:
            current_end = ts
        else:
            if current_id is not None:
                runs.append({"id": current_id, "t_start": current_start, "t_end": current_end})
            current_id = numeric_id
            current_start = ts
            current_end = ts

    if current_id is not None:
        runs.append({"id": current_id, "t_start": current_start, "t_end": current_end})

    return runs


def _remove_blips(runs, min_segment_seconds):
    """
    Remove runs whose duration is less than min_segment_seconds.

    Merge policy:
      - Blip absorbs into the PREVIOUS run (extend its t_end).
      - If the blip is the first run, absorb into the NEXT run.
      - After removal, re-check for newly created blips (repeat until stable).
    """
    if min_segment_seconds <= 0:
        return runs

    changed = True
    while changed:
        changed = False
        result = []
        i = 0
        while i < len(runs):
            run = runs[i]
            duration = (run["t_end"] - run["t_start"]).total_seconds()
            if duration < min_segment_seconds:
                changed = True
                if result:
                    result[-1]["t_end"] = run["t_end"]
                elif i + 1 < len(runs):
                    runs[i + 1]["t_start"] = run["t_start"]
                # else: single blip remaining — just drop it
                i += 1
            else:
                result.append(run)
                i += 1
        runs = result

    return runs


def _query_tag_ids(cur, tag_names):
    """Resolve tag names → ids, returns (tag_map {name: id}, id_to_name {id: name})."""
    cur.execute(
        "SELECT id, tag_name FROM tags WHERE tag_name = ANY(%s) AND is_active = true",
        (list(tag_names),)
    )
    tag_map = {row["tag_name"]: row["id"] for row in cur.fetchall()}
    id_to_name = {v: k for k, v in tag_map.items()}
    return tag_map, id_to_name


def _fetch_segment_tag_samples(cur, tag_id, from_dt, to_dt):
    """
    Fetch all (timestamp, value) samples for a single tag in time range.
    Returns list of (datetime, raw_value) ordered ASC.
    Falls back to tag_history_archive if tag_history is empty.
    """
    cur.execute("""
        SELECT h."timestamp", h.value
        FROM tag_history h
        WHERE h.tag_id = %s
          AND h."timestamp" >= %s::timestamp
          AND h."timestamp" <= %s::timestamp
        ORDER BY h."timestamp" ASC
    """, (tag_id, from_dt, to_dt))
    rows = cur.fetchall()

    if rows:
        return [(row["timestamp"], row["value"]) for row in rows]

    # Archive fallback — hourly granularity
    cur.execute("""
        SELECT a.archive_hour AS "timestamp", a.value
        FROM tag_history_archive a
        WHERE a.tag_id = %s
          AND a.archive_hour >= %s::timestamp
          AND a.archive_hour <= %s::timestamp
        ORDER BY a.archive_hour ASC
    """, (tag_id, from_dt, to_dt))
    rows = cur.fetchall()
    return [(row["timestamp"], row["value"]) for row in rows]


def _fetch_companion_value(cur, tag_id, aggregation, t_start, t_end):
    """
    Fetch a single aggregated value for a companion tag within [t_start, t_end].
    Returns (value, first_value, last_value) — first/last always populated for delta calcs.
    Falls back to archive if no raw history found.

    For first/last, prefers value_text when set (string tags like material name).
    """
    first_val = None
    last_val = None

    def _pick(row):
        """
        Pick the right value column for this row:
          - Numeric rows (value IS NOT NULL) → return numeric value (Weight etc.)
          - String rows  (value IS NULL, value_text IS NOT NULL) → return text (Product etc.)
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

    # Try tag_history first
    cur.execute("""
        SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value, h.value_text
        FROM tag_history h
        WHERE h.tag_id = %s
          AND h."timestamp" >= %s::timestamp
          AND h."timestamp" <= %s::timestamp
        ORDER BY h.tag_id, h."timestamp" ASC
    """, (tag_id, t_start, t_end))
    row = cur.fetchone()
    has_raw = row is not None
    if row:
        first_val = _pick(row)

    cur.execute("""
        SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value, h.value_text
        FROM tag_history h
        WHERE h.tag_id = %s
          AND h."timestamp" >= %s::timestamp
          AND h."timestamp" <= %s::timestamp
        ORDER BY h.tag_id, h."timestamp" DESC
    """, (tag_id, t_start, t_end))
    row = cur.fetchone()
    if row:
        last_val = _pick(row)

    if not has_raw:
        # Archive fallback
        cur.execute("""
            SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value, a.value_text
            FROM tag_history_archive a
            WHERE a.tag_id = %s
              AND a.archive_hour >= %s::timestamp
              AND a.archive_hour <= %s::timestamp
            ORDER BY a.tag_id, a.archive_hour ASC
        """, (tag_id, t_start, t_end))
        row = cur.fetchone()
        if row:
            first_val = _pick(row)

        cur.execute("""
            SELECT DISTINCT ON (a.tag_id) a.tag_id, a.value, a.value_text
            FROM tag_history_archive a
            WHERE a.tag_id = %s
              AND a.archive_hour >= %s::timestamp
              AND a.archive_hour <= %s::timestamp
            ORDER BY a.tag_id, a.archive_hour DESC
        """, (tag_id, t_start, t_end))
        row = cur.fetchone()
        if row:
            last_val = _pick(row)

    # Compute aggregation
    if aggregation in ("avg", "min", "max", "sum", "count"):
        # Try tag_history aggregate
        agg_fn = {"avg": "AVG", "min": "MIN", "max": "MAX", "sum": "SUM", "count": "COUNT"}[aggregation]
        cur.execute(f"""
            SELECT {agg_fn}(h.value) AS agg_value
            FROM tag_history h
            WHERE h.tag_id = %s
              AND h."timestamp" >= %s::timestamp
              AND h."timestamp" <= %s::timestamp
        """, (tag_id, t_start, t_end))
        row = cur.fetchone()
        agg_val = row["agg_value"] if row else None

        if agg_val is None:
            # Archive fallback for aggregation
            cur.execute(f"""
                SELECT {agg_fn}(a.value) AS agg_value
                FROM tag_history_archive a
                WHERE a.tag_id = %s
                  AND a.archive_hour >= %s::timestamp
                  AND a.archive_hour <= %s::timestamp
            """, (tag_id, t_start, t_end))
            row = cur.fetchone()
            agg_val = row["agg_value"] if row else None

        return agg_val, first_val, last_val

    elif aggregation == "delta":
        if first_val is not None and last_val is not None:
            try:
                delta = float(last_val) - float(first_val)
            except (TypeError, ValueError):
                delta = None
        else:
            delta = None
        return delta, first_val, last_val

    elif aggregation == "first":
        return first_val, first_val, last_val

    else:  # last (default)
        return last_val, first_val, last_val


# ── Public API ───────────────────────────────────────────────────────────────

def compute_row_segments(
    segment_tag_name,
    companion_cells,
    from_dt,
    to_dt,
    min_segment_seconds=60,
    ignore_values=None,
    merge_duplicates=True,
    get_conn=None,
):
    """
    Compute silo ID segments for a single template row over [from_dt, to_dt].

    Args:
        segment_tag_name (str): Tag name that drives segmentation (e.g. "G01_DEST").
        companion_cells (list[dict]): Each dict has {"tagName": str, "aggregation": str}.
            These are the other cells in the same row that need per-segment values.
            The same tag MAY appear multiple times with different aggregations — each
            aggregation is preserved separately in the output.
        from_dt: datetime (naive local) — start of time range.
        to_dt: datetime (naive local) — end of time range.
        min_segment_seconds (int): Segments shorter than this are merged into neighbor.
        ignore_values (list): Numeric IDs to ignore (default [0]).
        merge_duplicates (bool): When True, segments sharing the same silo_id AND the same
            non-numeric companion values (e.g. product name) are merged into a single row
            with summed deltas/sums and combined time range.
        get_conn (callable): DB connection factory. Auto-resolved from app module if None.

    Returns:
        list[dict] — ordered by t_start ASC:
        [
          {
            "t_start": datetime,
            "t_end": datetime,
            "silo_id": 101.0,
            "values": [
              {"tagName": "G01_REAL02",  "agg": "delta", "value": 12.3,    "first": 1000.0, "last": 1012.3},
              {"tagName": "G01_REAL02",  "agg": "first", "value": 1000.0,  "first": 1000.0, "last": 1012.3},
              {"tagName": "G01_REAL02",  "agg": "last",  "value": 1012.3,  "first": 1000.0, "last": 1012.3},
              {"tagName": "G01_MatName", "agg": "last",  "value": "Barley", "first": "Barley", "last": "Barley"}
            ]
          }, ...
        ]
    """
    if ignore_values is None:
        ignore_values = [0]

    # Normalise ignore_values to a set of floats so comparison works regardless of int/float
    ignore_set = set()
    for v in ignore_values:
        try:
            ignore_set.add(float(v))
        except (TypeError, ValueError):
            pass

    if get_conn is None:
        get_conn = _get_db_connection()

    try:
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, "_conn") else conn
            from psycopg2.extras import RealDictCursor
            cur = actual_conn.cursor(cursor_factory=RealDictCursor)

            # ── Step 1: Resolve segment tag name → id ──
            cur.execute(
                "SELECT id FROM tags WHERE tag_name = %s AND is_active = true LIMIT 1",
                (segment_tag_name,)
            )
            row = cur.fetchone()
            if not row:
                logger.warning("segment_engine: tag not found: %s", segment_tag_name)
                return []
            seg_tag_id = row["id"]

            # ── Step 2: Fetch all ordered samples for the segment tag ──
            samples = _fetch_segment_tag_samples(cur, seg_tag_id, from_dt, to_dt)
            if not samples:
                logger.debug("segment_engine: no samples for %s in range", segment_tag_name)
                return []

            # ── Step 3: Build run-length encoded segments ──
            runs = _build_runs(samples, ignore_set)
            if not runs:
                return []

            # ── Step 4: Remove blips ──
            runs = _remove_blips(runs, min_segment_seconds)
            if not runs:
                return []

            # ── Step 5: Resolve companion cells per segment ──
            # Pre-resolve companion tag IDs (one tag may appear in multiple cells)
            companion_tag_names = list({c["tagName"] for c in companion_cells if c.get("tagName")})
            if companion_tag_names:
                tag_map, _ = _query_tag_ids(cur, companion_tag_names)
            else:
                tag_map = {}

            # Dedupe (tag, agg) pairs so we don't run identical sub-queries twice.
            seen_pairs = set()
            unique_companions = []
            for cell in companion_cells:
                tag_name = cell.get("tagName")
                agg = cell.get("aggregation", "last") or "last"
                if not tag_name:
                    continue
                key = (tag_name, agg)
                if key in seen_pairs:
                    continue
                seen_pairs.add(key)
                unique_companions.append((tag_name, agg))

            segments = []
            for run in runs:
                t_start = run["t_start"]
                t_end = run["t_end"]

                values_list = []
                for tag_name, agg in unique_companions:
                    companion_tag_id = tag_map.get(tag_name)
                    if companion_tag_id is None:
                        values_list.append({
                            "tagName": tag_name, "agg": agg,
                            "value": None, "first": None, "last": None,
                        })
                        continue
                    try:
                        fetch_agg = companion_agg_for_fetch(agg)
                        val, first_val, last_val = _fetch_companion_value(
                            cur, companion_tag_id, fetch_agg, t_start, t_end
                        )
                        values_list.append({
                            "tagName": tag_name, "agg": agg,
                            "value": val, "first": first_val, "last": last_val,
                        })
                    except Exception as e:
                        logger.warning("segment_engine: companion query failed for %s/%s: %s", tag_name, agg, e)
                        values_list.append({
                            "tagName": tag_name, "agg": agg,
                            "value": None, "first": None, "last": None,
                        })

                segments.append({
                    "t_start": t_start,
                    "t_end": t_end,
                    "silo_id": run["id"],
                    "values": values_list,
                })

            # ── Step 6: Merge duplicate (silo_id, identity) segments ──
            if merge_duplicates and segments:
                segments = merge_segments_by_identity(segments)

            return segments

    except Exception as e:
        logger.exception("segment_engine: compute_row_segments failed: %s", e)
        return []


def _is_identity_value(v):
    """
    Heuristic: an identity value is one that should be the same across merged segments.
    Strings (product names, status text) are identity. Numbers (counters, weights) are
    window-dependent and not identity.
    """
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return False
    try:
        float(v)
        return False  # parseable as number → window-dependent
    except (ValueError, TypeError):
        return True  # non-numeric string → identity-like


def _identity_key(segment):
    """
    Build an identity key for a segment: (silo_id, tuple of (tagName, agg, value) for
    companion cells whose value is non-numeric and aggregation is first/last).
    """
    parts = []
    for entry in segment.get("values", []):
        agg = entry.get("agg")
        na = companion_agg_base_kind(agg)
        if na not in ("first", "last"):
            continue
        val = entry.get("value")
        if not _is_identity_value(val):
            continue
        parts.append((entry.get("tagName"), agg, str(val)))
    parts.sort()
    return (segment.get("silo_id"), tuple(parts))


def merge_segments_by_identity(segments):
    """
    Group segments sharing the same (silo_id, identity-companion-values) key and combine them.

    Combination rules per companion entry:
      - delta / sum / count → sum across segments
      - avg                  → simple mean of segment averages
      - min                  → min across segments
      - max                  → max across segments
      - first                → from chronologically earliest segment in the group
      - last                 → from chronologically latest segment in the group

    Time range: t_start = min, t_end = max. Output sorted by t_start ASC.
    """
    groups = {}  # key → list of segments
    order = []

    for seg in segments:
        key = _identity_key(seg)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(seg)

    merged = []
    for key in order:
        group = groups[key]
        if len(group) == 1:
            merged.append(group[0])
            continue

        # Sort group chronologically for first/last picking
        group_sorted = sorted(group, key=lambda s: s["t_start"])
        first_seg = group_sorted[0]
        last_seg = group_sorted[-1]

        merged_values = []
        # Use the first segment's companion list as the template
        for ref_entry in first_seg.get("values", []):
            tag_name = ref_entry.get("tagName")
            agg = ref_entry.get("agg")

            # Collect this (tag,agg) entry across all segments in the group
            entries = []
            for s in group_sorted:
                for e in s.get("values", []):
                    if e.get("tagName") == tag_name and e.get("agg") == agg:
                        entries.append(e)
                        break

            numeric_vals = []
            for e in entries:
                v = e.get("value")
                try:
                    if v is not None:
                        numeric_vals.append(float(v))
                except (TypeError, ValueError):
                    pass

            na = companion_agg_base_kind(agg)
            if na in ("delta", "sum", "count"):
                merged_val = sum(numeric_vals) if numeric_vals else None
            elif na == "min":
                merged_val = min(numeric_vals) if numeric_vals else None
            elif na == "max":
                merged_val = max(numeric_vals) if numeric_vals else None
            elif na == "avg":
                merged_val = (sum(numeric_vals) / len(numeric_vals)) if numeric_vals else None
            elif na == "first":
                merged_val = entries[0].get("value") if entries else None
            elif na == "last":
                merged_val = entries[-1].get("value") if entries else None
            else:
                merged_val = entries[-1].get("value") if entries else None

            # Combined first/last for this tag across the group's chronological range
            combined_first = entries[0].get("first") if entries else None
            combined_last = entries[-1].get("last") if entries else None

            merged_values.append({
                "tagName": tag_name,
                "agg": agg,
                "value": merged_val,
                "first": combined_first,
                "last": combined_last,
            })

        merged.append({
            "t_start": first_seg["t_start"],
            "t_end": last_seg["t_end"],
            "silo_id": first_seg["silo_id"],
            "values": merged_values,
        })

    merged.sort(key=lambda s: s["t_start"])
    return merged


def build_tag_overlay(segment, segment_tag_name):
    """
    Build a flat tagValues overlay dict from a single segment result.

    The overlay is merged with global tagValues before rendering an expanded row, so
    that resolveCellValue (both Python and JS) picks up the right per-segment values.

    Keys produced:
      silo_segments::<segment_tag_name>   → silo_id    (for the ID cell)
      <tagName>                           → primary value (last value if available)
      delta::<tagName>                    → delta value (per cell)
      first::<tagName>                    → first val   (per cell)
      last::<tagName>                     → last val
      sum::<tagName> / avg:: / etc.       → agg value
    """
    overlay = {}
    # Silo ID key
    overlay[f"silo_segments::{segment_tag_name}"] = segment["silo_id"]

    values = segment.get("values", [])

    # Backwards-compat: support legacy dict-shaped values too.
    if isinstance(values, dict):
        legacy = []
        for tag_name, info in values.items():
            legacy.append({
                "tagName": tag_name,
                "agg": info.get("agg", "last"),
                "value": info.get("value"),
                "first": info.get("first"),
                "last": info.get("last"),
            })
        values = legacy

    for entry in values:
        tag_name = entry.get("tagName")
        agg = entry.get("agg") or "last"
        val = entry.get("value")
        first_val = entry.get("first")
        last_val = entry.get("last")
        if not tag_name:
            continue

        # Namespace the actual aggregation value as agg::tagName.
        # 'last' is the default — also populate plain key.
        if agg == "last" or agg == "silo_last":
            overlay[tag_name] = val
            if last_val is not None:
                overlay[f"last::{tag_name}"] = last_val
            # Do not set first:: for silo_last — avoids clashing with a full-range "first" cell.
            if first_val is not None and agg != "silo_last":
                overlay.setdefault(f"first::{tag_name}", first_val)
            if agg == "silo_last":
                overlay[f"silo_last::{tag_name}"] = val
        else:
            overlay[f"{agg}::{tag_name}"] = val
            # Silo-scoped aggs use only silo_*:: keys — do not touch first::/last:: (avoids
            # clashing with a sibling cell using full-range first/last on the same tag).
            if str(agg).startswith("silo_"):
                continue
            if first_val is not None:
                overlay.setdefault(f"first::{tag_name}", first_val)
            if last_val is not None:
                overlay.setdefault(f"last::{tag_name}", last_val)
            if tag_name not in overlay:
                overlay[tag_name] = last_val if last_val is not None else val

    return overlay
