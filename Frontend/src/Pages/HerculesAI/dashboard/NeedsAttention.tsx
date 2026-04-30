/**
 * NeedsAttention — Plan 14 §3.6.
 *
 * Active anomalies (severity ∈ warn/crit, suppressed=false). Each row: dot,
 * headline, asset, OMR/month at risk. Click → AnomalyDrawer (commit 7).
 *
 * Commit 1 placeholder: real anomaly data, simple list.
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
  minHeight: 200,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 4,
};

const dot = (severity: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: severity === 'crit' ? 'var(--hai-status-crit-600)' : 'var(--hai-status-warn-600)',
  flexShrink: 0,
});

export default function NeedsAttention({ payload }: Props) {
  const anomalies = (payload?.anomalies ?? [])
    .filter((a: any) => !a.suppressed && (a.severity === 'crit' || a.severity === 'warn'))
    .slice(0, 4);

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Needs attention</div>

      {anomalies.length === 0 && (
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
          Nothing flagged. Hercules is watching every line.
        </div>
      )}

      {anomalies.map((a: any, i: number) => (
        <div
          key={a.id || i}
          style={{
            display: 'grid',
            gridTemplateColumns: '12px 1fr auto',
            alignItems: 'baseline',
            gap: 10,
            padding: '10px 0',
            borderBottom: i === anomalies.length - 1 ? 'none' : '1px solid var(--hai-glass-border)',
          }}
        >
          <span style={dot(a.severity)} aria-hidden="true" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hai-text-primary)', lineHeight: 1.3 }}>
              {a.headline || a.evidence || 'Anomaly'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
              {a.asset || 'plant-wide'}
            </span>
          </div>
          {a.omr_at_risk != null && a.omr_at_risk > 0 && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--hai-money)', whiteSpace: 'nowrap' }}>
              {Math.round(a.omr_at_risk).toLocaleString()} OMR/mo
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
