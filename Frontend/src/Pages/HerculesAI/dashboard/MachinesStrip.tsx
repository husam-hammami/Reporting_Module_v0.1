/**
 * MachinesStrip — Plan 14 §3.7.
 *
 * Compact full-width table of REAL assets only (junk filtered by useRealAssets).
 * Columns: asset, status, energy use, electrical efficiency, pace, setup, drilldown.
 * Click row → AssetDrawer (commit 7).
 *
 * Commit 1 placeholder: real data, simple table.
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from '../hooks/useRoiPayload';
import { useRealAssets } from './hooks/useRealAssets';

interface Props {
  payload: RoiPayload | null;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: 'var(--hai-space-5)',
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  overflow: 'hidden',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 8,
};

const headerStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-tertiary)',
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid var(--hai-glass-border)',
};

const cellStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--hai-text-primary)',
  padding: '10px 12px',
  borderBottom: '1px solid var(--hai-glass-border)',
};

const dot = (level: 'ok' | 'warn' | 'crit' | 'idle'): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
  background:
    level === 'crit' ? 'var(--hai-status-crit-600)' :
    level === 'warn' ? 'var(--hai-status-warn-600)' :
    level === 'ok'   ? 'var(--hai-status-ok-600)'   :
                       'var(--hai-status-idle-600)',
});

export default function MachinesStrip({ payload }: Props) {
  const assets = useRealAssets(payload);

  return (
    <div style={tile} className="hai-num">
      <div style={labelStyle}>Machines ({assets.length})</div>

      {assets.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 24,
          color: 'var(--hai-text-tertiary)',
          fontSize: 12,
          lineHeight: 1.5,
        }}>
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
              <th style={{ ...headerStyle, textAlign: 'right' }}>—</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => {
              const sec = a?.sec?.sec_today;
              const pf = a?.pf?.pf_avg;
              const pfTarget = a?.pf?.pf_target ?? 0.9;
              const pfBelow = pf != null && pf < pfTarget;
              return (
                <tr key={a.asset || i}>
                  <td style={cellStyle}>{a.asset}</td>
                  <td style={cellStyle}>
                    <span style={dot('ok')} aria-hidden="true" />
                  </td>
                  <td style={cellStyle}>
                    {sec != null ? `${sec.toFixed(1)} kWh/t` : <span style={{ color: 'var(--hai-text-tertiary)' }}>Learning</span>}
                  </td>
                  <td style={{ ...cellStyle, color: pfBelow ? 'var(--hai-status-warn-600)' : 'var(--hai-text-primary)' }}>
                    {pf != null ? `${pf.toFixed(2)}${pfBelow ? '  ⚠' : ''}` : '—'}
                  </td>
                  <td style={cellStyle}>—</td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: 'var(--hai-text-tertiary)' }}>›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
