"""End-of-day energy-bill projection.

Plan 5 §5.3 — Phase B feature B2.

Math:
    so_far_omr   = Σ(asset_sec_hourly.cost_omr today, all assets)
    For each remaining hour h:
        kwh_h    = EWMA over last 30 same-day-of-week + same-hour samples
        omr_h    = cost.kwh_to_omr(kwh_h, hour=h)
    projected_omr = so_far_omr + Σ(omr_h)
    p10/p90       = projected ± 1.96 × σ(historic) × √(remaining_hours)

Tariff source:
    cost.kwh_to_omr handles both Plan 2 hourly tariff (when shipped) and the
    flat-rate fallback automatically. This forecaster doesn't need to know.

Returns plant-wide projection (single chart per Plan §16.7 — bill collapsed
from per-asset cards into one Band-4 surface).
"""

import datetime
import logging

from ai_money import cost
from ai_money.db import cursor

logger = logging.getLogger(__name__)

_FEATURE_ID = 'daily_bill'
_EWMA_ALPHA = 0.30                # weight on most recent observations
_WARM_UP_DAYS = 14


def _so_far_today_omr(cur):
    """Sum of asset_sec_hourly.cost_omr for today, across all assets."""
    today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    cur.execute("""
        SELECT COALESCE(SUM(cost_omr), 0)
          FROM asset_sec_hourly
         WHERE hour_start >= %s
    """, (today_start,))
    row = cur.fetchone()
    return float(row[0] or 0)


def _historic_hour_kwh(cur, target_dt, lookback_days=30):
    """Return list of total-plant kWh for the matching DOW × hour over lookback_days."""
    cutoff = target_dt - datetime.timedelta(days=lookback_days)
    target_dow = target_dt.weekday()
    target_hour = target_dt.hour
    cur.execute("""
        SELECT hour_start, SUM(kwh_consumed) AS kwh
          FROM asset_sec_hourly
         WHERE hour_start >= %s AND hour_start < %s
           AND EXTRACT(DOW FROM hour_start)::int = %s
           AND EXTRACT(HOUR FROM hour_start)::int = %s
      GROUP BY hour_start
      ORDER BY hour_start
    """, (cutoff, target_dt, _pg_dow(target_dow), target_hour))
    rows = cur.fetchall()
    return [float(r[1] or 0) for r in rows]


def _pg_dow(python_dow):
    """Convert Python's weekday() (Mon=0) to PostgreSQL DOW (Sun=0)."""
    return (python_dow + 1) % 7


def _ewma(values, alpha=_EWMA_ALPHA):
    """Exponentially weighted moving average; weights newest most heavily."""
    if not values:
        return None
    s = values[0]
    for v in values[1:]:
        s = alpha * v + (1 - alpha) * s
    return s


def _stddev(values):
    n = len(values)
    if n < 2:
        return None
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return var ** 0.5


def _log_prediction(cur, predicted, p10, p90, target_at):
    try:
        cur.execute("""
            INSERT INTO model_accuracy_log
              (feature, asset_name, predicted_at, horizon_minutes,
               target_at, predicted_value, predicted_p10, predicted_p90)
            SELECT %s, %s, NOW(), %s, %s, %s, %s, %s
             WHERE NOT EXISTS (
               SELECT 1 FROM model_accuracy_log
                WHERE feature=%s AND asset_name=%s
                  AND created_at > NOW() - INTERVAL '5 minutes'
             )
        """, (_FEATURE_ID, '__plant__',
              int((target_at - datetime.datetime.now()).total_seconds() / 60),
              target_at, predicted, p10, p90,
              _FEATURE_ID, '__plant__'))
    except Exception as e:
        logger.debug("Could not log daily_bill prediction: %s", e)


def project():
    """End-of-day OMR projection across the whole plant.

    Returns dict or None when warming up.
    """
    now = datetime.datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + datetime.timedelta(days=1)

    with cursor(dict_cursor=False) as (cur, conn):
        # Warm-up gate
        cur.execute("""
            SELECT COUNT(DISTINCT date_trunc('day', hour_start))
              FROM asset_sec_hourly
        """)
        days_avail = int((cur.fetchone() or [0])[0] or 0)

        so_far = _so_far_today_omr(cur)

        if days_avail < _WARM_UP_DAYS:
            return {
                'so_far_omr': round(so_far, 2),
                'projected_omr': None,
                'p10_omr': None,
                'p90_omr': None,
                'last_week_same_day_omr': None,
                'accuracy_label': 'learning',
                'days_available': days_avail,
                'warm_up_days_required': _WARM_UP_DAYS,
            }

        # Project each remaining hour using EWMA of historic same-DOW-same-hour kWh
        per_hour_kwh = {}
        per_hour_omr_samples = []                  # for stddev
        cur_hour = now.replace(minute=0, second=0, microsecond=0) + datetime.timedelta(hours=1)
        while cur_hour < today_end:
            history = _historic_hour_kwh(cur, cur_hour)
            if history:
                forecast_kwh = _ewma(history)
            else:
                forecast_kwh = 0.0
            per_hour_kwh[cur_hour] = forecast_kwh
            # Convert to OMR for that hour
            omr_h = cost.kwh_to_omr(cur, forecast_kwh, cur_hour)
            per_hour_omr_samples.append(omr_h)
            cur_hour = cur_hour + datetime.timedelta(hours=1)

        projected_remaining_omr = sum(per_hour_omr_samples)
        projected_total = so_far + projected_remaining_omr
        remaining_h = (today_end - now).total_seconds() / 3600.0

        # Confidence band — stddev of hourly OMR samples × √remaining_h
        stddev = _stddev(per_hour_omr_samples) if len(per_hour_omr_samples) >= 2 else None
        p10 = p90 = None
        if stddev is not None and remaining_h > 0:
            margin = 1.96 * stddev * (remaining_h ** 0.5)
            p10 = max(0.0, projected_total - margin)
            p90 = projected_total + margin

        # Last-same-day-of-week for the "vs last X" comparison label
        last_week = today_start - datetime.timedelta(days=7)
        last_week_end = last_week + datetime.timedelta(days=1)
        cur.execute("""
            SELECT COALESCE(SUM(cost_omr), 0)
              FROM asset_sec_hourly
             WHERE hour_start >= %s AND hour_start < %s
        """, (last_week, last_week_end))
        last_week_omr = float((cur.fetchone() or [0])[0] or 0)

        _log_prediction(cur, projected_total, p10, p90, today_end)
        conn.commit()

    accuracy_label = 'reliable' if days_avail >= 30 else 'roughly-right'

    return {
        'so_far_omr': round(so_far, 2),
        'projected_omr': round(projected_total, 2),
        'p10_omr': round(p10, 2) if p10 is not None else None,
        'p90_omr': round(p90, 2) if p90 is not None else None,
        'last_week_same_day_omr': round(last_week_omr, 2) if last_week_omr > 0 else None,
        'accuracy_label': accuracy_label,
        'days_available': days_avail,
        'remaining_hours': round(remaining_h, 1),
    }
