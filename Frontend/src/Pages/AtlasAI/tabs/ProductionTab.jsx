import ForecastChart from '../charts/ForecastChart';
import EnergyChart from '../charts/EnergyChart';

export default function ProductionTab() {
  return (
    <section className="tab-pane active production">
      <div className="row row-prod-hero">
        <article className="card hero-card">
          <div className="hero-bg-orb"></div>
          <div className="card-eyebrow">
            <span className="ce-dot ok"></span>
            <span>Today's production · 24h horizon</span>
          </div>
          <div className="hero-status">
            <span className="status-pill ok lg"><span className="dot"></span>ON TRACK</span>
            <span className="hero-conf mono">94% conf.</span>
          </div>

          <h2 className="hero-title">
            You're trending to <span className="hl">108.0 t</span> by midnight.
          </h2>
          <p className="hero-sub">
            Hercules AI projects target hit at <span className="mono">22:18</span> · 1h 42m of buffer remaining.
          </p>

          <div className="hero-rings">
            <div className="hero-ring-block">
              <div className="hero-ring">
                <svg viewBox="0 0 110 110">
                  <defs>
                    <linearGradient id="ringGreen" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                  <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                  <circle cx="55" cy="55" r="46" fill="none" stroke="url(#ringGreen)" strokeWidth="6"
                    strokeLinecap="round" strokeDasharray="289" strokeDashoffset="106" transform="rotate(-90 55 55)"
                    style={{ filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.55))' }} />
                  <text x="55" y="56" textAnchor="middle" className="ring-num-svg">68.4</text>
                  <text x="55" y="68" textAnchor="middle" className="ring-unit-svg">t · NOW</text>
                </svg>
              </div>
              <div className="hero-ring-cap">
                <span className="hrc-label">Produced</span>
                <span className="hrc-delta up mono">+2.1% vs avg</span>
              </div>
            </div>

            <div className="hero-arrow-flow">
              <svg viewBox="0 0 80 60" fill="none">
                <defs>
                  <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#7df9ff" />
                  </linearGradient>
                </defs>
                <path d="M 6 30 C 30 30, 50 30, 74 30" stroke="url(#arrowGrad)" strokeWidth="1.4"
                  strokeDasharray="3 3" strokeLinecap="round" opacity="0.5" />
                <path d="M 6 30 C 30 30, 50 30, 74 30" stroke="url(#arrowGrad)" strokeWidth="1.6"
                  strokeLinecap="round" strokeDasharray="6 60" strokeDashoffset="0">
                  <animate attributeName="stroke-dashoffset" from="0" to="-66" dur="2.4s" repeatCount="indefinite" />
                </path>
                <path d="M 70 26 L 76 30 L 70 34" stroke="#7df9ff" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                <text x="40" y="22" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="7" fill="rgba(125,249,255,0.7)">+39.6t</text>
              </svg>
            </div>

            <div className="hero-ring-block">
              <div className="hero-ring">
                <svg viewBox="0 0 110 110">
                  <defs>
                    <linearGradient id="ringCyan" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#7df9ff" />
                      <stop offset="100%" stopColor="#0ea5e9" />
                    </linearGradient>
                  </defs>
                  <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                  <circle cx="55" cy="55" r="46" fill="none" stroke="url(#ringCyan)" strokeWidth="6"
                    strokeLinecap="round" strokeDasharray="289" strokeDashoffset="0" transform="rotate(-90 55 55)"
                    style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.55))' }} />
                  <text x="55" y="56" textAnchor="middle" className="ring-num-svg">108</text>
                  <text x="55" y="68" textAnchor="middle" className="ring-unit-svg">t · EOD</text>
                </svg>
              </div>
              <div className="hero-ring-cap">
                <span className="hrc-label">Forecast</span>
                <span className="hrc-delta neutral mono">target = 108</span>
              </div>
            </div>
          </div>

          <div className="hero-foot mono">
            <span>SHIFT 1 · 06:00–14:00</span>
            <span>·</span>
            <span>OPERATOR S. AL-BUSAIDI</span>
            <span>·</span>
            <span>WHEAT LOT #2025-A14</span>
          </div>
        </article>

        <article className="card forecast-card">
          <div className="card-eyebrow">
            <span className="ce-dot info"></span>
            <span>AI Forecast · cumulative tonnage</span>
          </div>
          <div className="forecast-head">
            <div className="forecast-title">Path to <span className="hl-cyan">108 t</span></div>
            <div className="forecast-tag mono">94% CONF · ±2.1t</div>
          </div>
          <ForecastChart />
          <div className="forecast-legend">
            <span className="fl-item"><span className="fl-line solid"></span>Actual</span>
            <span className="fl-item"><span className="fl-line dashed"></span>AI projection</span>
            <span className="fl-item"><span className="fl-line band"></span>Confidence band</span>
            <span className="fl-spacer"></span>
            <span className="fl-stat mono"><span className="muted">peak</span> 5.4 t/h · <span className="muted">avg</span> 4.5 t/h</span>
          </div>
        </article>

        <article className="card target-card">
          <div className="card-eyebrow">
            <span className="ce-dot ok"></span>
            <span>Daily Target</span>
          </div>
          <div className="target-big">
            <span className="tb-num">108</span>
            <span className="tb-unit">tons</span>
          </div>
          <div className="target-progress">
            <div className="tp-arc">
              <svg viewBox="0 0 120 70">
                <defs>
                  <linearGradient id="tpGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#7df9ff" />
                  </linearGradient>
                </defs>
                <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
                <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="url(#tpGrad)" strokeWidth="8"
                  strokeLinecap="round" strokeDasharray="157" strokeDashoffset="58"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.5))' }} />
              </svg>
              <div className="tp-arc-num"><span className="mono">63<span className="pct">%</span></span></div>
            </div>
            <div className="tp-rows">
              <div className="tp-row"><span className="l">Produced</span><span className="v ok mono">68.4 t</span></div>
              <div className="tp-row"><span className="l">Remaining</span><span className="v mono">39.6 t</span></div>
              <div className="tp-row"><span className="l">Pace</span><span className="v ok mono">+ on track</span></div>
              <div className="tp-row"><span className="l">ETA</span><span className="v mono">22:18</span></div>
            </div>
          </div>
        </article>
      </div>

      <div className="row row-prod-strip">
        <MetricCard color="cyan" trend="up" trendVal="▲ 2.1%" label="Flour output" value="6.64" unit="t/h"
          spark="M0,18 L10,16 L20,17 L30,14 L40,15 L50,12 L60,13 L70,10 L80,11 L90,8 L100,6"
          sparkColor="#7df9ff"
          icon={<path d="M12 2c2 4 4 6 4 10a4 4 0 0 1-8 0c0-4 2-6 4-10z" />} />
        <MetricCard color="amber" trend="up" trendVal="▲ 0.4%" label="Bran output" value="1.57" unit="t/h"
          spark="M0,14 L10,15 L20,12 L30,14 L40,11 L50,13 L60,10 L70,12 L80,9 L90,11 L100,8"
          sparkColor="#fbbf24"
          icon={<><circle cx="12" cy="12" r="3" /><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>} />
        <MetricCard color="cyan" trend="up" trendVal="▲ 1.8%" label="Wheat input" value="8.40" unit="t/h"
          spark="M0,16 L10,14 L20,15 L30,12 L40,13 L50,10 L60,11 L70,9 L80,8 L90,7 L100,6"
          sparkColor="#7df9ff"
          icon={<path d="M3 12h4l3-9 4 18 3-9h4" />} />
        <MetricCard color="green" trend="up" trendVal="▲ 0.3%" label="Extraction" value="79.1" unit="%"
          spark="M0,14 L10,12 L20,13 L30,11 L40,12 L50,10 L60,9 L70,11 L80,8 L90,7 L100,7"
          sparkColor="#34d399"
          icon={<><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></>} />
        <MetricCard color="amber" trend="down" trendVal="▼ 0.2%" label="Bran split" value="18.7" unit="%"
          spark="M0,8 L10,9 L20,10 L30,12 L40,11 L50,13 L60,12 L70,14 L80,13 L90,15 L100,14"
          sparkColor="#fbbf24"
          icon={<path d="M12 3v18M3 12h18" />} />
        <MetricCard color="red" trend="down" trendVal="▼ 0.1%" label="Loss" value="2.3" unit="%"
          spark="M0,12 L10,13 L20,12 L30,14 L40,13 L50,12 L60,11 L70,13 L80,12 L90,14 L100,13"
          sparkColor="#f87171"
          icon={<path d="M12 2L2 22h20L12 2z" />} />
      </div>

      <div className="row row-prod-bottom">
        <article className="card breakdown-card">
          <div className="card-eyebrow"><span className="ce-dot info"></span>Production breakdown · where your wheat goes</div>
          <div className="breakdown-body">
            <div className="bd-donut">
              <svg viewBox="0 0 60 60">
                <defs>
                  <linearGradient id="bdCyan" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7df9ff" /><stop offset="100%" stopColor="#0ea5e9" />
                  </linearGradient>
                  <linearGradient id="bdAmber" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="9" />
                <circle cx="30" cy="30" r="22" fill="none" stroke="url(#bdCyan)" strokeWidth="9"
                  strokeDasharray="109.4 138.2" strokeDashoffset="34.6" transform="rotate(-90 30 30)"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(34,211,238,0.5))' }} />
                <circle cx="30" cy="30" r="22" fill="none" stroke="url(#bdAmber)" strokeWidth="9"
                  strokeDasharray="25.9 138.2" strokeDashoffset="-74.8" transform="rotate(-90 30 30)"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(245,158,11,0.4))' }} />
                <circle cx="30" cy="30" r="22" fill="none" stroke="#f87171" strokeWidth="9"
                  strokeDasharray="3.2 138.2" strokeDashoffset="-100.7" transform="rotate(-90 30 30)" />
                <text x="30" y="29" textAnchor="middle" fontFamily="Geist" fontSize="9" fontWeight="800" fill="#fff">79.1%</text>
                <text x="30" y="36" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="3.5" fill="rgba(255,255,255,0.5)">FLOUR</text>
              </svg>
            </div>
            <div className="bd-legend">
              <div className="bd-row">
                <span className="bd-name"><span className="bd-dot cyan"></span>Flour</span>
                <span className="bd-val mono">79.1%</span>
                <span className="bd-tons mono muted">6.64 t/h</span>
              </div>
              <div className="bd-row">
                <span className="bd-name"><span className="bd-dot amber"></span>Bran</span>
                <span className="bd-val mono">18.7%</span>
                <span className="bd-tons mono muted">1.57 t/h</span>
              </div>
              <div className="bd-row">
                <span className="bd-name"><span className="bd-dot red"></span>Loss</span>
                <span className="bd-val mono">2.3%</span>
                <span className="bd-tons mono muted">0.19 t/h</span>
              </div>
            </div>
          </div>
          <div className="bd-foot">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v6m0 8v6m-9-9h6m8 0h6" />
            </svg>
            <span><b>Bran split is 0.7% above normal.</b> Hercules AI suggests sifter adjustment to recover ~12 OMR/h.</span>
          </div>
        </article>

        <article className="card energy-card">
          <div className="card-eyebrow"><span className="ce-dot info"></span>Energy cost · live vs AI forecast</div>
          <div className="energy-head">
            <div className="energy-now">
              <span className="en-num mono">1.42</span>
              <span className="en-unit">OMR/t</span>
              <span className="en-trend down mono">▼ 7.7% by midnight</span>
            </div>
          </div>
          <EnergyChart />
          <div className="energy-stats">
            <div className="es-cell">
              <div className="es-label">Tariff</div>
              <div className="es-value mono">0.025<span className="esu">OMR/kWh</span></div>
            </div>
            <div className="es-cell">
              <div className="es-label">kWh/ton</div>
              <div className="es-value mono">56.8</div>
            </div>
            <div className="es-cell">
              <div className="es-label">Total today</div>
              <div className="es-value mono">4,141<span className="esu">kWh</span></div>
            </div>
            <div className="es-cell">
              <div className="es-label">CO₂ saved</div>
              <div className="es-value mono ok">−14kg</div>
            </div>
          </div>
        </article>

      </div>
    </section>
  );
}

function MetricCard({ color, trend, trendVal, label, value, unit, spark, sparkColor, icon }) {
  return (
    <div className="metric-card">
      <div className="mc-head">
        <span className={`mc-icon ${color}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {icon}
          </svg>
        </span>
        <span className={`mc-trend ${trend} mono`}>{trendVal}</span>
      </div>
      <div className="mc-label">{label}</div>
      <div className="mc-value mono">{value}<span className="u">{unit}</span></div>
      <svg className="mc-spark" viewBox="0 0 100 24" preserveAspectRatio="none">
        <path d={spark} fill="none" stroke={sparkColor} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

