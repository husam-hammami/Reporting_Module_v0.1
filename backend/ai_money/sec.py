"""Specific Energy Consumption (SEC) — kWh per ton, per asset.

Plan §4.2 — promoted from Plan 3 F2 to first-class always-visible KPI.

Math:
    SEC(asset, window) = Σ(energy meter delta over window) / Σ(production counter delta over window)
    Units: kWh / ton

Skip rule: when production < 5% of asset's 30-day median, SEC is undefined
(prevents inf when a line is idle). Per Plan 3 R-rule design.

Public API:
    refresh_hour(hour_start)               — materialise one row of asset_sec_hourly
    get_recent(asset, hours_back=24)       — read from materialised view
    summary_for_asset(asset, period_hours) — current vs baseline excess-cost OMR
"""

import logging
from datetime import datetime, timedelta

from .db import cursor, get_config_value

logger = logging.getLogger(__name__)

# Skip threshold: if hourly production < 5% of 30-day median, mark SEC null
_PRODUCTION_FLOOR_PCT = 0.05


def _list_assets_with_pairs(cur):
    """Return [(asset_name, [energy_tag_ids], [production_tag_ids])]."""
    cur.execute("""
        SELECT p.parent_asset, p.tag_name, p.is_energy_meter, p.is_production_counter, t.id AS tag_id
          FROM hercules_ai_tag_profiles p
     LEFT JOIN tags t ON t.tag_name = p.tag_name
         WHERE p.parent_asset IS NOT NULL AND p.parent_asset <> ''
           AND p.is_tracked = TRUE
           AND (p.is_energy_meter = TRUE OR p.is_production_counter = TRUE)
    """)
    grouped = {}
    for row in cur.fetchall():
        asset = row[0] if not isinstance(row, dict) else row.get('parent_asset')
        is_e = row[2] if not isinstance(row, dict) else row.get('is_energy_meter')
        is_p = row[3] if not isinstance(row, dict) else row.get('is_production_counter')
        tag_id = row[4] if not isinstance(row, dict) else row.get('tag_id')
        if not tag_id:
            continue
        if asset not in grouped:
            grouped[asset] = {'energy': [], 'production': []}
        if is_e:
            grouped[asset]['energy'].append(tag_id)
        if is_p:
            grouped[asset]['production'].append(tag_id)
    return [(a, v['energy'], v['production']) for a, v in grouped.items()]


def _sum_delta(cur, tag_ids, t_from, t_to, source='archive'):
    """Sum value_delta across a tag set in a time window. Returns float (0 if empty).

    Historian convention: archive_hour stores the END of the bucket (top of next hour).
    So a bucket [13:00, 14:00) is keyed at archive_hour=14:00.
    Query semantics for archive: half-open with bucket-end timestamp inclusive on the right.
    """
    if not tag_ids:
        return 0.0
    if source == 'archive':
        cur.execute("""
            SELECT COALESCE(SUM(value_delta), 0)
              FROM tag_history_archive
             WHERE tag_id = ANY(%s)
               AND archive_hour >  %s
               AND archive_hour <= %s
               AND (granularity = 'hourly' OR granularity IS NULL)
        """, (list(tag_ids), t_from, t_to))
    else:
        cur.execute("""
            SELECT COALESCE(SUM(value_delta), 0)
              FROM tag_history
             WHERE tag_id = ANY(%s)
               AND "timestamp" >= %s AND "timestamp" < %s
        """, (list(tag_ids), t_from, t_to))
    row = cur.fetchone()
    return float(row[0] if not isinstance(row, dict) else list(row.values())[0] or 0)


