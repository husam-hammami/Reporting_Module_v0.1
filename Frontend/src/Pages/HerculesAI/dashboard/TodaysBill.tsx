/**
 * TodaysBill — Plan 14 §3.3.
 *
 * Today's daily-bill projection. Hero: projected OMR by close. Below: a
 * custom horizontal range visualisation showing where we are right now
 * (so_far_omr) and the confidence band (p10 → p90) for end-of-day. Click
 * → BillDrilldownDrawer (commit 7).
 *
 * Why custom SVG rather than recharts/chart.js: the backend returns only
 * summary stats (so_far + projected + p10 + p90), no hourly breakdown.
 * Interpolating a smooth curve through linear-interpolated hours would be
 * fake-precision UX. The horizontal range visualisation is honest about
 * the data Hercules actually has.
 */

import type { CSSProperties } from 'react';
import { useCountUp } from './hooks/useCountUp';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 240,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
};

interface ChartProps {
  soFar: number;
  projected: number;
  p10: number;
  p90: number;
}

function ProjectionChart({ soFar, projected, p10, p90 }: ChartProps) {
  // Layout the visualisation on a 0..p90*1.05 axis so the band has headroom.
  const axisMax = Math.max(p90, projected) * 1.05;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / axisMax) * 100));

  const soFarPct = pct(soFar);
  const p10Pct = pct(p10);
  const p90Pct = pct(p90);
  const projPct = pct(projected);

  return (
    <div style={{ position: 'relative', height: 96, padding: '24px 0' }}>
      {/* Axis line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 2,
          background: 'var(--hai-glass-border)',
          borderRadius: 2,
        }}
      />

      {/* Confidence band — gold tinted */}
      <div
        style={{
          position: 'absolute',
          left: `${p10Pct}%`,
          width: `${p90Pct - p10Pct}%`,
          top: 'calc(50% - 8px)',
          height: 16,
          background: 'rgba(202,138,4,0.18)',
          borderRadius: 8,
          border: '1px solid rgba(202,138,4,0.35)',
        }}
        aria-label="Forecast confidence range"
      />

      {/* So-far filled track from 0 to soFarPct */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: `${soFarPct}%`,
          top: 'calc(50% - 4px)',
          height: 8,
          background: 'var(--hai-money)',
          opacity: 0.65,
          borderRadius: 4,
        }}
      />

      {/* So-far marker */}
      <div
        style={{
          position: 'absolute',
          left: `calc(${soFarPct}% - 6px)`,
          top: 'calc(50% - 8px)',
          width: 12,
          height: 16,
          background: 'var(--hai-money)',
          borderRadius: 3,
          boxShadow: '0 0 0 2px var(--hai-glass-1)',
        }}
        aria-label={`So far ${Math.round(soFar)} OMR`}
      />

      {/* Projected marker */}
      <div
        style={{
          position: 'absolute',
          left: `calc(${projPct}% - 1px)`,
          top: 'calc(50% - 16px)',
          width: 2,
          height: 32,
          background: 'var(--hai-text-primary)',
          opacity: 0.65,
        }}
        aria-label={`Projected ${Math.round(projected)} OMR`}
      />

      {/* Labels */}
      <div
        style={{
          position: 'absolute',
          left: `calc(${soFarPct}% - 28px)`,
          top: 0,
          fontSize: 10,
          color: 'var(--hai-text-tertiary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          width: 56,
          textAlign: 'center',
        }}
      >
        Now
      </div>
      <div
        style={{
          position: 'absolute',
          left: `calc(${projPct}% - 28px)`,
          bottom: 0,
          fontSize: 10,
          color: 'var(--hai-text-tertiary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          width: 56,
          textAlign: 'center',
        }}
      >
        By close
      </div>
    </div>
  );
}

export default function TodaysBill({ payload }: Props) {
  const bill = payload?.forecasts?.daily_bill ?? null;
  const projected = bill?.projected_omr ?? null;
  const p10 = bill?.p10_omr ?? null;
  const p90 = bill?.p90_omr ?? null;
  const cost = payload?.money?.cost_omr_today ?? null;
  const accuracyLabel = bill?.accuracy_label;

  const animatedProjected = useCountUp(projected ?? 0);

  const hasFullForecast = projected != null && p10 != null && p90 != null && cost != null && accuracyLabel !== 'learning';

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Today's bill, by close</div>

      {/* Hero projection number */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontFamily: "'Inter Tight', system-ui, sans-serif",
            fontSize: 44,
            fontWeight: 300,
            color: 'var(--hai-money)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}
        >
          {hasFullForecast ? animatedProjected.toLocaleString() : '—'}
        </span>
        <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--hai-money)', opacity: 0.55 }}>
          OMR
        </span>
      </div>

      {/* Visualization */}
      {hasFullForecast ? (
        <ProjectionChart
          soFar={cost!}
          projected={projected!}
          p10={p10!}
          p90={p90!}
        />
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 96,
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
          {accuracyLabel === 'learning'
            ? 'Hercules is still learning the daily pattern. Projection will appear after a week of data.'
            : 'No forecast available right now.'}
        </div>
      )}

      {/* Range + so-far footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 12,
          color: 'var(--hai-text-secondary)',
        }}
      >
        <span>
          {p10 != null && p90 != null
            ? `Range ${Math.round(p10).toLocaleString()} – ${Math.round(p90).toLocaleString()} OMR`
            : ''}
        </span>
        <span>
          {cost != null
            ? `${Math.round(cost).toLocaleString()} OMR so far`
            : ''}
        </span>
      </div>
    </div>
  );
}
