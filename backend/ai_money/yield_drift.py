"""Hourly yield drift writer — populates asset_yield_hourly.

Plan 5 §4.5 spec'd this writer as 'computed alongside asset_sec_hourly by
ai_money.yield_drift.refresh_hour()' but the module was never created.
asset_yield_hourly has been empty since the table was added on 2026-04-04.
The L2 yield-drift lever in levers.py reads from this table and silently
returns 0 OMR savings, so the lever has been a no-op all along.

This module fills that gap with the lean shape:
    refresh_hour(hour_start)     — UPSERT one hour for every asset that has
                                   at least one production counter
    backfill_range(t_from, t_to) — call refresh_hour for each hour in [t_from, t_to)

Per-asset attribution (Salalah-tuned):
    Mill B has three totalizers (flour_totalizer, bran_totalizer, b1_totalizer)
    so we get full intake/flour/bran/b1 attribution and yield percentages.
    Pasta 1/4/E each have a single totalizer → flour_kg only; percentages NULL.
    C32/M30/M31 have only energy meters → no row written.
"""

import logging
from datetime import datetime, timedelta

from .db import cursor, get_config_value

logger = logging.getLogger(__name__)


def _list_assets_with_yield_tags(cur):
    """Return {asset_name: {'flour': tag_id|None, 'bran': tag_id|None,
                              'b1': tag_id|None, 'generic': [tag_id, ...]}}.

    Reads from hercules_ai_tag_profiles + tags. Filters to:
      - is_production_counter = TRUE  (skips kVAh/kVARh energy counters)
      - parent_asset non-empty        (skips orphans)
      - is_tracked = TRUE             (skips disabled tags)
    """
    cur.execute("""
        SELECT p.parent_asset, p.tag_name, t.id AS tag_id
          FROM hercules_ai_tag_profiles p
          JOIN tags t ON t.tag_name = p.tag_name
         WHERE p.is_production_counter = TRUE
           AND p.is_tracked = TRUE
           AND p.parent_asset IS NOT NULL
           AND TRIM(p.parent_asset) <> ''
    """)
    grouped: dict = {}
    for row in cur.fetchall():
        if isinstance(row, dict):
            asset = row['parent_asset']
            tag_name = row['tag_name']
            tag_id = row['tag_id']
        else:
            asset, tag_name, tag_id = row[0], row[1], row[2]
        bucket = grouped.setdefault(asset, {'flour': None, 'bran': None, 'b1': None, 'generic': []})
        n = (tag_name or '').lower()
        if 'flour_totalizer' in n or 'flour_total' in n:
            bucket['flour'] = tag_id
        elif 'bran_totalizer' in n or 'bran_total' in n:
            bucket['bran'] = tag_id
        elif 'b1_totalizer' in n or 'b1_total' in n:
            bucket['b1'] = tag_id
        else:
            bucket['generic'].append(tag_id)
    return grouped


def _sum_delta_archive(cur, tag_ids, hour_start, hour_end):
    """SUM(value_delta) from tag_history_archive across tag_ids in the bucket
    (hour_start, hour_end]. Returns float (0 if empty)."""
    if not tag_ids:
        return 0.0
    cur.execute("""
        SELECT COALESCE(SUM(value_delta), 0)
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND archive_hour >  %s
           AND archive_hour <= %s
           AND layout_id IS NULL
           AND (granularity = 'hourly' OR granularity IS NULL)
    """, (list(tag_ids), hour_start, hour_end))
    row = cur.fetchone()
    val = row[0] if not isinstance(row, dict) else list(row.values())[0]
    return float(val or 0)


def _value_per_ton(cur, key, fallback=0.0):
    """Read a value_per_ton_X config; returns 0.0 when unset."""
    v = get_config_value(cur, key, default=fallback)
    if v is None:
        return fallback
    if isinstance(v, dict):
        v = v.get('value', fallback)
    try:
        return float(v) if v is not None else fallback
    except (TypeError, ValueError):
        return fallback


