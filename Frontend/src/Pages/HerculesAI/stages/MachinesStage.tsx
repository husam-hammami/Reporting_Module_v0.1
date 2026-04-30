/**
 * MachinesStage — Plan 6 §5.3.
 *
 * Replaces the previous tall asset bento (~400px × 7 cards) with a single
 * one-row-per-asset table (~56px each). Click a row → drill drawer with
 * the full-fat SecCard + PfPenaltyCard (Phase A components reused).
 */

import { useState, type CSSProperties } from 'react';
import SecCard from '../components/SecCard';
import PfPenaltyCard from '../components/PfPenaltyCard';
import PacingRing from '../components/PacingRing';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
}

const tableContainer: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: 'var(--hai-space-3) 0',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
};

const headerRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr auto 1fr 1fr 1fr auto',
  gap: 'var(--hai-space-4)',
  padding: '8px var(--hai-space-5)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-tertiary)',
  fontWeight: 600,
  borderBottom: '1px solid var(--hai-glass-border)',
};

const dataRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr auto 1fr 1fr 1fr auto',
  gap: 'var(--hai-space-4)',
  padding: '14px var(--hai-space-5)',
  alignItems: 'center',
  cursor: 'pointer',
  borderBottom: '1px solid var(--hai-glass-border)',
  fontSize: 13,
  transition: 'background 180ms cubic-bezier(.22,1,.36,1)',
};

const setupBadge: CSSProperties = {
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--hai-status-warn-100)',
  color: 'var(--hai-status-warn-600)',
  fontWeight: 600,
  letterSpacing: '0.04em',
};

export default function MachinesStage({ payload }: Props) {
  const [drillAsset, setDrillAsset] = useState<any | null>(null);
  const assets = payload?.per_asset ?? [];
  const linked = assets.filter((a) => a.sec_available).length;

  // Index shift_pace by asset
  const paceByAsset: Record<string, any> = {};
  for (const p of payload?.forecasts?.shift_pace ?? []) {
    if (p?.asset) paceByAsset[p.asset] = p;
  }

  if (assets.length === 0) {
    return (
      <div style={{
        padding: 'var(--hai-space-6)',
        border: '1px dashed var(--hai-glass-border)',
        borderRadius: 16,
        color: 'var(--hai-text-secondary)',
        fontSize: 14,
        textAlign: 'center',
      }}>
        No machines being watched yet. Hercules will pick them up automatically as it learns your equipment.
      </div>
    );
  }

  return (
    <section className="hai-num" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-4)' }}>
      <div style={{ fontSize: 13, color: 'var(--hai-text-secondary)' }}>
        Setup status: <strong style={{ color: 'var(--hai-text-primary)' }}>{linked} of {assets.length}</strong> machines linked
      </div>

      <div style={tableContainer}>
        <div style={headerRow}>
          <span>Asset</span>
          <span>Status</span>
          <span>Energy use</span>
          <span>Electrical efficiency</span>
          <span>Shift pace</span>
          <span>Setup</span>
        </div>
        {assets.map((a) => {
          const pace = paceByAsset[a.asset];
          const sec = a.sec;
          const pf = a.pf;
          const dot =
            !a.sec_available ? 'var(--hai-text-tertiary)' :
            sec?.accuracy_label === 'red' ? 'var(--hai-status-crit-600)' :
            sec?.accuracy_label === 'amber' ? 'var(--hai-status-warn-600)' :
            'var(--hai-status-ok-600)';
          const pfBelowTarget = pf && pf.pf_avg != null && pf.pf_target != null && pf.pf_avg < pf.pf_target;
          return (
            <button
              key={a.asset}
              onClick={() => setDrillAsset(a)}
              style={{
                ...dataRow,
                background: 'transparent',
                border: 'none',
                color: 'var(--hai-text-primary)',
                textAlign: 'left',
                font: 'inherit',
                width: '100%',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--hai-glass-2)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
            >
              <span style={{ fontWeight: 600 }}>{a.asset}</span>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dot, justifySelf: 'center' }} />
              <span style={{ color: 'var(--hai-text-secondary)' }}>
                {sec?.sec_today != null ? `${sec.sec_today.toFixed(1)} kWh/ton` : '—'}
              </span>
              <span style={{
                color: pfBelowTarget ? 'var(--hai-status-crit-600)' : 'var(--hai-text-secondary)',
                fontWeight: pfBelowTarget ? 600 : 400,
              }}>
                {pf?.pf_avg != null ? pf.pf_avg.toFixed(2) : '—'}
                {pfBelowTarget && pf.pf_target != null && (
                  <span style={{ color: 'var(--hai-text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
                    (target {pf.pf_target.toFixed(2)})
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--hai-text-secondary)' }}>
                {pace?.status === 'on_track' && 'On track'}
                {pace?.status === 'at_risk' && 'At risk'}
                {pace?.status === 'will_miss' && 'Will miss'}
                {pace?.status === 'learning' && 'Learning'}
                {pace?.status === 'no_target' && 'No target'}
                {!pace && '—'}
              </span>
              <span>
                {a.sec_available ? <span style={{ color: 'var(--hai-status-ok-600)' }}>✓</span> : <span style={setupBadge}>Needs setup</span>}
              </span>
            </button>
          );
        })}
      </div>

      {drillAsset && (
        <AssetDrillDrawer asset={drillAsset} pace={paceByAsset[drillAsset.asset]} onClose={() => setDrillAsset(null)} />
      )}
    </section>
  );
}

/* ── Drill drawer ─────────────────────────────────────────────────────── */

function AssetDrillDrawer({ asset, pace, onClose }: { asset: any; pace: any | null; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label={`${asset.asset} details`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '90vw',
          height: '100vh',
          background: 'var(--hai-surface-canvas)',
          borderLeft: '1px solid var(--hai-glass-border)',
          padding: 'var(--hai-space-6)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--hai-space-4)',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontFamily: 'Inter Tight, system-ui, sans-serif', fontSize: 24, fontWeight: 600 }}>
            {asset.asset}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: '1px solid var(--hai-glass-border)',
              color: 'var(--hai-text-secondary)',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Close
          </button>
        </header>

        {pace && <PacingRing pace={pace} size={200} />}
        <SecCard summary={asset.sec} />
        <PfPenaltyCard status={asset.pf} />
      </aside>
    </div>
  );
}
