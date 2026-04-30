/**
 * LeverDrawer — Plan 14 §5.3.
 *
 * Trigger: click on a Top-3 Actions row.
 * Content: full evidence + Implement / Schedule / Dismiss action loop.
 *
 * The action buttons close the action loop the customer flagged was missing.
 * Implement → POST /hercules-ai/levers/<id>/implement (writes a savings_ledger
 * entry with rule = the lever rule, marked user_attributed = TRUE).
 * Schedule → opens a date picker (Phase D — for now, "Coming soon").
 * Dismiss → POST /hercules-ai/levers/<id>/dismiss with optional reason.
 *
 * Until those backend endpoints exist (Phase D), the buttons show a toast
 * acknowledging intent and the user record is captured client-side via
 * localStorage so customer interactions aren't lost.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { toast } from 'react-toastify';
import DrawerFrame from './DrawerFrame';

interface Props {
  open: boolean;
  onClose: () => void;
  lever: any;
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 6,
};

const evidenceBox: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 12,
  padding: 16,
  fontSize: 13,
  color: 'var(--hai-text-primary)',
  lineHeight: 1.6,
};

const stat: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flex: 1,
};

const btn = (kind: 'primary' | 'secondary' | 'ghost'): CSSProperties => ({
  flex: 1,
  fontSize: 13,
  fontWeight: 600,
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  border: kind === 'secondary' ? '1px solid var(--hai-glass-border)' : 'none',
  background: kind === 'primary'
    ? 'var(--hai-money)'
    : kind === 'secondary'
      ? 'transparent'
      : 'transparent',
  color: kind === 'primary'
    ? '#3a2400'
    : kind === 'secondary'
      ? 'var(--hai-text-primary)'
      : 'var(--hai-text-tertiary)',
});

function logIntent(lever: any, action: 'implement' | 'schedule' | 'dismiss', extra?: any) {
  try {
    const key = 'hercules.lever.actions';
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    prev.push({
      lever_id: lever?.id,
      headline: lever?.headline,
      action,
      at: new Date().toISOString(),
      ...(extra || {}),
    });
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {
    /* non-blocking */
  }
}

export default function LeverDrawer({ open, onClose, lever }: Props) {
  const [acted, setActed] = useState<string | null>(null);
  if (!lever) {
    return (
      <DrawerFrame open={open} onClose={onClose} title="Action">
        <div style={{ color: 'var(--hai-text-tertiary)', textAlign: 'center', padding: 24 }}>
          No lever selected.
        </div>
      </DrawerFrame>
    );
  }

  const omrYear = lever.omr_per_year ?? null;
  const omrMonth = lever.omr_per_month ?? null;
  const payback = typeof lever.payback_months === 'number' ? lever.payback_months : null;
  const headline = lever.headline || 'Action available';
  const evidence = lever.evidence || 'Hercules detected an opportunity to act.';

  const handle = (action: 'implement' | 'schedule' | 'dismiss') => {
    logIntent(lever, action);
    setActed(action);
    if (action === 'implement') toast.success('Marked as in progress. Hercules will track outcome.');
    else if (action === 'schedule') toast.info('Scheduling will be available shortly. Intent saved.');
    else toast.info('Dismissed. Hercules will not surface this again.');
    setTimeout(onClose, 600);
  };

  return (
    <DrawerFrame open={open} onClose={onClose} eyebrow="Action recommendation" title={headline}>
      {/* Stat row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }} className="hai-num">
        <div style={stat}>
          <div style={sectionLabel}>Annual value</div>
          <div className="hai-money-figure" style={{ fontSize: 24 }}>
            {omrYear == null ? '—' : Math.round(omrYear).toLocaleString()}
            <span className="hai-money-unit" style={{ fontSize: 11, marginLeft: 6 }}>OMR/year</span>
          </div>
        </div>
        {omrMonth != null && (
          <div style={stat}>
            <div style={sectionLabel}>Monthly value</div>
            <div className="hai-money-figure" style={{ fontSize: 18 }}>
              {Math.round(omrMonth).toLocaleString()}
              <span className="hai-money-unit" style={{ fontSize: 10, marginLeft: 4 }}>OMR/mo</span>
            </div>
          </div>
        )}
        {payback != null && (
          <div style={stat}>
            <div style={sectionLabel}>Payback</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--hai-text-primary)' }}>
              {payback.toFixed(1)} months
            </div>
          </div>
        )}
      </div>

      {/* Evidence */}
      <div style={sectionLabel}>Why Hercules suggests this</div>
      <div style={evidenceBox}>{evidence}</div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button onClick={() => handle('implement')} style={btn('primary')} disabled={!!acted}>
          {acted === 'implement' ? '✓ Marked' : 'Mark as in progress'}
        </button>
        <button onClick={() => handle('schedule')} style={btn('secondary')} disabled={!!acted}>
          Schedule
        </button>
        <button onClick={() => handle('dismiss')} style={btn('ghost')} disabled={!!acted}>
          Dismiss
        </button>
      </div>
    </DrawerFrame>
  );
}
