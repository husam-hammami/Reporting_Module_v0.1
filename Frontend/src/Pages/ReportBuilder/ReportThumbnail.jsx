import { useMemo, useState, useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

const DEFAULT_COLS = 12;
const DEFAULT_ROW_H = 40;
const CANVAS_W = 960;
const THUMB_W = 384;
const THUMB_H = 192;
const MAX_WIDGETS = 28;

const COLORS = {
  dark: {
    kpi:      { bg: '#0c2d2d', border: '#14524e', accent: '#2dd4bf', text: '#2dd4bf', muted: '#1a4a45' },
    stat:     { bg: '#1a1530', border: '#2d2552', accent: '#a78bfa', text: '#a78bfa', muted: '#2a2050' },
    chart:    { bg: '#0c2a1e', border: '#1a4a35', accent: '#34d399', text: '#34d399', muted: '#153828' },
    barchart: { bg: '#0c2a1e', border: '#1a4a35', accent: '#34d399', text: '#34d399', muted: '#153828' },
    table:    { bg: '#0c1a30', border: '#1a3052', accent: '#60a5fa', text: '#60a5fa', muted: '#122545' },
    gauge:    { bg: '#2a1f0c', border: '#4a3518', accent: '#fbbf24', text: '#fbbf24', muted: '#382a10' },
    silo:     { bg: '#0c2028', border: '#1a3848', accent: '#22d3ee', text: '#22d3ee', muted: '#152e3a' },
    image:    { bg: '#151530', border: '#252552', accent: '#818cf8', text: '#818cf8', muted: '#1e1e48' },
    text:     { bg: '#121820', border: '#1e2a38', accent: '#94a3b8', text: '#94a3b8', muted: '#1a2230' },
    repeat:   { bg: '#2a1a0c', border: '#4a3018', accent: '#fb923c', text: '#fb923c', muted: '#382210' },
  },
  light: {
    kpi:      { bg: '#f0fdfa', border: '#99f6e4', accent: '#0d9488', text: '#0d9488', muted: '#ccfbf1' },
    stat:     { bg: '#f5f3ff', border: '#c4b5fd', accent: '#7c3aed', text: '#7c3aed', muted: '#ede9fe' },
    chart:    { bg: '#f0fdf4', border: '#86efac', accent: '#059669', text: '#059669', muted: '#dcfce7' },
    barchart: { bg: '#f0fdf4', border: '#86efac', accent: '#059669', text: '#059669', muted: '#dcfce7' },
    table:    { bg: '#eff6ff', border: '#93c5fd', accent: '#2563eb', text: '#2563eb', muted: '#dbeafe' },
    gauge:    { bg: '#fffbeb', border: '#fcd34d', accent: '#d97706', text: '#d97706', muted: '#fef3c7' },
    silo:     { bg: '#ecfeff', border: '#67e8f9', accent: '#0891b2', text: '#0891b2', muted: '#cffafe' },
    image:    { bg: '#eef2ff', border: '#a5b4fc', accent: '#4f46e5', text: '#4f46e5', muted: '#e0e7ff' },
    text:     { bg: '#f8fafc', border: '#cbd5e1', accent: '#475569', text: '#475569', muted: '#e2e8f0' },
    repeat:   { bg: '#fff7ed', border: '#fdba74', accent: '#ea580c', text: '#ea580c', muted: '#fed7aa' },
  },
};

function getColors(type, isDark) {
  const palette = isDark ? COLORS.dark : COLORS.light;
  return palette[type] || palette.text;
}

function MiniKpi({ w, h, c }) {
  const title = c.config?.title || c.config?.dataSource?.tagName || 'Value';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 8px', gap: '2px' }}>
      <div style={{ fontSize: '5px', fontWeight: 700, color: c.muted === c.accent ? c.text : c.text, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {title.length > 14 ? title.slice(0, 14) : title}
      </div>
      <div style={{ fontSize: w > 100 ? '16px' : '12px', fontWeight: 800, color: c.accent, lineHeight: 1, letterSpacing: '-0.03em' }}>
        {(Math.random() * 400 + 50).toFixed(0)}
      </div>
      <div style={{ width: '55%', height: '2px', borderRadius: '1px', background: c.accent, opacity: 0.35, marginTop: '1px' }} />
    </div>
  );
}

function MiniTable({ w, h, c }) {
  const rowCount = Math.max(Math.floor((h - 14) / 7), 1);
  const colCount = Math.min(Math.max(Math.floor(w / 50), 2), 5);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '3px', gap: '1px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '2px', padding: '2px 3px', background: c.muted, borderRadius: '2px', flexShrink: 0 }}>
        {Array.from({ length: colCount }).map((_, ci) => (
          <div key={ci} style={{ flex: ci === 0 ? 2 : 1, height: '2px', background: c.accent, opacity: 0.5, borderRadius: '1px' }} />
        ))}
      </div>
      {Array.from({ length: Math.min(rowCount, 8) }).map((_, ri) => (
        <div key={ri} style={{
          display: 'flex', gap: '2px', padding: '1.5px 3px',
          background: ri % 2 === 0 ? `${c.accent}08` : 'transparent',
          borderRadius: '1px',
        }}>
          {Array.from({ length: colCount }).map((_, ci) => (
            <div key={ci} style={{
              flex: ci === 0 ? 2 : 1, height: '1.5px',
              background: c.text, opacity: ci === 0 ? 0.2 : 0.12,
              borderRadius: '1px', width: ci > 0 ? `${50 + Math.random() * 40}%` : undefined,
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MiniChart({ w, h, c, isBarchart }) {
  if (isBarchart) {
    const count = Math.min(Math.max(Math.floor(w / 14), 3), 10);
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '6px 6px 4px', gap: '3px' }}>
        {Array.from({ length: count }).map((_, i) => {
          const barH = 20 + Math.random() * 60;
          return (
            <div key={i} style={{
              flex: 1, height: `${barH}%`, borderRadius: '1.5px 1.5px 0 0',
              background: `linear-gradient(to top, ${c.accent}, ${c.accent}90)`,
              opacity: 0.55 + Math.random() * 0.3,
            }} />
          );
        })}
      </div>
    );
  }
  const points1 = Array.from({ length: 8 }, (_, i) => ({ x: i * 60 / 7, y: 4 + Math.random() * 12 }));
  const line1 = points1.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const area1 = `${line1} L60 20 L0 20 Z`;
  return (
    <div style={{ width: '100%', height: '100%', padding: '5px 4px 3px' }}>
      <svg viewBox="0 0 60 20" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <path d={area1} fill={c.accent} opacity="0.1" />
        <path d={line1} fill="none" stroke={c.accent} strokeWidth="1.2" opacity="0.7" strokeLinejoin="round" />
        <line x1="0" y1="19" x2="60" y2="19" stroke={c.text} opacity="0.06" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

function MiniGauge({ w, h, c }) {
  const pct = 0.55 + Math.random() * 0.3;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
      <svg viewBox="0 0 36 22" style={{ width: '70%', maxHeight: '75%' }}>
        <path d="M 5 18 A 13 13 0 0 1 31 18" fill="none" stroke={c.muted} strokeWidth="3" strokeLinecap="round" />
        <path d={`M 5 18 A 13 13 0 0 1 ${5 + 26 * pct} ${18 - Math.sin(Math.PI * pct) * 13}`} fill="none" stroke={c.accent} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        <circle cx="18" cy="18" r="1.5" fill={c.accent} opacity="0.6" />
      </svg>
      <div style={{ fontSize: '6px', fontWeight: 800, color: c.accent, opacity: 0.7, lineHeight: 1 }}>
        {(pct * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function MiniSilo({ w, h, c }) {
  const fillPct = 0.3 + Math.random() * 0.5;
  const bodyH = h * 0.5;
  const fillH = bodyH * fillPct;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 24 36" style={{ height: '85%', maxWidth: '80%' }}>
        <defs>
          <linearGradient id="silo-body-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c.accent} stopOpacity="0.15" />
            <stop offset="40%" stopColor={c.accent} stopOpacity="0.25" />
            <stop offset="100%" stopColor={c.accent} stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path d="M6 10 Q6 5, 12 4 Q18 5, 18 10" fill={`${c.accent}30`} stroke={c.accent} strokeWidth="0.5" opacity="0.5" />
        <rect x="6" y="10" width="12" height="16" fill="url(#silo-body-g)" stroke={c.accent} strokeWidth="0.5" opacity="0.6" rx="0.5" />
        <rect x="6" y={26 - fillH * 0.55} width="12" height={fillH * 0.55} fill={c.accent} opacity="0.35" rx="0.3" />
        <path d="M6 26 L9 30 L15 30 L18 26" fill={`${c.accent}20`} stroke={c.accent} strokeWidth="0.4" opacity="0.5" />
        <line x1="9" y1="30" x2="8" y2="33" stroke={c.accent} strokeWidth="0.5" opacity="0.4" />
        <line x1="15" y1="30" x2="16" y2="33" stroke={c.accent} strokeWidth="0.5" opacity="0.4" />
        {[12, 15, 18, 21].map(y => (
          <line key={y} x1="6.5" y1={y} x2="17.5" y2={y} stroke={c.accent} strokeWidth="0.2" opacity="0.2" />
        ))}
      </svg>
    </div>
  );
}

function MiniStat({ w, h, c }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '4px 7px', gap: '4px' }}>
      <div style={{ width: '3px', height: '60%', borderRadius: '2px', background: c.accent, opacity: 0.5, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
        <div style={{ fontSize: w > 100 ? '13px' : '10px', fontWeight: 800, color: c.accent, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {(Math.random() * 200 + 10).toFixed(0)}
        </div>
        <div style={{ fontSize: '4px', color: c.text, opacity: 0.35, fontWeight: 600, textTransform: 'uppercase' }}>count</div>
      </div>
    </div>
  );
}

function MiniText({ w, h, c }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '5px 7px', gap: '3px' }}>
      <div style={{ width: '75%', height: '2px', background: c.text, opacity: 0.18, borderRadius: '1px' }} />
      <div style={{ width: '55%', height: '2px', background: c.text, opacity: 0.12, borderRadius: '1px' }} />
      <div style={{ width: '65%', height: '2px', background: c.text, opacity: 0.08, borderRadius: '1px' }} />
    </div>
  );
}

function MiniImage({ w, h, c }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${c.accent}08` }}>
      <svg viewBox="0 0 28 20" style={{ width: '55%', opacity: 0.3 }}>
        <rect x="1" y="1" width="26" height="18" rx="2" fill="none" stroke={c.accent} strokeWidth="0.8" />
        <circle cx="8" cy="7" r="2.5" fill={c.accent} opacity="0.35" />
        <path d="M1 15 L9 9 L14 13 L19 8 L27 13 L27 19 L1 19Z" fill={c.accent} opacity="0.15" />
      </svg>
    </div>
  );
}

function MiniRepeat({ w, h, c }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '4px' }}>
      {[0.7, 0.85, 0.6].map((s, i) => (
        <div key={i} style={{ width: '18%', height: `${s * 70}%`, background: `${c.accent}20`, border: `0.5px solid ${c.accent}30`, borderRadius: '2px' }} />
      ))}
    </div>
  );
}

const MINI_RENDERERS = {
  kpi: MiniKpi, stat: MiniStat, chart: MiniChart, barchart: MiniChart,
  table: MiniTable, gauge: MiniGauge, silo: MiniSilo,
  image: MiniImage, text: MiniText, repeat: MiniRepeat,
};

function MiniWidgetBlock({ widget, colW, rowH, isDark }) {
  const type = widget.type || 'text';
  const c = getColors(type, isDark);
  const Renderer = MINI_RENDERERS[type];

  const x = (widget.x || 0) * colW;
  const y = (widget.y || 0) * rowH;
  const w = (widget.w || 1) * colW;
  const h = (widget.h || 1) * rowH;

  const isCardless = type === 'text' || type === 'image';

  return (
    <div style={{
      position: 'absolute', left: `${x}px`, top: `${y}px`,
      width: `${w}px`, height: `${h}px`,
      ...(isCardless ? {} : {
        background: c.bg, borderRadius: '4px', overflow: 'hidden',
        border: `0.8px solid ${c.border}`,
        boxShadow: isDark ? `0 1px 4px rgba(0,0,0,0.25)` : `0 1px 3px rgba(0,0,0,0.06)`,
      }),
    }}>
      {Renderer && <Renderer w={w} h={h} c={c} isBarchart={type === 'barchart'} config={widget.config} />}
    </div>
  );
}

export default function ReportThumbnail({ template }) {
  const { config } = useMemo(() => {
    const lc = template?.layout_config;
    if (!lc) return { config: null };
    try {
      const { config: c } = loadAndMigrateConfig(lc);
      return { config: c };
    } catch { return { config: null }; }
  }, [template?.layout_config]);

  const widgets = config?.widgets ?? [];

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const validWidgets = useMemo(() => widgets.filter(w => w && w.type).slice(0, MAX_WIDGETS), [widgets]);

  if (validWidgets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center"
        style={{ background: isDark ? '#0a1525' : '#f1f5f9' }}
      >
        <div className="flex flex-col items-center gap-2 opacity-40">
          <LayoutGrid size={24} style={{ color: isDark ? '#475569' : '#94a3b8' }} />
          <span style={{ fontSize: '9px', fontWeight: 600, color: isDark ? '#475569' : '#94a3b8' }}>Empty Report</span>
        </div>
      </div>
    );
  }

  const gridCols = config?.grid?.cols ?? DEFAULT_COLS;
  const gridRowH = config?.grid?.rowHeight ?? DEFAULT_ROW_H;
  const colW = CANVAS_W / gridCols;

  const maxY = Math.max(...validWidgets.map(w => (w.y || 0) + (w.h || 1)), 1);
  const canvasH = maxY * gridRowH;

  const scaleX = THUMB_W / CANVAS_W;
  const scaleY = THUMB_H / canvasH;
  const scale = Math.min(scaleX, scaleY, 0.42);

  const scaledW = CANVAS_W * scale;
  const scaledH = canvasH * scale;
  const offsetX = (THUMB_W - scaledW) / 2;
  const offsetY = Math.max((THUMB_H - scaledH) / 2, 4);

  return (
    <div className="w-full h-full relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(145deg, #080f1e 0%, #0b1628 50%, #091220 100%)'
          : 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 50%, #eaeff5 100%)',
      }}
    >
      <div style={{
        position: 'absolute', left: `${offsetX}px`, top: `${offsetY}px`,
        width: `${CANVAS_W}px`, height: `${canvasH}px`,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        pointerEvents: 'none',
      }}>
        {validWidgets.map((w, i) => (
          <MiniWidgetBlock key={w.id || i} widget={w} colW={colW} rowH={gridRowH} isDark={isDark} />
        ))}
      </div>

      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{
        height: '32px',
        background: isDark
          ? 'linear-gradient(to top, rgba(8,15,30,0.95) 0%, rgba(8,15,30,0.5) 50%, transparent 100%)'
          : 'linear-gradient(to top, rgba(248,250,252,0.95) 0%, rgba(248,250,252,0.5) 50%, transparent 100%)',
      }} />
    </div>
  );
}
