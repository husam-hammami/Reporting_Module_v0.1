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

    Strategy (Plan 6 hotfix — multi-fallback so the hero always has a number):
        Path A: Phase 1 _collect_tag_data_for_period + ai_kpi_scorer  (preferred)
        Path B: simple direct query against tag_history_archive       (always works)

    Returns: {value: int 0-100, breakdown: {...}, previous_omr: float|None} or None.

    Diagnostic logs are at WARNING so they actually surface in the System Logs
    page (root logger is WARNING level by default in app.py).
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    now = datetime.now()
    _log.warning("[plant_score] BEGIN computation at %s", now.isoformat(timespec='seconds'))

    # ── Path A: Phase 1 _collect_tag_data_for_period ──────────────────────
    try:
        import sys as _sys
        bp_mod = _sys.modules.get('hercules_ai_bp')
        if bp_mod is None:
            _log.warning("[plant_score] Path A SKIP: hercules_ai_bp not in sys.modules")
        else:
            collect_fn = getattr(bp_mod, '_collect_tag_data_for_period', None)
            if collect_fn is None:
                _log.warning("[plant_score] Path A SKIP: _collect_tag_data_for_period attr missing")
            else:
                from_dt = now - timedelta(hours=24)
                _log.warning("[plant_score] Path A: calling _collect_tag_data_for_period(None, %s, %s)",
                             from_dt.isoformat(timespec='seconds'), now.isoformat(timespec='seconds'))
                collected = collect_fn(None, from_dt, now)
                if isinstance(collected, tuple):
                    _log.warning("[plant_score] Path A FAILED: returned ERROR tuple = %s", collected)
                else:
                    n_templates = len(collected.get('templates') or [])
                    n_tag_data = len(collected.get('all_tag_data') or {})
                    n_profiles = len(collected.get('profile_map') or {})
                    _log.warning("[plant_score] Path A got dict: templates=%d tag_data=%d profiles=%d",
                                 n_templates, n_tag_data, n_profiles)
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
                    if kpi and kpi.get('score') is not None:
                        _log.warning("[plant_score] Path A SUCCESS: score=%s", kpi.get('score'))
                        previous_omr = _previous_day_omr(now)
                        return {
                            'value': kpi.get('score'),
                            'breakdown': kpi.get('breakdown') or {},
                            'efficiency': kpi.get('efficiency'),
                            'previous_omr': previous_omr,
                        }
                    _log.warning("[plant_score] Path A FAILED: kpi=%s no score", kpi)
    except Exception as e:
        _log.warning("[plant_score] Path A RAISED: %s", e, exc_info=True)

    # ── Path B: simple direct query ───────────────────────────────────────
    try:
        with cursor(dict_cursor=False) as (cur, _):
            cur.execute("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE quality_code = 'GOOD') AS good,
                       COALESCE(SUM(value_delta) FILTER (WHERE is_counter), 0) AS production
                  FROM tag_history_archive
                 WHERE archive_hour > NOW() - INTERVAL '24 hours'
                   AND (granularity = 'hourly' OR granularity IS NULL)
            """)
            row = cur.fetchone()
            if not row or not row[0]:
                _log.warning("[plant_score] Path B FAILED: tag_history_archive 0 rows in last 24h")
                # Path C: try without the granularity filter (some installs may have NULL or 'daily')
                cur.execute("SELECT COUNT(*), MAX(archive_hour) FROM tag_history_archive")
                tot_row = cur.fetchone()
                _log.warning("[plant_score] Path C diagnostic: total_rows=%s max_archive_hour=%s",
                             tot_row[0] if tot_row else None,
                             tot_row[1] if tot_row else None)
                return None
            total = int(row[0])
            good = int(row[1] or 0)
            production = float(row[2] or 0)
            quality_pct = (good / total * 100.0) if total else 50.0
            production_pct = 100.0 if production > 0 else 0.0
            score = round(0.70 * quality_pct + 0.30 * production_pct)
            score = max(0, min(100, int(score)))
            _log.warning("[plant_score] Path B SUCCESS: total=%d good=%d prod=%.1f score=%d",
                         total, good, production, score)
        return {
            'value': score,
            'breakdown': {},
            'efficiency': None,
            'previous_omr': _previous_day_omr(now),
        }
    except Exception as e:
        _log.warning("[plant_score] Path B RAISED: %s", e, exc_info=True)
        return None


def _previous_day_omr(now):
    """Sum cost_omr for yesterday from asset_sec_hourly. Returns float or None."""
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
                return float(row[0])
    except Exception:
        pass
    return None
