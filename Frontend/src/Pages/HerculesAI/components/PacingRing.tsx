/**
 * PacingRing — Plan 5 §14.5 / page-spec Band 2
 *
 * Conic-gradient ring that fills as the shift progresses. Shows projected
 * end-of-shift total + status. Honest empty state during warm-up.
 *
 * Props:
 *   pace: ShiftPace | null         — output of ai_forecast.shift_pace.project
 *
 * Plain-language only — no "p10/p90", no "MAPE", no "stddev".
 */

import type { CSSProperties } from 'react';

interface ShiftPace {
  asset: string;
  shift_id: string;
  shift_start: string;
  shift_end: string;
  elapsed_hours: number;
  remaining_hours: number;
  produced_so_far_kg: number;
  target_kg: number | null;
  projected_total_kg: number | null;
  p10_kg: number | null;
  p90_kg: number | null;
  status: 'on_track' | 'at_risk' | 'will_miss' | 'no_target' | 'learning';
  eta_minutes: number | null;
  gap_kg: number | null;
  accuracy_label: string;
}

interface PacingRingProps {
  pace: ShiftPace | null;
  size?: number;
  className?: string;
}

const cardStyle: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 18,
  padding: 'var(--hai-space-5)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--hai-space-2)',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
};

const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--hai-text-secondary)', alignSelf: 'flex-start',
};

function statusColor(s: ShiftPace['status']): string {
  switch (s) {
    case 'on_track':   return 'var(--hai-status-ok-600)';
    case 'at_risk':    return 'var(--hai-status-warn-600)';
    case 'will_miss':  return 'var(--hai-status-crit-600)';
    default:           return 'var(--hai-money)';
  }
}

function statusLabel(s: ShiftPace['status']): string {
  switch (s) {
    case 'on_track':   return 'On track';
    case 'at_risk':    return 'At risk';
    case 'will_miss':  return 'Will miss';
    case 'no_target':  return 'No target set';
    case 'learning':   return 'Learning…';
    default:           return '';
  }
}

function formatGap(gap: number | null): string {
  if (gap === null) return '';
  const tons = (gap / 1000).toFixed(1);
  if (gap > 0) return `${tons} t under target`;
  return `${Math.abs(parseFloat(tons))} t over target`;
}

function formatEta(min: number | null, shiftEnd: string): string | null {
  if (min === null) return null;
  const end = new Date(shiftEnd);
  const eta = new Date(Date.now() + min * 60_000);
  const margin = Math.round((end.getTime() - eta.getTime()) / 60_000);
  const hh = String(eta.getHours()).padStart(2, '0');
  const mm = String(eta.getMinutes()).padStart(2, '0');
  if (margin > 0) return `Hits target ${hh}:${mm} (+${margin} min margin)`;
  if (margin < 0) return `Hits target ${hh}:${mm} (${margin} min late)`;
  return `Hits target ${hh}:${mm}`;
}

export default function PacingRing({ pace, size = 220, className }: PacingRingProps) {
  if (!pace) {
    return (
      <article className={`hai-num ${className ?? ''}`} style={cardStyle} aria-label="Shift pace — no active shift">
        <div style={labelStyle}>Shift pace</div>
        <div style={{ fontSize: 36, color: 'var(--hai-text-secondary)', fontWeight: 300, padding: 'var(--hai-space-6) 0' }}>
          —
        </div>
        <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)' }}>No active shift</div>
      </article>
    );
  }

  const target = pace.target_kg;
  let pct = 0;
  if (target && pace.projected_total_kg !== null) {
    pct = Math.max(0, Math.min(100, (pace.projected_total_kg / target) * 100));
  } else if (pace.elapsed_hours + pace.remaining_hours > 0) {
    pct = (pace.elapsed_hours / (pace.elapsed_hours + pace.remaining_hours)) * 100;
  }

  const fill = statusColor(pace.status);
  const innerSize = size - 16;
  const ringStyle: CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    background: `conic-gradient(from -90deg, ${fill} 0% ${pct}%, rgba(255,255,255,0.06) ${pct}% 100%)`,
    filter: `drop-shadow(0 8px 24px ${fill}33)`,
    display: 'grid', placeItems: 'center', position: 'relative',
  };
  const innerStyle: CSSProperties = {
    width: innerSize - 60, height: innerSize - 60, borderRadius: '50%',
    background: 'var(--hai-surface-canvas)', display: 'grid', placeItems: 'center',
  };

  const isLearning = pace.status === 'learning';
  const projectedTons = pace.projected_total_kg !== null
    ? (pace.projected_total_kg / 1000).toFixed(1) : '—';
  const targetTons = target !== null ? (target / 1000).toFixed(0) : null;

  return (
    <article
      className={`hai-num hai-roi-card ${className ?? ''}`}
      style={cardStyle}
      role="region"
      aria-label={`Shift pace for ${pace.asset}: ${statusLabel(pace.status)}`}
      tabIndex={0}
    >
      <div style={labelStyle}>Shift pace · {pace.asset}</div>

      <div style={ringStyle} aria-hidden="true">
        <div style={innerStyle}>
          <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
            <div style={{
              fontSize: 'var(--hai-roi-display-sm)', fontWeight: 300,
              color: 'var(--hai-text-primary)', letterSpacing: '-0.02em',
            }}>
              {projectedTons}
            </div>
            <div style={{ fontSize: 13, color: 'var(--hai-text-secondary)', fontWeight: 500 }}>
              {targetTons ? `of ${targetTons}` : 'tonnes'}
            </div>
          </div>
        </div>
      </div>

      {isLearning ? (
        <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)' }}>
          Learning — needs more shift history
        </div>
      ) : (
        <>
          <div style={{
            fontSize: 12, fontWeight: 600, color: fill,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%', background: fill,
            }} />
            {statusLabel(pace.status)}
            {pace.gap_kg !== null && <span style={{ color: 'var(--hai-text-secondary)', fontWeight: 400 }}>· {formatGap(pace.gap_kg)}</span>}
          </div>
          {pace.eta_minutes !== null && (
            <div style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
              {formatEta(pace.eta_minutes, pace.shift_end)}
            </div>
          )}
          {pace.p10_kg !== null && pace.p90_kg !== null && (
            <div style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
              Range: {(pace.p10_kg / 1000).toFixed(1)}–{(pace.p90_kg / 1000).toFixed(1)} t
            </div>
          )}
        </>
      )}
    </article>
  );
}
