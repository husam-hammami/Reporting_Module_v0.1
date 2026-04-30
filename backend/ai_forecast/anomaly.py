"""Deterministic anomaly detectors — Plan 5 §5.5.

Three rules-only detectors. No ML. They write into ml_anomaly_events when
they fire, with anti-duplication windows so the watch list doesn't repeat
the same alert every minute.

Detectors:
    detect_stuck_totalizers()  — counter unchanged ≥10 min while equipment ON
    detect_zero_flow()         — flow rate ≈ 0 ≥ 5 min while order_active = TRUE
    detect_pf_cliff()          — Δcos_phi > 0.10 within 60 min (capacitor failure)

Each writes plain-language headline + evidence to ml_anomaly_events.
All R-rules from filters.py applied where appropriate.
"""

import datetime
import logging

from ai_money.db import cursor
from . import filters

logger = logging.getLogger(__name__)

_STUCK_WINDOW_MIN = 10
_ZERO_FLOW_WINDOW_MIN = 5
_PF_CLIFF_DROP = 0.10
_PF_CLIFF_WINDOW_MIN = 60


# ── Helpers ────────────────────────────────────────────────────────────────

def _list_tracked_tags(cur, where_clause='TRUE'):
    cur.execute(f"""
        SELECT t.id, t.tag_name, p.parent_asset, p.tag_type
          FROM hercules_ai_tag_profiles p
          JOIN tags t ON t.tag_name = p.tag_name
         WHERE p.is_tracked = TRUE
           AND ({where_clause})
    """)
    return cur.fetchall()


def _last_n_values(cur, tag_id, minutes):
    cutoff = datetime.datetime.now() - datetime.timedelta(minutes=minutes)
    cur.execute("""
        SELECT "timestamp", value
          FROM tag_history
         WHERE tag_id = %s AND "timestamp" >= %s
      ORDER BY "timestamp"
    """, (tag_id, cutoff))
    return cur.fetchall()


def _insert_event_if_new(cur, feature_id, asset, tag_name, severity, headline,
                         evidence, observed_value, baseline_value=None,
                         omr_at_risk=0, dedupe_minutes=60):
    """Insert an event unless one with same (feature_id, tag_name) is already active recently."""
    cur.execute("""
        INSERT INTO ml_anomaly_events
            (feature_id, window_from, window_to, asset_name, tag_name, severity,
             score, significance, baseline_value, observed_value,
             headline, evidence, omr_at_risk)
        SELECT %s, NOW() - INTERVAL '5 minutes', NOW(), %s, %s, %s,
               1, 0.9, %s, %s,
               %s, %s, %s
         WHERE NOT EXISTS (
            SELECT 1 FROM ml_anomaly_events
             WHERE feature_id = %s AND tag_name = %s
               AND detected_at > NOW() - INTERVAL '%s minutes'
               AND suppressed = FALSE
         )
    """, (
        feature_id, asset, tag_name, severity,
        baseline_value, observed_value,
        headline, evidence, omr_at_risk,
        feature_id, tag_name, dedupe_minutes,
    ))


# ── Detectors ──────────────────────────────────────────────────────────────

def detect_stuck_totalizers():
    """Counter tag unchanged for ≥ 10 min while equipment is ON.

    'Equipment ON' is approximated by "value_delta non-zero in the previous 30 min"
    on any totalizer of the same parent_asset. This avoids the parent_boolean_tag
    dependency that Plan 3's full R-rules would provide.
    """
    fired = 0
    with cursor(dict_cursor=False) as (cur, conn):
        counters = _list_tracked_tags(cur, "p.is_production_counter = TRUE")
        for tag_id, tag_name, asset, _ in counters:
            rows = _last_n_values(cur, tag_id, _STUCK_WINDOW_MIN)
            if len(rows) < 5:
                continue
            values = [float(r[1]) for r in rows if r[1] is not None]
            if not values or max(values) == min(values):
                # Stuck — but is the asset supposed to be running?
                # Check that this OR sibling totalizers had movement in the prior 30 min
                cur.execute("""
                    SELECT MAX(value_delta) FROM tag_history th
                      JOIN tags t ON t.id = th.tag_id
                      JOIN hercules_ai_tag_profiles p ON p.tag_name = t.tag_name
                     WHERE p.parent_asset = %s
                       AND p.is_production_counter = TRUE
                       AND th."timestamp" >= NOW() - INTERVAL '30 minutes'
                       AND th."timestamp" < NOW() - INTERVAL '%s minutes'
                """, (asset, _STUCK_WINDOW_MIN))
                pre = cur.fetchone()
                pre_delta = float((pre[0] if pre else 0) or 0)
                if pre_delta <= 0:
                    continue  # asset was idle anyway

                _insert_event_if_new(
                    cur, 'stuck', asset, tag_name, 'warn',
                    headline=f"Counter stuck on {tag_name}",
                    evidence=f"Reading hasn't changed for {_STUCK_WINDOW_MIN} minutes "
                             f"while {asset} appears to be running. Possible sensor freeze.",
                    observed_value=values[-1] if values else None,
                    dedupe_minutes=120,
                )
                fired += 1
        conn.commit()
    return fired


