import { useMemo } from 'react';
import { BarChart3, Activity, Table2, Gauge, Container, Hash, Copy, Image, Type } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

/* ── Widget type → icon + accent colors ────────────────────────── */
const WIDGET_META = {
  kpi:      { Icon: Hash,      color: 'bg-teal-500',    dot: 'bg-teal-500',    pillBg: 'bg-teal-50 dark:bg-teal-900/20',       pillText: 'text-teal-700 dark:text-teal-300',     label: 'KPI' },
  stat:     { Icon: Activity,  color: 'bg-violet-500',  dot: 'bg-violet-500',  pillBg: 'bg-violet-50 dark:bg-violet-900/20',   pillText: 'text-violet-700 dark:text-violet-300', label: 'Stat' },
  chart:    { Icon: BarChart3, color: 'bg-emerald-500', dot: 'bg-emerald-500', pillBg: 'bg-emerald-50 dark:bg-emerald-900/20', pillText: 'text-emerald-700 dark:text-emerald-300', label: 'Chart' },
  barchart: { Icon: BarChart3, color: 'bg-emerald-500', dot: 'bg-emerald-500', pillBg: 'bg-emerald-50 dark:bg-emerald-900/20', pillText: 'text-emerald-700 dark:text-emerald-300', label: 'Bar' },
  table:    { Icon: Table2,    color: 'bg-blue-500',    dot: 'bg-blue-500',    pillBg: 'bg-blue-50 dark:bg-blue-900/20',       pillText: 'text-blue-700 dark:text-blue-300',     label: 'Table' },
  gauge:    { Icon: Gauge,     color: 'bg-amber-500',   dot: 'bg-amber-500',   pillBg: 'bg-amber-50 dark:bg-amber-900/20',     pillText: 'text-amber-700 dark:text-amber-300',   label: 'Gauge' },
  silo:     { Icon: Container, color: 'bg-cyan-500',    dot: 'bg-cyan-500',    pillBg: 'bg-cyan-50 dark:bg-cyan-900/20',       pillText: 'text-cyan-700 dark:text-cyan-300',     label: 'Silo' },
  image:    { Icon: Image,     color: 'bg-indigo-400',  dot: 'bg-indigo-400',  pillBg: 'bg-indigo-50 dark:bg-indigo-900/20',   pillText: 'text-indigo-700 dark:text-indigo-300', label: 'Image' },
  text:     { Icon: Type,      color: 'bg-slate-500',   dot: 'bg-slate-500',   pillBg: 'bg-slate-50 dark:bg-slate-900/20',     pillText: 'text-slate-700 dark:text-slate-300',   label: 'Text' },
  repeat:   { Icon: Copy,      color: 'bg-orange-500',  dot: 'bg-orange-500',  pillBg: 'bg-orange-50 dark:bg-orange-900/20',   pillText: 'text-orange-700 dark:text-orange-300', label: 'Repeat' },
};

/* ── Category → gradient + label ───────────────────────────────── */
const CATEGORY_GRADIENTS = {
  kpi:      { light: 'from-teal-50 via-cyan-50 to-sky-50',       dark: 'dark:from-[#0c3547] dark:via-[#134e5e] dark:to-[#0e3d4a]',   label: 'KPI Dashboard',      iconColor: 'text-teal-400 dark:text-teal-500' },
  stat:     { light: 'from-violet-50 via-indigo-50 to-blue-50',   dark: 'dark:from-[#1e1145] dark:via-[#1e2a5e] dark:to-[#162350]',   label: 'Statistics Panel',   iconColor: 'text-violet-400 dark:text-violet-500' },
  chart:    { light: 'from-indigo-50 via-blue-50 to-violet-50',   dark: 'dark:from-[#162350] dark:via-[#1a2744] dark:to-[#1e1b4b]',   label: 'Analytics Report',   iconColor: 'text-emerald-400 dark:text-emerald-600' },
  barchart: { light: 'from-indigo-50 via-blue-50 to-emerald-50',  dark: 'dark:from-[#162350] dark:via-[#1a2744] dark:to-[#0f3326]',   label: 'Chart Report',       iconColor: 'text-emerald-400 dark:text-emerald-600' },
  table:    { light: 'from-blue-50 via-indigo-50 to-slate-50',    dark: 'dark:from-[#172044] dark:via-[#1e2a5e] dark:to-[#1e293b]',   label: 'Data Report',        iconColor: 'text-blue-400 dark:text-blue-500' },
  gauge:    { light: 'from-amber-50 via-orange-50 to-yellow-50',  dark: 'dark:from-[#451a03] dark:via-[#4a2c0a] dark:to-[#3b2506]',   label: 'Process Monitor',    iconColor: 'text-amber-400 dark:text-amber-600' },
  silo:     { light: 'from-cyan-50 via-teal-50 to-sky-50',        dark: 'dark:from-[#083344] dark:via-[#164e63] dark:to-[#0e4457]',   label: 'Equipment Overview', iconColor: 'text-cyan-400 dark:text-cyan-600' },
  image:    { light: 'from-indigo-50 via-blue-50 to-slate-50',   dark: 'dark:from-[#1e1b4b] dark:via-[#172044] dark:to-[#1e293b]',   label: 'Visual Report',      iconColor: 'text-indigo-400 dark:text-indigo-500' },
  text:     { light: 'from-slate-50 via-gray-50 to-zinc-50',     dark: 'dark:from-[#1e293b] dark:via-[#1a2332] dark:to-[#171f2e]',   label: 'Text Report',        iconColor: 'text-slate-400 dark:text-slate-500' },
  repeat:   { light: 'from-orange-50 via-amber-50 to-yellow-50',  dark: 'dark:from-[#431407] dark:via-[#4a2c0a] dark:to-[#3b2506]',   label: 'Repeat Panel',       iconColor: 'text-orange-400 dark:text-orange-600' },
  mixed:    { light: 'from-sky-50 via-emerald-50 to-amber-50',    dark: 'dark:from-[#0c1929] dark:via-[#111d2e] dark:to-[#1a1c23]',   label: 'Mixed Report',       iconColor: 'text-slate-400 dark:text-slate-500' },
};

