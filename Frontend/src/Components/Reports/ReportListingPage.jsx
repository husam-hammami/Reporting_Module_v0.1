import { useState, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutGrid, List, ChevronDown, Table2, BarChart2, Layers, Clock, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { useReportTemplates } from '../../Hooks/useReportBuilder';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { useLanguage } from '../../Hooks/useLanguage';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

/* ── Theme ──────────────────────────────────────────────────────────────────── */
function useTheme() {
  const { mode } = useContext(DarkModeContext);
  const dark = mode === 'dark';
  return {
    dark,
    pageBg: dark ? '#0a0f1a' : '#f3f4f6',
    surface: dark ? '#111827' : '#ffffff',
    surfaceAlt: dark ? '#0a0f1a' : '#f9fafb',
    border: dark ? '#1e293b' : '#e5e7eb',
    text: dark ? '#f0f4f8' : '#111827',
    textSecondary: dark ? '#8899ab' : '#6b7280',
    textMuted: dark ? '#556677' : '#9ca3af',
    accent: dark ? '#22d3ee' : '#0369a1',
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    hoverBg: dark ? 'rgba(10,15,26,0.4)' : 'rgba(0,0,0,0.03)',
    cardHoverBorder: dark ? 'rgba(34,211,238,0.3)' : 'rgba(3,105,161,0.25)',
    inputBg: dark ? '#111827' : '#ffffff',
  };
}

function timeAgo(iso, tr) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return tr('builder.justNow');
  if (m < 60) return `${m}${tr('builder.mAgo')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${tr('builder.hAgo')}`;
  return `${Math.floor(h / 24)}${tr('builder.dAgo')}`;
}

function getReportMeta(template) {
  const status = template.status || 'draft';
  let reportType = 'dashboard';
  let widgetCount = 0;
  try {
    const lc = template?.layout_config;
    if (lc) {
      const parsed = typeof lc === 'string' ? JSON.parse(lc) : lc;
      reportType = parsed?.reportType || 'dashboard';
      widgetCount = parsed?.reportType === 'paginated'
        ? (parsed?.paginatedSections?.length || 0)
        : (parsed?.widgets?.length || 0);
    }
  } catch {}
  return { status, reportType, widgetCount };
}

