import { useMemo, useState, useEffect } from 'react';
import { BarChart3, Activity, Table2, Gauge, Container, Hash, Copy, Image, Type, LayoutGrid } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

const WIDGET_META = {
  kpi:      { accent: '#14b8a6', accentDark: '#2dd4bf', label: 'KPI' },
  stat:     { accent: '#8b5cf6', accentDark: '#a78bfa', label: 'Stat' },
  chart:    { accent: '#10b981', accentDark: '#34d399', label: 'Chart' },
  barchart: { accent: '#10b981', accentDark: '#34d399', label: 'Bar' },
  table:    { accent: '#3b82f6', accentDark: '#60a5fa', label: 'Table' },
  gauge:    { accent: '#f59e0b', accentDark: '#fbbf24', label: 'Gauge' },
  silo:     { accent: '#06b6d4', accentDark: '#22d3ee', label: 'Silo' },
  image:    { accent: '#6366f1', accentDark: '#818cf8', label: 'Image' },
  text:     { accent: '#64748b', accentDark: '#94a3b8', label: 'Text' },
  repeat:   { accent: '#f97316', accentDark: '#fb923c', label: 'Repeat' },
};

const CATEGORY_INFO = {
  kpi: { label: 'KPI Dashboard' }, stat: { label: 'Statistics Panel' },
  chart: { label: 'Analytics Report' }, barchart: { label: 'Chart Report' },
  table: { label: 'Data Report' }, gauge: { label: 'Process Monitor' },
  silo: { label: 'Equipment Overview' }, image: { label: 'Visual Report' },
  text: { label: 'Text Report' }, repeat: { label: 'Repeat Panel' },
  mixed: { label: 'Mixed Report' },
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
  const dominant = entries[0][0];
  const pills = entries.slice(0, 5);
  const isMixed = entries.length > 2 && entries[0][1] / total < 0.5;
  const category = isMixed ? 'mixed' : dominant;
  return { dominant, pills, total, category };
}

function MiniKpi({ c, isDark }) {
  return (
    <div className="flex flex-col items-start justify-center h-full px-[3px] py-[2px] overflow-hidden">
      <div className="w-full truncate" style={{ fontSize: '4px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)' }}>
        {c.title || 'KPI'}
      </div>
      <div className="truncate" style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '-0.03em', color: isDark ? '#2dd4bf' : '#14b8a6', lineHeight: 1.1 }}>
        384.2
      </div>
      <div style={{ width: '60%', height: '1.5px', borderRadius: '1px', marginTop: '1px', background: isDark ? '#2dd4bf' : '#14b8a6', opacity: 0.5 }} />
    </div>
  );
}

