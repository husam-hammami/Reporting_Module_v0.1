import { useMemo, useState, useEffect } from 'react';
import { BarChart3, Activity, Table2, Gauge, Container, Hash, Copy, Image, Type, LayoutGrid } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

const WIDGET_META = {
  kpi:      { Icon: Hash,      color: '#14b8a6', dark: '#2dd4bf', label: 'KPI' },
  stat:     { Icon: Activity,  color: '#8b5cf6', dark: '#a78bfa', label: 'Stat' },
  chart:    { Icon: BarChart3, color: '#10b981', dark: '#34d399', label: 'Chart' },
  barchart: { Icon: BarChart3, color: '#10b981', dark: '#34d399', label: 'Bar' },
  table:    { Icon: Table2,    color: '#3b82f6', dark: '#60a5fa', label: 'Table' },
  gauge:    { Icon: Gauge,     color: '#f59e0b', dark: '#fbbf24', label: 'Gauge' },
  silo:     { Icon: Container, color: '#06b6d4', dark: '#22d3ee', label: 'Silo' },
  image:    { Icon: Image,     color: '#6366f1', dark: '#818cf8', label: 'Image' },
  text:     { Icon: Type,      color: '#64748b', dark: '#94a3b8', label: 'Text' },
  repeat:   { Icon: Copy,      color: '#f97316', dark: '#fb923c', label: 'Repeat' },
};

function analyzeComposition(widgets) {
  const counts = {};
  for (const w of widgets) {
    if (!w?.type) continue;
    counts[w.type] = (counts[w.type] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  return { entries, total, dominant: entries[0][0] };
}

function selectHeroWidgets(widgets) {
  const valid = widgets.filter(w => w && w.type);
  const scored = valid.map(w => ({
    ...w,
    area: (w.w || 1) * (w.h || 1),
  }));
  scored.sort((a, b) => b.area - a.area);

  const seen = new Set();
  const heroes = [];
  for (const w of scored) {
    if (heroes.length >= 5) break;
    if (!seen.has(w.type)) {
      heroes.push(w);
      seen.add(w.type);
    }
  }
  if (heroes.length < 4) {
    for (const w of scored) {
      if (heroes.length >= 5) break;
      if (!heroes.includes(w)) {
        heroes.push(w);
      }
    }
  }
  return heroes;
}

function LayoutBlocks({ widgets, heroIds, isDark }) {
  const gridCols = 12;
  const valid = widgets.filter(w => w && w.type).slice(0, 30);
  if (valid.length === 0) return null;

  const maxY = Math.max(...valid.map(c => (c.y || 0) + (c.h || 1)), 4);
  const cellW = 100 / gridCols;
  const cellH = 100 / maxY;
  const gap = 0.5;
  const bg = valid.filter(w => !heroIds.has(w.id));

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {bg.map((w, i) => {
        const meta = WIDGET_META[w.type] || WIDGET_META.text;
        const c = isDark ? meta.dark : meta.color;
        const x = (w.x || 0) * cellW + gap;
        const y = (w.y || 0) * cellH + gap;
        const bw = (w.w || 1) * cellW - gap * 2;
        const bh = (w.h || 1) * cellH - gap * 2;
        return (
          <rect key={i} x={x} y={y} width={bw} height={bh} rx="0.6"
            fill={c} opacity={isDark ? 0.1 : 0.06}
            stroke={c} strokeWidth="0.2" strokeOpacity={isDark ? 0.15 : 0.1}
          />
        );
      })}
    </svg>
  );
}

function PreviewKpi({ c, isDark, title }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 6px', overflow: 'hidden' }}>
      <div style={{ fontSize: '4.5px', fontWeight: 700, color: c, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {(title || 'metric').slice(0, 12)}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 800, color: c, lineHeight: 1.1, letterSpacing: '-0.03em', marginTop: '1px' }}>
        {(100 + Math.floor(Math.random() * 400)).toLocaleString()}
      </div>
      <div style={{ width: '50%', height: '2px', borderRadius: '1px', background: c, opacity: 0.25, marginTop: '2px' }} />
    </div>
  );
}

