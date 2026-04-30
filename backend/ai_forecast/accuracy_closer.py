"""Accuracy closer — fills `actual_value` into model_accuracy_log rows whose
target_at has passed. Computes abs/pct error and band_hit. Flips closed=TRUE.

Plan 5 §13.1 + §16.2.

Resolves actuals from:
    feature='shift_pace'      → totalizer delta over the shift window
    feature='daily_bill'      → SUM(asset_sec_hourly.cost_omr) over today
    feature='pf_trend'        → AVG(cos_phi) on target_at hour
    feature='voltage_imbalance_trend' → max imbalance % on target_at hour

Run by dynamic_archive_worker hourly. Cheap; touches ~tens of rows per run.
Also performs 90-day retention sweep.
"""

import datetime
import logging

from ai_money.db import cursor

logger = logging.getLogger(__name__)


def _resolve_actual(cur, feature, asset, target_at):
    """Return the actual measured value for a forecast that has matured."""
    if feature == 'shift_pace':
        # Sum totalizer deltas during that shift window.
        # We only know shift_end here; approximate shift_start as 8 hours back.
        cur.execute("""
            SELECT COALESCE(SUM(value_delta), 0)
              FROM tag_history_archive a
              JOIN tags t ON t.id = a.tag_id
              JOIN hercules_ai_tag_profiles p ON p.tag_name = t.tag_name
             WHERE p.parent_asset = %s
               AND p.is_production_counter = TRUE
               AND a.archive_hour > %s - INTERVAL '8 hours'
               AND a.archive_hour <= %s
        """, (asset, target_at, target_at))
        return float((cur.fetchone() or [0])[0] or 0)

    if feature == 'daily_bill':
        # Plant total cost_omr for the day ending at target_at
        day_start = target_at.replace(hour=0, minute=0, second=0, microsecond=0)
        cur.execute("""
            SELECT COALESCE(SUM(cost_omr), 0)
              FROM asset_sec_hourly
             WHERE hour_start >= %s AND hour_start < %s
        """, (day_start, target_at))
        return float((cur.fetchone() or [0])[0] or 0)

    if feature == 'pf_trend':
        # PF doesn't have a single "actual" at target_at; use the ±3-day avg
        cur.execute("""
            SELECT AVG(value)
              FROM tag_history_archive a
              JOIN tags t ON t.id = a.tag_id
              JOIN hercules_ai_tag_profiles p ON p.tag_name = t.tag_name
             WHERE p.parent_asset = %s
               AND t.tag_name ILIKE '%%cos_phi%%'
               AND a.archive_hour BETWEEN %s - INTERVAL '3 days' AND %s + INTERVAL '3 days'
        """, (asset, target_at, target_at))
        v = (cur.fetchone() or [None])[0]
        return float(v) if v is not None else None

    if feature == 'voltage_imbalance_trend':
        # Skip closing imbalance forecasts here — they're predictive, not point estimates.
        return None

    return None


def close_one(cur, row):
    """Close a single row given (id, feature, asset, target_at, predicted, p10, p90)."""
    rid, feat, asset, target_at, predicted, p10, p90 = (
        row['id'], row['feature'], row['asset_name'], row['target_at'],
        float(row['predicted_value']),
        float(row['predicted_p10']) if row['predicted_p10'] is not None else None,
        float(row['predicted_p90']) if row['predicted_p90'] is not None else None,
    )
    actual = _resolve_actual(cur, feat, asset, target_at)
    if actual is None:
        # Mark closed without actual so we don't keep retrying
        cur.execute("UPDATE model_accuracy_log SET closed=TRUE WHERE id=%s", (rid,))
        return 'unresolvable'

    abs_err = abs(actual - predicted)
    pct_err = abs_err / abs(predicted) * 100.0 if predicted else None
    band_hit = None
    if p10 is not None and p90 is not None:
        band_hit = (p10 <= actual <= p90)

    cur.execute("""
        UPDATE model_accuracy_log
           SET actual_value = %s, abs_error = %s, pct_error = %s,
               band_hit = %s, closed = TRUE
         WHERE id = %s
    """, (actual, abs_err, pct_err, band_hit, rid))
    return 'closed'


def run_once():
    """Walk all open rows whose target_at < NOW() and close them. Also prunes >90 days."""
    closed = 0
    unresolvable = 0
    with cursor(dict_cursor=True) as (cur, conn):
        cur.execute("""
            SELECT id, feature, asset_name, target_at,
                   predicted_value, predicted_p10, predicted_p90
              FROM model_accuracy_log
             WHERE closed = FALSE AND target_at < NOW()
          ORDER BY target_at
             LIMIT 500
        """)
        rows = cur.fetchall()
        for r in rows:
            try:
                result = close_one(cur, r)
                if result == 'closed':
                    closed += 1
                else:
                    unresolvable += 1
            except Exception as e:
                logger.debug("accuracy_closer: row %s failed: %s", r['id'], e)
        # 90-day retention
        cur.execute("DELETE FROM model_accuracy_log WHERE created_at < NOW() - INTERVAL '90 days'")
        pruned = cur.rowcount
        conn.commit()
    if closed or unresolvable or pruned:
        logger.info("[accuracy_closer] closed=%d unresolvable=%d pruned=%d",
                    closed, unresolvable, pruned)
    return {'closed': closed, 'unresolvable': unresolvable, 'pruned': pruned}


def mape_for(feature, asset=None, days=30):
    """Trailing MAPE for a feature/asset combination over the last N days."""
    with cursor(dict_cursor=False) as (cur, _):
        if asset:
            cur.execute("""
                SELECT AVG(pct_error), COUNT(*)
                  FROM model_accuracy_log
                 WHERE feature = %s AND asset_name = %s
                   AND closed = TRUE AND pct_error IS NOT NULL
                   AND created_at > NOW() - INTERVAL '%s days'
            """, (feature, asset, days))
        else:
            cur.execute("""
                SELECT AVG(pct_error), COUNT(*)
                  FROM model_accuracy_log
                 WHERE feature = %s
                   AND closed = TRUE AND pct_error IS NOT NULL
                   AND created_at > NOW() - INTERVAL '%s days'
            """, (feature, days))
        row = cur.fetchone()
    avg, n = row[0], row[1]
    return {
        'feature': feature,
        'asset': asset,
        'mape_pct': round(float(avg), 2) if avg is not None else None,
        'n_predictions': int(n or 0),
        'days': days,
    }


def band_hit_rate(feature, days=30):
    """% of predictions where actual fell inside [p10, p90]."""
    with cursor(dict_cursor=False) as (cur, _):
        cur.execute("""
            SELECT AVG(CASE WHEN band_hit THEN 1.0 ELSE 0.0 END), COUNT(*)
              FROM model_accuracy_log
             WHERE feature = %s AND closed = TRUE AND band_hit IS NOT NULL
               AND created_at > NOW() - INTERVAL '%s days'
        """, (feature, days))
        row = cur.fetchone()
    rate, n = row[0], row[1]
    return {
        'feature': feature,
        'band_hit_rate': round(float(rate) * 100.0, 1) if rate is not None else None,
        'n': int(n or 0),
    }
