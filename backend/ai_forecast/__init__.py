"""
ai_forecast — statistical Crystal Ball Layer.

Plan §5 — numpy-only forecasting (no ML libraries on client PC).
Phase B implementation; Phase A ships only the package skeleton so endpoints
in hercules_ai_bp can import without ImportError.

Modules (Phase B will populate):
    shift_pace      — end-of-shift projection from current totalizer rate
    daily_bill      — end-of-day OMR projection with EWMA
    baseline_24h    — Holt-Winters daily seasonality (numpy only)
    trend_slope     — linear regression for PF / voltage-imbalance health
    stuck_detector  — F1 promoted (no ML)
    accuracy_closer — nightly worker that fills actuals into model_accuracy_log
"""

# Phase B — Crystal Ball layer. Imported lazily by callers.
from . import filters
from . import shift_pace
from . import daily_bill
from . import trend_slope
from . import sec_drift
from . import anomaly
from . import accuracy_closer
from . import trust_score

__all__ = [
    'filters', 'shift_pace', 'daily_bill', 'trend_slope',
    'sec_drift', 'anomaly', 'accuracy_closer', 'trust_score',
]
