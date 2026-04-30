"""Trust Score — single composite 0..100 visible to the user.

Plan 5 §13.5 + §16.7.

Composition:
    50% — forecast accuracy (1 − avg(MAPE) / target_MAPE), clamped to [0, 1]
    30% — anomaly precision (useful / (useful+noise) over last 30 events)
    20% — savings ledger dispute rate (1 − disputed / total)

Returns null if any component lacks data — Plan §16.5: "Trust Score is null
until all 3 components have ≥7 days of data."
"""

import logging

from ai_money.db import cursor
from . import accuracy_closer

logger = logging.getLogger(__name__)


_TARGETS = {
    'shift_pace': 8.0,
    'daily_bill': 6.0,
    'pf_trend': 10.0,
    'voltage_imbalance_trend': 10.0,
}


def _forecast_component():
    """Average MAPE conformance vs target across all forecast features."""
    scores = []
    has_data = False
    for feat, target in _TARGETS.items():
        m = accuracy_closer.mape_for(feat, days=30)
        if m['n_predictions'] >= 5 and m['mape_pct'] is not None:
            has_data = True
            ratio = 1.0 - (m['mape_pct'] / target)
            scores.append(max(0.0, min(1.0, ratio)))
    if not has_data:
        return None
    return sum(scores) / len(scores)


def _anomaly_component():
    """Useful-vs-noise feedback ratio."""
    with cursor(dict_cursor=False) as (cur, _):
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE label = 'useful')::float AS useful,
              COUNT(*)::float AS total
              FROM ml_anomaly_feedback
             WHERE created_at > NOW() - INTERVAL '30 days'
        """)
        row = cur.fetchone()
    useful, total = float(row[0] or 0), float(row[1] or 0)
    if total < 5:
        return None  # insufficient feedback (Plan §16.5 fatigue protection)
    return useful / total


def _ledger_component():
    """1 - disputed / total over current month."""
    with cursor(dict_cursor=False) as (cur, _):
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE disputed) AS disputed,
              COUNT(*) AS total
              FROM ai_savings_ledger
             WHERE detected_at > date_trunc('month', NOW())
        """)
        row = cur.fetchone()
    disputed, total = int(row[0] or 0), int(row[1] or 0)
    if total < 3:
        return None
    return 1.0 - (disputed / total)


def compute():
    """Composite Trust Score; returns dict with score (0..100) or None when calibrating."""
    f = _forecast_component()
    a = _anomaly_component()
    l = _ledger_component()
    if any(c is None for c in (f, a, l)):
        return {
            'score': None,
            'components': {
                'forecast_accuracy': f, 'anomaly_precision': a, 'ledger_trust': l,
            },
            'calibrating': True,
        }
    score = 0.50 * f + 0.30 * a + 0.20 * l
    return {
        'score': round(score * 100, 0),
        'components': {
            'forecast_accuracy': round(f, 3),
            'anomaly_precision': round(a, 3),
            'ledger_trust': round(l, 3),
        },
        'calibrating': False,
    }
