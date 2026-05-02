import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../Hooks/useLanguage';
import './AtlasAI.css';

import ProductionTab from './ProductionTab';
import PdMTab from './PdMTab';
import YieldTab from './YieldTab';

const TABS = [
  { id: 'production', i18n: 'atlasAI.tabs.production' },
  { id: 'pdm', i18n: 'atlasAI.tabs.pdm' },
  { id: 'yield', i18n: 'atlasAI.tabs.yield' },
];

function ProductionIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h4l3-9 4 18 3-9h4" />
    </svg>
  );
}

function PdmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  );
}

function YieldIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zM4 7l8 5 8-5M12 22V12" />
    </svg>
  );
}

const TAB_ICONS = {
  production: <ProductionIcon />,
  pdm: <PdmIcon />,
  yield: <YieldIcon />,
};

export default function AtlasAIPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('production');
  const [clock, setClock] = useState(() => new Date());
  const tabsRef = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!tabsRef.current) return;
    const btn = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`);
    if (!btn) return;
    const parentLeft = tabsRef.current.getBoundingClientRect().left;
    const r = btn.getBoundingClientRect();
    setIndicator({ left: r.left - parentLeft, width: r.width });
  }, [activeTab]);

  const timeStr = clock.toLocaleTimeString('en-GB', { hour12: false });
  const feedItems = [
    { tone: 'ok', text: 'M30 intake stable · σ 0.4%' },
    { tone: 'warn', text: 'M31 phase L2 +12% · investigating' },
    { tone: 'ok', text: 'Forecast 108t · 94% confidence' },
    { tone: 'info', text: 'Sifter optimization queued' },
    { tone: 'ok', text: 'Energy 1.42 OMR/t · trending down' },
    { tone: 'ok', text: 'Vitamin feeder dosing on schedule' },
  ];

  return (
    <div className="atlas-ai-root">
      <div className="ambient">
        <div className="ambient-grid" />
        <div className="ambient-aurora a1" />
        <div className="ambient-aurora a2" />
      </div>

      <div className="neural-strip">
        <div className="ns-pillar">
          <div className="ns-eyebrow">ATLAS · NOW</div>
          <div className="ns-headline">
            <span className="ns-time mono">{timeStr}</span>
            <span className="ns-pulse-dot" />
            <span className="ns-status">Reasoning across <b>14 streams</b> · monitoring <b>42 assets</b></span>
          </div>
        </div>
        <div className="ns-divider" />
        <div className="ns-feed">
          <div className="ns-feed-track">
            {[...feedItems, ...feedItems].map((e, i) => (
              <span key={i} className={`ns-event ${e.tone}`}>
                <span className="d" />{e.text}
              </span>
            ))}
          </div>
        </div>
        <div className="ns-divider" />
        <div className="ns-action">
          <button className="ns-cta" type="button">
            <span className="ns-cta-text">{t('atlasAI.askAtlas') || 'Ask Atlas'}</span>
            <span className="ns-cta-key mono">/</span>
          </button>
        </div>
      </div>

      <div className="top-tab-strip">
        <nav className="top-tabs" ref={tabsRef}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-tab={tab.id}
              className={`top-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {TAB_ICONS[tab.id]}
              {t(tab.i18n)}
            </button>
          ))}
          <span
            className="top-tab-indicator"
            style={{ left: indicator.left, width: indicator.width }}
          />
        </nav>
      </div>

      <div className="content">
        {activeTab === 'production' && <ProductionTab />}
        {activeTab === 'pdm' && <PdMTab />}
        {activeTab === 'yield' && <YieldTab />}
      </div>
    </div>
  );
}