function PreviewTable({ c, isDark, w, h }) {
  const cols = Math.min(Math.max(Math.floor(w / 45), 2), 5);
  const rows = Math.min(Math.max(Math.floor((h - 12) / 6), 1), 6);
  const hdrBg = isDark ? `${c}18` : `${c}0c`;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '2px', gap: '0.5px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '1.5px', padding: '2px 3px', background: hdrBg, borderRadius: '1.5px', flexShrink: 0 }}>
        {Array.from({ length: cols }).map((_, ci) => (
          <div key={ci} style={{ flex: ci === 0 ? 2 : 1, height: '2px', background: c, opacity: 0.45, borderRadius: '1px' }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '1.5px', padding: '1.5px 3px', background: ri % 2 === 0 ? (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)') : 'transparent' }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} style={{ flex: ci === 0 ? 2 : 1, height: '1.5px', background: c, opacity: ci === 0 ? 0.2 : 0.1, borderRadius: '1px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PreviewChart({ c, isDark, isBarchart, w }) {
  if (isBarchart) {
    const n = Math.min(Math.max(Math.floor(w / 12), 3), 8);
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', padding: '6px 5px 3px', gap: '2px' }}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: `${25 + Math.random() * 60}%`, borderRadius: '1px 1px 0 0', background: c, opacity: 0.35 + Math.random() * 0.25 }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', padding: '4px 3px 2px' }}>
      <svg viewBox="0 0 60 22" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <path d="M0 16 Q8 10,15 13 T30 8 T45 12 T60 6" fill="none" stroke={c} strokeWidth="1.3" opacity="0.6" strokeLinejoin="round" />
        <path d="M0 16 Q8 10,15 13 T30 8 T45 12 T60 6 L60 22 L0 22Z" fill={c} opacity="0.08" />
        <line x1="0" y1="21" x2="60" y2="21" stroke={c} opacity="0.08" strokeWidth="0.4" />
      </svg>
    </div>
  );
}

function PreviewGauge({ c }) {
  const pct = 0.5 + Math.random() * 0.35;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 36 22" style={{ width: '65%', maxHeight: '70%' }}>
        <path d="M5 18 A13 13 0 0 1 31 18" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.12" />
        <path d={`M5 18 A13 13 0 0 1 ${5 + 26 * pct} ${18 - Math.sin(Math.PI * pct) * 13}`} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.65" />
        <circle cx="18" cy="18" r="1.2" fill={c} opacity="0.5" />
      </svg>
      <div style={{ fontSize: '6px', fontWeight: 800, color: c, opacity: 0.6, marginTop: '1px' }}>
        {(pct * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function PreviewSilo({ c, isDark }) {
  const fill = 0.3 + Math.random() * 0.45;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 22 34" style={{ height: '88%', maxWidth: '80%' }}>
        <path d="M5 9 Q5 4,11 3 Q17 4,17 9" fill={c} opacity="0.12" stroke={c} strokeWidth="0.4" strokeOpacity="0.3" />
        <rect x="5" y="9" width="12" height="15" fill={c} opacity="0.08" stroke={c} strokeWidth="0.4" strokeOpacity="0.25" rx="0.3" />
        <rect x="5" y={24 - 15 * fill} width="12" height={15 * fill} fill={c} opacity="0.3" rx="0.2" />
        <path d="M5 24 L8 28 L14 28 L17 24" fill={c} opacity="0.06" stroke={c} strokeWidth="0.3" strokeOpacity="0.2" />
        <line x1="8" y1="28" x2="7" y2="31" stroke={c} strokeWidth="0.4" opacity="0.2" />
        <line x1="14" y1="28" x2="15" y2="31" stroke={c} strokeWidth="0.4" opacity="0.2" />
        {[12, 15, 18, 21].map(yy => (
          <line key={yy} x1="5.3" y1={yy} x2="16.7" y2={yy} stroke={c} strokeWidth="0.15" opacity="0.15" />
        ))}
      </svg>
    </div>
  );
}

function PreviewStat({ c }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '3px 6px', gap: '3px' }}>
      <div style={{ width: '2.5px', height: '55%', borderRadius: '2px', background: c, opacity: 0.4, flexShrink: 0 }} />
      <div style={{ fontSize: '12px', fontWeight: 800, color: c, opacity: 0.7, lineHeight: 1 }}>
        {Math.floor(Math.random() * 200 + 10)}
      </div>
    </div>
  );
}

function HeroWidget({ widget, x, y, w, h, isDark }) {
  const meta = WIDGET_META[widget.type] || WIDGET_META.text;
  const c = isDark ? meta.dark : meta.color;
  const bg = isDark ? '#0c1628' : '#ffffff';
  const isCardless = widget.type === 'text' || widget.type === 'image';
  const title = widget.config?.title || widget.config?.dataSource?.tagName || '';

  let content = null;
  switch (widget.type) {
    case 'kpi': content = <PreviewKpi c={c} isDark={isDark} title={title} />; break;
    case 'table': content = <PreviewTable c={c} isDark={isDark} w={w} h={h} />; break;
    case 'chart': content = <PreviewChart c={c} isDark={isDark} isBarchart={false} w={w} />; break;
    case 'barchart': content = <PreviewChart c={c} isDark={isDark} isBarchart={true} w={w} />; break;
    case 'gauge': content = <PreviewGauge c={c} />; break;
    case 'silo': content = <PreviewSilo c={c} isDark={isDark} />; break;
    case 'stat': content = <PreviewStat c={c} />; break;
    default: return null;
  }

  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: `${w}%`, height: `${h}%`,
      ...(isCardless ? {} : {
        background: bg,
        borderRadius: '4px',
        border: `1px solid ${isDark ? c + '25' : c + '18'}`,
        boxShadow: isDark
          ? `0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px ${c}10`
          : `0 1px 6px rgba(0,0,0,0.06), 0 0 0 1px ${c}08`,
      }),
      overflow: 'hidden',
      zIndex: 2,
    }}>
      {content}
    </div>
  );
}

