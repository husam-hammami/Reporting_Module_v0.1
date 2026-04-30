/**
 * SecCard — Plan 5 §14.5
 * Specific Energy Consumption (kWh/ton) per asset with delta vs 30-day baseline
 * and excess-cost-today in OMR (gold).
 *
 * Empty state: "Calibrating · keep using Hercules for N more days" — never zero.
 * Accuracy badge: green/amber/red/grey per Plan §13.3.
 */

import type { CSSProperties } from 'react';

interface SecSummary {
  asset: string;
  period_hours: number;
  sec_today: number | null;
  sec_baseline: number | null;
  sec_delta_pct: number | null;
  kwh_today: number;
  kg_today: number;
  cost_omr_today: number;
  excess_omr_today: number;
  accuracy_label: 'green' | 'amber' | 'red' | 'calibrating';
  clean_hours: number;
}

interface SecCardProps {
  summary: SecSummary | null;
  className?: string;
}

const cardStyle: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 18,
  padding: 'var(--hai-space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hai-space-2)',
  minHeight: 140,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
};

const heroStyle: CSSProperties = {
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontWeight: 300,
  fontSize: 'var(--hai-roi-display-sm)',
  lineHeight: 1,
  color: 'var(--hai-text-primary)',
  letterSpacing: '-0.02em',
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
};

function badgeColors(label: SecSummary['accuracy_label']): { bg: string; fg: string; text: string } {
  switch (label) {
    case 'green':       return { bg: 'var(--hai-status-ok-100)',   fg: 'var(--hai-status-ok-600)',   text: 'Reliable' };
    case 'amber':       return { bg: 'var(--hai-status-warn-100)', fg: 'var(--hai-status-warn-600)', text: 'Roughly right' };
    case 'red':         return { bg: 'var(--hai-status-crit-100)', fg: 'var(--hai-status-crit-600)', text: 'Direction only' };
    case 'calibrating': return { bg: 'var(--hai-glass-2)',         fg: 'var(--hai-text-secondary)',  text: 'Learning' };
  }
}

export default function SecCard({ summary, className }: SecCardProps) {
  if (!summary || summary.sec_today === null) {
    const remainingDays = summary ? Math.max(0, 7 - Math.floor(summary.clean_hours / 24)) : 7;
    return (
      <article className={`hai-num ${className ?? ''}`} style={cardStyle} aria-label="Energy use — learning">
        <div style={labelStyle}>Energy use · {summary?.asset ?? '—'}</div>
        <div style={{ ...heroStyle, color: 'var(--hai-text-secondary)' }}>Learning…</div>
        <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)' }}>
          Need {remainingDays} more days of data
        </div>
      </article>
    );
  }

  const delta = summary.sec_delta_pct;
  const isUp = (delta ?? 0) > 0;
  const deltaColor =
    delta === null ? 'var(--hai-text-tertiary)'
    : isUp ? 'var(--hai-status-crit-600)' : 'var(--hai-status-ok-600)';

  const badge = badgeColors(summary.accuracy_label);

  return (
    <article
      className={`hai-num hai-roi-card ${className ?? ''}`}
      style={cardStyle}
      role="region"
      aria-label={`Energy used per ton for ${summary.asset}`}
      tabIndex={0}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={labelStyle}>Energy use · {summary.asset}</span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 999,
            background: badge.bg,
            color: badge.fg,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {badge.text}
        </span>
      </div>

      <div style={heroStyle}>
        <span>{summary.sec_today.toFixed(1)}</span>
        <span style={{ fontSize: 14, color: 'var(--hai-text-secondary)', fontWeight: 500 }}>kWh per ton</span>
      </div>

      {delta !== null && summary.sec_baseline !== null && (
        <div style={{ fontSize: 12, color: deltaColor, fontWeight: 500 }}>
          {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs last month average ({summary.sec_baseline.toFixed(1)} kWh per ton)
        </div>
      )}

      {summary.excess_omr_today > 0 && (
        <div style={{ fontSize: 12, color: 'var(--hai-text-secondary)' }}>
          Excess cost today:{' '}
          <span style={{ color: 'var(--hai-money)', fontWeight: 600 }}>
            {Math.round(summary.excess_omr_today).toLocaleString()} OMR
          </span>
        </div>
      )}
      {summary.excess_omr_today === 0 && summary.cost_omr_today > 0 && (
        <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)' }}>
          Cost today: <span style={{ fontWeight: 500, color: 'var(--hai-text-secondary)' }}>
            {Math.round(summary.cost_omr_today).toLocaleString()} OMR
          </span>
        </div>
      )}
    </article>
  );
}
