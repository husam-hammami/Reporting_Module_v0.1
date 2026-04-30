/**
 * BillProjectionCard — Plan 5 §14.5 / page-spec Band 4
 *
 * Plant-wide end-of-day bill projection. Single SVG horizontal candlestick
 * (consumed | projected | range halo). NO Recharts in critical path.
 *
 * Props:
 *   projection: { so_far_omr, projected_omr, p10_omr, p90_omr, last_week_same_day_omr,
 *                 accuracy_label, days_available, remaining_hours } | null
 */

import type { CSSProperties } from 'react';

interface DailyBill {
  so_far_omr: number;
  projected_omr: number | null;
  p10_omr: number | null;
  p90_omr: number | null;
  last_week_same_day_omr: number | null;
  accuracy_label: 'reliable' | 'roughly-right' | 'direction-only' | 'learning' | string;
  days_available: number;
  warm_up_days_required?: number;
  remaining_hours?: number;
}

interface BillProjectionCardProps {
  projection: DailyBill | null;
  className?: string;
}

const cardStyle: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 18,
  padding: 'var(--hai-space-5) var(--hai-space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hai-space-3)',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 200,
};

const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--hai-text-secondary)',
};

const goldStyle: CSSProperties = {
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontWeight: 300,
  fontSize: 'var(--hai-roi-display-sm)',
  lineHeight: 1, color: 'var(--hai-money)', letterSpacing: '-0.02em',
};

export default function BillProjectionCard({ projection, className }: BillProjectionCardProps) {
  // null projection = backend explicitly returned null (no data yet) — show learning state.
  // Plan 6 §10 T16: never scream "Couldn't load" when backend simply has no forecast yet.
  if (!projection) {
    return (
      <article className={`hai-num ${className ?? ''}`} style={cardStyle} aria-label="Today's bill — learning">
        <div style={labelStyle}>Today's energy bill</div>
        <div style={{ fontSize: 13, color: 'var(--hai-text-tertiary)' }}>
          Hercules is learning your usage patterns. The day's projection will appear once enough hourly data is recorded.
        </div>
      </article>
    );
  }

  const learning = projection.accuracy_label === 'learning' || projection.projected_omr === null;

  if (learning) {
    const need = (projection.warm_up_days_required || 14) - projection.days_available;
    return (
      <article className={`hai-num hai-roi-card ${className ?? ''}`} style={cardStyle} aria-label="Today's bill — learning">
        <div style={labelStyle}>Today's energy bill</div>
        <div style={{ display: 'flex', gap: 'var(--hai-space-6)', alignItems: 'baseline' }}>
          <div>
            <div style={goldStyle}>{Math.round(projection.so_far_omr).toLocaleString()}</div>
            <div style={{ fontSize: 12, color: 'var(--hai-text-secondary)', marginTop: 4 }}>OMR so far</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--hai-text-tertiary)' }}>
            Forecast hidden — Hercules needs {Math.max(0, need)} more days of data to project the day.
          </div>
        </div>
      </article>
    );
  }

  const projected = projection.projected_omr || 0;
  const soFar = projection.so_far_omr || 0;
  const p10 = projection.p10_omr;
  const p90 = projection.p90_omr;
  const last = projection.last_week_same_day_omr;
  const showRange = p10 !== null && p90 !== null && projection.accuracy_label !== 'direction-only';

  // Bar geometry — consumed (solid) ends at soFar/projected ratio; full bar = projected.
  const barH = 22;
  const consumedPct = projected > 0 ? Math.min(100, (soFar / projected) * 100) : 0;
  const haloLeft = p10 !== null && projected > 0 ? Math.max(consumedPct, (p10 / projected) * 100) : 0;
  const haloRight = p90 !== null && projected > 0 ? Math.min(100, (p90 / projected) * 100) : 100;

  return (
    <article
      className={`hai-num hai-roi-card ${className ?? ''}`}
      style={cardStyle}
      role="region"
      aria-label={`Today's energy bill — projected ${Math.round(projected)} OMR`}
      tabIndex={0}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={labelStyle}>Today's energy bill</span>
        <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
          {projection.remaining_hours !== undefined && `${projection.remaining_hours.toFixed(0)} h remaining`}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--hai-space-4)' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--hai-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>So far</div>
          <div style={{ ...goldStyle, fontSize: 32 }}>{Math.round(soFar).toLocaleString()} <span style={{ fontSize: 13, color: 'var(--hai-text-secondary)' }}>OMR</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--hai-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projected today</div>
          <div style={{ ...goldStyle, fontSize: 40 }}>{Math.round(projected).toLocaleString()} <span style={{ fontSize: 13, color: 'var(--hai-text-secondary)' }}>OMR</span></div>
        </div>
      </div>

      {/* Horizontal candlestick bar */}
      <div style={{ position: 'relative', height: barH, marginTop: 4 }}>
        {showRange && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', top: 0, height: barH, borderRadius: barH / 2,
              left: `${haloLeft}%`, width: `${haloRight - haloLeft}%`,
              background: 'rgba(240,181,79,0.15)',
            }}
          />
        )}
        {/* Hatched: consumed → projected */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 4, height: barH - 8, borderRadius: (barH - 8) / 2,
            left: `${consumedPct}%`, width: `${100 - consumedPct}%`,
            backgroundImage: 'repeating-linear-gradient(45deg, var(--hai-money) 0 4px, transparent 4px 8px)',
            opacity: 0.55,
          }}
        />
        {/* Solid: consumed */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 4, height: barH - 8, borderRadius: (barH - 8) / 2,
            left: 0, width: `${consumedPct}%`,
            background: 'var(--hai-money)',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--hai-text-secondary)' }}>
        {showRange && (
          <span>Range: {Math.round(p10!).toLocaleString()}–{Math.round(p90!).toLocaleString()} OMR</span>
        )}
        {last !== null && last > 0 && (
          <span>Last same day: {Math.round(last).toLocaleString()} OMR</span>
        )}
      </div>
    </article>
  );
}
