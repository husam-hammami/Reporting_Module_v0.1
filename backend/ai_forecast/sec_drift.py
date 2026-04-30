"""SEC drift detection — has energy-per-ton crept up vs prior weeks?

Plan 5 §5.4 — feature B3 (companion to trend_slope).

Algorithm:
    1. Compute median SEC over the last 7 days (R-filtered, hourly granularity).
    2. Compute median SEC over the prior 21 days (days 7..28 ago).
    3. Drift % = (recent − baseline) / baseline × 100
    4. Trigger when drift > 8% AND condition has held for 48 hours
       (we approximate "sustained" by requiring the last 48 hours of
       hourly SEC values to all exceed baseline × 1.05 — slightly looser
       than the headline threshold to avoid all-or-nothing flickering).

Returns one event per asset that's drifting; nothing if all stable.

Estimated OMR impact:
    excess_kwh_per_ton = (recent_sec − baseline_sec)
    daily_excess_kwh   = excess_kwh_per_ton × (last 7-day daily average tons)
    omr/day            = daily_excess_kwh × tariff
    omr/month          = ×30 (rough monthly ROI for the lever panel)
"""

import datetime
import logging

from ai_money import cost
from ai_money.db import cursor

logger = logging.getLogger(__name__)


_DRIFT_THRESHOLD_PCT = 8.0
_HOLD_HOURS = 48
_HOLD_FACTOR = 1.05            # all last-48h hours must exceed baseline × 1.05


def _median(values):
    s = sorted(v for v in values if v is not None)
    n = len(s)
    if n == 0:
        return None
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _hourly_sec(cur, asset, t_from, t_to):
    cur.execute("""
        SELECT sec_kwh_per_t
          FROM asset_sec_hourly
         WHERE asset_name = %s
           AND hour_start >= %s AND hour_start < %s
           AND sec_kwh_per_t IS NOT NULL
      ORDER BY hour_start
    """, (asset, t_from, t_to))
    return [float(r[0]) for r in cur.fetchall() if r[0] is not None]


def _avg_daily_tons(cur, asset, days=7):
    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
    cur.execute("""
        SELECT date_trunc('day', hour_start) AS d, SUM(kg_produced) AS kg
          FROM asset_sec_hourly
         WHERE asset_name = %s AND hour_start >= %s
      GROUP BY d
    """, (asset, cutoff))
    rows = cur.fetchall()
    if not rows:
        return 0.0
    daily_tons = [float(r[1] or 0) / 1000.0 for r in rows]
    return sum(daily_tons) / len(daily_tons) if daily_tons else 0.0


def check_asset(asset):
    """Returns drift event dict or None."""
    now = datetime.datetime.now()
    recent_from = now - datetime.timedelta(days=7)
    baseline_from = now - datetime.timedelta(days=28)
    baseline_to = recent_from
    hold_from = now - datetime.timedelta(hours=_HOLD_HOURS)

    with cursor(dict_cursor=False) as (cur, conn):
        recent_vals = _hourly_sec(cur, asset, recent_from, now)
        baseline_vals = _hourly_sec(cur, asset, baseline_from, baseline_to)
        if len(recent_vals) < 24 or len(baseline_vals) < 100:
            return None  # not enough data for stable medians

        recent_med = _median(recent_vals)
        baseline_med = _median(baseline_vals)
        if recent_med is None or baseline_med is None or baseline_med <= 0:
            return None

        drift_pct = (recent_med - baseline_med) / baseline_med * 100.0
        if drift_pct < _DRIFT_THRESHOLD_PCT:
            return None

        hold_vals = _hourly_sec(cur, asset, hold_from, now)
        if len(hold_vals) < int(_HOLD_HOURS * 0.6):
            return None
        if not all(v >= baseline_med * _HOLD_FACTOR for v in hold_vals):
            return None  # not sustained

        # Estimate OMR impact
        excess_per_ton = recent_med - baseline_med
        daily_tons = _avg_daily_tons(cur, asset, days=7)
        daily_excess_kwh = max(0.0, excess_per_ton * daily_tons)
        daily_omr = cost.kwh_to_omr(cur, daily_excess_kwh, now) if daily_excess_kwh > 0 else 0.0
        monthly_omr = round(daily_omr * 30, 2)

        # Insert event into ml_anomaly_events (no duplicate per 24h)
        cur.execute("""
            INSERT INTO ml_anomaly_events
              (feature_id, window_from, window_to, asset_name, severity,
               score, significance, delta_pct, baseline_value, observed_value,
               headline, evidence, omr_at_risk)
            SELECT 'sec_drift', %s, %s, %s, %s,
                   %s, %s, %s, %s, %s,
                   %s, %s, %s
             WHERE NOT EXISTS (
                SELECT 1 FROM ml_anomaly_events
                 WHERE feature_id = 'sec_drift' AND asset_name = %s
                   AND detected_at > NOW() - INTERVAL '24 hours'
                   AND suppressed = FALSE
             )
        """, (
            recent_from, now, asset, 'warn' if drift_pct < 15 else 'crit',
            float(drift_pct), 0.85,
            float(drift_pct), float(baseline_med), float(recent_med),
            f"Energy use rising on {asset}",
            f"Energy per ton up {drift_pct:.1f}% over 7 days vs prior 3 weeks "
            f"({baseline_med:.1f} → {recent_med:.1f} kWh/ton). "
            f"Sustained for the last {_HOLD_HOURS} hours.",
            monthly_omr,
            asset,
        ))
        conn.commit()

    return {
        'asset': asset,
        'metric': 'energy_per_ton',
        'recent_kwh_per_t': round(recent_med, 1),
        'baseline_kwh_per_t': round(baseline_med, 1),
        'drift_pct': round(drift_pct, 1),
        'sustained_hours': _HOLD_HOURS,
        'estimated_omr_per_month_at_risk': monthly_omr,
        'severity': 'warn' if drift_pct < 15 else 'crit',
    }


def check_all():
    out = []
    with cursor(dict_cursor=False) as (cur, _):
        cur.execute("SELECT asset_name FROM assets_view WHERE sec_available = TRUE")
        assets = [r[0] for r in cur.fetchall()]
    for a in assets:
        try:
            r = check_asset(a)
            if r:
                out.append(r)
        except Exception as e:
            logger.debug("sec_drift check failed for %s: %s", a, e)
    return out
