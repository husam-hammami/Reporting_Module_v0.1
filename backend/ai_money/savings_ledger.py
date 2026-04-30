"""Money-saved-this-month attribution ledger.

Plan §4.6 + §16.7 — append-only ledger of savings rules + user attribution.

Three attribution rules feed the ledger:
    pf_correction      — PF penalty fell after Hercules flagged it
    yield_drift        — yield drift caught early, recovery confirmed by user
    off_peak_shift     — flexible load shifted off-peak, kWh distribution changed

This module exposes:
    record(rule, asset, omr_saved, evidence, confidence_pct=50)
    summary(start=None, end=None) — confidence-weighted total + breakdown
    attribute(entry_id, user_id) — promote auto-detected entry to 100% confidence
    dispute(entry_id, user_id, note) — drop entry to 0% (disputed flag)
"""

import json
from datetime import datetime
from .db import cursor


def record(rule, asset, omr_saved, evidence, confidence_pct=50, detected_at=None, notes=None):
    """Insert a new ledger row. Returns the new id."""
    if detected_at is None:
        detected_at = datetime.now()
    # Round-down policy on confidence (Plan §13.7)
    confidence_pct = max(0, min(100, int(confidence_pct)))
    with cursor(dict_cursor=False) as (cur, conn):
        cur.execute("""
            INSERT INTO ai_savings_ledger
                (rule, asset_name, detected_at, omr_saved, confidence_pct, evidence_json, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (rule, asset, detected_at, float(omr_saved or 0), confidence_pct,
              json.dumps(evidence or {}), notes))
        new_id = cur.fetchone()[0]
        conn.commit()
    return new_id


def summary(start=None, end=None):
    """Return confidence-weighted total + per-rule breakdown.

    Used by /api/hercules-ai/savings to feed the SavingsRibbon.

    Returns:
        {
            total_omr,                  # sum(omr_saved * confidence/100) where not disputed
            total_omr_uncalibrated,     # sum without confidence weighting (audit view)
            total_omr_user_attributed,  # sum where user_attributed=true
            entries_count,
            disputed_count,
            breakdown: {
                pf_correction: {omr, count},
                yield_drift:   {omr, count},
                off_peak_shift:{omr, count},
            },
            calibrating: bool          # true if zero entries OR <30 days of data
        }
    """
    if start is None:
        start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if end is None:
        end = datetime.now()
    with cursor(dict_cursor=True) as (cur, _):
        cur.execute("""
            SELECT rule,
                   COUNT(*) AS cnt,
                   COUNT(*) FILTER (WHERE disputed = TRUE) AS disputed_cnt,
                   COUNT(*) FILTER (WHERE user_attributed = TRUE) AS user_cnt,
                   COALESCE(SUM(CASE WHEN disputed THEN 0 ELSE omr_saved * confidence_pct / 100.0 END), 0) AS weighted,
                   COALESCE(SUM(omr_saved), 0) AS uncalibrated,
                   COALESCE(SUM(CASE WHEN user_attributed AND NOT disputed THEN omr_saved END), 0) AS user_total
              FROM ai_savings_ledger
             WHERE detected_at >= %s AND detected_at < %s
          GROUP BY rule
        """, (start, end))
        rows = cur.fetchall()
        # Days of ledger history overall (used to label calibration)
        cur.execute("""
            SELECT COUNT(DISTINCT date_trunc('day', detected_at)) AS days
              FROM ai_savings_ledger
        """)
        total_days = (cur.fetchone() or {}).get('days') or 0

    breakdown = {}
    total = 0.0
    total_uncal = 0.0
    total_user = 0.0
    entries = 0
    disputed = 0
    for r in rows:
        rule = r['rule']
        breakdown[rule] = {
            'omr': round(float(r['weighted']), 2),
            'count': int(r['cnt']),
            'disputed_count': int(r['disputed_cnt']),
            'user_attributed_count': int(r['user_cnt']),
            'omr_uncalibrated': round(float(r['uncalibrated']), 2),
        }
        total += float(r['weighted'])
        total_uncal += float(r['uncalibrated'])
        total_user += float(r['user_total'])
        entries += int(r['cnt'])
        disputed += int(r['disputed_cnt'])

    return {
        'period_start': start.isoformat(),
        'period_end': end.isoformat(),
        'total_omr': round(total, 2),
        'total_omr_uncalibrated': round(total_uncal, 2),
        'total_omr_user_attributed': round(total_user, 2),
        'entries_count': entries,
        'disputed_count': disputed,
        'breakdown': breakdown,
        'calibrating': total_days < 30,  # Plan §16.5 warm-up disable
        'days_of_history': int(total_days),
    }


def attribute(entry_id, user_id):
    """Mark a ledger entry as user-confirmed: lifts confidence to 100%."""
    with cursor(dict_cursor=False) as (cur, conn):
        cur.execute("""
            UPDATE ai_savings_ledger
               SET user_attributed = TRUE,
                   actioned_at = COALESCE(actioned_at, NOW()),
                   confidence_pct = 100,
                   updated_at = NOW()
             WHERE id = %s
        """, (entry_id,))
        conn.commit()
        return cur.rowcount > 0


def dispute(entry_id, user_id, note=''):
    """User flagged this entry as wrong: confidence drops to 0."""
    with cursor(dict_cursor=False) as (cur, conn):
        cur.execute("""
            UPDATE ai_savings_ledger
               SET disputed = TRUE,
                   confidence_pct = 0,
                   notes = COALESCE(notes, '') || %s,
                   updated_at = NOW()
             WHERE id = %s
        """, (f"\n[disputed by user {user_id}] {note}", entry_id))
        conn.commit()
        return cur.rowcount > 0


def list_entries(start=None, end=None, limit=200):
    """List ledger entries for the audit panel."""
    if start is None:
        start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if end is None:
        end = datetime.now()
    with cursor(dict_cursor=True) as (cur, _):
        cur.execute("""
            SELECT id, rule, asset_name, detected_at, actioned_at, omr_saved,
                   confidence_pct, user_attributed, disputed, evidence_json, notes
              FROM ai_savings_ledger
             WHERE detected_at >= %s AND detected_at < %s
          ORDER BY detected_at DESC LIMIT %s
        """, (start, end, limit))
        rows = cur.fetchall()
    return [
        {
            'id': r['id'],
            'rule': r['rule'],
            'asset': r['asset_name'],
            'detected_at': r['detected_at'].isoformat() if r['detected_at'] else None,
            'actioned_at': r['actioned_at'].isoformat() if r['actioned_at'] else None,
            'omr_saved': float(r['omr_saved'] or 0),
            'confidence_pct': int(r['confidence_pct'] or 0),
            'user_attributed': bool(r['user_attributed']),
            'disputed': bool(r['disputed']),
            'evidence': r['evidence_json'] or {},
            'notes': r['notes'] or '',
        }
        for r in rows
    ]
