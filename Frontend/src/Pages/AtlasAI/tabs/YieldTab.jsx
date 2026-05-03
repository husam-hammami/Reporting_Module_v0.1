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
    <section className="tab-pane active yield-pane">
      {/* KPI strip — at-a-glance numbers, no scroll, no extra cards */}
      <div className="yield-kpi-strip">
        <YkCell label="Extraction" value="79.1" unit="%" tone="amber" hint="target 80.2%" />
        <YkCell label="Bran split" value="18.7" unit="%" tone="amber" hint="normal 18.0%" />
        <YkCell label="Loss" value="2.3" unit="%" tone="muted" hint="target 2.0%" />
        <YkCell label="Flow in" value="8.40" unit="t/h" tone="cyan" hint="Aus. Hard Red" />
        <YkCell label="Flour out" value="6.64" unit="t/h" tone="cyan" hint="to T7–T9" />
        <YkCell label="Energy" value="1.42" unit="OMR/t" tone="muted" hint="trending −0.02" />
        <YkCell label="Margin gap" value="+12" unit="OMR/h" tone="green" hint="recoverable" />
      </div>

      {/* Hero — 3D scene + current vs target + top recommendation */}
      <div className="yield-hero">
        <article className="card mill-card">
          <div className="mill-stage">
            <MillingCanvas />

            <div className="mill-annots">
              <div className="mann" data-anchor="intake">
                <div className="mann-key mono">01 · INTAKE</div>
                <div className="mann-val">Australian Hard Red <span className="mann-rate mono">8.40 t/h</span></div>
              </div>
              <div className="mann warn" data-anchor="sifter">
                <div className="mann-key mono">
                  <span className="mann-pulse"></span>
                  C2 PLANSIFTER
                </div>
                <div className="mann-val">
                  Bran split <b className="amber mono">18.7%</b>
                  <span className="mann-tag amber mono">+0.7pp</span>
                </div>
              </div>
              <div className="mann ok" data-anchor="flour">
                <div className="mann-key mono">FLOUR · 6.64 t/h</div>
              </div>
              <div className="mann" data-anchor="bran">
                <div className="mann-key mono">BRAN · 1.57 t/h</div>
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
            <div className="rc-num mono amber">79.1<span className="rcu">%</span></div>
            <div className="rc-label">Live extraction</div>
            <div className="rc-bar"><div className="rc-fill amber" style={{ '--w': '79.1%' }}></div></div>
          </article>

          <article className="card rail-card target">
            <div className="rc-eyebrow mono"><span className="rc-dot ok"></span>AI · TARGET</div>
            <div className="rc-num mono green">80.2<span className="rcu">%</span></div>
            <div className="rc-label">+1.1pp after sifter tune</div>
            <div className="rc-bar"><div className="rc-fill green" style={{ '--w': '80.2%' }}></div></div>
          </article>

          <article className="card rail-card opp action">
            <div className="rc-eyebrow mono"><span className="rc-dot warn"></span>TOP RECOMMENDATION</div>
            <div className="rec-headline">
              Tighten top sifter screen <span className="hl-cyan">−0.15&nbsp;mm</span>
            </div>
            <div className="rec-impact-row mono">
              <span className="ri-cell"><span className="ri-l">EXTRACTION</span><span className="ri-v green">+1.1pp</span></span>
              <span className="ri-cell"><span className="ri-l">MARGIN</span><span className="ri-v cyan">+12 OMR/h</span></span>
            </div>
            <button className="rc-cta">
              <span>Run sifter tune</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </article>
        </aside>
      </div>
    </section>
  );
}

function YkCell({ label, value, unit, tone, hint }) {
  return (
    <div className={`yk-cell yk-${tone}`}>
      <div className="yk-label mono">{label}</div>
      <div className="yk-value mono">{value}<span className="yk-unit">{unit}</span></div>
      {hint && <div className="yk-hint mono">{hint}</div>}
    </div>
  );
}
