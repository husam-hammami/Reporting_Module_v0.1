/**
 * KPI strip — Pace · Yield · Energy · Maintenance.
 *
 * Inline-styled to match the v4 mockup's dense card design (status pill,
 * supplemental message). Uses tokens for colors so it flips on theme change.
 */

const BOLD_RE = /\{b:([^}]+)\}/g;

function renderMessage(text) {
  if (!text) return null;
  const out = [];
  let last = 0;
  let match;
  let i = 0;
  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(<b key={`b-${i++}`}>{match[1]}</b>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function formatValue(value, precision) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  if (typeof precision === 'number') return Number(value).toFixed(precision);
  return Number(value).toLocaleString();
}

export default function AtlasKpiStrip({ kpis }) {
  return (
    <div className="atlas-kpis" role="list">
      {kpis.map((kpi) => (
        <div key={kpi.key} className="atlas-kpi-card" role="listitem">
          <div className="atlas-kpi-head">
            <div className="atlas-kpi-name">{kpi.label}</div>
            <div className={`atlas-kpi-status atlas-kpi-status--${kpi.status}`}>
              {kpi.statusLabel}
            </div>
          </div>
          <div className="atlas-kpi-value">
            <span className="atlas-kpi-num atlas-num">
              {formatValue(kpi.value, kpi.precision)}
            </span>
            <span className="atlas-kpi-unit">{kpi.unit}</span>
          </div>
          <div className="atlas-kpi-msg">{renderMessage(kpi.message)}</div>
        </div>
      ))}
    </div>
  );
}
