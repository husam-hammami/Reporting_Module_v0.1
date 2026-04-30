/**
 * Predictions — Plan 14 §3.5.
 *
 * Forward-looking signals: yield drift, PF dip, weekly bill trend. Each row:
 * directional arrow, headline, OMR/day at risk. Click → drilldown drawer.
 *
 * Commit 1 placeholder: pulls from forecasts.trends + forecasts.daily_bill +
 * shift_pace. Real card visualisation in commit 3.
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

const arrowFor = (direction: string) =>
  direction === 'up' ? '↗' : direction === 'down' ? '↘' : '⏱';

export default function Predictions({ payload }: Props) {
  // Pull predictive signals from forecasts.trends + at-risk shift_pace + week trend
  const trends = payload?.forecasts?.trends ?? [];
  const atRiskShifts = (payload?.forecasts?.shift_pace ?? []).filter(
    (s: any) => s?.status === 'will_miss',
  );

  const cards: Array<{ arrow: string; headline: string; sub?: string; omr?: number }> = [];

  for (const t of trends.slice(0, 2)) {
    const dir = t.delta_pct > 0 ? (t.metric === 'energy_per_ton' ? 'up' : 'up') : 'down';
    cards.push({
      arrow: arrowFor(dir),
      headline: t.headline || `${t.metric || 'Trend'} drifts on ${t.asset || 'plant'}`,
      sub: t.evidence || (t.sustained_hours ? `Sustained ${t.sustained_hours} h` : undefined),
      omr: t.estimated_omr_per_month_at_risk ?? t.omr_at_risk,
    });
  }
  for (const s of atRiskShifts.slice(0, 1)) {
    cards.push({
      arrow: '⏱',
      headline: `Shift on ${s.asset} likely to miss target`,
      sub: s.gap_kg ? `Gap ~${Math.round(s.gap_kg)} kg` : undefined,
    });
  }

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Predictions</div>

      {cards.length === 0 && (
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
          No drift or risk signals right now. Hercules will flag forward-looking issues here as they form.
        </div>
      )}

      {cards.map((c, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '20px 1fr auto',
            alignItems: 'baseline',
            gap: 10,
            padding: '10px 0',
            borderBottom: i === cards.length - 1 ? 'none' : '1px solid var(--hai-glass-border)',
          }}
        >
          <span style={{ fontSize: 16, color: 'var(--hai-text-secondary)' }}>{c.arrow}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hai-text-primary)', lineHeight: 1.3 }}>
              {c.headline}
            </span>
            {c.sub && (
              <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
                {c.sub}
              </span>
            )}
          </div>
          {c.omr != null && c.omr > 0 && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--hai-money)', whiteSpace: 'nowrap' }}>
              {Math.round(c.omr).toLocaleString()} OMR/mo
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
