"""Power factor penalty + capacitor sizing.

Plan §4.3 — derives:
    pf_avg over a billing period
    penalty OMR (zero when PF >= target)
    required kvar correction to reach target_correction (default 0.95)
    capacitor bank cost OMR + payback months

Tag conventions assumed (matches Salalah export):
    cos_phi tags          — name contains 'cos_phi' or unit 'pf'/'cos_phi'
    apparent_power tags   — name contains 'apparent_power', unit 'kVA'
    reactive_power tags   — 'reactive_power', unit 'kvar'
    effective_power tags  — 'effective_power' or 'active_power', unit 'kW'
    total_active_energy   — 'total_active_energy', unit 'kWh'
    total_reactive_energy — 'total_reactive_energy', unit 'kvarh'
"""

import math
from datetime import datetime, timedelta

from .db import cursor, get_config_value, derive_asset


def _list_pf_tags(cur, asset):
    """Return tag IDs for the asset's PF, kWh, kvarh, kW tags.

    Plan 6 hotfix: matches a tag to the asset via derive_asset (which
    falls through to tag_name pattern and line_name when parent_asset
    isn't populated).
    """
    asset_lower = (asset or '').strip().lower()
    cur.execute("""
        SELECT t.id, t.tag_name, p.parent_asset, p.line_name
          FROM hercules_ai_tag_profiles p
          JOIN tags t ON t.tag_name = p.tag_name
         WHERE p.is_tracked = TRUE
    """)
    rows = cur.fetchall()
    out = {'pf': [], 'kwh_total': [], 'kvarh_total': [], 'kw_now': []}
    for r in rows:
        if isinstance(r, dict):
            tid, name, pa, ln = r['id'], r['tag_name'], r.get('parent_asset'), r.get('line_name')
        else:
            tid, name, pa, ln = r[0], r[1], r[2], r[3]
        derived = derive_asset(name, pa, ln)
        if not derived or derived.lower() != asset_lower:
            continue
        n = (name or '').lower()
        if 'cos_phi' in n or n.endswith('_pf'):
            out['pf'].append(tid)
        elif 'total_active_energy' in n:
            out['kwh_total'].append(tid)
        elif 'total_reactive_energy' in n:
            out['kvarh_total'].append(tid)
        elif 'effective_power' in n or 'active_power' in n:
            out['kw_now'].append(tid)
    return out


def _avg_value_archive(cur, tag_ids, t_from, t_to):
    """Average reading over period (for cos_phi avg)."""
    if not tag_ids:
        return None
    cur.execute("""
        SELECT AVG(value)
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND archive_hour >  %s
           AND archive_hour <= %s
           AND (granularity = 'hourly' OR granularity IS NULL)
    """, (list(tag_ids), t_from, t_to))
    row = cur.fetchone()
    val = row[0] if not isinstance(row, dict) else list(row.values())[0]
    return float(val) if val is not None else None


def _sum_delta_archive(cur, tag_ids, t_from, t_to):
    if not tag_ids:
        return 0.0
    cur.execute("""
        SELECT COALESCE(SUM(value_delta), 0)
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND archive_hour >  %s
           AND archive_hour <= %s
           AND (granularity = 'hourly' OR granularity IS NULL)
    """, (list(tag_ids), t_from, t_to))
    row = cur.fetchone()
    val = row[0] if not isinstance(row, dict) else list(row.values())[0]
    return float(val or 0)


def _last_value_archive(cur, tag_ids):
    if not tag_ids:
        return None
    cur.execute("""
        SELECT value
          FROM tag_history_archive
         WHERE tag_id = ANY(%s)
           AND (granularity = 'hourly' OR granularity IS NULL)
      ORDER BY archive_hour DESC LIMIT 1
    """, (list(tag_ids),))
    row = cur.fetchone()
    val = row[0] if not isinstance(row, dict) else list(row.values())[0]
    return float(val) if val is not None else None


def compute_penalty(asset, period_start=None, period_end=None):
    """Compute the PF penalty + capacitor sizing recommendation for an asset.

    Returns:
        {
          asset,
          pf_avg, pf_target,
          kwh, kvarh,
          penalty_omr,
          required_kvar (to reach target_correction),
          capacitor_cost_omr, payback_months,
          available  (False if no PF / kWh tags configured)
        }
    """
    if period_end is None:
        period_end = datetime.now()
    if period_start is None:
        period_start = period_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    with cursor(dict_cursor=False) as (cur, _):
        pf_target = float(get_config_value(cur, 'pf_target', 0.90))
        penalty_rate_bz = float(get_config_value(cur, 'pf_penalty_rate_bz_per_kvarh', 4.0))
        capacitor_cost_per_kvar = float(get_config_value(cur, 'capacitor_cost_omr_per_kvar', 12))
        target_correction = float(get_config_value(cur, 'pf_correction_target', 0.95))

        tags = _list_pf_tags(cur, asset)
        if not tags['pf']:
            return {
                'asset': asset,
                'available': False,
                'pf_avg': None, 'pf_target': pf_target,
                'kwh': 0, 'kvarh': 0,
                'penalty_omr': 0,
                'required_kvar': 0,
                'capacitor_cost_omr': 0,
                'payback_months': None,
            }

        pf_avg = _avg_value_archive(cur, tags['pf'], period_start, period_end)
        kwh = _sum_delta_archive(cur, tags['kwh_total'], period_start, period_end)
        kvarh = _sum_delta_archive(cur, tags['kvarh_total'], period_start, period_end)
        kw_now = _last_value_archive(cur, tags['kw_now']) or 0.0

    # Penalty: when pf_avg < target, charge for excess kvarh above target's allowance
    penalty_omr = 0.0
    if pf_avg is not None and pf_avg < pf_target and kwh > 0 and kvarh > 0:
        # Excess kvarh: kvarh consumed beyond what target PF would allow at the same kWh.
        # tan(arccos(target)) is the kvarh/kwh ratio allowed at target PF.
        allowed_kvarh = kwh * math.tan(math.acos(pf_target))
        excess_kvarh = max(0.0, kvarh - allowed_kvarh)
        penalty_omr = (excess_kvarh * penalty_rate_bz) / 1000.0  # baisa → OMR

    # Capacitor sizing — based on current kW (not period kWh) since this sizes a physical bank
    required_kvar = 0.0
    if pf_avg is not None and kw_now > 0 and pf_avg < target_correction:
        try:
            required_kvar = kw_now * (math.tan(math.acos(pf_avg)) - math.tan(math.acos(target_correction)))
            required_kvar = max(0.0, required_kvar)
        except ValueError:
            required_kvar = 0.0

    capacitor_cost = required_kvar * capacitor_cost_per_kvar
    payback_months = None
    if penalty_omr > 0 and capacitor_cost > 0:
        # Annualise this month's penalty, divide annual cost-avoidance into the bank cost
        annual_avoided = penalty_omr * 12.0
        if annual_avoided > 0:
            payback_months = capacitor_cost / (annual_avoided / 12.0)

    return {
        'asset': asset,
        'available': True,
        'pf_avg': round(pf_avg, 3) if pf_avg is not None else None,
        'pf_target': pf_target,
        'kwh': round(kwh, 1),
        'kvarh': round(kvarh, 1),
        'penalty_omr': round(penalty_omr, 2),
        'required_kvar': round(required_kvar, 1),
        'capacitor_cost_omr': round(capacitor_cost, 2),
        'payback_months': round(payback_months, 1) if payback_months is not None else None,
        'period_start': period_start.isoformat(),
        'period_end': period_end.isoformat(),
    }
