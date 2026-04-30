/**
 * SavingsLedgerDrawer — Plan 14 §5.1.
 *
 * Trigger: click on the ROI Ribbon's "saved this month" hero figure.
 * Content: list of savings_ledger entries with confirm / dispute actions.
 *
 * Re-uses the existing herculesAIApi.getSavings + attributeSavings +
 * disputeSavings endpoints from Plan 6 §5.5 — no backend changes.
 */

import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import DrawerFrame from './DrawerFrame';
import { herculesAIApi } from '../../../../API/herculesAIApi';

interface Entry {
  id: number;
  rule: string;
  asset: string | null;
  detected_at: string | null;
  omr_saved: number;
  user_attributed: boolean;
  disputed: boolean;
  evidence: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const ruleLabel = (r: string): string => {
  switch (r) {
    case 'pf_correction':  return 'Power-factor correction';
    case 'yield_drift':    return 'Yield drift caught';
    case 'off_peak_shift': return 'Off-peak load shift';
    default:               return (r || '').replace(/_/g, ' ');
  }
};

const cardStyle: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 12,
  padding: 14,
  marginBottom: 10,
};

const btn = (primary: boolean): CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 8,
  border: primary ? 'none' : '1px solid var(--hai-glass-border)',
  background: primary ? 'var(--hai-money)' : 'transparent',
  color: primary ? '#3a2400' : 'var(--hai-text-secondary)',
  cursor: 'pointer',
});

export default function SavingsLedgerDrawer({ open, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await herculesAIApi.getSavings(true);
      setEntries((res as any).data?.entries ?? []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const action = async (id: number, kind: 'attribute' | 'dispute') => {
    setBusy(true);
    try {
      if (kind === 'attribute') await herculesAIApi.attributeSavings(id);
      else await herculesAIApi.disputeSavings(id);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerFrame
      open={open}
      onClose={onClose}
      eyebrow="Savings ledger"
      title="What Hercules saved this month"
    >
      {entries === null && (
        <div style={{ textAlign: 'center', color: 'var(--hai-text-tertiary)', padding: 24, fontSize: 12 }}>
          Loading…
        </div>
      )}
      {entries && entries.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--hai-text-tertiary)', padding: 24, fontSize: 13, lineHeight: 1.6 }}>
          No savings recorded yet — Hercules adds entries here when its detection rules
          fire. Each entry is auditable and can be confirmed or disputed.
        </div>
      )}
      {(entries || []).map((e) => (
        <article key={e.id} style={{ ...cardStyle, opacity: e.disputed ? 0.5 : 1 }} className="hai-num">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--hai-text-primary)' }}>
                {ruleLabel(e.rule)} · {e.asset || 'plant-wide'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--hai-text-tertiary)', marginTop: 2 }}>
                {e.detected_at ? new Date(e.detected_at).toLocaleString() : '—'}
                {e.user_attributed && <span style={{ color: 'var(--hai-status-ok-600)', marginLeft: 8 }}>✓ Confirmed</span>}
                {e.disputed && <span style={{ color: 'var(--hai-status-crit-600)', marginLeft: 8 }}>✗ Disputed</span>}
              </div>
            </div>
            <span className="hai-money-figure" style={{ fontSize: 22 }}>
              {Math.round(e.omr_saved).toLocaleString()}
              <span className="hai-money-unit" style={{ fontSize: 10, marginLeft: 4 }}>OMR</span>
            </span>
          </div>
          {!e.disputed && !e.user_attributed && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={() => action(e.id, 'attribute')} style={btn(true)}>
                Mark as done
              </button>
              <button disabled={busy} onClick={() => action(e.id, 'dispute')} style={btn(false)}>
                This isn't right
              </button>
            </div>
          )}
        </article>
      ))}
    </DrawerFrame>
  );
}
