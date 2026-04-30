/**
 * AnomalyDrawer — Plan 14 §5.9.
 *
 * Trigger: click on a single Needs-Attention row.
 * Content: full anomaly detail (headline, evidence, OMR-at-risk, asset,
 * tag) + a Suppress action.
 *
 * Re-uses herculesAIApi.suppressAnomaly (Plan 5 §5.5) — no backend changes.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { toast } from 'react-toastify';
import DrawerFrame from './DrawerFrame';
import { herculesAIApi } from '../../../../API/herculesAIApi';

interface Props {
  open: boolean;
  onClose: () => void;
  anomaly: any;
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 6,
};

const evidenceBox: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 12,
  padding: 14,
  fontSize: 13,
  color: 'var(--hai-text-primary)',
  lineHeight: 1.6,
};

const meta: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  fontSize: 12,
  color: 'var(--hai-text-secondary)',
  marginBottom: 16,
};

const tag: CSSProperties = {
  background: 'var(--hai-glass-2)',
  border: '1px solid var(--hai-glass-border)',
  padding: '3px 10px',
  borderRadius: 999,
};

export default function AnomalyDrawer({ open, onClose, anomaly }: Props) {
  const [busy, setBusy] = useState(false);

  if (!anomaly) {
    return (
      <DrawerFrame open={open} onClose={onClose} title="Anomaly">
        <div style={{ color: 'var(--hai-text-tertiary)', textAlign: 'center', padding: 24 }}>
          No anomaly selected.
        </div>
      </DrawerFrame>
    );
  }

  const suppress = async () => {
    setBusy(true);
    try {
      await herculesAIApi.suppressAnomaly(anomaly.id);
      toast.success('Anomaly suppressed for 24 hours.');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Could not suppress');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerFrame
      open={open}
      onClose={onClose}
      eyebrow={anomaly.severity === 'crit' ? 'Critical' : 'Warning'}
      title={anomaly.headline || 'Anomaly detail'}
    >
      <div className="hai-num">
        <div style={meta}>
          <span style={tag}>{anomaly.asset || 'plant-wide'}</span>
          {anomaly.tag && <span style={tag}>{anomaly.tag}</span>}
          {anomaly.detected_at && (
            <span style={{ color: 'var(--hai-text-tertiary)' }}>
              Detected {new Date(anomaly.detected_at).toLocaleString()}
            </span>
          )}
        </div>

        {anomaly.omr_at_risk != null && anomaly.omr_at_risk > 0 && (
          <div style={{ marginBottom: 16 }}>
            <span className="hai-money-figure" style={{ fontSize: 24 }}>
              {Math.round(anomaly.omr_at_risk).toLocaleString()}
              <span className="hai-money-unit" style={{ fontSize: 11, marginLeft: 6 }}>OMR/month at risk</span>
            </span>
          </div>
        )}

        <div style={sectionLabel}>What happened</div>
        <div style={evidenceBox}>
          {anomaly.evidence || 'No additional evidence captured.'}
        </div>

        {(anomaly.observed_value != null || anomaly.baseline_value != null) && (
          <div style={{ marginTop: 16, display: 'flex', gap: 24 }}>
            {anomaly.baseline_value != null && (
              <div>
                <div style={sectionLabel}>Expected</div>
                <div style={{ fontSize: 18, color: 'var(--hai-text-primary)' }}>
                  {Number(anomaly.baseline_value).toFixed(2)}
                </div>
              </div>
            )}
            {anomaly.observed_value != null && (
              <div>
                <div style={sectionLabel}>Observed</div>
                <div style={{ fontSize: 18, color: 'var(--hai-status-warn-600)' }}>
                  {Number(anomaly.observed_value).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button
            onClick={suppress}
            disabled={busy}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid var(--hai-glass-border)',
              background: 'transparent',
              color: 'var(--hai-text-secondary)',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Suppressing…' : 'Suppress for 24 h'}
          </button>
        </div>
      </div>
    </DrawerFrame>
  );
}
