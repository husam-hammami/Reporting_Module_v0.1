"""Trend slope analyser — predicts when PF / voltage imbalance will cross threshold.

Plan 5 §5.4 — Phase B feature B3.

Algorithm:
    1. Pull last 14 days of hourly readings, R-filtered.
    2. Fit y = m·x + b via numpy.polyfit (least squares).
    3. Compute t-statistic: t = m / SE(m) where SE(m) = √(s²_resid / Σ(x - x̄)²)
    4. Approximate p-value from t-distribution (two-sided), n-2 df:
       For our purposes, we use the rule-of-thumb: |t| > 2 ⇒ significant at p<0.05.
       (More precise via Welch–Satterthwaite or scipy, but scipy's not bundled.)
    5. Project days-to-threshold-cross: days = (threshold − current) / m_per_day
       Only meaningful if slope is significant AND points toward threshold.

Returns dict or None (when warm-up < 14 days, slope insignificant, or no data).

Two public functions:
    pf_trend(asset)              — PF expected to fall below pf_target
    voltage_imbalance_trend(asset)— imbalance expected to exceed 2%
"""

import datetime
import logging

import numpy as np

from ai_money.db import cursor, get_config_value
from . import filters

logger = logging.getLogger(__name__)

_FEATURE_PF = 'pf_trend'
_FEATURE_VI = 'voltage_imbalance_trend'

_LOOKBACK_DAYS = 14
_MIN_POINTS = 24                 # ~1 day of hourly readings minimum
_T_STAT_THRESHOLD = 2.0          # ~p<0.05 for n>30 (rule of thumb)
_VI_THRESHOLD_PCT = 2.0          # voltage imbalance % above which de-rate kicks in


def _list_tags_for_metric(cur, asset, metric):
    """metric ∈ {'pf', 'l1_voltage', 'l2_voltage', 'l3_voltage'}"""
    needle_map = {
        'pf': '%cos_phi%',
        'l1_voltage': '%l1_voltage%',
        'l2_voltage': '%l2_voltage%',
        'l3_voltage': '%l3_voltage%',
    }
    needle = needle_map.get(metric)
    if not needle:
        return []
    cur.execute("""
        SELECT t.id
          FROM hercules_ai_tag_profiles p
          JOIN tags t ON t.tag_name = p.tag_name
         WHERE p.parent_asset = %s
           AND p.is_tracked = TRUE
           AND p.tag_name ILIKE %s
    """, (asset, needle))
    return [r[0] for r in cur.fetchall()]


def _hourly_avg_readings(cur, tag_ids, days):
    """Return (timestamps_in_hours_since_start, values) for last N days, R-filtered."""
    if not tag_ids:
        return None, None
    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
    cur.execute("""
        SELECT archive_hour, AVG(value) AS v, MAX(quality_code) AS q, MAX(order_name) AS o
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND archive_hour >= %s
           AND (granularity = 'hourly' OR granularity IS NULL)
      GROUP BY archive_hour
      ORDER BY archive_hour
    """, (list(tag_ids), cutoff))
    rows = [
        {'archive_hour': r[0], 'value': float(r[1] or 0),
         'quality_code': r[2], 'order_name': r[3]}
        for r in cur.fetchall()
        if r[1] is not None
    ]
    rows = filters.apply_pipeline(rows)
    if len(rows) < _MIN_POINTS:
        return None, None
    t0 = rows[0]['archive_hour']
    xs = np.array([(r['archive_hour'] - t0).total_seconds() / 3600.0 for r in rows])
    ys = np.array([r['value'] for r in rows])
    return xs, ys


def _slope_with_significance(xs, ys):
    """Return (slope_per_hour, intercept, current_value, t_stat, n)."""
    if xs is None or len(xs) < _MIN_POINTS:
        return None, None, None, None, 0
    n = len(xs)
    m, b = np.polyfit(xs, ys, 1)
    y_hat = m * xs + b
    residuals = ys - y_hat
    s2 = float(np.sum(residuals ** 2) / max(1, n - 2))
    sx2 = float(np.sum((xs - xs.mean()) ** 2))
    if sx2 == 0:
        return None, None, None, None, n
    se_m = (s2 / sx2) ** 0.5
    t = float(m) / se_m if se_m > 0 else 0.0
    return float(m), float(b), float(ys[-1]), t, n


def _log_prediction(cur, feature, asset, predicted, target_at):
    try:
        cur.execute("""
            INSERT INTO model_accuracy_log
              (feature, asset_name, predicted_at, horizon_minutes,
               target_at, predicted_value)
            SELECT %s, %s, NOW(), %s, %s, %s
             WHERE NOT EXISTS (
               SELECT 1 FROM model_accuracy_log
                WHERE feature=%s AND asset_name=%s
                  AND created_at > NOW() - INTERVAL '60 minutes'
             )
        """, (feature, asset,
              int((target_at - datetime.datetime.now()).total_seconds() / 60),
              target_at, predicted, feature, asset))
    except Exception as e:
        logger.debug("Could not log %s prediction: %s", feature, e)