def refresh_hour(hour_start, write=True):
    """Compute one hour of asset_yield_hourly, optionally UPSERT.

    Args:
        hour_start: datetime aligned to top of hour (will be normalized).
        write: True → UPSERT into asset_yield_hourly. False → return-only.
    Returns:
        list of dicts [{asset, hour_start, intake_kg, flour_kg, flour_pct,
                        bran_pct, b1_pct, yield_revenue_omr, drift_omr_vs_baseline}]
    """
    if hour_start.minute or hour_start.second or hour_start.microsecond:
        hour_start = hour_start.replace(minute=0, second=0, microsecond=0)
    hour_end = hour_start + timedelta(hours=1)

    rows = []
    with cursor(dict_cursor=False) as (cur, conn):
        per_asset = _list_assets_with_yield_tags(cur)
        if not per_asset:
            return rows

        v_flour = _value_per_ton(cur, 'value_per_ton_flour', 0.0)
        v_bran  = _value_per_ton(cur, 'value_per_ton_bran',  0.0)

        for asset, tags in per_asset.items():
            flour_kg = _sum_delta_archive(cur, [tags['flour']], hour_start, hour_end) if tags['flour'] else 0.0
            bran_kg  = _sum_delta_archive(cur, [tags['bran']],  hour_start, hour_end) if tags['bran']  else 0.0
            b1_kg    = _sum_delta_archive(cur, [tags['b1']],    hour_start, hour_end) if tags['b1']    else 0.0
            generic_kg = _sum_delta_archive(cur, tags['generic'], hour_start, hour_end) if tags['generic'] else 0.0

            has_attr = bool(tags['flour'] or tags['bran'] or tags['b1'])
            if has_attr:
                intake_kg = flour_kg + bran_kg + b1_kg
                if intake_kg > 0:
                    flour_pct = (flour_kg / intake_kg) * 100.0
                    bran_pct  = (bran_kg  / intake_kg) * 100.0
                    b1_pct    = (b1_kg    / intake_kg) * 100.0
                else:
                    flour_pct = bran_pct = b1_pct = None
            else:
                # Single-totalizer asset (Pasta 1/4/E): treat as flour output.
                flour_kg = generic_kg
                intake_kg = None
                flour_pct = bran_pct = b1_pct = None

            yield_revenue_omr = (
                (flour_kg / 1000.0) * v_flour
                + (bran_kg  / 1000.0) * v_bran
            )
            # drift_omr_vs_baseline: leave NULL on backfill; the trend layer
            # (sec_drift / accuracy_closer) populates this against a baseline
            # once enough history exists. Keeping the column write here lets
            # the L2 lever's SUM(drift_omr_vs_baseline) read NULLs as zero.

            row = {
                'asset': asset,
                'hour_start': hour_start,
                'intake_kg': round(intake_kg, 4) if intake_kg is not None else None,
                'flour_kg': round(flour_kg, 4),
                'flour_pct': round(flour_pct, 2) if flour_pct is not None else None,
                'bran_pct':  round(bran_pct,  2) if bran_pct  is not None else None,
                'b1_pct':    round(b1_pct,    2) if b1_pct    is not None else None,
                'yield_revenue_omr': round(yield_revenue_omr, 4),
                'drift_omr_vs_baseline': None,
            }
            rows.append(row)

            if write:
                cur.execute("""
                    INSERT INTO asset_yield_hourly
                        (asset_name, hour_start, flour_pct, bran_pct, b1_pct,
                         intake_kg, flour_kg, yield_revenue_omr, drift_omr_vs_baseline)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (asset_name, hour_start) DO UPDATE SET
                        flour_pct = EXCLUDED.flour_pct,
                        bran_pct = EXCLUDED.bran_pct,
                        b1_pct = EXCLUDED.b1_pct,
                        intake_kg = EXCLUDED.intake_kg,
                        flour_kg = EXCLUDED.flour_kg,
                        yield_revenue_omr = EXCLUDED.yield_revenue_omr,
                        computed_at = NOW()
                """, (
                    asset, hour_start,
                    row['flour_pct'], row['bran_pct'], row['b1_pct'],
                    row['intake_kg'], row['flour_kg'], row['yield_revenue_omr'],
                    row['drift_omr_vs_baseline'],
                ))
        if write:
            conn.commit()
    return rows


def backfill_range(t_from, t_to):
    """Call refresh_hour for every hour in [t_from, t_to). Idempotent
    (UPSERTs). Use to populate historical yield rows after a fix or fresh
    install. Returns int count of hours processed."""
    if t_from.minute or t_from.second:
        t_from = t_from.replace(minute=0, second=0, microsecond=0)
    if t_to.minute or t_to.second:
        t_to = t_to.replace(minute=0, second=0, microsecond=0)
    count = 0
    h = t_from
    while h < t_to:
        try:
            refresh_hour(h, write=True)
            count += 1
        except Exception as e:
            logger.warning("[yield_drift] backfill hour %s failed: %s", h.isoformat(), e)
        h += timedelta(hours=1)
    logger.info("[yield_drift] backfill complete: %d hours from %s to %s",
                count, t_from.isoformat(), t_to.isoformat())
    return count
