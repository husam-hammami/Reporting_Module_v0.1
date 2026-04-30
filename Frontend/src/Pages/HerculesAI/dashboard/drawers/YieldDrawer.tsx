/**
 * YieldDrawer — Plan 14 §5.6.
 *
 * Trigger: click on a yield-related Predictions card.
 * Content: yield trend (last 7 days vs prior 14 days baseline) for the
 * referenced asset, plus the OMR/month at risk if any.
 *
 * Hits GET /hercules-ai/yield (Phase D — for now, shows a learning state).
 */

import type { CSSProperties } from 'react';
import DrawerFrame from './DrawerFrame';

interface Props {
  open: boolean;
  onClose: () => void;
  asset?: string | null;
  trend?: any;
}

const stat: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
};

export default function YieldDrawer({ open, onClose, asset, trend }: Props) {
  const recent = trend?.recent_value ?? trend?.recent_kwh_per_t ?? null;
  const baseline = trend?.baseline_value ?? trend?.baseline_kwh_per_t ?? null;
  const driftPct = trend?.drift_pct ?? trend?.delta_pct ?? null;
  const omrAtRisk = trend?.estimated_omr_per_month_at_risk ?? trend?.omr_at_risk ?? null;

  return (
    <DrawerFrame
      open={open}
      onClose={onClose}
      eyebrow="Yield trend"
      title={asset ? `Yield outlook · ${asset}` : 'Yield outlook'}
    >
      {!trend && (
        <div style={{
          padding: 24,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--hai-text-tertiary)',
          lineHeight: 1.6,
        }}>
          Hercules is still learning the yield baseline. Trend signals will appear
          here when 14 days of clean production history are available.
        </div>
      )}

      {trend && (
        <div className="hai-num">
          <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
            <div style={stat}>
              <div style={labelStyle}>Recent (7d)</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--hai-text-primary)' }}>
                {recent != null ? recent.toFixed(2) : '—'}
              </div>
            </div>
            <div style={stat}>
              <div style={labelStyle}>Baseline (prior 21d)</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--hai-text-secondary)' }}>
                {baseline != null ? baseline.toFixed(2) : '—'}
              </div>
            </div>
            <div style={stat}>
              <div style={labelStyle}>Drift</div>
              <div style={{
                fontSize: 22,
                fontWeight: 500,
                color: driftPct != null && driftPct > 0 ? 'var(--hai-status-warn-600)' : 'var(--hai-text-primary)',
              }}>
                {driftPct != null ? `${driftPct > 0 ? '+' : ''}${driftPct.toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          {omrAtRisk != null && omrAtRisk > 0 && (
            <div style={{
              padding: 16,
              background: 'rgba(202,138,4,0.08)',
              border: '1px solid rgba(202,138,4,0.25)',
              borderRadius: 12,
              fontSize: 13,
              color: 'var(--hai-text-primary)',
              lineHeight: 1.5,
            }}>
              <span className="hai-money-figure" style={{ fontSize: 18 }}>
                {Math.round(omrAtRisk).toLocaleString()}
                <span className="hai-money-unit" style={{ fontSize: 11, marginLeft: 4 }}>OMR/mo at risk</span>
              </span>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--hai-text-secondary)' }}>
                {trend?.evidence || 'If this drift sustains, monthly cost rises by the figure above.'}
              </div>
            </div>
          )}
        </div>
      )}
    </DrawerFrame>
  );
}
