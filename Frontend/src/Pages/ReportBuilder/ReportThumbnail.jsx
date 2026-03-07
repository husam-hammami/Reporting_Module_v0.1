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

function LayoutBlocks({ widgets, isDark }) {
  const gridCols = 12;
  const valid = widgets.filter(w => w && w.type).slice(0, 30);
  if (valid.length === 0) return null;

  const maxY = Math.max(...valid.map(c => (c.y || 0) + (c.h || 1)), 4);
  const cellW = 100 / gridCols;
  const cellH = 100 / maxY;
  const gap = 0.6;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        {valid.map((w, i) => {
          const meta = WIDGET_META[w.type] || WIDGET_META.text;
          const c = isDark ? meta.dark : meta.color;
          return (
            <linearGradient key={i} id={`wb-${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={isDark ? 0.28 : 0.18} />
              <stop offset="100%" stopColor={c} stopOpacity={isDark ? 0.15 : 0.08} />
            </linearGradient>
          );
        })}
      </defs>
      {valid.map((w, i) => {
        const meta = WIDGET_META[w.type] || WIDGET_META.text;
        const c = isDark ? meta.dark : meta.color;
        const x = (w.x || 0) * cellW + gap;
        const y = (w.y || 0) * cellH + gap;
        const bw = (w.w || 1) * cellW - gap * 2;
        const bh = (w.h || 1) * cellH - gap * 2;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} rx="0.8"
              fill={`url(#wb-${i})`}
            />
            <rect x={x} y={y} width={bw} height={bh} rx="0.8"
              fill="none" stroke={c}
              strokeWidth="0.3"
              opacity={isDark ? 0.3 : 0.2}
            />
          </g>
        );
      })}
    </svg>
  );
}

function CompositionStrip({ entries, total, isDark }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 12px',
      background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(8px)',
      borderRadius: '6px',
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
        overflow: 'hidden', width: '40px', flexShrink: 0,
        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }}>
        {entries.map(([type, count]) => {
          const meta = WIDGET_META[type];
          if (!meta) return null;
          const c = isDark ? meta.dark : meta.color;
          return (
            <div key={type} style={{
              width: `${(count / total) * 100}%`, height: '100%',
              background: c, opacity: isDark ? 0.7 : 0.55,
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

  if (!composition) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDark
          ? 'linear-gradient(145deg, #0a1525, #0d1a2d)'
          : 'linear-gradient(145deg, #f8fafc, #f1f5f9)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', opacity: 0.25 }}>
          <LayoutGrid size={28} style={{ color: isDark ? '#64748b' : '#94a3b8' }} />
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#64748b' : '#94a3b8' }}>
            Empty Report
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: isDark
        ? '#080f1e'
        : '#f6f8fb',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: isDark
          ? 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)'
          : 'linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)',
        backgroundSize: '8.333% 25%',
      }} />

      <LayoutBlocks widgets={widgets} isDark={isDark} />

      <div style={{
        position: 'absolute', bottom: '8px', left: '8px', right: '8px',
      }}>
        <CompositionStrip entries={composition.entries} total={composition.total} isDark={isDark} />
      </div>
    </div>
  );
}
