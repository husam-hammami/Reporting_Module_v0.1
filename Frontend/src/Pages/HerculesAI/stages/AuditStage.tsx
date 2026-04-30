/**
 * AuditStage — Plan 6 §5.5.
 *
 * Lists savings ledger entries with attribute/dispute actions.
 * Calibrating-state empty state when no entries yet.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { herculesAIApi } from '../../../API/herculesAIApi';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
}

interface LedgerEntry {
  id: number;
  rule: string;
  asset: string | null;
  detected_at: string | null;
  actioned_at: string | null;
  omr_saved: number;
  confidence_pct: number;
  user_attributed: boolean;
  disputed: boolean;
  evidence: any;
  notes: string;
}

const cardStyle: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: 'var(--hai-space-5)',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
};

const ruleLabel = (r: string): string => {
  switch (r) {
    case 'pf_correction':  return 'Power-factor correction';
    case 'yield_drift':    return 'Yield drift caught';
    case 'off_peak_shift': return 'Off-peak load shift';
    default:               return r.replace(/_/g, ' ');
  }
};

export default function AuditStage({ payload }: Props) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const calibrating = payload?.savings?.calibrating;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await herculesAIApi.getSavings(true);
        if (!cancelled) setEntries(res.data?.entries ?? []);
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const action = async (id: number, kind: 'attribute' | 'dispute') => {
    setBusy(true);
    try {
      if (kind === 'attribute') await herculesAIApi.attributeSavings(id);
      else await herculesAIApi.disputeSavings(id);
      const res = await herculesAIApi.getSavings(true);
      setEntries(res.data?.entries ?? []);
    } finally {
      setBusy(false);
    }
  };

  if (calibrating || (entries && entries.length === 0)) {
    return (
      <div style={{
        padding: 'var(--hai-space-6)',
        border: '1px dashed var(--hai-glass-border)',
        borderRadius: 16,
        color: 'var(--hai-text-secondary)',
        fontSize: 14,
        textAlign: 'center',
      }}>
        Hercules is calibrating. Confirmed savings will appear here once Hercules has 30 days of data.
      </div>
    );
  }

  return (
    <section className="hai-num" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-4)' }}>
      <div style={{ fontSize: 13, color: 'var(--hai-text-secondary)' }}>
        {entries?.length ?? 0} entries this month · {payload?.savings?.disputed_count ?? 0} disputed
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-3)' }}>
        {(entries ?? []).map((e) => (
          <article key={e.id} style={{
            ...cardStyle,
            opacity: e.disputed ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--hai-space-4)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--hai-text-primary)' }}>
                  {ruleLabel(e.rule)} · {e.asset || 'plant-wide'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)', marginTop: 2 }}>
                  {e.detected_at ? new Date(e.detected_at).toLocaleString() : '—'}
                  {e.user_attributed && <span style={{ color: 'var(--hai-status-ok-600)', marginLeft: 8 }}>✓ Confirmed</span>}
                  {e.disputed && <span style={{ color: 'var(--hai-status-crit-600)', marginLeft: 8 }}>✗ Disputed</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="hai-money-figure" style={{ fontSize: 28 }}>
                  {Math.round(e.omr_saved).toLocaleString()}
                  <span className="hai-money-unit">OMR</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
                  {e.confidence_pct}% confident
                </div>
              </div>
            </div>
            {!e.disputed && !e.user_attributed && (
              <div style={{ display: 'flex', gap: 'var(--hai-space-2)', marginTop: 'var(--hai-space-3)' }}>
                <button
                  disabled={busy}
                  onClick={() => action(e.id, 'attribute')}
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 8,
                    background: 'var(--hai-money)', color: '#3a2400', border: 'none',
                    cursor: busy ? 'wait' : 'pointer', fontWeight: 600,
                  }}
                >
                  Mark as done
                </button>
                <button
                  disabled={busy}
                  onClick={() => action(e.id, 'dispute')}
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 8,
                    background: 'transparent', color: 'var(--hai-text-secondary)',
                    border: '1px solid var(--hai-glass-border)',
                    cursor: busy ? 'wait' : 'pointer', fontWeight: 500,
                  }}
                >
                  This isn't right
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