const SORT_OPTIONS = [
  { key: 'date-desc', labelKey: 'viewer.sortByNewest' },
  { key: 'date-asc', labelKey: 'viewer.sortByOldest' },
  { key: 'name-asc', labelKey: 'viewer.sortByName' },
  { key: 'name-desc', labelKey: 'viewer.sortByNameDesc' },
  { key: 'widgets-desc', labelKey: 'viewer.sortByWidgets' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, duration: 0.3 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/* ── Main Component ─────────────────────────────────────────────────────────── */
export default function ReportListingPage({ title, subtitle, filterType, baseRoute, icon: Icon }) {
  const navigate = useNavigate();
  const { templates, loading } = useReportTemplates();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [viewMode, setViewMode] = useState('grid');
  const [sortOpen, setSortOpen] = useState(false);
  const t = useTheme();
  const { t: tr } = useLanguage();

  const filtered = useMemo(() => {
    let list = templates.filter(tp => {
      const { reportType } = getReportMeta(tp);
      const matchesType = filterType === 'dashboard'
        ? reportType !== 'paginated'
        : reportType === 'paginated';
      return matchesType;
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tp =>
        tp.name?.toLowerCase().includes(q) ||
        tp.description?.toLowerCase().includes(q)
      );
    }

    const [field, dir] = sortBy.split('-');
    list = [...list].sort((a, b) => {
      if (field === 'name') {
        const cmp = (a.name || '').localeCompare(b.name || '');
        return dir === 'asc' ? cmp : -cmp;
      }
      if (field === 'date') {
        const cmp = new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
        return dir === 'asc' ? cmp : -cmp;
      }
      if (field === 'widgets') {
        const cmp = getReportMeta(a).widgetCount - getReportMeta(b).widgetCount;
        return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });

    return list;
  }, [templates, filterType, search, sortBy]);

  const typeColor = filterType === 'dashboard'
    ? (t.dark ? '#38bdf8' : '#0284c7')
    : (t.dark ? '#f87171' : '#991b1b');  // muted dark red — matches badge

  const statusColor = t.dark ? '#34d399' : '#059669';
  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sortBy)?.labelKey || '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="report-builder min-h-[calc(100vh-72px)]"
      style={{ background: t.pageBg }}
    >
      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${t.border}` }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: t.accentBg }}>
            <Icon size={16} style={{ color: t.accent }} />
          </div>
          <div>
            <h1 className="text-[16px] font-bold" style={{ color: t.text }}>{title}</h1>
            <p className="text-[11px]" style={{ color: t.textMuted }}>{subtitle}</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="px-6 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt }}>
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: t.textMuted }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tr('viewer.searchReports')}
            className="w-full ps-9 pe-3 py-1.5 rounded-lg text-[11px] focus:outline-none focus:ring-2"
            style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, '--tw-ring-color': t.accent }}
          />
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.textSecondary }}
          >
            {tr(currentSortLabel)}
            <ChevronDown size={12} />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
              <div className="absolute z-50 mt-1 end-0 w-44 rounded-lg shadow-xl overflow-hidden"
                style={{ background: t.surface, border: `1px solid ${t.border}` }}>
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key}
                    onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                    className="w-full text-start px-3 py-2 text-[11px] transition-colors"
                    style={{
                      color: sortBy === opt.key ? t.accent : t.textSecondary,
                      background: sortBy === opt.key ? t.accentBg : 'transparent',
                    }}
                    onMouseEnter={e => { if (sortBy !== opt.key) e.currentTarget.style.background = t.hoverBg; }}
                    onMouseLeave={e => { if (sortBy !== opt.key) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {tr(opt.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Count badge */}
        <span className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: t.accentBg, color: t.accent }}>
          {filtered.length} {tr('viewer.reports')}
        </span>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden ms-auto" style={{ border: `1px solid ${t.border}` }}>
          {[
            { mode: 'grid', icon: LayoutGrid, label: tr('viewer.gridView') },
            { mode: 'list', icon: List, label: tr('viewer.listView') },
          ].map(v => (
            <button key={v.mode}
              onClick={() => setViewMode(v.mode)}
              className="p-1.5 transition-colors"
              title={v.label}
              style={{
                background: viewMode === v.mode ? t.accent : 'transparent',
                color: viewMode === v.mode ? (t.dark ? '#0a0f1a' : '#fff') : t.textMuted,
              }}>
              <v.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-6 py-4">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg overflow-hidden animate-pulse" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
                <div className="h-[3px]" style={{ background: t.surfaceAlt }} />
                <div className="px-4 py-3.5 space-y-2.5">
                  <div className="flex justify-between">
                    <div className="h-3.5 rounded w-2/3" style={{ background: t.surfaceAlt }} />
                    <div className="h-3 rounded w-14" style={{ background: t.surfaceAlt }} />
                  </div>
                  <div className="h-2.5 rounded w-4/5" style={{ background: t.surfaceAlt }} />
                  <div className="h-px" style={{ background: t.border }} />
                  <div className="flex justify-between">
                    <div className="h-3 rounded w-16" style={{ background: t.surfaceAlt }} />
                    <div className="h-3 rounded w-12" style={{ background: t.surfaceAlt }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: t.accentBg }}>
              <FileText size={24} style={{ color: t.accent }} />
            </div>
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: t.text }}>
              {search ? tr('viewer.noMatchingReports') : tr('viewer.noReleasedReports')}
            </h3>
            <p className="text-[12px] max-w-sm mx-auto" style={{ color: t.textMuted }}>
              {search ? tr('viewer.adjustSearch') : tr('viewer.releaseFromBuilder')}
            </p>
          </div>
        )}

        {/* ═══ Grid view — Builder-style info cards (no thumbnails) ═══ */}
        {!loading && filtered.length > 0 && viewMode === 'grid' && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          >
            {filtered.map(tp => {
              const { widgetCount } = getReportMeta(tp);
              return (
                <motion.button
                  key={tp.id}
                  variants={itemVariants}
                  onClick={() => navigate(`${baseRoute}/${tp.id}`)}
                  className="text-start rounded-lg overflow-hidden transition-all duration-200 group"
                  style={{ background: t.surface, border: `1px solid ${t.border}` }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = t.cardHoverBorder; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {/* Accent bar */}
                  <div className="h-[3px]" style={{ background: typeColor }} />

                  {/* Card content */}
                  <div className="px-4 py-3.5">
                    {/* Title + status badge */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="text-[13px] font-semibold truncate" style={{ color: t.text }}>
                        {tp.name || 'Untitled'}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0"
                        style={{ background: `${statusColor}15`, color: statusColor }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                        Released
                      </span>
                    </div>

                    {/* Description */}
                    {tp.description ? (
                      <p className="text-[11px] line-clamp-2 mb-3 leading-relaxed" style={{ color: t.textMuted }}>
                        {tp.description}
                      </p>
                    ) : (
                      <div className="mb-3" />
                    )}

                    {/* Footer — type + count + time */}
                    <div className="flex items-center justify-between pt-2.5" style={{ borderTop: `1px solid ${t.border}` }}>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{
                          color: filterType === 'dashboard' ? typeColor : (t.dark ? '#f87171' : '#991b1b'),
                          background: filterType === 'dashboard' ? `${typeColor}10` : (t.dark ? 'rgba(248,113,113,0.08)' : 'rgba(153,27,27,0.06)'),
                        }}>
                        {filterType === 'dashboard' ? <BarChart2 size={10} /> : <Table2 size={10} />}
                        {filterType === 'dashboard' ? tr('viewer.dashboardType') : tr('viewer.tableType')}
                      </span>
                      <div className="flex items-center gap-2.5">
                        {widgetCount > 0 && (
                          <span className="text-[10px] font-medium flex items-center gap-1" style={{ color: t.textSecondary }}>
                            <Layers size={10} /> {widgetCount} {widgetCount === 1 ? tr('viewer.item') : tr('viewer.items')}
                          </span>
                        )}
                        <span className="text-[10px] flex items-center gap-1" style={{ color: t.textMuted }}>
                          <Clock size={10} /> {timeAgo(tp.updated_at, tr)}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* ═══ List view ═══ */}
        {!loading && filtered.length > 0 && viewMode === 'list' && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${t.border}` }}
          >
            {/* List header */}
            <div className="grid grid-cols-[1fr_80px_100px] px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: t.surfaceAlt, color: t.textMuted, borderBottom: `1px solid ${t.border}` }}>
              <span>{tr('common.name')}</span>
              <span className="text-center">{tr('viewer.widgets')}</span>
              <span className="text-end">{tr('viewer.modified')}</span>
            </div>
            {filtered.map(tp => {
              const { widgetCount } = getReportMeta(tp);
              return (
                <motion.button
                  key={tp.id}
                  variants={itemVariants}
                  onClick={() => navigate(`${baseRoute}/${tp.id}`)}
                  className="w-full grid grid-cols-[1fr_80px_100px] items-center px-4 py-3 text-start transition-colors"
                  style={{ borderBottom: `1px solid ${t.border}`, background: t.surface }}
                  onMouseEnter={e => e.currentTarget.style.background = t.hoverBg}
                  onMouseLeave={e => e.currentTarget.style.background = t.surface}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: typeColor }} />
                    <div className="min-w-0">
                      <h3 className="text-[12px] font-semibold truncate" style={{ color: t.text }}>
                        {tp.name || 'Untitled'}
                      </h3>
                      {tp.description && (
                        <p className="text-[10px] truncate" style={{ color: t.textMuted }}>
                          {tp.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-center" style={{ color: t.textSecondary }}>
                    {widgetCount}
                  </span>
                  <span className="text-[10px] text-end" style={{ color: t.textMuted }}>
                    {timeAgo(tp.updated_at, tr)}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
