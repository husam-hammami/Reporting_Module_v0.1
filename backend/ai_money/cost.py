"""Convert kWh to OMR using whichever tariff is configured.

Plan §4.4 — kWh to OMR, hourly granularity.

Resolution order:
    1. electricity_tariffs table (Plan 2) — when shipped, use proper APSR 4-component model.
    2. hercules_ai_config.electricity_tariff_omr_per_kwh — flat rate (current default).

Phase A uses the flat rate. The tariff-table path is gated by
table existence (avoids hard dep on Plan 2). When Plan 2 ships, the
hourly path activates automatically.
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Sentinel: Phase A flat-rate fallback if both DB sources fail
_FALLBACK_OMR_PER_KWH = 0.025


def _flat_rate_from_config(cur):
    """Fetch the flat tariff rate from hercules_ai_config."""
    from .db import get_config_value
    rate = get_config_value(cur, 'electricity_tariff_omr_per_kwh', _FALLBACK_OMR_PER_KWH)
    try:
        return float(rate)
    except (ValueError, TypeError):
        return _FALLBACK_OMR_PER_KWH


def _has_tariff_table(cur):
    """Return True if Plan 2's tariff table is present and has at least one active row."""
    try:
        cur.execute("""
            SELECT 1 FROM information_schema.tables
             WHERE table_name = 'electricity_tariffs' LIMIT 1
        """)
        if not cur.fetchone():
            return False
        cur.execute("""
            SELECT 1 FROM electricity_tariffs
             WHERE (effective_to IS NULL OR effective_to >= CURRENT_DATE)
               AND effective_from <= CURRENT_DATE
             LIMIT 1
        """)
        return bool(cur.fetchone())
    except Exception:
        return False


def _hourly_rate_from_tariff(cur, when):
    """Read hourly energy rate from electricity_tariffs (baisa/kWh).

    Returns (rate_baisa_per_kwh, duos_baisa_per_kwh) or None if unavailable.
    """
    try:
        month = when.month
        hour = when.hour
        cur.execute("""
            SELECT energy_charges_bz, summer_months, duos_bz_per_kwh
              FROM electricity_tariffs
             WHERE (effective_to IS NULL OR effective_to >= %s)
               AND effective_from <= %s
          ORDER BY effective_from DESC LIMIT 1
        """, (when.date(), when.date()))
        row = cur.fetchone()
        if not row:
            return None
        # Row may be RealDict or tuple
        if isinstance(row, dict):
            charges = row.get('energy_charges_bz') or {}
            summer_months = row.get('summer_months') or [6, 7, 8, 9]
            duos = float(row.get('duos_bz_per_kwh') or 0)
        else:
            charges = row[0] or {}
            summer_months = row[1] or [6, 7, 8, 9]
            duos = float(row[2] or 0)
        season = 'summer' if month in summer_months else 'winter'
        rates_24h = charges.get(season, [])
        if not rates_24h or len(rates_24h) <= hour:
            return None
        return (float(rates_24h[hour]), duos)
    except Exception as e:
        logger.debug("Tariff hourly lookup failed (falling back to flat): %s", e)
        return None


def kwh_to_omr(cur, kwh, when=None):
    """Convert kWh consumed at `when` to OMR. Cursor required for tariff lookup.

    Uses the proper Oman CRT model when Plan 2's table is populated; flat rate otherwise.
    """
    if kwh is None or kwh <= 0:
        return 0.0
    when = when or datetime.now()
    if _has_tariff_table(cur):
        bz_rates = _hourly_rate_from_tariff(cur, when)
        if bz_rates:
            energy_bz, duos_bz = bz_rates
            # 1000 baisa = 1 OMR
            return kwh * (energy_bz + duos_bz) / 1000.0
    # Flat-rate fallback
    return kwh * _flat_rate_from_config(cur)


def kwh_to_omr_window(cur, kwh, t_from, t_to):
    """Convert kWh consumed across [t_from, t_to] to OMR using midpoint hour."""
    if kwh is None or kwh <= 0 or t_to <= t_from:
        return 0.0
    midpoint = t_from + (t_to - t_from) / 2
    return kwh_to_omr(cur, kwh, midpoint)


def is_hourly_tariff_available(cur):
    """Public predicate — used by levers.py to gate the off-peak shift recommendation."""
    return _has_tariff_table(cur)


def per_hour_breakdown(cur, kwh_per_hour, t_from, t_to):
    """Return [{hour_start, kwh, omr, baisa_per_kwh}] for tooltip display.

    `kwh_per_hour`: dict mapping hour datetime → kwh value
    """
    out = []
    has_tariff = _has_tariff_table(cur)
    flat_rate = _flat_rate_from_config(cur)
    for hour, kwh in sorted(kwh_per_hour.items()):
        if hour < t_from or hour >= t_to:
            continue
        rate_omr_per_kwh = flat_rate
        rate_source = 'flat'
        if has_tariff:
            tariff = _hourly_rate_from_tariff(cur, hour)
            if tariff:
                rate_omr_per_kwh = sum(tariff) / 1000.0
                rate_source = 'tariff'
        out.append({
            'hour_start': hour.isoformat(),
            'kwh': round(float(kwh), 3),
            'omr': round(float(kwh) * rate_omr_per_kwh, 4),
            'rate': round(rate_omr_per_kwh, 5),
            'rate_source': rate_source,
        })
    return out
