/**
 * IntensityTile — Plan 14 §3.2.
 *
 * Status pulse + plant score (56 px badge — demoted from 80 px hero) +
 * energy intensity (kWh/ton) + cost intensity (OMR/ton, rolling 24 h per
 * locked answer). Replaces the universal verdict card.
 *
 * Commit 1 placeholder: layout + real numbers; OMR/ton uses cost_omr_today
 * for now (rolling 24 h hook lands in commit 3).
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
  gap: 12,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 240,
};

const statusDot = (level: string | undefined): CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  background:
    level === 'crit' ? 'var(--hai-status-crit-600)' :
    level === 'warn' ? 'var(--hai-status-warn-600)' :
    level === 'ok'   ? 'var(--hai-status-ok-600)'   :
                       'var(--hai-status-idle-600)',
});

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
};

export default function IntensityTile({ payload }: Props) {
  const score = payload?.plant_score?.value ?? null;
  const eff = payload?.plant_score?.efficiency ?? null;     // kWh/ton
  const cost = payload?.money?.cost_omr_today ?? null;
  const verdict = payload?.plant_status_verdict ?? '';
  const level = payload?.plant_status_level;

  // Stub for OMR/ton — proper rolling-24h hook lands in commit 3
  const omrPerTon =
    cost != null && eff != null && eff > 0
      ? (cost / 1000) * (eff / 21.4)   // placeholder formula until hook
      : null;

  return (
    <div style={tile} className="hai-num">
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={statusDot(level)} aria-hidden="true" />
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
          {score == null ? '—' : score}
        </span>
        <span style={{ fontSize: 18, fontWeight: 400, color: 'var(--hai-text-tertiary)' }}>
          /100
        </span>
      </div>

      <div style={{
        height: 1,
        background: 'var(--hai-glass-border)',
        margin: '4px 0',
      }} />

      {/* kWh/ton + OMR/ton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={labelStyle}>Energy intensity</div>
        <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--hai-text-primary)' }}>
          {eff == null ? '—' : `${eff.toFixed(1)} kWh/ton`}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={labelStyle}>Cost intensity</div>
        <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--hai-money)' }}>
          {omrPerTon == null ? '—' : `${omrPerTon.toFixed(3)} OMR/ton`}
        </div>
        <div style={{ fontSize: 10, color: 'var(--hai-text-tertiary)' }}>
          24 h average
        </div>
      </div>
    </div>
  );
}
