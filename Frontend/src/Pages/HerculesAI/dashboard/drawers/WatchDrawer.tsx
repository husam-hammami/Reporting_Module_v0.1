/**
 * WatchDrawer — Plan 14 §5.8.
 *
 * Trigger: click on the "Needs attention" or "Predictions" tile header.
 * Content: full list of trends + anomalies (not just the top 3-4 shown
 * on the bento), with severity grouping.
 */

import type { CSSProperties } from 'react';
import DrawerFrame from './DrawerFrame';
import type { RoiPayload } from '../../hooks/useRoiPayload';

interface Props {
  open: boolean;
  onClose: () => void;
  payload: RoiPayload | null;
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginTop: 20,
  marginBottom: 8,
};

const itemRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '12px 1fr auto',
  alignItems: 'baseline',
  gap: 12,
  padding: '12px 0',
  borderBottom: '1px solid var(--hai-glass-border)',
};

function dot(severity: string): CSSProperties {
  if (severity === 'crit') {
    return { width: 10, height: 10, borderRadius: '50%', background: 'var(--hai-status-crit-600)', flexShrink: 0 };
  }
  return {
    width: 10, height: 10, borderRadius: '50%',
    background: 'transparent',
    border: '2px solid var(--hai-status-warn-600)',
    flexShrink: 0, boxSizing: 'border-box',
  };
}

export default function WatchDrawer({ open, onClose, payload }: Props) {
  const anomalies = (payload?.anomalies ?? []).filter((a: any) => !a.suppressed);
  const trends = (payload?.forecasts?.trends ?? []) as any[];
  const atRiskShifts = (payload?.forecasts?.shift_pace ?? []).filter((s: any) => s?.status === 'will_miss');

  const hasAny = anomalies.length + trends.length + atRiskShifts.length > 0;

  return (
    <DrawerFrame open={open} onClose={onClose} eyebrow="Watch list" title="Everything Hercules is tracking">
      {!hasAny && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--hai-text-tertiary)', fontSize: 13, lineHeight: 1.6 }}>
          Nothing flagged right now. Hercules is watching every line.
        </div>
      )}

      {anomalies.length > 0 && (
        <>
          <div style={sectionLabel}>Active anomalies ({anomalies.length})</div>
          {anomalies.map((a: any, i: number) => (
            <div key={a.id || i} style={itemRow}>
              <span style={dot(a.severity)} aria-hidden="true" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--hai-text-primary)', fontWeight: 500 }}>
                  {a.headline || 'Anomaly'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
                  {a.asset || 'plant-wide'}{a.evidence ? ` — ${String(a.evidence).split('.')[0]}` : ''}
                </span>
              </div>
              {a.omr_at_risk != null && a.omr_at_risk > 0 && (
                <span className="hai-money-figure" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  {Math.round(a.omr_at_risk).toLocaleString()}
                  <span className="hai-money-unit" style={{ fontSize: 9, marginLeft: 4 }}>OMR/mo</span>
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {trends.length > 0 && (
        <>
          <div style={sectionLabel}>Trend signals ({trends.length})</div>
          {trends.map((t: any, i: number) => (
            <div key={i} style={itemRow}>
              <span style={{ fontSize: 14, color: 'var(--hai-text-secondary)', lineHeight: 1 }}>↗</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--hai-text-primary)', fontWeight: 500 }}>
                  {t.headline || `Trend on ${t.asset || 'plant'}`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
                  {t.evidence ? String(t.evidence).split('.')[0] : `Sustained ${t.sustained_hours || '?'} h`}
                </span>
              </div>
              {(t.estimated_omr_per_month_at_risk ?? t.omr_at_risk) != null && (
                <span className="hai-money-figure" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  {Math.round(t.estimated_omr_per_month_at_risk ?? t.omr_at_risk).toLocaleString()}
                  <span className="hai-money-unit" style={{ fontSize: 9, marginLeft: 4 }}>OMR/mo</span>
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {atRiskShifts.length > 0 && (
        <>
          <div style={sectionLabel}>At-risk shifts ({atRiskShifts.length})</div>
          {atRiskShifts.map((s: any, i: number) => (
            <div key={i} style={itemRow}>
              <span style={{ fontSize: 14, color: 'var(--hai-status-warn-600)', lineHeight: 1 }}>⏱</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--hai-text-primary)', fontWeight: 500 }}>
                  {s.asset} shift may miss target
                </span>
                <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
                  {s.gap_kg ? `Gap ~${Math.round(s.gap_kg)} kg` : 'Pace below target'}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </DrawerFrame>
  );
}
