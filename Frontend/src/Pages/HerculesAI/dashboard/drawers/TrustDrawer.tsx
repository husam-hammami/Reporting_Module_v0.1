/**
 * TrustDrawer — Plan 14 §5.5.
 *
 * Trigger: click on the Trust pill in the ROI Ribbon.
 * Content: trust score breakdown by component (forecast accuracy, anomaly
 * precision, etc.).
 */

import type { CSSProperties } from 'react';
import DrawerFrame from './DrawerFrame';
import type { RoiPayload } from '../../hooks/useRoiPayload';

interface Props {
  open: boolean;
  onClose: () => void;
  payload: RoiPayload | null;
}

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid var(--hai-glass-border)',
  fontSize: 13,
};

export default function TrustDrawer({ open, onClose, payload }: Props) {
  const trust = payload?.trust;
  const components = (trust?.components ?? {}) as Record<string, { score: number; label?: string }>;
  const componentEntries = Object.entries(components);

  return (
    <DrawerFrame open={open} onClose={onClose} eyebrow="Trust score" title="How Hercules earns its number">
      <div className="hai-num">
        <div style={{
          fontSize: 64,
          fontWeight: 300,
          color: 'var(--hai-text-primary)',
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums lining-nums',
          marginBottom: 4,
        }}>
          {trust?.score ?? '—'}
          <span style={{ fontSize: 24, color: 'var(--hai-text-tertiary)' }}>/100</span>
        </div>

        {trust?.calibrating && (
          <div style={{ fontSize: 12, color: 'var(--hai-text-secondary)', marginBottom: 16 }}>
            Hercules is still calibrating against actual outcomes. The score will
            stabilize after about a week of predictions vs measurements.
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--hai-text-secondary)',
            marginBottom: 6,
          }}>
            Components
          </div>

          {componentEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--hai-text-tertiary)', padding: 12 }}>
              Component breakdown not available yet.
            </div>
          ) : componentEntries.map(([key, val]) => (
            <div key={key} style={row}>
              <span style={{ color: 'var(--hai-text-primary)' }}>
                {val?.label || key.replace(/_/g, ' ')}
              </span>
              <span style={{ color: 'var(--hai-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {val?.score ?? '—'}/100
              </span>
            </div>
          ))}
        </div>
      </div>
    </DrawerFrame>
  );
}
