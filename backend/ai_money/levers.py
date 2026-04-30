"""Top-3 ROI levers — ranked by OMR/month, surfaced on the Levers panel.

Plan §6.3 + §16.7 — the close-the-sale card. Six lever generators (L1–L6),
top 3 by `omr_per_month` are surfaced. Missing slots fill with the honest
"plant well-tuned" empty state.

Levers (Phase A enables L1, L2; L3–L6 are skeletons activated as data exists):
    L1 — Capacitor install on asset (PF avg < target)
    L2 — Investigate yield drift on Mill B (extraction % drift > 1%)
    L3 — Shift load off-peak (requires hourly tariff from Plan 2)
    L4 — Repair stuck totalizer (requires Plan 3 F1 stuck-detector)
    L5 — Voltage rebalance (requires Phase B trend-slope)
    L6 — Reduce idle running (requires Phase B anomaly detector)

Each lever generator returns a dict (or None if not applicable):
    {
      id: 'L1', asset, headline,
      omr_per_month, omr_per_year,
      one_time_cost_omr, payback_months,
      confidence_pct, evidence, evidence_link, rank
    }
"""

from datetime import datetime
from . import pf_penalty
from .db import cursor, get_config_value


def _list_assets(cur):
    cur.execute("SELECT asset_name FROM assets_view ORDER BY asset_name")
    return [r[0] if not isinstance(r, dict) else r.get('asset_name') for r in cur.fetchall()]


def _generate_l1_capacitor(cur, asset):
    """L1 — capacitor install when PF averages below target this month."""
    p = pf_penalty.compute_penalty(asset)
    if not p.get('available'):
        return None
    if p.get('penalty_omr', 0) <= 0 or p.get('required_kvar', 0) <= 0:
        return None
    return {
        'id': 'L1', 'asset': asset,
        'headline': f"Add power-correction equipment on {asset}",
        'omr_per_month': round(p['penalty_omr'], 2),
        'omr_per_year': round(p['penalty_omr'] * 12, 2),
        'one_time_cost_omr': p['capacitor_cost_omr'],
        'payback_months': p['payback_months'],
        'confidence_pct': 80,
        'evidence': f"Electrical efficiency averaged {p['pf_avg']:.2f} this month — utility expects {p['pf_target']:.2f} or higher. "
                    f"Utility penalty {p['penalty_omr']:.0f} OMR/month at current usage.",
        'evidence_link': f"/insights/{asset.lower().replace(' ', '_')}?metric=pf",
    }


def _generate_l2_yield(cur, asset):
    """L2 — yield drift on Mill B (only Mill B has flour/bran percentage tags today)."""
    if 'mill b' not in asset.lower() and 'mil b' not in asset.lower():
        return None
    cur.execute("""
        SELECT
            AVG(flour_pct) FILTER (WHERE hour_start > NOW() - INTERVAL '7 days') AS recent_flour,
            AVG(flour_pct) FILTER (WHERE hour_start > NOW() - INTERVAL '37 days'
                                     AND hour_start <= NOW() - INTERVAL '7 days') AS baseline_flour,
            SUM(drift_omr_vs_baseline) FILTER (WHERE hour_start > NOW() - INTERVAL '7 days') AS week_drift_omr
          FROM asset_yield_hourly
         WHERE asset_name = %s
    """, (asset,))
    row = cur.fetchone()
    if not row:
        return None
    if isinstance(row, dict):
        recent = row.get('recent_flour')
        baseline = row.get('baseline_flour')
        week_omr = row.get('week_drift_omr') or 0
    else:
        recent, baseline, week_omr = row[0], row[1], row[2] or 0
    if recent is None or baseline is None:
        return None
    drift = float(baseline) - float(recent)
    if drift < 1.0:
        return None
    monthly_omr = float(week_omr) * 30 / 7  # extrapolate week → month
    if monthly_omr < 25:
        return None
    return {
        'id': 'L2', 'asset': asset,
        'headline': f"Check why flour output dropped on {asset}",
        'omr_per_month': round(monthly_omr, 2),
        'omr_per_year': round(monthly_omr * 12, 2),
        'one_time_cost_omr': 0,
        'payback_months': 0,
        'confidence_pct': 70,
        'evidence': f"Flour extraction down {drift:.1f}% over the last 7 days. "
                    f"Estimated lost revenue: ~{week_omr:.0f} OMR per week.",
        'evidence_link': f"/insights/{asset.lower().replace(' ', '_')}?metric=yield",
    }


def _generate_l3_off_peak(cur, asset):
    """L3 — shift flexible load off-peak. Gated on hourly tariff availability."""
    from . import cost
    if not cost.is_hourly_tariff_available(cur):
        return None
    # Phase A returns None — Phase B unlocks this with peak/off-peak kWh analysis.
    return None


def _generate_l4_stuck(cur, asset):
    """L4 — repair stuck totalizer. Phase B (depends on F1 detector)."""
    return None


def _generate_l5_voltage(cur, asset):
    """L5 — voltage rebalance. Phase B (depends on trend-slope)."""
    return None


def _generate_l6_idle(cur, asset):
    """L6 — reduce idle running. Phase B (depends on anomaly detector)."""
    return None


_GENERATORS = [
    _generate_l1_capacitor,
    _generate_l2_yield,
    _generate_l3_off_peak,
    _generate_l4_stuck,
    _generate_l5_voltage,
    _generate_l6_idle,
]


def top_levers(limit=3):
    """Compute, rank, and return the top-N levers across all assets."""
    candidates = []
    with cursor(dict_cursor=True) as (cur, _):
        assets = _list_assets(cur)
        for asset in assets:
            for gen in _GENERATORS:
                try:
                    lever = gen(cur, asset)
                    if lever:
                        candidates.append(lever)
                except Exception:
                    # Lever generation must never crash the page
                    continue
    candidates.sort(key=lambda x: x.get('omr_per_month', 0), reverse=True)
    top = candidates[:limit]
    for i, lever in enumerate(top):
        lever['rank'] = i + 1
    return top
