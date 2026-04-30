/**
 * TodaysBill — Plan 14 §3.3.
 *
 * Today's daily-bill projection with confidence band. Hero: projected_omr
 * by close. Range: p10-p90.
 *
 * Commit 1 placeholder: textual projection + range. Chart lands in commit 4.
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

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
};

export default function TodaysBill({ payload }: Props) {
  const bill = payload?.forecasts?.daily_bill ?? null;
  const projected = bill?.projected_omr ?? null;
  const p10 = bill?.p10_omr ?? null;
  const p90 = bill?.p90_omr ?? null;
  const cost = payload?.money?.cost_omr_today ?? null;

  const hasForecast = projected != null;
  const hasBand = p10 != null && p90 != null;

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Today's bill, by close</div>

      {/* Hero projection */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: "'Inter Tight', system-ui, sans-serif",
          fontSize: 44,
          fontWeight: 300,
          color: 'var(--hai-money)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}>
          {hasForecast ? `${Math.round(projected!).toLocaleString()}` : '—'}
        </span>
        <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--hai-money)', opacity: 0.55 }}>
          OMR
        </span>
      </div>

      {/* Confidence band — placeholder for chart in commit 4 */}
      <div style={{
        flex: 1,
        minHeight: 80,
        border: '1px dashed var(--hai-glass-border)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--hai-text-tertiary)',
        fontSize: 12,
      }}>
        forecast chart · commit 4
      </div>

      {/* Range + so-far */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: 12,
        color: 'var(--hai-text-secondary)',
      }}>
        <span>
          {hasBand ? `Range ${Math.round(p10!).toLocaleString()} – ${Math.round(p90!).toLocaleString()} OMR` : 'Learning the daily pattern'}
        </span>
        <span>
          {cost != null ? `${Math.round(cost).toLocaleString()} OMR so far` : ''}
        </span>
      </div>
    </div>
  );
}
