import { useMemo, useState, useEffect } from 'react';
import { BarChart3, Activity, Table2, Gauge, Container, Hash, Copy, Image, Type, LayoutGrid } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

const WIDGET_META = {
  kpi:      { Icon: Hash,      accent: '#14b8a6', accentDark: '#2dd4bf', label: 'KPI' },
  stat:     { Icon: Activity,  accent: '#8b5cf6', accentDark: '#a78bfa', label: 'Stat' },
  chart:    { Icon: BarChart3, accent: '#10b981', accentDark: '#34d399', label: 'Chart' },
  barchart: { Icon: BarChart3, accent: '#10b981', accentDark: '#34d399', label: 'Bar' },
  table:    { Icon: Table2,    accent: '#3b82f6', accentDark: '#60a5fa', label: 'Table' },
  gauge:    { Icon: Gauge,     accent: '#f59e0b', accentDark: '#fbbf24', label: 'Gauge' },
  silo:     { Icon: Container, accent: '#06b6d4', accentDark: '#22d3ee', label: 'Silo' },
  image:    { Icon: Image,     accent: '#6366f1', accentDark: '#818cf8', label: 'Image' },
  text:     { Icon: Type,      accent: '#64748b', accentDark: '#94a3b8', label: 'Text' },
  repeat:   { Icon: Copy,      accent: '#f97316', accentDark: '#fb923c', label: 'Repeat' },
};

const CATEGORY_INFO = {
  kpi:      { label: 'KPI Dashboard' },
  stat:     { label: 'Statistics Panel' },
  chart:    { label: 'Analytics Report' },
  barchart: { label: 'Chart Report' },
  table:    { label: 'Data Report' },
  gauge:    { label: 'Process Monitor' },
  silo:     { label: 'Equipment Overview' },
  image:    { label: 'Visual Report' },
  text:     { label: 'Text Report' },
  repeat:   { label: 'Repeat Panel' },
  mixed:    { label: 'Mixed Report' },
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

  return { dominant, pills, total, category, isMixed };
}

function MiniWidgetBlock({ widget, gridCols, gridH, isDark }) {
  const meta = WIDGET_META[widget.type] || WIDGET_META.text;
  const Icon = meta.Icon;
  const accent = isDark ? meta.accentDark : meta.accent;

  const colW = 100 / gridCols;
  const x = (widget.x || 0) * colW;
  const w = Math.min((widget.w || 1) * colW, 100 - x);
  const y = (widget.y || 0) * gridH;
  const h = (widget.h || 1) * gridH;

  return (
    <div
      className="absolute rounded-[3px] overflow-hidden transition-all duration-300"
      style={{
        left: `${x}%`,
        top: `${y}px`,
        width: `${w}%`,
        height: `${h}px`,
        background: isDark
          ? `linear-gradient(135deg, ${accent}18, ${accent}08)`
          : `linear-gradient(135deg, ${accent}12, ${accent}06)`,
        border: `1px solid ${isDark ? accent + '30' : accent + '22'}`,
        boxShadow: isDark ? `0 1px 4px ${accent}10` : `0 1px 3px ${accent}08`,
      }}
    >
      <div className="w-full h-full flex items-center justify-center">
        <Icon
          size={Math.min(Math.max(h * 0.35, 7), 14)}
          style={{ color: accent, opacity: isDark ? 0.6 : 0.45 }}
          strokeWidth={1.8}
        />
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
        style={{
          background: 'linear-gradient(135deg, var(--rb-surface) 0%, var(--rb-panel) 100%)',
        }}
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

  const visibleWidgets = widgets
    .filter(w => w && w.type)
    .slice(0, 30);

  const accentColor = isDark ? dominantMeta.accentDark : dominantMeta.accent;

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{
        background: isDark
          ? `linear-gradient(145deg, #0a1525 0%, #0d1a2d 50%, #0a1220 100%)`
          : `linear-gradient(145deg, #f8fafc 0%, #f1f5f9 50%, #e8eef5 100%)`,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: isDark
            ? `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)`
            : `radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)`,
          backgroundSize: '16px 16px',
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? `radial-gradient(ellipse at 30% 20%, ${accentColor}08 0%, transparent 60%)`
            : `radial-gradient(ellipse at 30% 20%, ${accentColor}06 0%, transparent 60%)`,
        }}
      />

      <div className="relative px-3 pt-3 pb-2" style={{ height: `${thumbH}px` }}>
        <div className="relative w-full" style={{ height: `${Math.min(totalGridH, thumbH - 12)}px` }}>
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
        className="absolute bottom-0 left-0 right-0 px-3 py-2.5"
        style={{
          background: isDark
            ? 'linear-gradient(to top, rgba(10,21,37,0.95) 0%, rgba(10,21,37,0.7) 60%, transparent 100%)'
            : 'linear-gradient(to top, rgba(248,250,252,0.95) 0%, rgba(248,250,252,0.7) 60%, transparent 100%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <dominantMeta.Icon size={11} style={{ color: accentColor, opacity: 0.7 }} strokeWidth={2} />
            <span className="text-[10px] font-bold" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)' }}>
              {catInfo.label}
            </span>
          </div>
          <span className="text-[9px] font-semibold tabular-nums" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)' }}>
            {total} widget{total !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
          {pills.map(([type, count]) => {
            const meta = WIDGET_META[type];
            if (!meta) return null;
            const pillColor = isDark ? meta.accentDark : meta.accent;
            return (
              <div key={type} className="flex items-center gap-1 px-1.5 py-0.5 rounded flex-shrink-0"
                style={{
                  background: isDark ? `${pillColor}15` : `${pillColor}10`,
                  border: `1px solid ${isDark ? pillColor + '20' : pillColor + '18'}`,
                }}
              >
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: pillColor }} />
                <span className="text-[7.5px] font-bold whitespace-nowrap"
                  style={{ color: isDark ? `${pillColor}cc` : pillColor }}
                >
                  {meta.label} ×{count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
