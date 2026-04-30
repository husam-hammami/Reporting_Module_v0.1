"""Shift pace projector — end-of-shift production projection per asset.

Plan 5 §5.2 — Phase B feature B1.

Math:
    elapsed_h        = (now - shift_start) / 1h
    remaining_h      = (shift_end - now) / 1h
    rate             = produced_so_far / elapsed_h
    projected_total  = produced_so_far + rate × remaining_h
    p10/p90 band     = projected_total ± 1.96 × rate_stddev × √remaining_h
    status:
        on_track     if projected ≥ target × 0.97
        at_risk      if projected ≥ target × 0.90
        will_miss    otherwise

Confidence band uses rolling stddev of hourly delta over the last 30 shifts
(after R-rule filtering). When stddev cannot be computed (warm-up < 14 days),
the band is hidden — the UI shows the point estimate without the range.

Returns None when the asset has no active shift, no production counter, or
calibration period hasn't elapsed.
"""

import datetime
import json
import logging

from ai_money.db import cursor, get_config_value
from . import filters

logger = logging.getLogger(__name__)

_FORECAST_FEATURE_ID = 'shift_pace'
_WARM_UP_DAYS = 14


def _load_shifts_config():
    """Read shifts_config.json — returns {shifts: [{id, start, end, days}]} or None."""
    try:
        import os
        bundle_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cfg_path = os.path.join(bundle_dir, 'config', 'shifts_config.json')
        if not os.path.exists(cfg_path):
            return None
        with open(cfg_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.debug("shifts_config.json not loadable: %s", e)
        return None


def _current_shift(now=None):
    """Return (shift_id, shift_start_dt, shift_end_dt) or None."""
    cfg = _load_shifts_config()
    if not cfg:
        return None
    now = now or datetime.datetime.now()
    today = now.date()

    def _parse_hhmm(s):
        h, m = s.split(':')
        return datetime.time(int(h), int(m))

    for shift in (cfg.get('shifts') or []):
        try:
            start_t = _parse_hhmm(shift['start'])
            end_t = _parse_hhmm(shift['end'])
        except Exception:
            continue
        start_dt = datetime.datetime.combine(today, start_t)
        end_dt = datetime.datetime.combine(today, end_t)
        if end_dt <= start_dt:                        # crosses midnight
            if now.time() >= start_t:
                end_dt = end_dt + datetime.timedelta(days=1)
            else:
                start_dt = start_dt - datetime.timedelta(days=1)
        if start_dt <= now < end_dt:
            return (shift.get('id', ''), start_dt, end_dt)
    return None


def _list_production_counters(cur, asset):
    """Return (tag_id, tag_name, parent_boolean_tag_id_or_None) tuples for an asset."""
    cur.execute("""
        SELECT t.id, t.tag_name
          FROM hercules_ai_tag_profiles p
          JOIN tags t ON t.tag_name = p.tag_name
         WHERE p.parent_asset = %s
           AND p.is_tracked = TRUE
           AND p.is_production_counter = TRUE
    """, (asset,))
    return [(r[0], r[1]) for r in cur.fetchall()]


def _sum_delta_since(cur, tag_ids, t_from):
    """Sum value_delta for tags from t_from to now (uses fine-grained tag_history)."""
    if not tag_ids:
        return 0.0
    cur.execute("""
        SELECT COALESCE(SUM(value_delta), 0)
          FROM tag_history
         WHERE tag_id = ANY(%s)
           AND "timestamp" >= %s
    """, (list(tag_ids), t_from))
    row = cur.fetchone()
    return float(row[0] or 0)


def _hourly_deltas_recent(cur, tag_ids, days=30):
    """Return list of hourly deltas across last N days, R-filtered, in kg."""
    if not tag_ids:
        return []
    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
    cur.execute("""
        SELECT archive_hour, value_delta, quality_code, order_name
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND archive_hour >= %s
           AND (granularity = 'hourly' OR granularity IS NULL)
           AND value_delta IS NOT NULL
      ORDER BY archive_hour
    """, (list(tag_ids), cutoff))
    rows = [
        {'archive_hour': r[0], 'value_delta': float(r[1]),
         'quality_code': r[2], 'order_name': r[3]}
        for r in cur.fetchall()
    ]
    rows = filters.apply_pipeline(rows)
    # Aggregate by archive_hour
    by_hour = {}
    for r in rows:
        h = r['archive_hour']
        by_hour[h] = by_hour.get(h, 0.0) + r['value_delta']
    return list(by_hour.values())


def _shift_target_kg(asset, shift_id):
    """Read configured shift target (kg) for asset/shift. Returns None if unset."""
    with cursor(dict_cursor=False) as (cur, _):
        targets = get_config_value(cur, 'shift_target_kg', {}) or {}
    if not isinstance(targets, dict):
        return None
    asset_targets = targets.get(asset) or {}
    if isinstance(asset_targets, dict):
        val = asset_targets.get(shift_id) or asset_targets.get('default')
    else:
        val = asset_targets
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _stddev(values):
    if len(values) < 2:
        return None
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return var ** 0.5


def _log_prediction(cur, asset, predicted, p10, p90, target_at, code_sha=''):
    """Insert a forecast row into model_accuracy_log (throttled by accuracy_closer)."""
    try:
        cur.execute("""
            INSERT INTO model_accuracy_log
              (feature, asset_name, code_sha, predicted_at, horizon_minutes,
               target_at, predicted_value, predicted_p10, predicted_p90)
            SELECT %s, %s, %s, NOW(), %s, %s, %s, %s, %s
             WHERE NOT EXISTS (
               SELECT 1 FROM model_accuracy_log
                WHERE feature=%s AND asset_name=%s
                  AND created_at > NOW() - INTERVAL '5 minutes'
             )
        """, (_FORECAST_FEATURE_ID, asset, code_sha,
              int((target_at - datetime.datetime.now()).total_seconds() / 60),
              target_at, predicted, p10, p90,
              _FORECAST_FEATURE_ID, asset))
    except Exception as e:
        logger.debug("Could not log shift_pace prediction: %s", e)


def project(asset):
    """Compute end-of-shift projection for one asset.

    Returns dict or None.
    """
    shift = _current_shift()
    if not shift:
        return None
    shift_id, shift_start, shift_end = shift
    now = datetime.datetime.now()
    elapsed_h = max(0.001, (now - shift_start).total_seconds() / 3600.0)
    remaining_h = max(0.0, (shift_end - now).total_seconds() / 3600.0)

    with cursor(dict_cursor=False) as (cur, conn):
        counters = _list_production_counters(cur, asset)
        if not counters:
            return None
        tag_ids = [tid for tid, _ in counters]
        produced_so_far = _sum_delta_since(cur, tag_ids, shift_start)

        # Warm-up gate (Plan §16.5)
        hourly_history = _hourly_deltas_recent(cur, tag_ids, days=30)
        if len(hourly_history) < _WARM_UP_DAYS * 16:        # ~16 active hours/day
            target_kg = _shift_target_kg(asset, shift_id)
            return {
                'asset': asset,
                'shift_id': shift_id,
                'shift_start': shift_start.isoformat(),
                'shift_end': shift_end.isoformat(),
                'elapsed_hours': round(elapsed_h, 2),
                'remaining_hours': round(remaining_h, 2),
                'produced_so_far_kg': round(produced_so_far, 1),
                'target_kg': target_kg,
                'projected_total_kg': None,
                'p10_kg': None,
                'p90_kg': None,
                'status': 'learning',
                'eta_minutes': None,
                'gap_kg': None,
                'accuracy_label': 'learning',
            }

        rate = produced_so_far / elapsed_h
        projected_total = produced_so_far + rate * remaining_h
        stddev = _stddev(hourly_history)

        p10 = p90 = None
        if stddev is not None and remaining_h > 0:
            margin = 1.96 * stddev * (remaining_h ** 0.5)
            p10 = max(0.0, projected_total - margin)
            p90 = projected_total + margin

        target_kg = _shift_target_kg(asset, shift_id)
        gap_kg = None
        eta_min = None
        status = None
        if target_kg is not None:
            gap_kg = target_kg - projected_total
            if rate > 0:
                kg_to_go = max(0.0, target_kg - produced_so_far)
                eta_h = kg_to_go / rate
                eta_min = int(eta_h * 60)
            if projected_total >= target_kg * 0.97:
                status = 'on_track'
            elif projected_total >= target_kg * 0.90:
                status = 'at_risk'
            else:
                status = 'will_miss'

        # Log for accuracy tracking
        _log_prediction(cur, asset, projected_total, p10, p90, shift_end)
        conn.commit()

    return {
        'asset': asset,
        'shift_id': shift_id,
        'shift_start': shift_start.isoformat(),
        'shift_end': shift_end.isoformat(),
        'elapsed_hours': round(elapsed_h, 2),
        'remaining_hours': round(remaining_h, 2),
        'produced_so_far_kg': round(produced_so_far, 1),
        'target_kg': target_kg,
        'projected_total_kg': round(projected_total, 1),
        'p10_kg': round(p10, 1) if p10 is not None else None,
        'p90_kg': round(p90, 1) if p90 is not None else None,
        'status': status or 'no_target',
        'eta_minutes': eta_min,
        'gap_kg': round(gap_kg, 1) if gap_kg is not None else None,
        'accuracy_label': 'reliable',  # refined by accuracy_closer over time
    }


def project_all_assets():
    """Project for all assets that have a production counter linked."""
    with cursor(dict_cursor=False) as (cur, _):
        cur.execute("SELECT asset_name FROM assets_view WHERE has_production_counter = TRUE ORDER BY asset_name")
        assets = [r[0] for r in cur.fetchall()]
    out = []
    for a in assets:
        try:
            p = project(a)
            if p:
                out.append(p)
        except Exception as e:
            logger.debug("shift_pace project failed for %s: %s", a, e)
    return out