/**
 * Analyze widget composition to determine dominant type, pills, and gradient.
 */
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
  const pills = entries.slice(0, 4);
  const remaining = Math.max(0, entries.length - 4);

  // Determine if truly mixed (top type < 50% of total)
  const isMixed = entries.length > 2 && entries[0][1] / total < 0.5;
  const gradientKey = isMixed ? 'mixed' : dominant;
  const gradient = CATEGORY_GRADIENTS[gradientKey] || CATEGORY_GRADIENTS.mixed;

  return { dominant, pills, remaining, total, gradient, isMixed };
}

/**
 * Composition pill — colored dot + label + count.
 */
function CompositionPill({ type, count }) {
  const meta = WIDGET_META[type];
  if (!meta) return null;

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${meta.pillBg} flex-shrink-0`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} flex-shrink-0`} />
      <span className={`text-[8px] font-semibold ${meta.pillText} whitespace-nowrap`}>
        {meta.label}&nbsp;×{count}
      </span>
    </div>
  );
}

/**
 * Report thumbnail — composition summary design.
 * Shows a gradient hero with dominant type icon + composition strip with type pills.
 */
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

  /* ── Empty state ── */
  if (!composition) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0f172a] dark:to-[#1e293b] flex items-center justify-center">
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-6 py-4 flex flex-col items-center gap-1.5">
          <BarChart3 size={20} className="text-gray-300 dark:text-gray-600" />
          <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-600">Empty Report</span>
        </div>
      </div>
    );
  }

  const { dominant, pills, remaining, total, gradient } = composition;
  const DominantIcon = WIDGET_META[dominant]?.Icon || BarChart3;

  return (
    <div className={`w-full h-full relative bg-gradient-to-br ${gradient.light} ${gradient.dark} flex flex-col overflow-hidden`}>
      {/* ── Zone 1: Hero ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 relative min-h-0">
        {/* Watermark icon */}
        <div className="absolute bottom-2 right-3 pointer-events-none">
          <DominantIcon size={44} className={`${gradient.iconColor} opacity-[0.06]`} strokeWidth={1.5} />
        </div>

        {/* Frosted icon circle */}
        <div className="w-[52px] h-[52px] rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-sm border border-white/30 dark:border-white/10 flex items-center justify-center shadow-sm">
          <DominantIcon size={22} className={gradient.iconColor} strokeWidth={2} />
        </div>

        {/* Category label */}
        <span className="text-[11px] font-bold text-black/50 dark:text-white/60 tracking-wide text-center leading-tight">
          {gradient.label}
        </span>

        {/* Widget count pill */}
        <span className="text-[9px] font-semibold text-black/40 dark:text-white/45 bg-white/50 dark:bg-white/[0.07] backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-white/20 dark:border-white/10">
          {total} widget{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Zone 2: Composition Strip ── */}
      <div className="flex-shrink-0 bg-white/50 dark:bg-black/20 backdrop-blur-sm border-t border-black/[0.04] dark:border-white/[0.04] px-3 py-2 flex items-center gap-1.5 overflow-hidden">
        {pills.map(([type, count]) => (
          <CompositionPill key={type} type={type} count={count} />
        ))}
        {remaining > 0 && (
          <span className="text-[8px] font-semibold text-black/30 dark:text-white/30 whitespace-nowrap flex-shrink-0">
            +{remaining} more
          </span>
        )}
      </div>
    </div>
  );
}
