/**
 * AttentionStage — Plan 6 §5.2 (default chip).
 *
 * Hosts Top-3 Levers (Phase C; placeholder list when empty) + Watch list
 * (Phase B trends + anomalies).
 */

import type { CSSProperties } from 'react';
import WatchBand from '../components/WatchBand';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 'var(--hai-space-3)',
};

const leverCard: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: 'var(--hai-space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 160,
};

export default function AttentionStage({ payload }: Props) {
  const levers = payload?.levers ?? [];
  const trends = payload?.forecasts?.trends ?? [];
  const anomalies = payload?.anomalies ?? [];
  const machinesCount = payload?.per_asset?.length ?? 0;

  const everythingEmpty = levers.length === 0 && trends.length === 0 && anomalies.length === 0;

  if (everythingEmpty) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-5)' }}>
        <div style={{
          padding: 'var(--hai-space-6)',
          border: '1px dashed var(--hai-glass-border)',
          borderRadius: 16,
          color: 'var(--hai-text-secondary)',
          fontSize: 14,
          textAlign: 'center',
        }}>
          Nothing demanding your attention right now. Hercules is watching {machinesCount} machine{machinesCount === 1 ? '' : 's'} and will surface anything unusual.
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-5)' }}>
      {/* Top-3 Levers */}
      {levers.length > 0 && (
        <div>
          <div style={sectionLabel}>Top {Math.min(3, levers.length)} action{levers.length === 1 ? '' : 's'}</div>
          <div
            className="hai-num"
            style={{
              display: 'grid',
              gap: 'var(--hai-space-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            {levers.slice(0, 3).map((lever: any, i: number) => (
              <article
                key={lever.id || i}
                className="hai-roi-lever"
                data-rank={(i + 1).toString()}
                style={leverCard}
                tabIndex={0}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, color: 'var(--hai-text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Action {i + 1}
                  </span>
                  {lever.confidence_pct != null && (
                    <span style={{ fontSize: 10, color: 'var(--hai-text-tertiary)' }}>
                      {lever.confidence_pct}% confident
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: 'Inter Tight, system-ui, sans-serif',
                  fontWeight: 500,
                  fontSize: 16,
                  color: 'var(--hai-text-primary)',
                  lineHeight: 1.3,
                }}>
                  {lever.headline}
                </div>
                <div className="hai-money-figure" style={{ fontSize: 32, marginTop: 'auto' }}>
                  {Math.round(lever.omr_per_month).toLocaleString()}
                  <span className="hai-money-unit">OMR/month</span>
                </div>
                {lever.payback_months != null && lever.payback_months > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--hai-text-secondary)' }}>
                    Pays back in {lever.payback_months.toFixed(1)} months
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)', borderTop: '1px solid var(--hai-glass-border)', paddingTop: 8, marginTop: 4 }}>
                  {lever.evidence}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Watch list */}
      {(trends.length > 0 || anomalies.length > 0) && (
        <div>
          <WatchBand trends={trends} anomalies={anomalies} />
        </div>
      )}
    </section>
  );
}
