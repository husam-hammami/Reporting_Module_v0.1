/**
 * NeedsAttention — Plan 14 §3.6.
 *
 * Active anomalies (severity ∈ warn/crit, suppressed=false). Each row:
 * severity-colored dot, headline, asset chip, OMR/month at risk. Click row
 * → AnomalyDrawer (commit 7) with last-N-min mini chart + Suppress button.
 *
 * Severity treatment honors MASTER §2 — warn = warn-600 outline, crit =
 * crit-600 fill. No idle pulse.
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
  onItemClick?: (anomaly: any) => void;
  onHeaderClick?: () => void;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
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

function severityDot(severity: string): CSSProperties {
  if (severity === 'crit') {
    return {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'var(--hai-status-crit-600)',
      flexShrink: 0,
    };
  }
  // warn (and any other) — outline only, signals "watch this" not "urgent"
  return {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'transparent',
    border: '2px solid var(--hai-status-warn-600)',
    flexShrink: 0,
    boxSizing: 'border-box',
  };
}

const assetChipStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--hai-text-tertiary)',
  background: 'var(--hai-glass-2)',
  border: '1px solid var(--hai-glass-border)',
  padding: '1px 6px',
  borderRadius: 4,
  letterSpacing: '0.02em',
};

export default function NeedsAttention({ payload, onItemClick, onHeaderClick }: Props) {
  const anomalies = (payload?.anomalies ?? [])
    .filter((a: any) => !a.suppressed && (a.severity === 'crit' || a.severity === 'warn'))
    // crit first, then warn, then most-recent
    .sort((a: any, b: any) => {
      if (a.severity !== b.severity) return a.severity === 'crit' ? -1 : 1;
      const at = a.detected_at ? new Date(a.detected_at).getTime() : 0;
      const bt = b.detected_at ? new Date(b.detected_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, 4);

  return (
    <div style={tile} className="hai-num">
      <div
        role={onHeaderClick ? 'button' : undefined}
        tabIndex={onHeaderClick ? 0 : undefined}
        onClick={onHeaderClick}
        onKeyDown={(e) => {
          if (onHeaderClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onHeaderClick();
          }
        }}
        style={{ ...labelStyle, cursor: onHeaderClick ? 'pointer' : 'default', outline: 'none' }}
        aria-label={onHeaderClick ? 'Open full watch list' : undefined}
      >
        Needs attention
        {anomalies.length > 0 && (
          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--hai-text-tertiary)', textTransform: 'none', letterSpacing: 0 }}>
            ({anomalies.length})
          </span>
        )}
      </div>

      {anomalies.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--hai-text-tertiary)',
            fontSize: 12,
            textAlign: 'center',
            padding: 16,
            lineHeight: 1.5,
          }}
        >
          Nothing flagged. Hercules is watching every line.
        </div>
      )}

      {anomalies.map((a: any, i: number) => (
        <article
          key={a.id || i}
          tabIndex={0}
          role="button"
          aria-label={`${a.severity === 'crit' ? 'Critical' : 'Warning'}: ${a.headline || 'anomaly'} on ${a.asset || 'plant-wide'}`}
          onClick={() => onItemClick?.(a)}
          onKeyDown={(e) => {
            if (onItemClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onItemClick(a);
            }
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '12px 1fr auto',
            alignItems: 'baseline',
            gap: 12,
            padding: '10px 0',
            borderBottom: i === anomalies.length - 1 ? 'none' : '1px solid var(--hai-glass-border)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <span style={severityDot(a.severity)} aria-hidden="true" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hai-text-primary)', lineHeight: 1.3 }}>
              {a.headline || a.evidence?.split('.')[0] || 'Anomaly'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={assetChipStyle}>{a.asset || 'plant-wide'}</span>
              {a.detected_at && (
                <span style={{ fontSize: 10, color: 'var(--hai-text-tertiary)' }}>
                  {relativeTime(a.detected_at)}
                </span>
              )}
            </span>
          </div>
          {a.omr_at_risk != null && a.omr_at_risk > 0 && (
            <span
              className="hai-money-figure"
              style={{ fontSize: 13, whiteSpace: 'nowrap' }}
            >
              {Math.round(a.omr_at_risk).toLocaleString()}
              <span className="hai-money-unit" style={{ fontSize: 9, marginLeft: 4 }}>
                OMR/mo
              </span>
            </span>
          )}
        </article>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} h ago`;
    return `${Math.floor(hr / 24)} d ago`;
  } catch {
    return '';
  }
}
