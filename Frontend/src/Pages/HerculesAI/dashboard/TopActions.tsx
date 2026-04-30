/**
 * TopActions — Plan 14 §3.4.
 *
 * Three highest-value levers. Each card: rank, OMR/year (gold), headline,
 * payback months. Click → opens LeverDrawer.
 *
 * Commit 1 placeholder: real lever data, simple list. Drawer wiring commit 7.
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: 'var(--hai-space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 240,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 4,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px 1fr auto',
  alignItems: 'baseline',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--hai-glass-border)',
};

export default function TopActions({ payload }: Props) {
  const levers = (payload?.levers ?? []).slice(0, 3);

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Top {Math.min(3, levers.length || 3)} actions</div>

      {levers.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--hai-text-tertiary)',
          fontSize: 12,
          textAlign: 'center',
          padding: 16,
          lineHeight: 1.5,
        }}>
          Hercules is learning your patterns. Action recommendations will appear once enough history is collected.
        </div>
      )}

      {levers.map((lever: any, i: number) => {
        const omr = lever.omr_per_year ?? lever.omr_per_month ?? null;
        const omrUnit = lever.omr_per_year != null ? '/year' : '/month';
        return (
          <div key={lever.id || i} style={{ ...rowStyle, borderBottom: i === levers.length - 1 ? 'none' : rowStyle.borderBottom }}>
            <span style={{ fontSize: 14, color: 'var(--hai-text-tertiary)' }}>
              {['①', '②', '③'][i]}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--hai-money)' }}>
                {omr == null ? '—' : `${Math.round(omr).toLocaleString()} OMR${omrUnit}`}
              </span>
              <span style={{ fontSize: 12, color: 'var(--hai-text-secondary)', lineHeight: 1.4 }}>
                {lever.headline || lever.evidence || 'Action available'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
              {lever.payback_months != null && lever.payback_months > 0
                ? `${lever.payback_months.toFixed(1)} mo`
                : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
