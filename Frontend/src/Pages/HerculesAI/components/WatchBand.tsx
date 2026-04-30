/**
 * WatchBand — Plan 5 §14.4 Band 5
 *
 * Forecasts (trend slope to threshold) + open anomaly events.
 * Max 3 items visible; overflow opens a drawer.
 *
 * Items come from RoiPayload.forecasts.trends and RoiPayload.anomalies.
 */

import type { CSSProperties } from 'react';

interface Trend {
  asset: string;
  metric: string;          // 'electrical_efficiency' | 'voltage_imbalance'
  current?: number;
  current_pct?: number;
  target?: number;
  target_pct?: number;
  days_to_cross: number;
  severity: 'warn' | 'crit';
}

interface Anomaly {
  id: number;
  feature_id: string;
  asset: string;
  tag: string | null;
  severity: 'info' | 'warn' | 'crit';
  headline: string;
  evidence: string;
  omr_at_risk: number;
}

interface WatchBandProps {
  trends?: Trend[];
  anomalies?: Anomaly[];
  className?: string;
}

const cardStyle: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 18,
  padding: 'var(--hai-space-5) var(--hai-space-6)',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hai-space-3)',
};

const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--hai-text-secondary)',
};

const dotColor = (sev: string) =>
  sev === 'crit' ? 'var(--hai-status-crit-600)' :
  sev === 'warn' ? 'var(--hai-status-warn-600)' :
                   'var(--hai-status-info-600)';

function trendLine(t: Trend): string {
  if (t.metric === 'electrical_efficiency') {
    return `Electrical efficiency on ${t.asset} trending toward ${t.target} in ${t.days_to_cross} days`;
  }
  if (t.metric === 'voltage_imbalance') {
    return `Voltage imbalance on ${t.asset} expected to cross ${t.target_pct}% in ${t.days_to_cross} days`;
  }
  return `${t.metric} drifting on ${t.asset}`;
}

export default function WatchBand({ trends = [], anomalies = [], className }: WatchBandProps) {
  // Combine + rank by severity then OMR-at-risk
  const items: Array<{ key: string; severity: string; line: string; sub?: string }> = [];
  for (const t of trends.slice(0, 3)) {
    items.push({
      key: `trend-${t.asset}-${t.metric}`,
      severity: t.severity,
      line: trendLine(t),
    });
  }
  for (const a of anomalies.slice(0, 3)) {
    items.push({
      key: `anom-${a.id}`,
      severity: a.severity,
      line: a.headline,
      sub: a.omr_at_risk > 0
        ? `${Math.round(a.omr_at_risk).toLocaleString()} OMR/month at risk · ${a.evidence}`
        : a.evidence,
    });
  }
  // Sort: crit first, then warn, then info
  items.sort((x, y) => {
    const order: Record<string, number> = { crit: 0, warn: 1, info: 2 };
    return (order[x.severity] ?? 3) - (order[y.severity] ?? 3);
  });
  const visible = items.slice(0, 3);
  const overflow = items.length - visible.length;

  if (visible.length === 0) {
    return (
      <article className={`hai-num ${className ?? ''}`} style={cardStyle} aria-label="Watch — nothing to flag">
        <div style={labelStyle}>Watch</div>
        <div style={{ fontSize: 13, color: 'var(--hai-text-tertiary)' }}>
          Nothing unusual right now.
        </div>
      </article>
    );
  }

  return (
    <article className={`hai-num hai-roi-card ${className ?? ''}`} style={cardStyle} aria-label="Watch — forecasts and anomalies">
      <div style={labelStyle}>Watch</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-3)' }}>
        {visible.map((it) => (
          <li key={it.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%', background: dotColor(it.severity),
              marginTop: 7, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--hai-text-primary)', fontWeight: 500 }}>{it.line}</div>
              {it.sub && (
                <div style={{ fontSize: 12, color: 'var(--hai-text-secondary)', marginTop: 2 }}>{it.sub}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <div style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>+{overflow} more</div>
      )}
    </article>
  );
}
