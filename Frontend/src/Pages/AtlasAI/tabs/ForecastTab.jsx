/**
 * Forecast tab — verdict bar + production/cost forecast + KPI strip.
 *
 * Replaces the standalone /atlas page (Hercules Atlas) by re-rendering the
 * same data inside the Atlas AI shell.
 *
 * Data is mocked via forecastMock.js. Phase 2 swaps to
 * GET /api/hercules-ai/mill-b-snapshot — same shape, no other changes.
 */

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import ProductionForecastChart from '../charts/ProductionForecastChart';
import EnergyCostForecastChart from '../charts/EnergyCostForecastChart';
import { forecastMock } from '../data/forecastMock';

function renderVerdict(text) {
  const out = [];
  let last = 0;
  let i = 0;
  // Recreate regex each call so `lastIndex` doesn't leak between invocations.
  const re = /\{(gold|good|hi|b):([^}]+)\}/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const [, kind, body] = match;
    out.push(
      <span key={`v-${i++}`} className={`fc-vh fc-vh-${kind}`}>
        {body}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderKpiMessage(text) {
  if (!text) return null;
  const out = [];
  let last = 0;
  let i = 0;
  const re = /\{b:([^}]+)\}/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(<b key={`b-${i++}`}>{match[1]}</b>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function formatKpi(value, precision) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  if (typeof precision === 'number') return Number(value).toFixed(precision);
  return Number(value).toLocaleString();
}

export default function ForecastTab() {
  const snapshot = forecastMock;
  const verdict = useMemo(() => snapshot.verdict, [snapshot]);

  const prod = snapshot.production;
  const cost = snapshot.energy_cost_per_ton;

  const showVsPlan = typeof prod.plan_tons === 'number' && prod.plan_tons > 0;
  const deltaPositive = prod.delta_vs_plan_tons >= 0;
  const deltaSign = deltaPositive ? '+' : '';

  const willImprove = cost.predicted_next_shift_omr_per_t < cost.current_omr_per_t;
  const hasSavings = typeof cost.savings_omr_8h === 'number';

  return (
    <section className="tab-pane active forecast">
      {/* Verdict bar — full width */}
      <div className="row row-fc-verdict">
        <article className="card fc-verdict-card">
          <div className="fc-verdict-icon">
            <Sparkles size={18} strokeWidth={2.4} />
          </div>
          <div className="fc-verdict-text">
            <div className="fc-verdict-eyebrow mono">ATLAS · VERDICT</div>
            <div className="fc-verdict-msg">{renderVerdict(verdict.text)}</div>
          </div>
        </article>
      </div>

      {/* Heroes — production + energy cost side by side */}
      <div className="row row-fc-heroes">
        <article className="card fc-hero-card">
          <div className="fc-hero-head">
            <div className="card-eyebrow"><span className="ce-dot ok"></span>Today's production · projected EOD</div>
            {showVsPlan && (
              <span className={`fc-badge fc-badge-${deltaPositive ? 'good' : 'warn'} mono`}>
                {`${deltaSign}${prod.delta_vs_plan_tons}`}<span className="fc-badge-u">t</span>
                <span className="fc-badge-sub">vs plan {prod.plan_tons}</span>
              </span>
            )}
          </div>
          <div className="fc-flow">
            <div className="fc-flow-block">
              <span className="fc-flow-lbl mono">NOW</span>
              <span className="fc-flow-num mono">{Number(prod.today_tons).toFixed(1)}</span>
              <span className="fc-flow-unit">tons</span>
            </div>
            <div className="fc-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 80 24" fill="none">
                <defs>
                  <linearGradient id="fcArrowProd" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7df9ff" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <path d="M 4 12 C 24 12, 56 12, 72 12" stroke="url(#fcArrowProd)" strokeWidth="1.4"
                  strokeDasharray="3 3" strokeLinecap="round" opacity="0.55" />
                <path d="M 4 12 C 24 12, 56 12, 72 12" stroke="url(#fcArrowProd)" strokeWidth="1.6"
                  strokeLinecap="round" strokeDasharray="6 60" strokeDashoffset="0">
                  <animate attributeName="stroke-dashoffset" from="0" to="-66" dur="2.4s" repeatCount="indefinite" />
                </path>
                <path d="M 68 8 L 74 12 L 68 16" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div className="fc-flow-block fc-flow-block-pred">
              <span className="fc-flow-lbl mono">EOD FORECAST</span>
              <span className="fc-flow-num mono">{Math.round(prod.predicted_eod_tons)}</span>
              <span className="fc-flow-unit">tons</span>
            </div>
          </div>
          <div className="fc-hero-foot mono">
            <span>PACE {Number(prod.pace_t_per_h).toFixed(2)} t/h</span>
            <span>·</span>
            <span>CONFIDENCE {prod.confidence_pct}%</span>
          </div>
        </article>

        <article className="card fc-hero-card">
          <div className="fc-hero-head">
            <div className="card-eyebrow"><span className="ce-dot info"></span>Energy cost per ton · next shift</div>
            {hasSavings && (
              <span className={`fc-badge fc-badge-${willImprove ? 'good' : 'warn'} mono`}>
                {`-${cost.savings_omr_8h}`}<span className="fc-badge-u">OMR</span>
                <span className="fc-badge-sub">savings (8h)</span>
              </span>
            )}
          </div>
          <div className={`fc-flow fc-flow-${willImprove ? 'down' : 'up'}`}>
            <div className="fc-flow-block">
              <span className="fc-flow-lbl mono">NOW</span>
              <span className="fc-flow-num mono">{Number(cost.current_omr_per_t).toFixed(2)}</span>
              <span className="fc-flow-unit">OMR / ton</span>
            </div>
            <div className="fc-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 80 24" fill="none">
                <defs>
                  <linearGradient id="fcArrowCost" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7df9ff" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <path d="M 4 12 C 24 12, 56 12, 72 12" stroke="url(#fcArrowCost)" strokeWidth="1.4"
                  strokeDasharray="3 3" strokeLinecap="round" opacity="0.55" />
                <path d="M 4 12 C 24 12, 56 12, 72 12" stroke="url(#fcArrowCost)" strokeWidth="1.6"
                  strokeLinecap="round" strokeDasharray="6 60" strokeDashoffset="0">
                  <animate attributeName="stroke-dashoffset" from="0" to="-66" dur="2.4s" repeatCount="indefinite" />
                </path>
                <path d="M 68 8 L 74 12 L 68 16" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div className="fc-flow-block fc-flow-block-pred">
              <span className="fc-flow-lbl mono">NEXT SHIFT</span>
              <span className="fc-flow-num mono">{Number(cost.predicted_next_shift_omr_per_t).toFixed(2)}</span>
              <span className="fc-flow-unit">OMR / ton</span>
            </div>
          </div>
          <div className="fc-hero-foot mono">
            <span>{willImprove ? 'TRENDING DOWN' : 'TRENDING UP'}</span>
            <span>·</span>
            <span>HORIZON 8H</span>
          </div>
        </article>
      </div>

      {/* Charts row */}
      <div className="row row-fc-charts">
        <article className="card fc-chart-card">
          <div className="fc-chart-head">
            <div>
              <div className="card-eyebrow"><span className="ce-dot info"></span>Cumulative tons today</div>
              <div className="fc-chart-sub mono">06:00 → 24:00 · forecast band ±confidence</div>
            </div>
            <div className="fc-legend">
              <span className="fc-legend-item"><span className="fc-legend-swatch fc-sw-actual"></span>Actual</span>
              <span className="fc-legend-item"><span className="fc-legend-swatch fc-sw-forecast"></span>Forecast</span>
              <span className="fc-legend-item"><span className="fc-legend-swatch fc-sw-band"></span>Band</span>
            </div>
          </div>
          <ProductionForecastChart series={snapshot.production_series} />
        </article>

        <article className="card fc-chart-card">
          <div className="fc-chart-head">
            <div>
              <div className="card-eyebrow"><span className="ce-dot info"></span>OMR per ton</div>
              <div className="fc-chart-sub mono">last 24h · next 12h forecast</div>
            </div>
            <div className="fc-legend">
              <span className="fc-legend-item"><span className="fc-legend-swatch fc-sw-actual"></span>Actual</span>
              <span className="fc-legend-item"><span className="fc-legend-swatch fc-sw-forecast"></span>Forecast</span>
              <span className="fc-legend-item"><span className="fc-legend-swatch fc-sw-band"></span>Band</span>
            </div>
          </div>
          <EnergyCostForecastChart series={snapshot.energy_cost_per_ton} />
        </article>
      </div>

      {/* KPI strip */}
      <div className="row row-fc-kpis">
        {snapshot.kpis.map((kpi) => (
          <article key={kpi.key} className="card fc-kpi-card">
            <div className="fc-kpi-head">
              <span className="fc-kpi-name">{kpi.label}</span>
              <span className={`status-pill ${kpi.status === 'good' ? 'ok' : 'warn'}`}>
                <span className="dot"></span>{kpi.statusLabel}
              </span>
            </div>
            <div className="fc-kpi-value">
              <span className="fc-kpi-num mono">{formatKpi(kpi.value, kpi.precision)}</span>
              <span className="fc-kpi-unit">{kpi.unit}</span>
            </div>
            <div className="fc-kpi-msg">{renderKpiMessage(kpi.message)}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
