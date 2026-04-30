"""R-rules shim — noise reduction filters applied before any forecast or anomaly insert.

Plan 3 §"Noise reduction" defines R1-R8. This is a slim Phase-B-only version
(R3, R4, R5, R8) that does not require Plan 3's full infrastructure. When
Plan 3's `backend/ml/filters.py` lands, this module can be deleted and the
forecasters / detectors switched to import from there.

What's included here:
    R3 — Weekend / non-production mask  (Oman default Fri-Sat)
    R4 — Order-change buffer            (±15 min around order_name change)
    R5 — Minimum variance floor         (rolling 30-day CoV < 0.01 → reject)
    R8 — Quality code filter            (drop BAD/STALE/COMM_ERROR rows)

What's NOT here (deferred to Plan 3):
    R1 — Equipment-on gate (needs parent_boolean_tag column)
    R2 — Auto shutdown detection (needs interval-tree infra)
    R6 — Significance floor (handled inline in each detector)
    R7 — User exclusion windows (needs ml_exclusion_windows table)
"""

import datetime
import logging
from contextlib import closing

logger = logging.getLogger(__name__)


# ── Configuration ───────────────────────────────────────────────────────────
# Default Oman weekend. Override via hercules_ai_config.weekend_dows
# (list of ISO weekday numbers; 0=Monday, 6=Sunday).
_DEFAULT_WEEKEND_DOWS = [4, 5]  # Friday, Saturday

# Order-change buffer in minutes
_ORDER_CHANGE_BUFFER_MIN = 15

# Minimum coefficient of variation for a tag to be admitted
_MIN_COV = 0.01


def is_weekend(dt, weekend_dows=None):
    """R3 — return True if `dt` falls on a configured weekend day."""
    weekend_dows = weekend_dows or _DEFAULT_WEEKEND_DOWS
    return dt.weekday() in weekend_dows


def filter_weekend_mask(rows, dt_field='archive_hour', weekend_dows=None):
    """R3 — drop rows whose timestamp is in a weekend day."""
    weekend_dows = weekend_dows or _DEFAULT_WEEKEND_DOWS
    return [r for r in rows if r.get(dt_field) and not is_weekend(r[dt_field], weekend_dows)]


def filter_order_change_buffer(rows, dt_field='archive_hour', order_field='order_name',
                                buffer_min=_ORDER_CHANGE_BUFFER_MIN):
    """R4 — drop rows within ±buffer_min of an order_name change.

    Identifies change points in the sequence; masks rows in their neighbourhood.
    """
    if not rows:
        return rows
    sorted_rows = sorted(rows, key=lambda r: r.get(dt_field) or datetime.datetime.min)
    change_points = []
    prev_order = None
    for r in sorted_rows:
        cur_order = r.get(order_field)
        if cur_order != prev_order and prev_order is not None:
            change_points.append(r.get(dt_field))
        prev_order = cur_order
    if not change_points:
        return rows
    delta = datetime.timedelta(minutes=buffer_min)
    out = []
    for r in sorted_rows:
        ts = r.get(dt_field)
        if not ts:
            continue
        masked = any(abs((ts - cp).total_seconds()) <= delta.total_seconds()
                     for cp in change_points)
        if not masked:
            out.append(r)
    return out


def filter_quality(rows, quality_field='quality_code'):
    """R8 — drop rows with quality_code in {BAD, STALE, COMM_ERROR}."""
    bad = {'BAD', 'STALE', 'COMM_ERROR'}
    return [r for r in rows if (r.get(quality_field) or 'GOOD') not in bad]


def coefficient_of_variation(values):
    """R5 — return CoV (stddev/mean) for a list of numeric values; 0 if degenerate."""
    if not values:
        return 0.0
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    if mean == 0:
        return 0.0
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    stddev = var ** 0.5
    return stddev / abs(mean)


def is_low_variance(values):
    """R5 — True if a tag's recent history is too flat to admit."""
    return coefficient_of_variation(values) < _MIN_COV


def apply_pipeline(rows, weekend_mask=True, order_buffer=True, quality=True,
                   dt_field='archive_hour', weekend_dows=None):
    """Apply R3+R4+R8 in sequence. Returns filtered row list."""
    out = list(rows)
    if quality:
        out = filter_quality(out)
    if weekend_mask:
        out = filter_weekend_mask(out, dt_field=dt_field, weekend_dows=weekend_dows)
    if order_buffer:
        out = filter_order_change_buffer(out, dt_field=dt_field)
    return out


def get_weekend_dows(cur):
    """Read configured weekend days from hercules_ai_config; fall back to default."""
    try:
        from ai_money.db import get_config_value
        val = get_config_value(cur, 'weekend_dows', _DEFAULT_WEEKEND_DOWS)
        if isinstance(val, list) and all(isinstance(x, int) and 0 <= x <= 6 for x in val):
            return val
    except Exception:
        pass
    return _DEFAULT_WEEKEND_DOWS
