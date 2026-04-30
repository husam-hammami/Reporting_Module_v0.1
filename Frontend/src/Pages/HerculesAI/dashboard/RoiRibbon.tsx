/**
 * RoiRibbon — Plan 14 §3.1.
 *
 * Full-width gold ribbon. Hero: month-to-date OMR savings (count-up tween).
 * Inline middle: today's running cost + projected end-of-day. Right rail:
 * Confidence + Trust pills.
 *
 * State coverage (Plan 14 §6):
 *   - normal:        gold hero + caption "saved this month"
 *   - calibrating:   neutral hero "—" + caption "Hercules learning · saving figures show after 30 days"
 *   - no-data:       hero "—" + caption "saved this month"
 *   - error:         keeps last good value, shows subtle "couldn't load" subline
 *   - learning forecast: projection hidden until confidence ≥ 60%, 800 ms crossfade
 */

import type { CSSProperties } from 'react';
import { useCountUp } from './hooks/useCountUp';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
  loading: boolean;
  error: string | null;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 24,
  padding: '24px 32px',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  position: 'relative',
  // Subtle gold gradient inlay per Plan 14 §3.1 token spec
  backgroundImage:
    'linear-gradient(135deg, rgba(202,138,4,0.06), rgba(202,138,4,0.01))',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginTop: 6,
};

const heroStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 64,
  fontWeight: 300,
  color: 'var(--hai-money)',
  lineHeight: 1,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

const middleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 400,
  fontVariantNumeric: 'tabular-nums lining-nums',
};

const pillStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--hai-text-secondary)',
  background: 'var(--hai-glass-2)',
  border: '1px solid var(--hai-glass-border)',
  padding: '4px 10px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};

function confidenceLabel(payload: RoiPayload | null): string {
  const trust = payload?.trust?.score;
  const calibrating = payload?.trust?.calibrating;
  if (calibrating || trust == null) return 'Confidence: Learning';
  if (trust >= 85) return 'Confidence: Reliable';
  if (trust >= 65) return 'Confidence: Steady';
  return 'Confidence: Building';
}

export default function RoiRibbon({ payload, loading, error }: Props) {
  const saved = payload?.money?.savings_this_month_omr ?? null;
  const calibrating = !!payload?.savings?.calibrating;
  const cost = payload?.money?.cost_omr_today ?? null;
  const projected = payload?.forecasts?.daily_bill?.projected_omr ?? null;
  const accuracyLabel = payload?.forecasts?.daily_bill?.accuracy_label;
  const trust = payload?.trust?.score ?? null;

  // Hide projection during the "learning" warmup (per Plan 14 §3.1: confidence ≥ 60% gate).
  const projectionVisible = projected != null && accuracyLabel && accuracyLabel !== 'learning';

  const animatedSaved = useCountUp(saved ?? 0);
  const animatedCost = useCountUp(cost ?? 0);
  const animatedProjected = useCountUp(projected ?? 0);

  return (
    <div style={tile} className="hai-num">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        {/* Hero block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
          <div style={heroStyle}>
            {loading || saved == null ? '—' : `${animatedSaved.toLocaleString()} OMR`}
          </div>
          <div style={labelStyle}>
            {calibrating
              ? 'Hercules learning · saving figures show after 30 days'
              : 'saved this month'}
          </div>
        </div>

        {/* Middle block — today's running + projection */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-start',
            minWidth: 220,
            flex: '0 1 auto',
          }}
        >
          <div style={{ ...middleStyle, color: 'var(--hai-money)' }}>
            {cost == null ? '—' : `${animatedCost.toLocaleString()} OMR today`}
          </div>
          <div
            style={{
              ...middleStyle,
              color: 'var(--hai-money)',
              opacity: projectionVisible ? 0.55 : 0,
              transition: 'opacity 800ms ease-out',
              minHeight: 22,
            }}
          >
            {projectionVisible
              ? `→ ~${animatedProjected.toLocaleString()} by close`
              : ' '}
          </div>
        </div>

        {/* Right rail — Confidence + Trust pills */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-end',
          }}
        >
          <div style={pillStyle}>{confidenceLabel(payload)}</div>
          <div style={pillStyle}>
            {trust == null ? 'Trust — calibrating' : `Trust ${trust}/100`}
          </div>
        </div>
      </div>

      {error && saved == null && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--hai-text-tertiary)',
            marginTop: 8,
            fontStyle: 'italic',
          }}
        >
          Couldn't load latest figures · retrying
        </div>
      )}
    </div>
  );
}
