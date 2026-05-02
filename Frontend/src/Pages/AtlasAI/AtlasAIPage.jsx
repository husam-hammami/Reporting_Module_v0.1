import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './AtlasAI.css';

import ProductionTab from './tabs/ProductionTab';
import PdMTab from './tabs/PdMTab';
import YieldTab from './tabs/YieldTab';

const TABS = [
  { key: 'production', label: 'Production', context: 'Production · Mill B', icon: <path d="M3 12h4l3-9 4 18 3-9h4" /> },
  { key: 'pdm', label: 'Predictive Maintenance', context: 'Predictive Maintenance · M31', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></> },
  { key: 'yield', label: 'Yield Optimization', context: 'Yield Optimization · Mill B', icon: <><path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" /><path d="M4 7l8 5 8-5M12 22V12" /></> },
];

export default function AtlasAIPage() {
  const [active, setActive] = useState('production');
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [askValue, setAskValue] = useState('');
  const [askPlaceholder, setAskPlaceholder] = useState("Ask Atlas about today's production, forecast, or how to improve…");

  const tabsRef = useRef(null);
  const indicatorRef = useRef(null);
  const askInputRef = useRef(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  // Move indicator under the active tab
  useLayoutEffect(() => {
    function move() {
      const tabs = tabsRef.current;
      const indicator = indicatorRef.current;
      if (!tabs || !indicator) return;
      const activeBtn = tabs.querySelector('.top-tab.active');
      if (!activeBtn) return;
      const tabsRect = tabs.getBoundingClientRect();
      const r = activeBtn.getBoundingClientRect();
      indicator.style.left = (r.left - tabsRect.left) + 'px';
      indicator.style.width = r.width + 'px';
    }
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [active]);

  // Global '/' shortcut to focus Ask Atlas input
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        askInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const askContext = TABS.find((t) => t.key === active)?.context ?? '';

  function handleAskSubmit(e) {
    if (e.key !== 'Enter') return;
    if (!askValue.trim()) return;
    setAskPlaceholder('Atlas is thinking…');
    setAskValue('');
    setTimeout(() => {
      setAskPlaceholder("Ask Atlas about today's production, forecast, or how to improve…");
    }, 1800);
  }

  function handleChip(text) {
    setAskValue(text);
    askInputRef.current?.focus();
  }

  return (
    <div className="atlas-ai-root">
      <div className="ambient">
        <div className="ambient-grid"></div>
        <div className="ambient-noise"></div>
        <div className="ambient-aurora a1"></div>
        <div className="ambient-aurora a2"></div>
        <div className="ambient-scanline"></div>
      </div>

      <main className="ai-main">
        <header className="mill-bar">
          <div className="mb-left">
            <svg className="mill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M5 21V9l7-5 7 5v12" />
              <path d="M9 21v-6h6v6" />
            </svg>
            <span className="mill-label">Mill B — Salalah Flour Mills, Oman</span>
            <span className="live-pill"><span className="dot"></span>LIVE</span>
          </div>

          <nav className="top-tabs" ref={tabsRef}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`top-tab${active === t.key ? ' active' : ''}`}
                onClick={() => setActive(t.key)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {t.icon}
                </svg>
                {t.label}
              </button>
            ))}
            <span className="top-tab-indicator" ref={indicatorRef}></span>
          </nav>

          <div className="mb-right">
            <button type="button" className="icon-btn" aria-label="Notifications">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M11 21h2" />
              </svg>
              <span className="badge-dot">2</span>
            </button>
            <button type="button" className="icon-btn" aria-label="Help">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
              </svg>
            </button>
          </div>
        </header>

        <div className="neural-strip">
          <div className="ns-pillar">
            <div className="ns-eyebrow">ATLAS · NOW</div>
            <div className="ns-headline">
              <span className="ns-time mono">{clock}</span>
              <span className="ns-pulse-dot"></span>
              <span className="ns-status">
                Reasoning across <b>14 streams</b> · monitoring <b>42 assets</b>
              </span>
            </div>
          </div>
          <div className="ns-divider"></div>
          <div className="ns-feed">
            <div className="ns-feed-track">
              <FeedItem type="ok" text="M30 intake stable · σ 0.4%" />
              <FeedItem type="warn" text="M31 phase L2 +12% · investigating" />
              <FeedItem type="ok" text="Forecast 108t · 94% confidence" />
              <FeedItem type="info" text="Sifter optimization queued" />
              <FeedItem type="ok" text="Energy 1.42 OMR/t · trending down" />
              <FeedItem type="ok" text="Vitamin feeder dosing on schedule" />
              <FeedItem type="ok" text="M30 intake stable · σ 0.4%" />
              <FeedItem type="warn" text="M31 phase L2 +12% · investigating" />
              <FeedItem type="ok" text="Forecast 108t · 94% confidence" />
              <FeedItem type="info" text="Sifter optimization queued" />
              <FeedItem type="ok" text="Energy 1.42 OMR/t · trending down" />
            </div>
          </div>
          <div className="ns-divider"></div>
          <div className="ns-action">
            <button type="button" className="ns-cta" onClick={() => askInputRef.current?.focus()}>
              <span className="ns-cta-text">Ask Atlas</span>
              <span className="ns-cta-key mono">/</span>
            </button>
          </div>
        </div>

        <div className="content">
          {active === 'production' && <ProductionTab />}
          {active === 'pdm' && <PdMTab />}
          {active === 'yield' && <YieldTab />}
        </div>

        <div className="ask-atlas">
          <div className="aa-orb">
            <div className="aa-orb-inner">
              <div className="aa-orb-core"></div>
            </div>
          </div>
          <div className="aa-content">
            <div className="aa-eyebrow mono">
              <span className="aa-dot"></span>ATLAS · ASK
              <span className="aa-sep">·</span>
              <span className="aa-context">{askContext}</span>
            </div>
            <div className="aa-input-wrap">
              <input
                ref={askInputRef}
                type="text"
                className="aa-input"
                placeholder={askPlaceholder}
                value={askValue}
                onChange={(e) => setAskValue(e.target.value)}
                onKeyDown={handleAskSubmit}
              />
              <button type="button" className="aa-send" aria-label="Send">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <div className="aa-chips">
              <button type="button" className="aa-chip" onClick={() => handleChip('Why is L2 high?')}>Why is L2 high?</button>
              <button type="button" className="aa-chip" onClick={() => handleChip('How to hit 110t?')}>How to hit 110t?</button>
              <button type="button" className="aa-chip" onClick={() => handleChip('Cut energy cost')}>Cut energy cost</button>
              <button type="button" className="aa-chip" onClick={() => handleChip('Show sifter delta')}>Show sifter delta</button>
            </div>
          </div>
          <div className="aa-meta mono">
            <div className="aa-meta-row"><span>Latency</span><span>312ms</span></div>
            <div className="aa-meta-row"><span>Tokens</span><span>1.2K</span></div>
          </div>
        </div>
      </main>
    </div>
  );
}

function FeedItem({ type, text }) {
  return (
    <span className={`ns-event ${type}`}>
      <span className="d"></span>{text}
    </span>
  );
}

function formatClock(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
