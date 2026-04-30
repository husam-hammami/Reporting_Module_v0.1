"""RoiPayload composer — single source-of-truth for the ROI surface.

Plan §6.1 — the LLM never receives raw tag data; it gets this typed payload.
Phase A populates: money block + per-asset SEC/PF + savings ledger summary.
Phase B adds: forecasts (shift_pace, daily_bill, pf_trend).
Phase C adds: anomalies, levers (already wired here for early UI integration).
"""

from datetime import datetime, timedelta

from . import sec, pf_penalty, savings_ledger, levers
from .db import cursor


def build():
    """Compose the full RoiPayload. Cheap; called by /api/hercules-ai/roi-payload."""
    period_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    period_end = datetime.now()
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Asset list
    with cursor(dict_cursor=True) as (cur, _):
        cur.execute("""
            SELECT asset_name, has_energy_meter, has_production_counter, sec_available,
                   tracked_tags, energy_meters, production_counters
              FROM assets_view
          ORDER BY asset_name
        """)
        asset_rows = cur.fetchall()

    per_asset = []
    for r in asset_rows:
        asset = r['asset_name']
        sec_summary = sec.summary_for_asset(asset, period_hours=24) if r['sec_available'] else None
        pf_data = pf_penalty.compute_penalty(asset, period_start=period_start, period_end=period_end)
        per_asset.append({
            'asset': asset,
            'has_energy_meter': bool(r['has_energy_meter']),
            'has_production_counter': bool(r['has_production_counter']),
            'sec_available': bool(r['sec_available']),
            'sec': sec_summary,
            'pf': pf_data if pf_data.get('available') else None,
        })

    # 2. Savings (this month)
    savings = savings_ledger.summary(start=period_start, end=period_end)

    # 3. Top-3 levers
    try:
        top_levers = levers.top_levers(limit=3)
    except Exception:
        top_levers = []

    # 3b. Phase B — Forecasts + anomalies + trust score (Crystal Ball)
    forecasts_block = {'shift_pace': [], 'daily_bill': None, 'trends': []}
    anomalies_block = []
    trust_block = None
    try:
        from ai_forecast import shift_pace, daily_bill, trend_slope, anomaly, trust_score
        forecasts_block['shift_pace'] = shift_pace.project_all_assets()
        forecasts_block['daily_bill'] = daily_bill.project()
        forecasts_block['trends'] = trend_slope.all_trends()
        anomalies_block = anomaly.list_open_events(limit=5)
        trust_block = trust_score.compute()
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).debug("Phase B payload section failed: %s", e)

    # 4. Money block aggregates
    pf_penalty_omr_month = sum(
        (p['pf'] or {}).get('penalty_omr', 0) for p in per_asset if p['pf']
    )
    sec_excess_omr_today = sum(
        (p['sec'] or {}).get('excess_omr_today', 0) for p in per_asset if p['sec']
    )
    cost_omr_today = sum(
        (p['sec'] or {}).get('cost_omr_today', 0) for p in per_asset if p['sec']
    )

    money = {
        'savings_this_month_omr': savings['total_omr'],
        'savings_calibrating': savings['calibrating'],
        'pf_penalty_omr_month': round(pf_penalty_omr_month, 2),
        'sec_excess_omr_today': round(sec_excess_omr_today, 2),
        'cost_omr_today': round(cost_omr_today, 2),
    }

    # 5. Plant status verdict (deterministic — Phase C narrator may override)
    # Plain language only — never 'PF', 'SEC', etc. on a customer screen.
    if any(p['sec'] and (p['sec'].get('sec_delta_pct') or 0) > 15 for p in per_asset):
        verdict_level = 'warn'
        verdict_text = 'Using more energy than usual'
    elif any((p['pf'] or {}).get('penalty_omr', 0) > 0 for p in per_asset):
        verdict_level = 'warn'
        verdict_text = 'Electrical efficiency below target'
    else:
        verdict_level = 'ok'
        verdict_text = 'Running smoothly'

    return {
        'generated_at': datetime.now().isoformat(),
        'period_from': period_start.isoformat(),
        'period_to': period_end.isoformat(),
        'plant_status_level': verdict_level,
        'plant_status_verdict': verdict_text,
        'money': money,
        'savings': savings,
        'per_asset': per_asset,
        'levers': top_levers,
        'forecasts': forecasts_block,
        'anomalies': anomalies_block,
        'trust': trust_block,
    }
