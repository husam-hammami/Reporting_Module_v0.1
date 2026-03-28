import { useState, useMemo, useContext, forwardRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Trash2, Search, LayoutGrid, FileText, X, Layers, Table2, Clock, ArrowUpRight, MoreVertical, Filter, List, Send } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useReportTemplates } from '../../Hooks/useReportBuilder';
import ReportThumbnail from './ReportThumbnail';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import ConfirmationModal from '../../Components/Common/ConfirmationModal';
import { useLanguage } from '../../Hooks/useLanguage';
import '../ReportBuilder/reportBuilderTheme.css';

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
    accentHover: dark ? '#06b6d4' : '#075985',
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    hoverBg: dark ? 'rgba(10,15,26,0.4)' : 'rgba(0,0,0,0.03)',
    cardHoverBorder: dark ? 'rgba(34,211,238,0.3)' : 'rgba(3,105,161,0.25)',
    inputBg: dark ? '#111827' : '#ffffff',
    modalBg: dark ? '#111827' : '#ffffff',
    modalInputBg: dark ? '#0a0f1a' : '#f9fafb',
    btnGhostHover: dark ? '#1a2233' : '#f3f4f6',
    btnText: dark ? '#0a0f1a' : '#ffffff',
  };
}

const STATUS_CONFIG_STATIC = {
  draft: {
    darkBg: 'rgba(100,116,139,0.15)', darkColor: '#94a3b8',
    lightBg: '#f1f5f9', lightColor: '#475569',
    labelKey: 'builder.draft',
  },
  released: {
    darkBg: 'rgba(16,185,129,0.12)', darkColor: '#34d399',
    lightBg: '#ecfdf5', lightColor: '#047857',
    labelKey: 'builder.released',
  },
};

const FILTER_TABS = ['all', 'draft', 'released'];

const REPORT_TYPES_STATIC = [
  { key: 'dashboard', labelKey: 'builder.dashboard', icon: LayoutGrid, descKey: 'builder.dashboardDesc', color: '#0369a1', darkColor: '#38bdf8' },
  { key: 'paginated', labelKey: 'builder.tableReport', icon: Table2, descKey: 'builder.tableReportDesc', color: '#991b1b', darkColor: '#f87171' },
];

function CreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [reportType, setReportType] = useState('dashboard');
  const [submitting, setSubmitting] = useState(false);
  const t = useTheme();
  const { t: tr } = useLanguage();

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try { await onCreate({ name: name.trim(), description: desc.trim(), reportType }); setName(''); setDesc(''); setReportType('dashboard'); onClose(); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl"
        style={{ background: t.modalBg, border: `1px solid ${t.border}` }}>
        <div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: t.accentBg }}>
              <Plus size={16} style={{ color: t.accent }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: t.text }}>{tr('builder.createNewReport')}</h2>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>{tr('builder.newTemplate')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textSecondary }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: t.accent }}>{tr('builder.reportType')}</label>
            <div className="grid grid-cols-2 gap-3">
              {REPORT_TYPES_STATIC.map((rt) => {
                const selected = reportType === rt.key;
                return (
                  <button key={rt.key} type="button" onClick={() => setReportType(rt.key)}
                    className="relative flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all duration-200"
                    style={{ border: `2px solid ${selected ? rt.color : t.border}`, background: selected ? `${rt.color}08` : t.modalInputBg }}>
                    {selected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: rt.color }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${rt.color}15`, border: `1px solid ${rt.color}25` }}>
                      <rt.icon size={20} style={{ color: rt.color }} />
                    </div>
                    <div>
                      <div className="text-xs font-bold" style={{ color: selected ? rt.color : t.text }}>{tr(rt.labelKey)}</div>
                      <div className="text-[10px] mt-0.5 leading-snug" style={{ color: t.textSecondary }}>{tr(rt.descKey)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>{tr('builder.reportName')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Production Summary" autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
              style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>{tr('builder.descriptionOptional')}</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." rows={2}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none transition-colors"
              style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg transition-colors" style={{ color: t.textSecondary }}>{tr('common.cancel')}</button>
            <button type="submit" disabled={!name.trim() || submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: t.accent, color: t.btnText }}>
              {submitting ? tr('builder.creating') : tr('builder.createReport')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
      widgetCount = parsed?.reportType === 'paginated' ? (parsed?.paginatedSections?.length || 0) : (parsed?.widgets?.length || 0);
    }
  } catch {}
  return { status, reportType, widgetCount };
}

export default function ReportBuilderManager() {
  const navigate = useNavigate();
  const { templates, loading, createTemplate, deleteTemplate, duplicateTemplate, clearAllTemplates, updateTemplateStatus } = useReportTemplates();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const t = useTheme();
  const { t: tr } = useLanguage();

  const filtered = useMemo(() => {
    let list = templates;
    if (statusFilter !== 'all') list = list.filter((tp) => (tp.status || 'draft') === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((tp) => tp.name?.toLowerCase().includes(q) || tp.description?.toLowerCase().includes(q));
    }
    return list;
  }, [templates, search, statusFilter]);

  const stats = useMemo(() => {
    const total = templates.length;
    const drafts = templates.filter(tp => (tp.status || 'draft') === 'draft').length;
    const released = templates.filter(tp => tp.status === 'released').length;
    let dashboards = 0;
    let tableReports = 0;
    templates.forEach(tp => {
      const { reportType } = getReportMeta(tp);
      if (reportType === 'paginated') tableReports++;
      else dashboards++;
    });
    return { total, drafts, released, dashboards, tableReports };
  }, [templates]);

  const handleOpen = (id) => {
    const tp = templates.find((x) => x.id === id);
    const { reportType } = getReportMeta(tp);
    if (reportType === 'paginated') navigate(`/report-builder/${id}/paginated`);
    else navigate(`/report-builder/${id}`);
  };
  const handleCreate = async (data) => {
    const reportType = data.reportType || 'dashboard';
    const layoutConfig = reportType === 'paginated'
      ? { reportType: 'paginated', paginatedSections: [], widgets: [], grid: { cols: 12, rowHeight: 40 } }
      : { widgets: [], grid: { cols: 12, rowHeight: 40 } };
    const created = await createTemplate({ name: data.name, description: data.description, layout_config: layoutConfig });
    if (created?.id) {
      if (reportType === 'paginated') navigate(`/report-builder/${created.id}/paginated`);
      else navigate(`/report-builder/${created.id}`);
    }
  };
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', description: '', onConfirm: null, confirmText: '', confirmColor: 'brand' });
  const handleDelete = (id) => {
    setConfirmModal({ open: true, title: tr('builder.deleteReport'), description: tr('builder.deleteReportConfirm'), confirmText: tr('common.delete'), confirmColor: 'red', onConfirm: () => { deleteTemplate(id); setConfirmModal(m => ({ ...m, open: false })); } });
  };
  const handleClearAll = () => {
    setConfirmModal({ open: true, title: tr('builder.removeAll'), description: tr('builder.removeAllConfirm'), confirmText: tr('builder.removeAllBtn'), confirmColor: 'red', onConfirm: () => { clearAllTemplates(); setConfirmModal(m => ({ ...m, open: false })); } });
  };

  const sc = (status) => {
    const cfg = STATUS_CONFIG_STATIC[status] || STATUS_CONFIG_STATIC.draft;
    return { bg: t.dark ? cfg.darkBg : cfg.lightBg, color: t.dark ? cfg.darkColor : cfg.lightColor };
  };

  const tc = (reportType) => {
    const rt = REPORT_TYPES_STATIC.find(r => r.key === reportType) || REPORT_TYPES_STATIC[0];
    return t.dark ? rt.darkColor : rt.color;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05, duration: 0.4 } }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.4 }}
      className="report-builder min-h-[calc(100vh-72px)]" 
      style={{ background: t.pageBg }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 lg:px-12 py-6 md:py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold" style={{ color: t.text }}>{tr('builder.title')}</h1>
            <p className="text-sm mt-1" style={{ color: t.textSecondary }}>{tr('builder.subtitle')}</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: t.accent, color: t.btnText, '--tw-ring-color': t.accent, '--tw-ring-offset-color': t.pageBg }}>
            <Plus size={14} strokeWidth={2} /> {tr('builder.newReport')}
          </button>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-6 mb-6 px-4 py-2.5 rounded-lg"
          style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          {[
            { label: tr('builder.total'), value: stats.total, color: t.accent },
            { label: tr('builder.dashboards'), value: stats.dashboards, color: t.dark ? '#38bdf8' : '#0284c7' },
            { label: tr('builder.tableReports'), value: stats.tableReports, color: t.dark ? '#f87171' : '#991b1b' },
            { label: tr('builder.drafts'), value: stats.drafts, color: t.dark ? '#94a3b8' : '#64748b' },
            { label: tr('builder.released'), value: stats.released, color: t.dark ? '#34d399' : '#059669' },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-1.5" style={i < arr.length - 1 ? { paddingRight: '1.5rem', borderRight: `1px solid ${t.border}` } : undefined}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-xs font-medium" style={{ color: t.textMuted }}>{s.label}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </motion.div>

        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: t.textMuted }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('builder.searchReports')}
                className="w-80 pl-10 pr-4 py-2.5 rounded-lg text-sm focus:outline-none transition-all shadow-sm focus:ring-2 focus:border-transparent"
                style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, '--tw-ring-color': t.accentBg }} />
            </div>
            <div className="flex items-center rounded-lg p-1 shadow-sm" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
              {FILTER_TABS.map(s => {
                const isActive = statusFilter === s;
                return (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-md capitalize transition-all"
                    style={{
                      background: isActive ? t.accentBg : 'transparent',
                      color: isActive ? t.accent : t.textSecondary,
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = t.text; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = t.textSecondary; }}
                  >{s === 'all' ? tr('builder.all') : s === 'draft' ? tr('builder.draft') : tr('builder.released')}</button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {templates.length > 0 && (
              <button onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 shadow-sm"
                style={{ color: t.textSecondary, border: `1px solid ${t.border}`, background: t.surface }}>
                <Trash2 size={12} /> {tr('builder.clearAll')}
              </button>
            )}
            <div className="flex items-center rounded-md p-0.5" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
              <button onClick={() => setViewMode('table')} className="p-1.5 rounded transition-colors"
                style={{ background: viewMode === 'table' ? t.accentBg : 'transparent', color: viewMode === 'table' ? t.accent : t.textMuted }}
                title={tr('builder.listView')}>
                <List size={14} />
              </button>
              <button onClick={() => setViewMode('grid')} className="p-1.5 rounded transition-colors"
                style={{ background: viewMode === 'grid' ? t.accentBg : 'transparent', color: viewMode === 'grid' ? t.accent : t.textMuted }}
                title={tr('builder.gridView')}>
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg overflow-hidden" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: `1px solid ${t.border}` }}>
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded w-44 animate-pulse" style={{ background: t.border }} />
                  <div className="h-2.5 rounded w-28 animate-pulse" style={{ background: t.surfaceAlt }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-lg"
            style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <FileText size={24} style={{ color: t.textMuted, marginBottom: 12 }} />
            <h3 className="text-sm font-semibold mb-1" style={{ color: t.text }}>
              {search || statusFilter !== 'all' ? tr('builder.noMatchingReports') : tr('builder.noReportsYet')}
            </h3>
            <p className="text-xs mb-5 max-w-xs" style={{ color: t.textSecondary }}>
              {search ? tr('builder.adjustSearch') : tr('builder.createFirst')}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs transition-colors"
                style={{ background: t.accent, color: t.btnText }}>
                <Plus size={14} /> {tr('builder.newReport')}
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* ── LIST VIEW ── */
          <div className="rounded-lg overflow-hidden" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div className="grid grid-cols-[1.5fr_130px_100px_70px_100px_70px] items-center px-5 py-2.5 text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: t.textMuted, borderBottom: `1px solid ${t.border}`, background: t.dark ? 'rgba(10,15,26,0.5)' : '#f8fafc' }}>
              <span>{tr('builder.name')}</span><span>{tr('builder.type')}</span><span>{tr('builder.status')}</span><span>{tr('builder.items')}</span><span>{tr('builder.modified')}</span><span className="text-right">{tr('common.actions')}</span>
            </div>
            <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {filtered.map((tp, idx) => {
              const { status, reportType, widgetCount } = getReportMeta(tp);
              const s = sc(status);
              const cfg = STATUS_CONFIG_STATIC[status] || STATUS_CONFIG_STATIC.draft;
              const typeColor = tc(reportType);
              return (
                <motion.div variants={itemVariants} key={tp.id} onClick={() => handleOpen(tp.id)}
                  className="grid grid-cols-[1.5fr_130px_100px_70px_100px_70px] items-center px-5 py-3 cursor-pointer transition-colors duration-150 group relative"
                  style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${t.border}` : 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                  {/* Colored left accent */}
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: typeColor }} />
                  <div className="min-w-0 pl-2">
                    <p className="text-[13px] font-semibold truncate" style={{ color: t.text }}>{tp.name || tr('builder.untitled')}</p>
                    {tp.description && <p className="text-[11px] truncate mt-0.5" style={{ color: t.textMuted }}>{tp.description}</p>}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded"
                    style={{
                      color: reportType === 'paginated' ? (t.dark ? '#f87171' : '#991b1b') : typeColor,
                      background: reportType === 'paginated' ? (t.dark ? 'rgba(248,113,113,0.08)' : 'rgba(153,27,27,0.06)') : `${typeColor}10`,
                    }}>
                    {reportType === 'paginated' ? <Table2 size={11} /> : <LayoutGrid size={11} />}
                    {reportType === 'paginated' ? tr('builder.tableReport') : tr('builder.dashboard')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded"
                    style={{ background: s.bg, color: s.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                    {tr(cfg.labelKey)}
                  </span>
                  <span className="text-[12px] font-medium tabular-nums" style={{ color: t.textSecondary }}>{widgetCount}</span>
                  <span className="text-[11px]" style={{ color: t.textMuted }}>{timeAgo(tp.updated_at, tr)}</span>
                  <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); updateTemplateStatus(tp.id, status === 'released' ? 'draft' : 'released'); }}
                      className="p-1.5 rounded transition-colors" style={{ color: status === 'released' ? '#059669' : t.textMuted }}
                      title={status === 'released' ? tr('builder.unrelease') : tr('builder.release')}
                      onMouseEnter={(e) => e.currentTarget.style.color = status === 'released' ? '#dc2626' : '#059669'}
                      onMouseLeave={(e) => e.currentTarget.style.color = status === 'released' ? '#059669' : t.textMuted}>
                      <Send size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); duplicateTemplate(tp.id); }}
                      className="p-1.5 rounded transition-colors" style={{ color: t.textMuted }} title={tr('builder.duplicate')}
                      onMouseEnter={(e) => e.currentTarget.style.color = t.text}
                      onMouseLeave={(e) => e.currentTarget.style.color = t.textMuted}>
                      <Copy size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(tp.id); }}
                      className="p-1.5 rounded transition-colors hover:text-red-500" style={{ color: t.textMuted }} title={tr('common.delete')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
            </motion.div>
          </div>
        ) : (
          /* ── GRID VIEW ── cards with colored top bar */
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((tp) => {
              const { status, reportType, widgetCount } = getReportMeta(tp);
              const s = sc(status);
              const cfg = STATUS_CONFIG_STATIC[status] || STATUS_CONFIG_STATIC.draft;
              const typeColor = tc(reportType);
              return (
                <motion.div variants={itemVariants} key={tp.id} onClick={() => handleOpen(tp.id)}
                  className="group rounded-lg overflow-hidden cursor-pointer transition-all duration-150"
                  style={{ background: t.surface, border: `1px solid ${t.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.dark ? '#334155' : '#c7d2de'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = 'none'; }}>
                  {/* Colored top bar */}
                  <div className="h-1" style={{ background: typeColor }} />
                  <div className="px-4 py-3.5">
                    {/* Title row with status badge */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: t.text }}>{tp.name || tr('builder.untitled')}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 px-2 py-0.5 rounded"
                        style={{ background: s.bg, color: s.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                        {tr(cfg.labelKey)}
                      </span>
                    </div>
                    {tp.description && <p className="text-[11px] line-clamp-2 mb-3 leading-relaxed" style={{ color: t.textMuted }}>{tp.description}</p>}
                    {!tp.description && <div className="mb-3" />}
                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2.5" style={{ borderTop: `1px solid ${t.border}` }}>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{
                          color: reportType === 'paginated' ? (t.dark ? '#f87171' : '#991b1b') : typeColor,
                          background: reportType === 'paginated' ? (t.dark ? 'rgba(248,113,113,0.08)' : 'rgba(153,27,27,0.06)') : `${typeColor}10`,
                        }}>
                        {reportType === 'paginated' ? <Table2 size={10} /> : <LayoutGrid size={10} />}
                        {reportType === 'paginated' ? tr('builder.tableReport') : tr('builder.dashboard')}
                      </span>
                      <div className="flex items-center gap-2.5">
                        {widgetCount > 0 && (
                          <span className="text-[10px] font-medium" style={{ color: t.textSecondary }}>{widgetCount} {tr('builder.items').toLowerCase()}</span>
                        )}
                        <span className="text-[10px]" style={{ color: t.textMuted }}>{timeAgo(tp.updated_at, tr)}</span>
                        <button onClick={(e) => { e.stopPropagation(); updateTemplateStatus(tp.id, status === 'released' ? 'draft' : 'released'); }}
                          className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                          style={{ color: status === 'released' ? '#059669' : t.textMuted }}
                          title={status === 'released' ? tr('builder.unrelease') : tr('builder.release')}>
                          <Send size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <AnimatePresence>
          {showCreate && <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
        </AnimatePresence>

        <ConfirmationModal
          isOpen={confirmModal.open}
          title={confirmModal.title}
          description={confirmModal.description}
          onConfirm={confirmModal.onConfirm || (() => {})}
          onCancel={() => setConfirmModal(m => ({ ...m, open: false }))}
          confirmText={confirmModal.confirmText}
          confirmColor={confirmModal.confirmColor}
        />
      </div>
    </motion.div>
  );
}
