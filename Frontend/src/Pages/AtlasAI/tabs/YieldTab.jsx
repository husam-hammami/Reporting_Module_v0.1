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

            {/* Equipment-stage labels — sit ABOVE each piece of kit in the scene */}
            <div className="mill-stagelabels">
              <div className="ms-label" data-pos="rollers">
                <div className="msl-eyebrow mono">02 · GRINDING ROLLERS</div>
                <div className="msl-line">4-pair break + reduction</div>
              </div>
              <div className="ms-label warn" data-pos="sifter">
                <div className="msl-eyebrow mono">
                  <span className="msl-pulse"></span>
                  03 · SIFTER / SEPARATION
                </div>
                <div className="msl-line">Plansifter · 8 deck</div>
              </div>
            </div>

            {/* Process-flow data callouts — wheat in / flour out / bran out */}
            <div className="mill-flowlabels">
              <div className="mfl-tag intake" data-pos="intake">
                <div className="mfl-key mono">WHEAT IN</div>
                <div className="mfl-val mono"><b>8.40</b><span className="mfu">t/h</span></div>
                <div className="mfl-meta">Aus. Hard Red</div>
              </div>
              <div className="mfl-tag flour" data-pos="flour">
                <div className="mfl-key mono">FLOUR OUT</div>
                <div className="mfl-val mono cyan"><b>6.64</b><span className="mfu">t/h</span> <span className="mfl-pct">79.1%</span></div>
                <div className="mfl-meta">to T7–T9</div>
              </div>
              <div className="mfl-tag bran" data-pos="bran">
                <div className="mfl-key mono">BRAN OUT</div>
                <div className="mfl-val mono amber"><b>1.57</b><span className="mfu">t/h</span> <span className="mfl-pct">18.7%</span></div>
                <div className="mfl-meta">to feed bins</div>
              </div>
            </div>

            {/* Diagnostic warning callout — pinned to the sifter */}
            <div className="mill-warning-callout">
              <div className="mwc-row">
                <span className="mwc-icon">⚠</span>
                <div className="mwc-text">
                  <div className="mwc-headline">
                    Bran split <b>0.7%</b> high
                  </div>
                  <div className="mwc-sub">SIFTER SCREEN WEAR OR LOOSE FEED-RATE</div>
                </div>
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