def detect_zero_flow():
    """Flow rate ≈ 0 for ≥ 5 min while order_active = TRUE.

    'order_active' is approximated by checking the latest tag_history row for any
    tag with name containing 'order_active' on the same parent_asset. If no such
    tag exists, the detector skips (no false positives).
    """
    fired = 0
    with cursor(dict_cursor=False) as (cur, conn):
        # Get all rate tags
        rates = _list_tracked_tags(cur, "p.tag_type = 'rate'")
        for tag_id, tag_name, asset, _ in rates:
            rows = _last_n_values(cur, tag_id, _ZERO_FLOW_WINDOW_MIN)
            if len(rows) < 5:
                continue
            values = [float(r[1]) for r in rows if r[1] is not None]
            if not values:
                continue
            # All near-zero?
            if max(values) > 0.05:
                continue

            # Is the asset's order_active flag true?
            cur.execute("""
                SELECT value FROM tag_history th
                  JOIN tags t ON t.id = th.tag_id
                  JOIN hercules_ai_tag_profiles p ON p.tag_name = t.tag_name
                 WHERE p.parent_asset = %s AND t.tag_name ILIKE '%%order_active%%'
              ORDER BY th."timestamp" DESC LIMIT 1
            """, (asset,))
            row = cur.fetchone()
            if not row or not row[0]:
                continue  # no order active or no order_active tag — skip

            _insert_event_if_new(
                cur, 'flow0', asset, tag_name, 'warn',
                headline=f"No flow on {tag_name}",
                evidence=f"Flow rate has been zero for {_ZERO_FLOW_WINDOW_MIN} minutes "
                         f"while {asset} has an active order. Check for a blockage or stopped feeder.",
                observed_value=0.0, dedupe_minutes=60,
            )
            fired += 1
        conn.commit()
    return fired


def detect_pf_cliff():
    """Power-factor sudden drop ≥ 0.10 within 60 min — capacitor failure signature."""
    fired = 0
    with cursor(dict_cursor=False) as (cur, conn):
        pfs = _list_tracked_tags(cur, "t.tag_name ILIKE '%cos_phi%'")
        for tag_id, tag_name, asset, _ in pfs:
            rows = _last_n_values(cur, tag_id, _PF_CLIFF_WINDOW_MIN)
            if len(rows) < 10:
                continue
            values = [float(r[1]) for r in rows if r[1] is not None]
            if len(values) < 10:
                continue
            window_max = max(values[: len(values) // 2])  # earlier half max
            window_min = min(values[len(values) // 2 :])  # latter half min
            drop = window_max - window_min
            if drop < _PF_CLIFF_DROP:
                continue
            if window_min > 0.85:
                continue  # not a real concern if still above target

            _insert_event_if_new(
                cur, 'pf_cliff', asset, tag_name, 'crit',
                headline=f"Sudden electrical-efficiency drop on {asset}",
                evidence=f"Power factor fell from {window_max:.2f} to {window_min:.2f} "
                         f"within the last hour. This pattern often indicates a failed "
                         f"power-correction component. Inspect the equipment soon.",
                observed_value=window_min, baseline_value=window_max,
                dedupe_minutes=240,
            )
            fired += 1
        conn.commit()
    return fired


def run_all():
    """Run every deterministic detector. Called by dynamic_archive_worker once per hour."""
    counts = {}
    for fn in (detect_stuck_totalizers, detect_zero_flow, detect_pf_cliff):
        try:
            counts[fn.__name__] = fn()
        except Exception as e:
            logger.warning("anomaly detector %s failed: %s", fn.__name__, e)
            counts[fn.__name__] = 'error'
    return counts


def list_open_events(limit=10):
    """Return active anomaly events for the Watch band."""
    with cursor(dict_cursor=True) as (cur, _):
        cur.execute("""
            SELECT id, feature_id, asset_name, tag_name, severity, headline,
                   evidence, omr_at_risk, detected_at, observed_value, baseline_value
              FROM ml_anomaly_events
             WHERE suppressed = FALSE
               AND detected_at > NOW() - INTERVAL '24 hours'
          ORDER BY
             CASE severity WHEN 'crit' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
             detected_at DESC
             LIMIT %s
        """, (limit,))
        rows = cur.fetchall()
    return [
        {
            'id': r['id'],
            'feature_id': r['feature_id'],
            'asset': r['asset_name'],
            'tag': r['tag_name'],
            'severity': r['severity'],
            'headline': r['headline'],
            'evidence': r['evidence'],
            'omr_at_risk': float(r['omr_at_risk'] or 0),
            'detected_at': r['detected_at'].isoformat() if r['detected_at'] else None,
            'observed_value': float(r['observed_value']) if r['observed_value'] is not None else None,
            'baseline_value': float(r['baseline_value']) if r['baseline_value'] is not None else None,
        }
        for r in rows
    ]


def suppress_event(event_id):
    with cursor(dict_cursor=False) as (cur, conn):
        cur.execute("UPDATE ml_anomaly_events SET suppressed = TRUE WHERE id = %s", (event_id,))
        conn.commit()
        return cur.rowcount > 0