def _production_floor(cur, asset, production_tag_ids):
    """5% of 30-day median hourly production for the asset (returns kg)."""
    if not production_tag_ids:
        return 0.0
    cur.execute("""
        SELECT date_trunc('hour', archive_hour) AS h,
               COALESCE(SUM(value_delta), 0) AS kg
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND archive_hour > NOW() - INTERVAL '30 days'
           AND (granularity = 'hourly' OR granularity IS NULL)
      GROUP BY h
      ORDER BY kg
    """, (list(production_tag_ids),))
    rows = cur.fetchall()
    if not rows:
        return 0.0
    values = sorted(float(r[1] if not isinstance(r, dict) else r.get('kg') or 0) for r in rows)
    n = len(values)
    median = values[n // 2] if n else 0.0
    return median * _PRODUCTION_FLOOR_PCT


def refresh_hour(hour_start, write=True):
    """Compute asset_sec_hourly for ONE hour, optionally writing to DB.

    Args:
        hour_start: datetime aligned to top of hour
        write: if True, UPSERT into asset_sec_hourly
    Returns:
        list of dicts [{asset, kwh, kg, sec, cost_omr, revenue_omr}]
    """
    if hour_start.minute != 0 or hour_start.second != 0 or hour_start.microsecond != 0:
        hour_start = hour_start.replace(minute=0, second=0, microsecond=0)
    hour_end = hour_start + timedelta(hours=1)

    from . import cost as cost_mod
    from . import revenue as revenue_mod

    rows = []
    with cursor(dict_cursor=False) as (cur, conn):
        assets = _list_assets_with_pairs(cur)
        for asset, e_ids, p_ids in assets:
            kwh = _sum_delta(cur, e_ids, hour_start, hour_end)
            kg = _sum_delta(cur, p_ids, hour_start, hour_end)
            floor = _production_floor(cur, asset, p_ids)
            sec_val = None
            if kg > floor and kg > 0:
                sec_val = (kwh / (kg / 1000.0))  # kWh per ton

            cost_omr = cost_mod.kwh_to_omr(cur, kwh, hour_start) if kwh > 0 else 0.0
            revenue_omr = revenue_mod.kg_to_omr(cur, kg, asset)

            rows.append({
                'asset': asset,
                'hour_start': hour_start,
                'kwh': round(kwh, 4),
                'kg': round(kg, 4),
                'sec_kwh_per_t': round(sec_val, 4) if sec_val is not None else None,
                'cost_omr': round(cost_omr, 4),
                'revenue_omr': round(revenue_omr, 4),
            })

            if write:
                cur.execute("""
                    INSERT INTO asset_sec_hourly
                        (asset_name, hour_start, kwh_consumed, kg_produced, sec_kwh_per_t, cost_omr, revenue_omr)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (asset_name, hour_start) DO UPDATE SET
                        kwh_consumed = EXCLUDED.kwh_consumed,
                        kg_produced = EXCLUDED.kg_produced,
                        sec_kwh_per_t = EXCLUDED.sec_kwh_per_t,
                        cost_omr = EXCLUDED.cost_omr,
                        revenue_omr = EXCLUDED.revenue_omr,
                        computed_at = NOW()
                """, (asset, hour_start, rows[-1]['kwh'], rows[-1]['kg'],
                      rows[-1]['sec_kwh_per_t'], rows[-1]['cost_omr'], rows[-1]['revenue_omr']))
        if write:
            conn.commit()
    return rows


def get_recent(asset, hours_back=24):
    """Read materialised SEC rows for an asset over the last N hours."""
    cutoff = datetime.now() - timedelta(hours=hours_back)
    with cursor(dict_cursor=True) as (cur, _):
        cur.execute("""
            SELECT hour_start, kwh_consumed, kg_produced, sec_kwh_per_t, cost_omr, revenue_omr
              FROM asset_sec_hourly
             WHERE asset_name = %s AND hour_start >= %s
          ORDER BY hour_start
        """, (asset, cutoff))
        rows = cur.fetchall()
    return [
        {
            'hour_start': r['hour_start'].isoformat() if r['hour_start'] else None,
            'kwh': float(r['kwh_consumed'] or 0),
            'kg': float(r['kg_produced'] or 0),
            'sec_kwh_per_t': float(r['sec_kwh_per_t']) if r['sec_kwh_per_t'] is not None else None,
            'cost_omr': float(r['cost_omr'] or 0),
            'revenue_omr': float(r['revenue_omr'] or 0),
        }
        for r in rows
    ]


def summary_for_asset(asset, period_hours=24):
    """Return today's SEC, baseline SEC (30-day median), and excess cost in OMR.

    Returns dict with keys:
        sec_today, sec_baseline, sec_delta_pct,
        kwh_today, kg_today, cost_omr_today,
        excess_omr_today (cost above baseline SEC for today's production)
        accuracy_label ('green'|'amber'|'red'|'calibrating')
    """
    period_start = datetime.now() - timedelta(hours=period_hours)
    baseline_start = datetime.now() - timedelta(days=30)

    with cursor(dict_cursor=True) as (cur, _):
        # Period totals
        cur.execute("""
            SELECT COALESCE(SUM(kwh_consumed), 0) AS kwh,
                   COALESCE(SUM(kg_produced), 0) AS kg,
                   COALESCE(SUM(cost_omr), 0) AS cost
              FROM asset_sec_hourly
             WHERE asset_name = %s AND hour_start >= %s
        """, (asset, period_start))
        cur_row = cur.fetchone()

        # Baseline median SEC over last 30 days, excluding null SEC rows
        cur.execute("""
            SELECT sec_kwh_per_t
              FROM asset_sec_hourly
             WHERE asset_name = %s
               AND hour_start >= %s
               AND sec_kwh_per_t IS NOT NULL
        """, (asset, baseline_start))
        baseline_rows = [float(r['sec_kwh_per_t']) for r in cur.fetchall()]

        # Hours of clean data — used for calibrating state
        clean_hours = len(baseline_rows)

    kwh_today = float(cur_row['kwh'] or 0)
    kg_today = float(cur_row['kg'] or 0)
    cost_today = float(cur_row['cost'] or 0)

    sec_today = None
    if kg_today > 0:
        sec_today = kwh_today / (kg_today / 1000.0)

    sec_baseline = None
    if baseline_rows:
        baseline_rows.sort()
        sec_baseline = baseline_rows[len(baseline_rows) // 2]

    delta_pct = None
    excess_omr = 0.0
    if sec_today is not None and sec_baseline is not None and sec_baseline > 0:
        delta_pct = ((sec_today - sec_baseline) / sec_baseline) * 100.0
        if sec_today > sec_baseline:
            excess_kwh = (sec_today - sec_baseline) * (kg_today / 1000.0)
            with cursor(dict_cursor=False) as (cur, _):
                from . import cost as cost_mod
                excess_omr = cost_mod.kwh_to_omr(cur, excess_kwh, datetime.now())

    # Accuracy label per Plan §13.3 / §16.5 warm-up disable
    if clean_hours < 7 * 24:
        accuracy_label = 'calibrating'
    elif sec_baseline is None:
        accuracy_label = 'calibrating'
    else:
        accuracy_label = 'green'  # Phase A returns green by default; Phase B refines from MAPE

    return {
        'asset': asset,
        'period_hours': period_hours,
        'sec_today': round(sec_today, 2) if sec_today is not None else None,
        'sec_baseline': round(sec_baseline, 2) if sec_baseline is not None else None,
        'sec_delta_pct': round(delta_pct, 1) if delta_pct is not None else None,
        'kwh_today': round(kwh_today, 1),
        'kg_today': round(kg_today, 1),
        'cost_omr_today': round(cost_today, 2),
        'excess_omr_today': round(excess_omr, 2),
        'accuracy_label': accuracy_label,
        'clean_hours': clean_hours,
    }
