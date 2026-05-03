import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './AtlasAI.css';

import ProductionTab from './tabs/ProductionTab';
import PdMTab from './tabs/PdMTab';
import YieldTab from './tabs/YieldTab';

const TABS = [
  { key: 'production', label: 'Production', icon: <path d="M3 12h4l3-9 4 18 3-9h4" /> },
  { key: 'pdm', label: 'Predictive Maintenance', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></> },
  { key: 'yield', label: 'Yield Optimization', icon: <><path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" /><path d="M4 7l8 5 8-5M12 22V12" /></> },
];

export default function AtlasAIPage() {
  const [active, setActive] = useState('production');
  const [clock, setClock] = useState(() => formatClock(new Date()));

  const tabsRef = useRef(null);
  const indicatorRef = useRef(null);

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
        </div>

        <div className="content">
          {active === 'production' && <ProductionTab />}
          {active === 'pdm' && <PdMTab />}
          {active === 'yield' && <YieldTab />}
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
