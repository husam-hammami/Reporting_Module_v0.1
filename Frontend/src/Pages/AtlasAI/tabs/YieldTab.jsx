import { useEffect, useRef } from 'react';
import { initMillingScene } from '../ThreeScenes';

function MillingCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cleanup = initMillingScene(ref.current);
    return cleanup;
  }, []);
  return <canvas id="milling-canvas" ref={ref} />;
}

export default function YieldTab() {
  return (
    <section className="tab-pane active">
      <div className="yield-hero">
        <article className="card mill-card">
          <div className="mill-header">
            <div className="mill-eyebrow">
              <span className="me-dot"></span>
              <span className="me-text mono">LIVE PROCESS · MILL B · LINE 02</span>
              <span className="me-sep">·</span>
              <span className="me-meta mono">14:32:08 GST</span>
            </div>
            <h2 className="mill-title">
              Where the <em>opportunity</em> lives.
            </h2>
            <p className="mill-sub">
              A real-time cross-section of the milling line. Atlas has identified a sub-optimal
              bran split at the <b>C2 plansifter</b> — the point where flour and bran separate
              after the second break. A <b className="hl-cyan">0.15mm screen tightening</b>
              closes a <b className="hl-amber">+1.1pp</b> extraction gap worth <b className="hl-cyan">~12 OMR/h</b>.
            </p>
          </div>

          <div className="mill-stage">
            <MillingCanvas />

            <svg className="mill-leaders" viewBox="0 0 1000 600" preserveAspectRatio="none"></svg>

            <div className="mill-annots">
              <div className="mann" data-anchor="intake">
                <div className="mann-key mono">01 · INTAKE</div>
                <div className="mann-val">Australian Hard Red <span className="mann-rate mono">8.40 t/h</span></div>
              </div>
              <div className="mann" data-anchor="rollers">
                <div className="mann-key mono">02 · BREAK ROLLERS</div>
                <div className="mann-val">4-pair fluted · <span className="mann-rate mono">1450 rpm</span></div>
              </div>
              <div className="mann warn" data-anchor="sifter">
                <div className="mann-key mono">
                  <span className="mann-pulse"></span>
                  03 · C2 PLANSIFTER
                </div>
                <div className="mann-val">
                  Bran split <b className="amber mono">18.7%</b>
                  <span className="mann-tag amber mono">+0.7pp · NORMAL 18.0%</span>
                </div>
              </div>
              <div className="mann ok" data-anchor="flour">
                <div className="mann-key mono">04 · FLOUR</div>
                <div className="mann-val"><span className="mann-rate mono">6.64 t/h</span> <span className="mann-meta">to silos T7–T9</span></div>
              </div>
              <div className="mann" data-anchor="bran">
                <div className="mann-key mono">05 · BRAN</div>
                <div className="mann-val"><span className="mann-rate mono">1.57 t/h</span> <span className="mann-meta">to feed bins</span></div>
              </div>
            </div>

            <div className="mill-balance">
              <div className="mbal-cell">
                <div className="mbal-key mono">IN</div>
                <div className="mbal-val mono">8.40<span className="mbu">t/h</span></div>
              </div>
              <div className="mbal-eq mono">=</div>
              <div className="mbal-cell flour">
                <div className="mbal-key mono">FLOUR</div>
                <div className="mbal-val mono">6.64<span className="mbu">t/h</span></div>
              </div>
              <div className="mbal-plus mono">+</div>
              <div className="mbal-cell bran">
                <div className="mbal-key mono">BRAN</div>
                <div className="mbal-val mono">1.57<span className="mbu">t/h</span></div>
              </div>
              <div className="mbal-plus mono">+</div>
              <div className="mbal-cell loss">
                <div className="mbal-key mono">LOSS</div>
                <div className="mbal-val mono">0.19<span className="mbu">t/h</span></div>
              </div>
              <div className="mbal-spacer"></div>
              <div className="mbal-cell extract">
                <div className="mbal-key mono">EXTRACTION</div>
                <div className="mbal-val mono amber">79.1<span className="mbu">%</span></div>
                <div className="mbal-target mono">target 80.2%</div>
              </div>
            </div>

            <div className="mill-tick tl"></div>
            <div className="mill-tick tr"></div>
            <div className="mill-tick bl"></div>
            <div className="mill-tick br"></div>
          </div>
        </article>

        <aside className="yield-rail">
          <article className="card rail-card now">
            <div className="rc-eyebrow mono"><span className="rc-dot"></span>NOW</div>
            <div className="rc-num mono">79.1<span className="rcu">%</span></div>
            <div className="rc-label">Live extraction</div>
            <div className="rc-meta mono">8.40 t/h · 1.42 OMR/t energy</div>
            <div className="rc-bar"><div className="rc-fill amber" style={{ '--w': '79.1%' }}></div></div>
          </article>

          <article className="card rail-card target">
            <div className="rc-eyebrow mono"><span className="rc-dot ok"></span>AI · TARGET</div>
            <div className="rc-num mono">80.2<span className="rcu">%</span></div>
            <div className="rc-label">After sifter tune</div>
            <div className="rc-meta mono">+1.1pp · −0.7pp bran · −0.3pp loss</div>
            <div className="rc-bar"><div className="rc-fill green" style={{ '--w': '80.2%' }}></div></div>
          </article>

          <article className="card rail-card opp">
            <div className="rc-eyebrow mono"><span className="rc-dot warn"></span>OPPORTUNITY</div>
            <div className="rc-num mono cyan">12<span className="rcu">OMR/h</span></div>
            <div className="rc-label">Recoverable margin</div>
            <div className="rc-meta mono">~288 OMR/day · ~105K OMR/yr</div>
            <button className="rc-cta">
              <span>Run sifter tune</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </article>
        </aside>
      </div>

      <div className="yield-diag">
        <article className="card diag-card finding">
          <div className="diag-head">
            <div className="diag-num mono">01</div>
            <div>
              <div className="card-eyebrow amber"><span className="ce-dot warn"></span>FINDING</div>
              <h3 className="diag-title">Bran split is running 0.7pp above normal.</h3>
            </div>
          </div>
          <p className="diag-body">
            C2 plansifter bran-stream output is at <b className="amber mono">18.7%</b> versus
            its 5-day rolling normal of <b className="mono">18.0%</b>. Atlas modeled
            <span className="mono"> 312 historical lots</span> from this Australian Hard Red wheat source —
            this signature is consistent with a marginally loose top sifter screen.
          </p>
          <div className="diag-stats">
            <div><span className="ds-l mono">CONFIDENCE</span><span className="ds-v mono cyan">94%</span></div>
            <div><span className="ds-l mono">SAMPLE</span><span className="ds-v mono">312 lots</span></div>
            <div><span className="ds-l mono">SIGNATURE</span><span className="ds-v">Sifter wear</span></div>
          </div>
        </article>

        <article className="card diag-card action">
          <div className="diag-head">
            <div className="diag-num mono cyan">02</div>
            <div>
              <div className="card-eyebrow cyan"><span className="ce-dot info"></span>ATLAS · RECOMMENDED ACTION</div>
              <h3 className="diag-title">Tighten top sifter screen <span className="hl-cyan">−0.15mm</span>.</h3>
            </div>
          </div>
          <ol className="diag-steps">
            <li><span className="dst-num mono">A</span><span className="dst-text">Tighten top sifter screen by <b className="mono">0.15 mm</b> — single-turn adjustment.</span></li>
            <li><span className="dst-num mono">B</span><span className="dst-text">Hold for <b className="mono">2 min</b> and observe bran split telemetry.</span></li>
            <li><span className="dst-num mono">C</span><span className="dst-text">If drift exceeds <b className="mono">0.3%</b>, Atlas will re-tune automatically.</span></li>
          </ol>
          <div className="diag-impact">
            <div className="dim-cell"><div className="dim-l mono">EXTRACTION</div><div className="dim-v mono green">+1.1pp</div></div>
            <div className="dim-cell"><div className="dim-l mono">BRAN</div><div className="dim-v mono green">−0.7pp</div></div>
            <div className="dim-cell"><div className="dim-l mono">LOSS</div><div className="dim-v mono green">−0.3pp</div></div>
            <div className="dim-cell"><div className="dim-l mono">PROFIT</div><div className="dim-v mono cyan">+12 OMR/h</div></div>
          </div>
        </article>

        <article className="card diag-card forecast">
          <div className="diag-head">
            <div className="diag-num mono green">03</div>
            <div>
              <div className="card-eyebrow green"><span className="ce-dot ok"></span>FORECAST · AFTER ACTION</div>
              <h3 className="diag-title">Extraction back to AI-optimum band.</h3>
            </div>
          </div>
          <div className="fc-curve">
            <svg viewBox="0 0 320 110" preserveAspectRatio="none">
              <defs>
                <linearGradient id="fcAreaY" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(52,211,153,0.35)" />
                  <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                </linearGradient>
                <linearGradient id="fcAreaCY" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(125,249,255,0.18)" />
                  <stop offset="100%" stopColor="rgba(125,249,255,0)" />
                </linearGradient>
              </defs>
              <line x1="0" y1="34" x2="320" y2="34" stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
              <line x1="0" y1="68" x2="320" y2="68" stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
              <text x="4" y="14" fill="rgba(244,249,255,0.32)" fontSize="8" fontFamily="JetBrains Mono">80.2%</text>
              <text x="4" y="100" fill="rgba(244,249,255,0.32)" fontSize="8" fontFamily="JetBrains Mono">79.0%</text>
              <line x1="160" y1="0" x2="160" y2="110" stroke="rgba(125,249,255,0.25)" strokeDasharray="3 3" />
              <text x="164" y="12" fill="rgba(125,249,255,0.7)" fontSize="8" fontFamily="JetBrains Mono">NOW</text>
              <path d="M 0 64 C 28 70, 56 60, 80 66 S 130 78, 160 70" fill="none" stroke="#7df9ff" strokeWidth="1.6" opacity="0.85" />
              <path d="M 0 64 C 28 70, 56 60, 80 66 S 130 78, 160 70 L 160 110 L 0 110 Z" fill="url(#fcAreaCY)" />
              <path d="M 160 70 C 184 56, 208 42, 232 38 S 296 34, 320 36" fill="none" stroke="#34d399" strokeWidth="1.8" strokeDasharray="4 3" />
              <path d="M 160 70 C 184 56, 208 42, 232 38 S 296 34, 320 36 L 320 110 L 160 110 Z" fill="url(#fcAreaY)" />
              <circle cx="320" cy="36" r="3" fill="#34d399" />
              <circle cx="320" cy="36" r="6" fill="none" stroke="#34d399" strokeOpacity="0.4" />
            </svg>
          </div>
          <div className="fc-rows">
            <div className="fc-row"><span className="fc-l">Extraction</span><span className="fc-v mono green">80.2%</span><span className="fc-d mono up">+1.1</span></div>
            <div className="fc-row"><span className="fc-l">Bran split</span><span className="fc-v mono">18.0%</span><span className="fc-d mono down">−0.7</span></div>
            <div className="fc-row"><span className="fc-l">Loss</span><span className="fc-v mono">2.0%</span><span className="fc-d mono down">−0.3</span></div>
            <div className="fc-row"><span className="fc-l">Margin</span><span className="fc-v mono cyan">+12 OMR/h</span><span className="fc-d mono up">recovered</span></div>
          </div>
        </article>
      </div>

      <div className="row row-yield-4">
        <article className="card perf-card">
          <div className="card-eyebrow"><span className="ce-dot info"></span>Yield performance · benchmark</div>
          <div className="perf-bars">
            <div className="perf-col">
              <div className="perf-num mono cyan">79.1<span className="pnu">%</span></div>
              <div className="perf-bar cyan" style={{ '--h': '60%' }}></div>
              <div className="perf-label">Current</div>
            </div>
            <div className="perf-col">
              <div className="perf-num mono green">79.8<span className="pnu">%</span></div>
              <div className="perf-bar green" style={{ '--h': '78%' }}></div>
              <div className="perf-label">Historical best</div>
            </div>
            <div className="perf-col">
              <div className="perf-num mono green-bright">80.2<span className="pnu">%</span></div>
              <div className="perf-bar green-bright" style={{ '--h': '92%' }}></div>
              <div className="perf-label">AI potential</div>
            </div>
          </div>
          <div className="perf-foot">
            Closing the gap from <span className="mono">79.1%</span> to <b className="mono">80.2%</b> lifts profit by <b className="ok">~12 OMR/h</b>.
          </div>
        </article>

        <div className="right-col">
          <article className="card opp-card">
            <div className="opp-glow"></div>
            <div className="opp-num">
              <div className="opp-big mono">80.2<span className="oppu">%</span></div>
              <div className="opp-cap mono">OPPORTUNITY · TARGET</div>
            </div>
            <div className="opp-text">
              <div className="opp-title">Closing the extraction gap</div>
              <div className="opp-savings">
                <span className="os-amount mono">~12 OMR<span className="osu">/h</span></span>
                <span className="os-label">potential savings</span>
              </div>
              <div className="opp-cumulative mono">~288 OMR/day · ~105K OMR/year</div>
            </div>
          </article>

          <div className="recs-block">
            <div className="card-eyebrow"><span className="ce-dot info"></span>What Atlas recommends · prioritized</div>
            <div className="rec-list">
              <div className="rec-card">
                <div className="rec-head">
                  <span className="rec-num mono">01</span>
                  <span className="rec-impact high">HIGH IMPACT</span>
                </div>
                <div className="rec-title">Adjust sifter screens</div>
                <div className="rec-desc">Tighten top screen 0.15mm · normalize bran split.</div>
              </div>
              <div className="rec-card">
                <div className="rec-head">
                  <span className="rec-num mono">02</span>
                  <span className="rec-impact med">MEDIUM</span>
                </div>
                <div className="rec-title">Watch bran deviation</div>
                <div className="rec-desc">Observe through shift to confirm adjustment held.</div>
              </div>
              <div className="rec-card">
                <div className="rec-head">
                  <span className="rec-num mono">03</span>
                  <span className="rec-impact med">MEDIUM</span>
                </div>
                <div className="rec-title">Hold energy efficient</div>
                <div className="rec-desc">Keep grinding load steady · prevent kWh/ton drift.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
