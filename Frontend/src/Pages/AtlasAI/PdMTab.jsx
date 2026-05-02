export default function PdMTab() {
  return (
    <section className="tab-pane" id="tab-pdm">
      <div className="row row-pdm-1">
        <article className="card health-card">
          <div className="card-eyebrow"><span className="ce-dot warn" />Asset health · plant-wide</div>
          <div className="health-row">
            <div className="health-text">
              <div className="health-headline">One area needs attention</div>
              <div className="health-sub">M31 grinding section shows rising imbalance.</div>
              <div className="health-meta">
                <span className="hm-chip"><span className="hm-dot ok" />2 healthy</span>
                <span className="hm-chip"><span className="hm-dot warn" />1 warning</span>
                <span className="hm-chip"><span className="hm-dot crit" />0 critical</span>
              </div>
            </div>
            <div className="health-ring">
              <svg viewBox="0 0 110 110">
                <defs>
                  <linearGradient id="aaiRingHealth" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="55%" stopColor="#10b981" />
                    <stop offset="78%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
                <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                <circle cx="55" cy="55" r="46" fill="none" stroke="url(#aaiRingHealth)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray="289" strokeDashoffset="110" transform="rotate(-90 55 55)"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(245,158,11,0.4))' }} />
                <text x="55" y="56" textAnchor="middle" className="ring-num-svg amber-num">62</text>
                <text x="55" y="68" textAnchor="middle" className="ring-unit-svg">/100</text>
              </svg>
            </div>
          </div>
          <div className="grad-track">
            <div className="grad-bar">
              <div className="grad-marker" style={{ left: '50%' }} />
            </div>
            <div className="grad-labels mono">
              <span>HEALTHY</span><span>ATTENTION</span><span>CRITICAL</span>
            </div>
          </div>
        </article>

        <article className="card next-card">
          <div className="card-eyebrow"><span className="ce-dot warn" />Next maintenance · M31</div>
          <div className="next-big mono">~17<span className="nbu">days</span></div>
          <div className="next-date">May 31 · Sat · 06:00 window</div>
          <div className="next-bar">
            <div className="grad-bar">
              <div className="grad-marker amber" style={{ left: '50%' }} />
            </div>
          </div>
          <div className="next-meta">
            <div className="nm-row"><span className="nm-l">Estimated downtime</span><span className="nm-v mono">2.5 h</span></div>
            <div className="nm-row"><span className="nm-l">Parts needed</span><span className="nm-v mono">Bearing 6312-2Z</span></div>
            <div className="nm-row"><span className="nm-l">Stock status</span><span className="nm-v ok mono">in stock · 3 units</span></div>
          </div>
        </article>

        <article className="card concern-card">
          <div className="concern-rail" />
          <div className="card-eyebrow amber"><span className="ce-dot warn" />Why Atlas is concerned</div>
          <div className="concern-text">
            Phase 2 current in M31 is <b className="hl-amber">12% higher</b> than L1/L3 and has been rising for{' '}
            <b className="hl-amber">14 days</b>. Pattern matches early bearing wear with{' '}
            <span className="mono">87%</span> historical accuracy.
          </div>
          <div className="concern-trace">
            <div className="ct-step"><span className="ct-num mono">01</span><span className="ct-text">Imbalance detected on L2 phase current</span></div>
            <div className="ct-step"><span className="ct-num mono">02</span><span className="ct-text">Cross-checked vs 4 prior bearing failures</span></div>
            <div className="ct-step"><span className="ct-num mono">03</span><span className="ct-text">Forecast: attention zone in 17 days</span></div>
          </div>
          <svg className="concern-trend" viewBox="0 0 100 30" preserveAspectRatio="none">
            <defs>
              <linearGradient id="aaiConcernGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgba(245,158,11,0)" />
                <stop offset="100%" stopColor="rgba(245,158,11,0.4)" />
              </linearGradient>
            </defs>
            <path d="M 0 26 L 10 24 L 20 23 L 30 21 L 40 18 L 50 15 L 60 12 L 70 8 L 80 5 L 90 3 L 100 2 L 100 30 L 0 30 Z" fill="url(#aaiConcernGrad)" />
            <path d="M 0 26 L 10 24 L 20 23 L 30 21 L 40 18 L 50 15 L 60 12 L 70 8 L 80 5 L 90 3 L 100 2"
              fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 3px rgba(245,158,11,0.7))' }} />
            <circle cx="100" cy="2" r="2" fill="#f59e0b" />
          </svg>
        </article>
      </div>

      <div className="row row-pdm-2">
        <article className="card asset-focus-card">
          <div className="af-header">
            <div className="af-title-block">
              <div className="card-eyebrow"><span className="ce-dot warn" />Asset focus</div>
              <h3 className="af-title">M31 <span className="muted">— Grinding Section</span></h3>
            </div>
            <span className="status-pill warn lg"><span className="dot" />ATTENTION</span>
          </div>
          <div className="af-body">
            <div className="af-stage">
              <div className="af-stage-corners" />
              <div className="motor-ph">
                <svg viewBox="0 0 200 120" fill="none">
                  <defs>
                    <linearGradient id="aaiMotorBody" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1a2540" />
                      <stop offset="100%" stopColor="#0a1426" />
                    </linearGradient>
                  </defs>
                  <rect x="50" y="35" width="100" height="50" rx="6" fill="url(#aaiMotorBody)" stroke="rgba(125,249,255,0.4)" strokeWidth="1" />
                  {[60, 70, 80, 90, 100, 110, 120, 130, 140].map((x) => (
                    <line key={x} x1={x} y1="35" x2={x} y2="85" stroke="rgba(125,249,255,0.12)" strokeWidth="1" />
                  ))}
                  <circle cx="100" cy="60" r="14" fill="#0a1426" stroke="rgba(125,249,255,0.6)" strokeWidth="1" />
                  <circle cx="100" cy="60" r="6" fill="#7df9ff" opacity="0.8" />
                  <rect x="30" y="55" width="20" height="10" fill="#1a2540" stroke="rgba(125,249,255,0.4)" strokeWidth="0.7" />
                  <rect x="150" y="55" width="20" height="10" fill="#1a2540" stroke="rgba(125,249,255,0.4)" strokeWidth="0.7" />
                  <rect x="55" y="85" width="90" height="6" fill="#0e1628" stroke="rgba(125,249,255,0.3)" strokeWidth="0.7" />
                </svg>
              </div>
              <div className="holo-label" style={{ top: '22%', left: '12%' }}>
                <div className="holo-line" />
                <div className="holo-tag">
                  <span className="ht-key mono">FRAME T°</span>
                  <span className="ht-val mono">68.4°C</span>
                </div>
              </div>
              <div className="holo-label warn" style={{ top: '50%', right: '10%' }}>
                <div className="holo-tag">
                  <span className="ht-key mono">VIBRATION</span>
                  <span className="ht-val mono">4.2 mm/s</span>
                </div>
                <div className="holo-line right" />
              </div>
              <div className="holo-label" style={{ bottom: '18%', left: '14%' }}>
                <div className="holo-line" />
                <div className="holo-tag">
                  <span className="ht-key mono">RPM</span>
                  <span className="ht-val mono">1486</span>
                </div>
              </div>
              <div className="motor-label">
                <span className="ml-id mono">M31</span>
                <span className="ml-name">Grinding Section</span>
              </div>
            </div>
            <div className="af-stats">
              <div className="af-stat">
                <div className="af-s-label">Active power</div>
                <div className="af-s-value mono">188<span className="afsu">kW</span></div>
                <div className="af-s-spark">
                  <svg viewBox="0 0 80 16" preserveAspectRatio="none">
                    <path d="M0,10 L8,8 L16,9 L24,7 L32,8 L40,6 L48,7 L56,5 L64,6 L72,4 L80,5" fill="none" stroke="#7df9ff" strokeWidth="1.2" />
                  </svg>
                </div>
              </div>
              <div className="af-stat warn">
                <div className="af-s-label">Power factor</div>
                <div className="af-s-value mono">0.95<span className="warn-tick">!</span></div>
                <div className="af-s-spark">
                  <svg viewBox="0 0 80 16" preserveAspectRatio="none">
                    <path d="M0,4 L8,5 L16,4 L24,6 L32,5 L40,7 L48,6 L56,8 L64,7 L72,9 L80,10" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
                  </svg>
                </div>
              </div>
              <div className="af-stat">
                <div className="af-s-label">Line voltage</div>
                <div className="af-s-value mono">395<span className="afsu">V</span></div>
                <div className="af-s-spark">
                  <svg viewBox="0 0 80 16" preserveAspectRatio="none">
                    <path d="M0,8 L8,8 L16,7 L24,9 L32,8 L40,7 L48,8 L56,7 L64,9 L72,8 L80,8" fill="none" stroke="#7df9ff" strokeWidth="1.2" />
                  </svg>
                </div>
              </div>
              <div className="af-stat warn">
                <div className="af-s-label">Imbalance Σ</div>
                <div className="af-s-value mono amber">12.0<span className="afsu">%</span></div>
                <div className="af-s-spark">
                  <svg viewBox="0 0 80 16" preserveAspectRatio="none">
                    <path d="M0,12 L8,11 L16,11 L24,9 L32,8 L40,7 L48,5 L56,4 L64,3 L72,2 L80,1" fill="none" stroke="#f59e0b" strokeWidth="1.2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="card phase-card">
          <div className="card-eyebrow"><span className="ce-dot warn" />3-phase current</div>
          <div className="phase-bars">
            <div className="phase-col">
              <div className="phase-bar" style={{ '--h': '58%' }} />
              <div className="phase-num mono">112<span className="pn-u">A</span></div>
              <div className="phase-label">L1</div>
            </div>
            <div className="phase-col warn">
              <div className="phase-bar amber" style={{ '--h': '78%' }}>
                <div className="phase-bar-pulse" />
              </div>
              <div className="phase-num mono amber">126<span className="pn-u">A</span></div>
              <div className="phase-label amber">L2 ▲</div>
            </div>
            <div className="phase-col">
              <div className="phase-bar" style={{ '--h': '58%' }} />
              <div className="phase-num mono">112<span className="pn-u">A</span></div>
              <div className="phase-label">L3</div>
            </div>
          </div>
          <div className="phase-foot">
            <span>L2 is <b className="hl-amber">+12%</b> over L1/L3 ·</span>
            <span className="muted"> growing 14d</span>
          </div>
          <div className="phase-thd mono">
            <span>THD</span><span className="muted">·</span><span>L1 1.8%</span><span className="muted">·</span><span className="amber">L2 3.2%</span><span className="muted">·</span><span>L3 1.9%</span>
          </div>
        </article>

        <div className="stack-col">
          <article className="card mini-card">
            <div className="mini-title">What is happening now</div>
            <div className="mini-row">
              <span className="mini-id mono">M31</span>
              <span className="mini-name">Grinding</span>
              <span className="mini-arrow">→</span>
              <span className="status-pill warn"><span className="dot" />Warning</span>
            </div>
            <div className="mini-row">
              <span className="mini-id mono">M30</span>
              <span className="mini-name">Intake &amp; Cleaning</span>
              <span className="mini-arrow">→</span>
              <span className="status-pill ok"><span className="dot" />Healthy</span>
            </div>
            <div className="mini-row">
              <span className="mini-id mono">C32</span>
              <span className="mini-name">Sifting &amp; Packing</span>
              <span className="mini-arrow">→</span>
              <span className="status-pill ok"><span className="dot" />Healthy</span>
            </div>
          </article>

          <article className="card mini-card">
            <div className="mini-title">When to act</div>
            <div className="timeline">
              <div className="timeline-zones mono"><span className="ok">HEALTHY</span><span className="amber">ATTENTION</span><span className="red">CRITICAL</span></div>
              <div className="timeline-bar">
                <div className="timeline-pin" style={{ left: '55%' }} />
                <div className="timeline-tooltip" style={{ left: '55%' }}>+17d · May 31</div>
              </div>
              <div className="timeline-dates mono"><span>MAY 15</span><span>JUN 15</span></div>
            </div>
          </article>
        </div>
      </div>

      <div className="row row-pdm-3">
        <article className="card anom-card">
          <div className="card-eyebrow"><span className="ce-dot warn" />Anomalies · last 30 days</div>
          <svg className="anom-chart" viewBox="0 0 320 80" preserveAspectRatio="none">
            {Array.from({ length: 30 }).map((_, i) => {
              const x = i * 10 + 6;
              const h = [3, 6, 4, 8, 12, 5, 7, 10, 4, 6, 14, 7, 5, 9, 18, 11, 6, 8, 13, 22, 9, 7, 14, 18, 11, 8, 12, 24, 16, 10][i];
              const color = i > 18 ? '#f97316' : '#fbbf24';
              return <rect key={i} x={x} y={80 - h * 2} width="6" height={h * 2} rx="1" fill={color} opacity="0.85" />;
            })}
          </svg>
          <div className="anom-x mono"><span>APR 15</span><span>APR 22</span><span>APR 29</span><span>MAY 6</span><span>MAY 13</span></div>
          <div className="anom-legend">
            <span className="al-item"><span className="al-dot amber" />PF drops <span className="al-c mono">8</span></span>
            <span className="al-item"><span className="al-dot orange" />Stuck totalizer <span className="al-c mono">5</span></span>
            <span className="al-tot mono">13 EVENTS</span>
          </div>
        </article>

        <article className="card events-card">
          <div className="card-eyebrow"><span className="ce-dot warn" />Recent anomaly events</div>
          <table className="events-table">
            <thead>
              <tr><th>Date</th><th>Time</th><th>Type</th><th>Asset</th><th>Duration</th></tr>
            </thead>
            <tbody>
              <tr><td className="mono">May 13</td><td className="mono">10:24</td><td><span className="ev-tag amber">PF drop</span></td><td className="mono">M31</td><td className="mono">3.2m</td></tr>
              <tr><td className="mono">May 13</td><td className="mono">08:15</td><td><span className="ev-tag amber">PF drop</span></td><td className="mono">M31</td><td className="mono">2.8m</td></tr>
              <tr><td className="mono">May 12</td><td className="mono">22:01</td><td><span className="ev-tag orange">Stuck totalizer</span></td><td className="mono">C32</td><td className="mono">14.5m</td></tr>
              <tr><td className="mono">May 12</td><td className="mono">14:30</td><td><span className="ev-tag amber">PF drop</span></td><td className="mono">M31</td><td className="mono">4.1m</td></tr>
              <tr><td className="mono">May 11</td><td className="mono">09:45</td><td><span className="ev-tag amber">PF drop</span></td><td className="mono">M30</td><td className="mono">1.9m</td></tr>
            </tbody>
          </table>
        </article>

        <article className="card flow-card">
          <div className="card-eyebrow"><span className="ce-dot info" />Process context · grinding focus</div>
          <div className="flow">
            <div className="flow-stage">Intake</div>
            <span className="flow-arrow">›</span>
            <div className="flow-stage">Cleaning</div>
            <span className="flow-arrow">›</span>
            <div className="flow-stage active"><span className="fs-pulse" />Grinding</div>
            <span className="flow-arrow">›</span>
            <div className="flow-stage">Sifting</div>
            <span className="flow-arrow">›</span>
            <div className="flow-stage">Blending</div>
            <span className="flow-arrow">›</span>
            <div className="flow-stage">Packing</div>
          </div>
          <div className="flow-meters">
            <div className="fm-cell"><div className="fm-id mono">M30</div><div className="fm-name">Intake</div><div className="fm-status ok mono">HEALTHY</div></div>
            <div className="fm-cell active"><div className="fm-id mono">M31</div><div className="fm-name">Grinding</div><div className="fm-status warn mono">ATTENTION</div></div>
            <div className="fm-cell"><div className="fm-id mono">C32</div><div className="fm-name">Sift/Pack</div><div className="fm-status ok mono">HEALTHY</div></div>
          </div>
        </article>
      </div>
    </section>
  );
}
