/**
 * MachinesStrip — Plan 14 §3.7.
 *
 * Compact full-width row showing REAL assets (junk filtered by useRealAssets).
 * Columns: Asset · Status · Energy use · Electrical efficiency · Pace · ▸
 * Click row → AssetDrawer (commit 7) with the existing SecCard / PfPenaltyCard
 * / PacingRing rendered inside.
 *
 * Status dot color reads from the worst signal across SEC + PF + pace:
 *   crit if PF below target by > 0.10 OR pace.status === 'will_miss'
 *   warn if PF below target OR sec_kwh_per_t > baseline × 1.10
 *   ok   otherwise
 *   idle for assets in calibrating / no-data state
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from '../hooks/useRoiPayload';
import { useRealAssets, type RealAsset } from './hooks/useRealAssets';

interface Props {
  payload: RoiPayload | null;
  onAssetClick?: (asset: string) => void;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: '20px 24px',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  overflow: 'hidden',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 12,
};

const headerStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-tertiary)',
  textAlign: 'left',
  padding: '8px 12px 8px 0',
  borderBottom: '1px solid var(--hai-glass-border)',
  fontVariantNumeric: 'tabular-nums',
};

const cellStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--hai-text-primary)',
  padding: '12px 12px 12px 0',
  borderBottom: '1px solid var(--hai-glass-border)',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

const learningStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--hai-text-tertiary)',
  fontStyle: 'italic',
};

function dot(level: 'ok' | 'warn' | 'crit' | 'idle'): CSSProperties {
  const map = {
    ok:   { bg: 'var(--hai-status-ok-600)',   border: 'transparent' },
    warn: { bg: 'transparent',                 border: 'var(--hai-status-warn-600)' },
    crit: { bg: 'var(--hai-status-crit-600)', border: 'transparent' },
    idle: { bg: 'var(--hai-status-idle-600)', border: 'transparent', opacity: 0.55 },
  } as const;
  const c = map[level];
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: c.bg,
    border: `2px solid ${c.border}`,
    boxSizing: 'border-box',
    display: 'inline-block',
    opacity: 'opacity' in c ? c.opacity : 1,
  };
}

function statusFor(a: RealAsset, payload: RoiPayload | null): 'ok' | 'warn' | 'crit' | 'idle' {
  const pf = a?.pf;
  const sec = a?.sec;

  // PF danger gates
  if (pf && typeof pf.pf_avg === 'number' && typeof pf.pf_target === 'number') {
    const gap = pf.pf_target - pf.pf_avg;
    if (gap > 0.10) return 'crit';
  }

  // Pace will-miss → crit
  const paceList = (payload?.forecasts?.shift_pace ?? []) as any[];
  const pace = paceList.find((p) => p?.asset === a.asset);
  if (pace?.status === 'will_miss') return 'crit';

  // Warn: PF below target OR SEC up vs baseline
  if (pf && typeof pf.pf_avg === 'number' && typeof pf.pf_target === 'number' && pf.pf_avg < pf.pf_target) return 'warn';
  if (sec && typeof sec.sec_today === 'number' && typeof sec.sec_baseline === 'number' && sec.sec_baseline > 0) {
    if (sec.sec_today > sec.sec_baseline * 1.10) return 'warn';
  }

  // Idle if neither side has data
  if (!sec?.sec_today && !pf?.pf_avg) return 'idle';

  return 'ok';
}

function paceCell(a: RealAsset, payload: RoiPayload | null): React.ReactNode {
  const paceList = (payload?.forecasts?.shift_pace ?? []) as any[];
  const pace = paceList.find((p) => p?.asset === a.asset);
  if (!pace || pace.status === 'idle') return <span style={learningStyle}>—</span>;
  if (pace.status === 'warming_up') return <span style={learningStyle}>Warming up</span>;
  if (pace.status === 'will_miss') {
    const gap = pace.gap_kg ? `${Math.round(pace.gap_kg)} kg short` : 'Behind target';
    return <span style={{ color: 'var(--hai-status-warn-600)' }}>{gap}</span>;
  }
  if (pace.status === 'on_track') return <span style={{ color: 'var(--hai-status-ok-600)' }}>On track</span>;
  return <span>{pace.status}</span>;
}

export default function MachinesStrip({ payload, onAssetClick }: Props) {
  const assets = useRealAssets(payload);

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>
        Machines{assets.length > 0 ? ` (${assets.length})` : ''}
      </div>

      {assets.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: 'var(--hai-text-tertiary)',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          No instrumented machines yet. Run the AI scan from Settings to classify your tags.
        </div>
      )}

      {assets.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerStyle}>Asset</th>
              <th style={headerStyle}>Status</th>
              <th style={headerStyle}>Energy</th>
              <th style={headerStyle}>Electrical efficiency</th>
              <th style={headerStyle}>Pace</th>
              <th style={{ ...headerStyle, textAlign: 'right' }} aria-label="Drilldown" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => {
              const sec = a?.sec?.sec_today;
              const pf = a?.pf?.pf_avg;
              const pfTarget = a?.pf?.pf_target ?? 0.9;
              const pfBelow = pf != null && pf < pfTarget;
              const status = statusFor(a, payload);
              return (
                <tr
                  key={a.asset || i}
                  tabIndex={0}
                  role="button"
                  aria-label={`${a.asset} — open drilldown`}
                  onClick={() => a.asset && onAssetClick?.(a.asset)}
                  onKeyDown={(e) => {
                    if (a.asset && onAssetClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onAssetClick(a.asset);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{a.asset}</td>
                  <td style={cellStyle}>
                    <span style={dot(status)} aria-hidden="true" />
                  </td>
                  <td style={cellStyle}>
                    {sec != null ? (
                      `${sec.toFixed(1)} kWh/t`
                    ) : (
                      <span style={learningStyle}>Learning</span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    {pf != null ? (
                      <span style={pfBelow ? { color: 'var(--hai-status-warn-600)' } : undefined}>
                        {pf.toFixed(2)}
                        {pfBelow && <span style={{ marginLeft: 6, fontSize: 10 }}>⚠</span>}
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--hai-text-tertiary)' }}>
                          target {pfTarget.toFixed(2)}
                        </span>
                      </span>
                    ) : (
                      <span style={learningStyle}>—</span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    {paceCell(a, payload)}
                  </td>
                  <td
                    style={{
                      ...cellStyle,
                      textAlign: 'right',
                      color: 'var(--hai-text-tertiary)',
                      fontSize: 14,
                    }}
                    aria-hidden="true"
                  >
                    ›
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