def pf_trend(asset):
    """Power-factor trend slope. Returns None if insignificant or warming up."""
    with cursor(dict_cursor=False) as (cur, conn):
        target_pf = float(get_config_value(cur, 'pf_target', 0.90))
        tag_ids = _list_tags_for_metric(cur, asset, 'pf')
        xs, ys = _hourly_avg_readings(cur, tag_ids, _LOOKBACK_DAYS)
        if xs is None:
            return None
        slope, _, current, t_stat, n = _slope_with_significance(xs, ys)
        if slope is None or abs(t_stat) < _T_STAT_THRESHOLD:
            return None  # not statistically significant — don't cry wolf

        # Days to threshold cross — only if slope points toward target from current
        days_to_cross = None
        if slope < 0 and current > target_pf:           # falling toward target
            days_to_cross = (current - target_pf) / (-slope * 24)
        elif slope > 0 and current < target_pf:         # rising toward target (recovery)
            days_to_cross = None                          # don't alarm on recovery

        if days_to_cross is None or days_to_cross < 0 or days_to_cross > 60:
            return None  # too far away to be actionable

        target_at = datetime.datetime.now() + datetime.timedelta(days=days_to_cross)
        _log_prediction(cur, _FEATURE_PF, asset, target_pf, target_at)
        conn.commit()

    return {
        'asset': asset,
        'metric': 'electrical_efficiency',
        'current': round(current, 3),
        'target': target_pf,
        'slope_per_day': round(slope * 24, 5),
        'days_to_cross': round(days_to_cross, 1),
        'samples': n,
        'severity': 'warn' if days_to_cross > 7 else 'crit',
    }


def voltage_imbalance_trend(asset):
    """Voltage imbalance trend. Imbalance% = max(|Vi - V_avg|) / V_avg × 100."""
    with cursor(dict_cursor=False) as (cur, conn):
        l1_ids = _list_tags_for_metric(cur, asset, 'l1_voltage')
        l2_ids = _list_tags_for_metric(cur, asset, 'l2_voltage')
        l3_ids = _list_tags_for_metric(cur, asset, 'l3_voltage')
        if not (l1_ids and l2_ids and l3_ids):
            return None
        x1, y1 = _hourly_avg_readings(cur, l1_ids, _LOOKBACK_DAYS)
        x2, y2 = _hourly_avg_readings(cur, l2_ids, _LOOKBACK_DAYS)
        x3, y3 = _hourly_avg_readings(cur, l3_ids, _LOOKBACK_DAYS)
        if x1 is None or x2 is None or x3 is None:
            return None
        # Align lengths conservatively (truncate to min)
        n_min = min(len(x1), len(x2), len(x3))
        if n_min < _MIN_POINTS:
            return None
        y1, y2, y3 = y1[:n_min], y2[:n_min], y3[:n_min]
        x = x1[:n_min]
        avg = (y1 + y2 + y3) / 3.0
        # Avoid divide-by-zero
        avg_safe = np.where(avg == 0, 1, avg)
        max_dev = np.maximum(np.maximum(np.abs(y1 - avg), np.abs(y2 - avg)), np.abs(y3 - avg))
        imbalance_pct = 100.0 * max_dev / avg_safe

        slope, _, current, t_stat, n = _slope_with_significance(x, imbalance_pct)
        if slope is None or abs(t_stat) < _T_STAT_THRESHOLD:
            return None

        days_to_cross = None
        if slope > 0 and current < _VI_THRESHOLD_PCT:
            days_to_cross = (_VI_THRESHOLD_PCT - current) / (slope * 24)
        if days_to_cross is None or days_to_cross < 0 or days_to_cross > 60:
            return None

        target_at = datetime.datetime.now() + datetime.timedelta(days=days_to_cross)
        _log_prediction(cur, _FEATURE_VI, asset, _VI_THRESHOLD_PCT, target_at)
        conn.commit()

    return {
        'asset': asset,
        'metric': 'voltage_imbalance',
        'current_pct': round(current, 2),
        'target_pct': _VI_THRESHOLD_PCT,
        'slope_pct_per_day': round(slope * 24, 4),
        'days_to_cross': round(days_to_cross, 1),
        'samples': n,
        'severity': 'warn' if days_to_cross > 14 else 'crit',
    }


def all_trends():
    """Compute PF + voltage trends across all assets. Returns list of significant trends."""
    out = []
    with cursor(dict_cursor=False) as (cur, _):
        cur.execute("SELECT asset_name FROM assets_view ORDER BY asset_name")
        assets = [r[0] for r in cur.fetchall()]
    for a in assets:
        for fn in (pf_trend, voltage_imbalance_trend):
            try:
                t = fn(a)
                if t:
                    out.append(t)
            except Exception as e:
                logger.debug("trend_slope %s failed for %s: %s", fn.__name__, a, e)
    return out
