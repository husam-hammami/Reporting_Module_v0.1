/**
 * PfPenaltyCard — Plan 5 §14.5 (post-review §16.7 reuses existing PowerFactorGauge)
 *
 * Shows current PF avg, target threshold, monthly penalty in OMR, and capacitor
 * sizing recommendation with payback months.
 *
 * Follows MASTER §6 anti-PhD rule: max one PF visualisation on the page. The
 * existing PowerFactorGauge component (Phase 1) is reused for the gauge slot;
 * this card adds the financial framing around it.
 */

import type { CSSProperties } from 'react';

interface PfStatus {
  asset: string;
  available: boolean;
  pf_avg: number | null;
  pf_target: number;
  kwh: number;
  kvarh: number;
  penalty_omr: number;
  required_kvar: number;
  capacitor_cost_omr: number;
  payback_months: number | null;
  period_start?: string;
  period_end?: string;
}

interface PfPenaltyCardProps {
  status: PfStatus | null;
  onLeverClick?: () => void;
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
};

export default function PfPenaltyCard({ status, onLeverClick, className }: PfPenaltyCardProps) {
  if (!status || !status.available || status.pf_avg === null) {
    return (
      <article className={`hai-num ${className ?? ''}`} style={cardStyle} aria-label="Electrical efficiency — not configured">
        <div style={labelStyle}>Electrical efficiency</div>
        <div style={{ ...heroStyle, color: 'var(--hai-text-secondary)' }}>—</div>
        <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)' }}>
          Power-factor sensor not connected on {status?.asset ?? 'this asset'}
        </div>
      </article>
    );
  }

  const belowTarget = status.pf_avg < status.pf_target;
  const tint = belowTarget ? 'rgba(239, 68, 68, 0.04)' : 'transparent';

  return (
    <article
      className={`hai-num hai-roi-card ${className ?? ''}`}
      style={{ ...cardStyle, background: `linear-gradient(${tint}, ${tint}), var(--hai-glass-1)` }}
      role="region"
      aria-label={`Power factor for ${status.asset}: ${status.pf_avg}, target ${status.pf_target}`}
      tabIndex={0}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={labelStyle}>Electrical efficiency · {status.asset}</span>
        <MercuryGauge value={status.pf_avg} target={status.pf_target} />
      </div>

      <div style={heroStyle}>
        <span>{status.pf_avg.toFixed(2)}</span>
        <span style={{ fontSize: 14, color: 'var(--hai-text-secondary)', fontWeight: 500, marginLeft: 8 }}>
          should be {status.pf_target.toFixed(2)} or higher
        </span>
      </div>

      {status.penalty_omr > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--hai-text-secondary)' }}>
          Utility penalty this month:{' '}
          <span style={{ color: 'var(--hai-money)', fontWeight: 600 }}>
            {Math.round(status.penalty_omr).toLocaleString()} OMR
          </span>
          {status.payback_months !== null && status.payback_months > 0 && (
            <>
              {' · '}
              <button
                onClick={onLeverClick}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dotted var(--hai-future)',
                  color: 'var(--hai-future)',
                  cursor: 'pointer',
                  font: 'inherit',
                  padding: 0,
                }}
              >
                Equipment pays for itself in {status.payback_months.toFixed(1)} months →
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--hai-status-ok-600)', fontWeight: 500 }}>
          ✓ Running efficiently
        </div>
      )}
    </article>
  );
}

/* ── Mercury-style gauge: thin vertical bar with target tick line ───────── */
function MercuryGauge({ value, target }: { value: number; target: number }) {
  const min = 0.5;
  const max = 1.0;
  const clamped = Math.max(min, Math.min(max, value));
  const pct = ((clamped - min) / (max - min)) * 100;
  const targetPct = ((target - min) / (max - min)) * 100;
  const belowTarget = value < target;
  const fillColor = belowTarget ? 'var(--hai-status-crit-600)' : 'var(--hai-status-ok-600)';
  return (
    <svg width="14" height="48" viewBox="0 0 14 48" aria-hidden="true">
      {/* Track */}
      <rect x="5" y="2" width="4" height="44" rx="2" fill="var(--hai-glass-2)" />
      {/* Fill */}
      <rect
        x="5"
        y={2 + (44 * (1 - pct / 100))}
        width="4"
        height={44 * (pct / 100)}
        rx="2"
        fill={fillColor}
      />
      {/* Target tick */}
      <line
        x1="2" x2="12"
        y1={2 + 44 * (1 - targetPct / 100)}
        y2={2 + 44 * (1 - targetPct / 100)}
        stroke="var(--hai-money)"
        strokeWidth="1"
      />
    </svg>
  );
}
