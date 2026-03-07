import { useMemo, useState, useEffect } from 'react';
import { BarChart3, Activity, Table2, Gauge, Container, Hash, Copy, Image, Type, LayoutGrid } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

const WIDGET_META = {
  kpi:      { Icon: Hash,      color: '#14b8a6', label: 'KPI' },
  stat:     { Icon: Activity,  color: '#8b5cf6', label: 'Stat' },
  chart:    { Icon: BarChart3, color: '#10b981', label: 'Chart' },
  barchart: { Icon: BarChart3, color: '#10b981', label: 'Bar' },
  table:    { Icon: Table2,    color: '#3b82f6', label: 'Table' },
  gauge:    { Icon: Gauge,     color: '#f59e0b', label: 'Gauge' },
  silo:     { Icon: Container, color: '#06b6d4', label: 'Silo' },
  image:    { Icon: Image,     color: '#6366f1', label: 'Image' },
  text:     { Icon: Type,      color: '#64748b', label: 'Text' },
  repeat:   { Icon: Copy,      color: '#f97316', label: 'Repeat' },
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

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function LayoutHeatmap({ widgets, isDark, accent }) {
  const gridCols = 12;
  const cells = [];
  for (const w of widgets) {
    if (!w?.type) continue;
    const meta = WIDGET_META[w.type] || WIDGET_META.text;
    const x = w.x || 0;
    const y = w.y || 0;
    const ww = w.w || 1;
    const hh = w.h || 1;
    cells.push({ x, y, w: ww, h: hh, color: meta.color });
  }
  if (cells.length === 0) return null;

  const maxY = Math.max(...cells.map(c => c.y + c.h), 4);
  const cellW = 100 / gridCols;
  const cellH = 100 / maxY;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x * cellW + 0.3}
          y={c.y * cellH + 0.3}
          width={c.w * cellW - 0.6}
          height={c.h * cellH - 0.6}
          rx="0.8"
          fill={c.color}
          opacity={isDark ? 0.12 : 0.08}
        />
      ))}
    </svg>
  );
}

function CompositionBar({ entries, total, isDark }) {
  return (
    <div style={{
      display: 'flex', width: '100%', height: '3px',
      borderRadius: '2px', overflow: 'hidden',
      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    }}>
      {entries.map(([type, count]) => {
        const meta = WIDGET_META[type];
        if (!meta) return null;
        return (
          <div key={type} style={{
            width: `${(count / total) * 100}%`, height: '100%',
            background: meta.color,
            opacity: isDark ? 0.65 : 0.5,
          }} />
        );
      })}
    </div>
  );
}

function TypeIcons({ entries, isDark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {entries.slice(0, 4).map(([type, count]) => {
        const meta = WIDGET_META[type];
        if (!meta) return null;
        const Icon = meta.Icon;
        return (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Icon size={11} style={{ color: meta.color, opacity: isDark ? 0.75 : 0.6 }} strokeWidth={2} />
            <span style={{
              fontSize: '10px', fontWeight: 700,
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          </div>
        );
      })}
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

  const dominant = WIDGET_META[composition.dominant] || WIDGET_META.text;
  const DomIcon = dominant.Icon;
  const accent = dominant.color;
  const seed = hashStr(template?.name || 'x');

  const waveY1 = 55 + (seed % 15);
  const waveY2 = 65 + (seed % 10);

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: isDark
        ? `linear-gradient(160deg, #080f1e 0%, #0c1728 60%, ${accent}08 100%)`
        : `linear-gradient(160deg, #fafbfd 0%, #f4f6fa 60%, ${accent}06 100%)`,
    }}>
      <LayoutHeatmap widgets={widgets} isDark={isDark} accent={accent} />

      <svg style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
      }} viewBox="0 0 400 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`wg-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={isDark ? 0.15 : 0.08} />
            <stop offset="100%" stopColor={accent} stopOpacity={isDark ? 0.03 : 0.02} />
          </linearGradient>
        </defs>
        <path d={`M0 ${waveY1} Q60 ${waveY1-18}, 120 ${waveY1-5} T240 ${waveY1-12} T360 ${waveY1-8} L400 ${waveY1-3} L400 100 L0 100Z`}
          fill={`url(#wg-${seed})`} />
        <path d={`M0 ${waveY2} Q80 ${waveY2-12}, 160 ${waveY2-3} T320 ${waveY2-8} L400 ${waveY2-5} L400 100 L0 100Z`}
          fill={accent} opacity={isDark ? 0.04 : 0.03} />
      </svg>

      <div style={{
        position: 'absolute', top: '14px', right: '16px',
        opacity: isDark ? 0.05 : 0.035,
      }}>
        <DomIcon size={56} style={{ color: accent }} strokeWidth={1} />
      </div>

      <div style={{
        position: 'absolute', bottom: '10px', left: '14px', right: '14px',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <TypeIcons entries={composition.entries} isDark={isDark} />
        <CompositionBar entries={composition.entries} total={composition.total} isDark={isDark} />
      </div>
    </div>
  );
}