function MiniTable({ c, isDark }) {
  const accent = isDark ? '#60a5fa' : '#3b82f6';
  const muted = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
  const headerBg = isDark ? `${accent}20` : `${accent}12`;
  return (
    <div className="flex flex-col h-full px-[2px] py-[2px] overflow-hidden gap-[1px]">
      <div style={{ height: '4px', background: headerBg, borderRadius: '1px', display: 'flex', gap: '2px', padding: '0 1px', alignItems: 'center' }}>
        <div style={{ flex: 2, height: '1px', background: accent, opacity: 0.5, borderRadius: '1px' }} />
        <div style={{ flex: 1, height: '1px', background: accent, opacity: 0.3, borderRadius: '1px' }} />
        <div style={{ flex: 1, height: '1px', background: accent, opacity: 0.3, borderRadius: '1px' }} />
      </div>
      {[0.7, 0.5, 0.85, 0.4, 0.65].map((w, i) => (
        <div key={i} style={{ height: '2.5px', display: 'flex', gap: '2px', padding: '0 1px', alignItems: 'center', background: i % 2 === 0 ? (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') : 'transparent', borderRadius: '0.5px' }}>
          <div style={{ width: `${w * 40}%`, height: '1px', background: muted, borderRadius: '1px' }} />
          <div style={{ width: '15%', height: '1px', background: muted, opacity: 0.6, borderRadius: '1px' }} />
          <div style={{ width: '10%', height: '1px', background: muted, opacity: 0.4, borderRadius: '1px' }} />
        </div>
      ))}
    </div>
  );
}

function MiniChart({ isDark, isBarchart }) {
  const accent = isDark ? '#34d399' : '#10b981';
  if (isBarchart) {
    const bars = [0.4, 0.65, 0.5, 0.8, 0.55, 0.7];
    return (
      <div className="flex items-end justify-center h-full px-[3px] pb-[2px] pt-[4px] gap-[1.5px]">
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h * 100}%`, background: `linear-gradient(to top, ${accent}, ${accent}80)`, borderRadius: '0.5px 0.5px 0 0', opacity: 0.6 + i * 0.05 }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-end h-full px-[2px] pb-[2px] pt-[4px]">
      <svg viewBox="0 0 60 20" className="w-full h-full" preserveAspectRatio="none">
        <path d="M0 15 Q8 10, 15 12 T30 8 T45 11 T60 5" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.7" />
        <path d="M0 15 Q8 10, 15 12 T30 8 T45 11 T60 5 L60 20 L0 20Z" fill={accent} opacity="0.08" />
        <path d="M0 18 Q10 14, 20 16 T40 13 T60 10" fill="none" stroke={isDark ? '#fbbf24' : '#f59e0b'} strokeWidth="0.8" opacity="0.4" strokeDasharray="2 1" />
      </svg>
    </div>
  );
}

function MiniGauge({ isDark }) {
  const accent = isDark ? '#fbbf24' : '#f59e0b';
  return (
    <div className="flex items-center justify-center h-full">
      <svg viewBox="0 0 30 20" className="w-3/4" style={{ maxHeight: '90%' }}>
        <path d="M 4 16 A 11 11 0 0 1 26 16" fill="none" stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 4 16 A 11 11 0 0 1 20 6.5" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        <line x1="15" y1="15" x2="20" y2="8" stroke={accent} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        <circle cx="15" cy="15" r="1.2" fill={accent} opacity="0.7" />
      </svg>
    </div>
  );
}

function MiniSilo({ isDark }) {
  const accent = isDark ? '#22d3ee' : '#06b6d4';
  const fill = isDark ? '#34d399' : '#10b981';
  return (
    <div className="flex items-center justify-center h-full">
      <svg viewBox="0 0 20 28" className="h-3/4" style={{ maxWidth: '70%' }}>
        <path d="M5 8 Q5 4, 10 3 Q15 4, 15 8" fill={isDark ? '#3a4a5a' : '#a0b0c0'} stroke={isDark ? '#4a5a6a' : '#8898a8'} strokeWidth="0.4" />
        <rect x="5" y="8" width="10" height="13" fill={isDark ? '#2a3a4a' : '#c0d0dd'} stroke={isDark ? '#4a5a6a' : '#8898a8'} strokeWidth="0.4" />
        <rect x="5" y="14" width="10" height="7" fill={fill} opacity="0.6" />
        <ellipse cx="10" cy="14" rx="5" ry="1.2" fill={fill} opacity="0.3" />
        <path d="M5 21 L8 25 L12 25 L15 21" fill={isDark ? '#2a3a4a' : '#a0b0c0'} stroke={isDark ? '#4a5a6a' : '#8898a8'} strokeWidth="0.3" />
        <line x1="7" y1="25" x2="6" y2="27" stroke={isDark ? '#4a5a6a' : '#8898a8'} strokeWidth="0.5" />
        <line x1="13" y1="25" x2="14" y2="27" stroke={isDark ? '#4a5a6a' : '#8898a8'} strokeWidth="0.5" />
      </svg>
    </div>
  );
}

function MiniStat({ c, isDark }) {
  const accent = isDark ? '#a78bfa' : '#8b5cf6';
  return (
    <div className="flex items-center h-full px-[3px] py-[2px] overflow-hidden">
      <div style={{ width: '2px', height: '65%', borderRadius: '2px', background: accent, opacity: 0.5, marginRight: '3px', flexShrink: 0 }} />
      <div className="truncate" style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '-0.03em', color: accent, opacity: 0.8, lineHeight: 1 }}>
        42
      </div>
    </div>
  );
}

function MiniText({ c, isDark }) {
  const muted = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
  return (
    <div className="flex flex-col justify-center h-full px-[3px] py-[2px] gap-[1.5px]">
      <div style={{ width: '80%', height: '1.5px', background: muted, borderRadius: '1px' }} />
      <div style={{ width: '60%', height: '1.5px', background: muted, opacity: 0.6, borderRadius: '1px' }} />
      <div style={{ width: '70%', height: '1.5px', background: muted, opacity: 0.4, borderRadius: '1px' }} />
    </div>
  );
}

function MiniImage({ isDark }) {
  const accent = isDark ? '#818cf8' : '#6366f1';
  return (
    <div className="flex items-center justify-center h-full" style={{ background: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)' }}>
      <svg viewBox="0 0 24 18" className="w-3/5" opacity="0.4">
        <rect x="1" y="1" width="22" height="16" rx="1.5" fill="none" stroke={accent} strokeWidth="0.8" />
        <circle cx="7" cy="6" r="2" fill={accent} opacity="0.4" />
        <path d="M1 14 L8 9 L12 12 L17 7 L23 12 L23 17 L1 17Z" fill={accent} opacity="0.2" />
      </svg>
    </div>
  );
}

function MiniWidgetContent({ widget, isDark }) {
  const c = widget.config || {};
  switch (widget.type) {
    case 'kpi': return <MiniKpi c={c} isDark={isDark} />;
    case 'table': return <MiniTable c={c} isDark={isDark} />;
    case 'chart': return <MiniChart isDark={isDark} isBarchart={false} />;
    case 'barchart': return <MiniChart isDark={isDark} isBarchart={true} />;
    case 'gauge': return <MiniGauge isDark={isDark} />;
    case 'silo': return <MiniSilo isDark={isDark} />;
    case 'stat': return <MiniStat c={c} isDark={isDark} />;
    case 'text': return <MiniText c={c} isDark={isDark} />;
    case 'image': return <MiniImage isDark={isDark} />;
    default: return null;
  }
}

function MiniWidgetBlock({ widget, gridCols, gridH, isDark }) {
  const meta = WIDGET_META[widget.type] || WIDGET_META.text;
  const accent = isDark ? meta.accentDark : meta.accent;

  const colW = 100 / gridCols;
  const x = (widget.x || 0) * colW;
  const w = Math.min((widget.w || 1) * colW, 100 - x);
  const y = (widget.y || 0) * gridH;
  const h = (widget.h || 1) * gridH;

  return (
    <div
      className="absolute rounded-[3px] overflow-hidden"
      style={{
        left: `${x}%`,
        top: `${y}px`,
        width: `${w}%`,
        height: `${h}px`,
        background: isDark
          ? `linear-gradient(145deg, ${accent}12, ${accent}06)`
          : `linear-gradient(145deg, ${accent}0a, ${accent}05)`,
        border: `0.5px solid ${isDark ? accent + '28' : accent + '1a'}`,
        boxShadow: `0 0.5px 2px ${isDark ? accent + '0c' : accent + '08'}`,
      }}
    >
      <MiniWidgetContent widget={widget} isDark={isDark} />
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
    } catch {
      return { config: null };
    }
  }, [template?.layout_config]);

  const widgets = config?.widgets ?? [];
  const composition = useMemo(
    () => analyzeComposition(widgets.filter((w) => w && typeof w === 'object')),
    [widgets],
  );

  if (!composition) {
    return (
      <div className="w-full h-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, var(--rb-surface) 0%, var(--rb-panel) 100%)' }}
      >
        <div className="flex flex-col items-center gap-2 opacity-40">
          <LayoutGrid size={24} style={{ color: 'var(--rb-text-muted)' }} />
          <span className="text-[9px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Empty Report</span>
        </div>
      </div>
    );
  }

  const { dominant, pills, total, category } = composition;
  const catInfo = CATEGORY_INFO[category] || CATEGORY_INFO.mixed;
  const dominantMeta = WIDGET_META[dominant] || WIDGET_META.text;

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const gridCols = config?.grid?.cols ?? config?.gridCols ?? 12;
  const maxY = Math.max(...widgets.map(w => (w.y || 0) + (w.h || 1)), 6);
  const thumbH = 130;
  const gridH = Math.min(thumbH / maxY, 28);
  const totalGridH = maxY * gridH;

  const visibleWidgets = widgets.filter(w => w && w.type).slice(0, 30);
  const accentColor = isDark ? dominantMeta.accentDark : dominantMeta.accent;

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(145deg, #0a1525 0%, #0d1a2d 50%, #0a1220 100%)'
          : 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 50%, #e8eef5 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)'
            : 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.025) 1px, transparent 0)',
          backgroundSize: '14px 14px',
        }}
      />

      <div className="relative px-2.5 pt-2.5 pb-1" style={{ height: `${thumbH}px` }}>
        <div className="relative w-full" style={{ height: `${Math.min(totalGridH, thumbH - 8)}px` }}>
          {visibleWidgets.map((w, i) => (
            <MiniWidgetBlock
              key={w.id || i}
              widget={w}
              gridCols={gridCols}
              gridH={gridH}
              isDark={isDark}
            />
          ))}
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-2"
        style={{
          background: isDark
            ? 'linear-gradient(to top, rgba(10,21,37,0.97) 0%, rgba(10,21,37,0.8) 50%, transparent 100%)'
            : 'linear-gradient(to top, rgba(248,250,252,0.97) 0%, rgba(248,250,252,0.8) 50%, transparent 100%)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)' }}>
            {catInfo.label}
          </span>
          <span className="text-[8px] font-semibold tabular-nums" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }}>
            {total} widget{total !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1 overflow-hidden">
          {pills.map(([type, count]) => {
            const m = WIDGET_META[type];
            if (!m) return null;
            const pc = isDark ? m.accentDark : m.accent;
            return (
              <div key={type} className="flex items-center gap-[3px] px-1.5 py-[1px] rounded flex-shrink-0"
                style={{ background: `${pc}${isDark ? '15' : '0d'}`, border: `0.5px solid ${pc}${isDark ? '25' : '18'}` }}
              >
                <span className="w-[3px] h-[3px] rounded-full flex-shrink-0" style={{ background: pc }} />
                <span className="text-[7px] font-bold whitespace-nowrap" style={{ color: `${pc}${isDark ? 'cc' : ''}` }}>
                  {m.label} ×{count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