function CompositionStrip({ entries, total, isDark }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 10px',
      background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
      backdropFilter: 'blur(10px)',
      borderRadius: '5px',
    }}>
      {entries.slice(0, 5).map(([type, count]) => {
        const meta = WIDGET_META[type];
        if (!meta) return null;
        const Icon = meta.Icon;
        const c = isDark ? meta.dark : meta.color;
        return (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Icon size={10} style={{ color: c }} strokeWidth={2.2} />
            <span style={{
              fontSize: '9px', fontWeight: 700,
              color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          </div>
        );
      })}
      <div style={{
        marginLeft: 'auto',
        display: 'flex', height: '3px', borderRadius: '2px',
        overflow: 'hidden', width: '36px', flexShrink: 0,
        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }}>
        {entries.map(([type, count]) => {
          const meta = WIDGET_META[type];
          if (!meta) return null;
          return (
            <div key={type} style={{
              width: `${(count / total) * 100}%`, height: '100%',
              background: isDark ? meta.dark : meta.color, opacity: isDark ? 0.7 : 0.55,
            }} />
          );
        })}
      </div>
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

  const composition = useMemo(
    () => analyzeComposition(widgets.filter(w => w && typeof w === 'object')),
    [widgets]
  );

  const heroes = useMemo(() => selectHeroWidgets(widgets), [widgets]);
  const heroIds = useMemo(() => new Set(heroes.map(w => w.id)), [heroes]);

  if (!composition) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDark ? 'linear-gradient(145deg, #0a1525, #0d1a2d)' : 'linear-gradient(145deg, #f8fafc, #f1f5f9)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', opacity: 0.25 }}>
          <LayoutGrid size={28} style={{ color: isDark ? '#64748b' : '#94a3b8' }} />
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#64748b' : '#94a3b8' }}>Empty Report</span>
        </div>
      </div>
    );
  }

  const gridCols = config?.grid?.cols ?? 12;
  const allValid = widgets.filter(w => w && w.type);
  const maxY = Math.max(...allValid.map(w => (w.y || 0) + (w.h || 1)), 4);
  const colPct = 100 / gridCols;
  const rowPct = 100 / maxY;

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: isDark ? '#080f1e' : '#f6f8fb',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: isDark
          ? 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)'
          : 'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)',
        backgroundSize: `${colPct}% ${rowPct}%`,
      }} />

      <LayoutBlocks widgets={allValid} heroIds={heroIds} isDark={isDark} />

      {heroes.map((w, i) => (
        <HeroWidget
          key={w.id || i}
          widget={w}
          x={(w.x || 0) * colPct}
          y={(w.y || 0) * rowPct}
          w={(w.w || 1) * colPct}
          h={(w.h || 1) * rowPct}
          isDark={isDark}
        />
      ))}

      <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', zIndex: 3 }}>
        <CompositionStrip entries={composition.entries} total={composition.total} isDark={isDark} />
      </div>
    </div>
  );
}
