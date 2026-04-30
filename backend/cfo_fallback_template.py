"""CFO fallback briefing — deterministic template used when the LLM
validator rejects the model's output twice in a row.

Plan 5 §6.2 / §16.4 — guarantees the email always sends a coherent CFO
briefing, even when the LLM is offline / returns invalid JSON / fabricates
OMR figures. Strictly composes from the typed payload — no LLM calls.

Returns the same dict shape that build_cfo_briefing_prompt expects the LLM
to return, so the caller can feed it through the same renderer downstream.
"""


def render_from_payload(payload):
    """Build a CFO-style briefing dict from the typed RoiPayload, no LLM."""
    payload = payload or {}
    money = payload.get('money') or {}
    forecasts = payload.get('forecasts') or {}
    bill = forecasts.get('daily_bill') or {}
    levers = (payload.get('levers') or [])[:3]
    anomalies = (payload.get('anomalies') or [])[:3]
    verdict_text = payload.get('plant_status_verdict') or 'Standing by'

    actions = []
    for i, l in enumerate(levers):
        actions.append({
            'rank': i + 1,
            'headline': (l.get('headline') or '')[:60],
            'omr_per_month': int(round(l.get('omr_per_month', 0))),
            'evidence': (l.get('evidence') or '')[:200],
        })

    watch = []
    for a in anomalies:
        if a.get('headline'):
            watch.append({
                'severity': a.get('severity', 'warn'),
                'headline': a['headline'][:140],
                'evidence': (a.get('evidence') or '')[:200],
            })

    return {
        'verdict': verdict_text[:60],
        'money': {
            'savings_this_month_omr': int(round(money.get('savings_this_month_omr', 0) or 0)),
            'today_running_cost_omr': int(round(money.get('cost_omr_today', 0) or 0)),
            'today_projected_cost_omr': (
                int(round(bill.get('projected_omr', 0))) if bill.get('projected_omr') is not None else None
            ),
            'utility_penalty_omr_month': int(round(money.get('pf_penalty_omr_month', 0) or 0)),
        },
        'actions': actions,
        'watch': watch,
        'footer': 'Generated from Hercules deterministic template (LLM unavailable).',
    }
