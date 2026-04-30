/**
 * IntensityTile — Plan 14 §3.2.
 *
 * Status pulse + plant score (56-px badge — demoted from the old 80-px hero) +
 * energy intensity (kWh/ton) + cost intensity (OMR/ton, rolling 24 h per locked
 * answer to §12 Q1).
 *
 * The verdict text is part of THIS tile (not a separate hero card) so the
 * "shit verdict badge" the customer flagged disappears as a labeled block —
 * status reads as the dot color + a neutral verdict line, integrated into
 * the same tile that holds the score and intensity figures.
 */

import type { CSSProperties } from 'react';
import { useCountUp } from './hooks/useCountUp';
import { useDerivedMoneyPerTon } from './hooks/useDerivedMoneyPerTon';
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
  gap: 14,
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

const dotStyle = (level: string | undefined): CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
  background:
    level === 'crit' ? 'var(--hai-status-crit-600)' :
    level === 'warn' ? 'var(--hai-status-warn-600)' :
    level === 'ok'   ? 'var(--hai-status-ok-600)'   :
                       'var(--hai-status-idle-600)',
  // No idle pulse — MASTER §6.2: max two animated elements at idle, neither is the status dot.
});

export default function IntensityTile({ payload }: Props) {
  const score = payload?.plant_score?.value ?? null;
  const eff = payload?.plant_score?.efficiency ?? null;     // kWh/ton
  const verdict = payload?.plant_status_verdict ?? '';
  const level = payload?.plant_status_level;
  const omrPerTon = useDerivedMoneyPerTon(payload);

  const animatedScore = useCountUp(score ?? 0);
  // OMR/ton can be small (e.g. 0.107) — use a multiplier to count up cents-of-OMR for visual interest.
  const animatedOmrCents = useCountUp(omrPerTon != null ? Math.round(omrPerTon * 1000) : 0);

  return (
    <div style={tile} className="hai-num">
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={dotStyle(level)} aria-hidden="true" />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hai-text-primary)' }}>
          {verdict || 'Standing by'}
        </span>
      </div>

      {/* Score badge — 56 px (demoted from 80 px hero) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: "'Inter Tight', system-ui, sans-serif",
          fontSize: 56,
          fontWeight: 300,
          color: 'var(--hai-text-primary)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}>
          {score == null ? '—' : animatedScore}
        </span>
        <span style={{ fontSize: 18, fontWeight: 400, color: 'var(--hai-text-tertiary)' }}>
          /100
        </span>
      </div>

      <div style={{ height: 1, background: 'var(--hai-glass-border)' }} />

      {/* Energy intensity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={labelStyle}>Energy intensity</div>
        <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--hai-text-primary)' }}>
          {eff == null ? '—' : `${eff.toFixed(1)} kWh/ton`}
        </div>
      </div>

      {/* Cost intensity — OMR/ton, rolling 24 h */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={labelStyle}>Cost intensity</div>
        <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--hai-money)' }}>
          {omrPerTon == null
            ? '—'
            : `${(animatedOmrCents / 1000).toFixed(3)} OMR/ton`}
        </div>
        <div style={{ fontSize: 10, color: 'var(--hai-text-tertiary)', letterSpacing: '0.04em' }}>
          24 h average
        </div>
      </div>
    </div>
  );
}
