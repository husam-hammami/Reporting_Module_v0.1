/**
 * RoiRibbon — Plan 14 §3.1.
 *
 * Full-width gold ribbon. Hero: month-to-date OMR savings. Inline: today's
 * running cost + projected end-of-day. Right rail: Confidence + Trust.
 *
 * Commit 1 placeholder: real numbers wired, simple layout. Token cleanup
 * and motion polish in commit 2.
 */

import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
  loading: boolean;
  error: string | null;
}

const tile: React.CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 24,
  padding: '24px 32px',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  position: 'relative',
};

export default function RoiRibbon({ payload, loading, error }: Props) {
  const saved = payload?.money?.savings_this_month_omr ?? null;
  const calibrating = !!payload?.savings?.calibrating;
  const cost = payload?.money?.cost_omr_today ?? null;
  const projected = payload?.forecasts?.daily_bill?.projected_omr ?? null;
  const trust = payload?.trust?.score ?? null;

  return (
    <div style={tile} className="hai-num">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        {/* Hero block — left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontSize: 56,
            fontWeight: 300,
            color: 'var(--hai-money)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}>
            {loading
              ? '—'
              : (saved == null
                  ? '—'
                  : `${Math.round(saved).toLocaleString()} OMR`)}
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--hai-text-secondary)',
            marginTop: 6,
          }}>
            {calibrating ? 'Hercules learning · saving figures show after 30 days' : 'saved this month'}
          </div>
        </div>

        {/* Today running + projection — middle */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'flex-start',
          minWidth: 220,
        }}>
          <div style={{ fontSize: 22, fontWeight: 400, color: 'var(--hai-money)' }}>
            {cost == null ? '—' : `${Math.round(cost).toLocaleString()} OMR today`}
          </div>
          <div style={{ fontSize: 22, fontWeight: 400, color: 'var(--hai-money)', opacity: 0.55 }}>
            {projected == null ? '—' : `→ ~${Math.round(projected).toLocaleString()} by close`}
          </div>
        </div>

        {/* Right rail — Confidence + Trust */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'flex-end',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--hai-text-secondary)',
        }}>
          <div>Confidence: {trust == null ? 'Learning' : 'Reliable'}</div>
          <div>{trust == null ? 'Trust — calibrating' : `Trust ${trust}/100`}</div>
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: 11,
          color: 'var(--hai-status-warn-600)',
          marginTop: 8,
        }}>
          Couldn't load latest figures · retrying
        </div>
      )}
    </div>
  );
}
