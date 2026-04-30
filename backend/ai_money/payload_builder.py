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
    # Per-call try/except so one failure doesn't blank the whole block.
    forecasts_block = {'shift_pace': [], 'daily_bill': None, 'trends': []}
    anomalies_block = []
    trust_block = None
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        from ai_forecast import shift_pace
        forecasts_block['shift_pace'] = shift_pace.project_all_assets()
    except Exception as e:
        _log.debug("shift_pace.project_all_assets failed: %s", e)
    try:
        from ai_forecast import daily_bill
        forecasts_block['daily_bill'] = daily_bill.project()
    except Exception as e:
        _log.debug("daily_bill.project failed: %s", e)
    try:
        from ai_forecast import trend_slope
        forecasts_block['trends'] = trend_slope.all_trends()
    except Exception as e:
        _log.debug("trend_slope.all_trends failed: %s", e)
    try:
        from ai_forecast import anomaly
        anomalies_block = anomaly.list_open_events(limit=5)
    except Exception as e:
        _log.debug("anomaly.list_open_events failed: %s", e)
    try:
        from ai_forecast import trust_score
        trust_block = trust_score.compute()
    except Exception as e:
        _log.debug("trust_score.compute failed: %s", e)

    # 3c. Phase 1 plant_score (boardroom card hero fallback)
    # Lightweight: pulls last-24h tag data + computes the composite KPI.
    # Never raises — boardroom card has its own fallback if this returns None.
    plant_score_block = _compute_plant_score()

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
        'plant_score': plant_score_block,
    }


def _compute_plant_score():
    """Compute Phase 1's KPI composite score over the last 24 h for the boardroom hero.

    Returns: {value: int 0-100, breakdown: {...}, previous_omr: float|None} or None.
    Cached implicitly by the 30 s frontend poll cadence — no LRU here.
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        import sys as _sys
        # Use the same data-collection helper that /insights uses
        bp_mod = _sys.modules.get('hercules_ai_bp')
        if bp_mod is None:
            return None
        collect_fn = getattr(bp_mod, '_collect_tag_data_for_period', None)
        if collect_fn is None:
            return None
        now = datetime.now()
        from_dt = now - timedelta(hours=24)
        collected = collect_fn(None, from_dt, now)
        if isinstance(collected, tuple):
            return None  # error tuple
        import ai_kpi_scorer as _scorer
        ai_cfg = collected.get('ai_config', {}) or {}
        try:
            tariff = float(ai_cfg.get('electricity_tariff_omr_per_kwh', 0.025))
        except (ValueError, TypeError):
            tariff = 0.025
        kpi = _scorer.compute_kpi_score(
            tag_data=collected.get('all_tag_data') or {},
            prev_tag_data=collected.get('prev_tag_data') or {},
            profiles=collected.get('profile_map') or {},
            tariff_omr_per_kwh=tariff,
        )
        # Previous-day plant OMR for the "Yesterday: X" sub-line on the boardroom card
        previous_omr = None
        try:
            with cursor(dict_cursor=False) as (cur, _):
                yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                yesterday_end = yesterday_start + timedelta(days=1)
                cur.execute("""
                    SELECT COALESCE(SUM(cost_omr), 0)
                      FROM asset_sec_hourly
                     WHERE hour_start >= %s AND hour_start < %s
                """, (yesterday_start, yesterday_end))
                row = cur.fetchone()
                if row and row[0]:
                    previous_omr = float(row[0])
        except Exception as e:
            _log.debug("plant_score previous_omr lookup failed: %s", e)
        return {
            'value': kpi.get('score'),
            'breakdown': kpi.get('breakdown') or {},
            'efficiency': kpi.get('efficiency'),
            'previous_omr': previous_omr,
        }
    except Exception as e:
        _log.debug("plant_score compute failed: %s", e)
        return None
