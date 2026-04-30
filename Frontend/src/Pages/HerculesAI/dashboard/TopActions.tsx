/**
 * TopActions — Plan 14 §3.4.
 *
 * Top 3 highest-value levers. Each row: rank (①②③), gold OMR/year figure,
 * headline, payback chip. Rank-1 row gets the gold money-figure glow pulse
 * already defined in tokens.css (.hai-roi-lever[data-rank='1'] selector).
 *
 * Empty state: a calibrating message when the lever list is empty (Hercules
 * is still learning patterns — no actionable recommendations yet).
 *
 * Note on confidence_pct: per Plan 14 anti-pattern §4.10, we do NOT show the
 * hard-coded "80% confident" literal until that figure comes from a real
 * model. Payback months is the grounded number we surface instead.
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
  gap: 6,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 240,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 4,
};

const RANK_GLYPHS = ['①', '②', '③'];

interface LeverRowProps {
  lever: any;
  index: number;
  isLast: boolean;
}

function LeverRow({ lever, index, isLast }: LeverRowProps) {
  const omrYear = lever.omr_per_year ?? null;
  const omrMonth = lever.omr_per_month ?? null;
  const omr = omrYear ?? (omrMonth != null ? omrMonth * 12 : null);
  const animated = useCountUp(omr ?? 0);
  const payback = typeof lever.payback_months === 'number' ? lever.payback_months : null;
  const headline = lever.headline || lever.evidence || 'Action available';

  return (
    <article
      className="hai-roi-lever"
      data-rank={String(index + 1)}
      tabIndex={0}
      aria-label={`Action ${index + 1}: ${headline}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto',
        alignItems: 'baseline',
        gap: 12,
        padding: '10px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--hai-glass-border)',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      <span style={{ fontSize: 16, color: 'var(--hai-text-tertiary)', lineHeight: 1 }}>
        {RANK_GLYPHS[index] || `${index + 1}.`}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          className="hai-money-figure"
          style={{ fontSize: 20 }}
        >
          {omr == null ? '—' : animated.toLocaleString()}
          <span className="hai-money-unit" style={{ fontSize: 11, marginLeft: 6 }}>
            OMR/year
          </span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--hai-text-secondary)', lineHeight: 1.4 }}>
          {headline}
        </span>
      </div>
      <span
        style={{
          fontSize: 11,
          color: 'var(--hai-text-tertiary)',
          background: 'var(--hai-glass-2)',
          border: '1px solid var(--hai-glass-border)',
          padding: '2px 8px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
        }}
      >
        {payback != null && payback > 0 ? `${payback.toFixed(1)} mo payback` : 'No CAPEX'}
      </span>
    </article>
  );
}

export default function TopActions({ payload }: Props) {
  const levers = (payload?.levers ?? []).slice(0, 3);

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Top {Math.min(3, levers.length || 3)} actions</div>

      {levers.length === 0 && (
        <div
          style={{
            flex: 1,
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
          Hercules is learning your patterns. Action recommendations will appear once enough history is collected.
        </div>
      )}

      {levers.map((lever: any, i: number) => (
        <LeverRow
          key={lever.id || i}
          lever={lever}
          index={i}
          isLast={i === levers.length - 1}
        />
      ))}
    </div>
  );
}
