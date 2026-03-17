import { useState, useMemo, useContext, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Trash2, Search, LayoutGrid, FileText, X, Table2 } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useReportTemplates } from '../../Hooks/useReportBuilder';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import '../ReportBuilder/reportBuilderTheme.css';

function timeAgo(iso) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

const STATUS_CONFIG = {
  draft: {
    darkBg: 'rgba(100,116,139,0.15)', darkColor: '#94a3b8',
    lightBg: 'rgba(100,116,139,0.10)', lightColor: '#64748b',
    label: 'Draft',
  },
  released: {
    darkBg: 'rgba(52,211,153,0.10)', darkColor: '#34d399',
    lightBg: 'rgba(16,185,129,0.08)', lightColor: '#059669',
    label: 'Released',
  },
};

const FILTER_TABS = ['all', 'draft', 'released'];

const REPORT_TYPES = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, description: 'Drag-and-drop canvas with widgets (charts, KPIs, gauges, tables)', color: '#0284c7' },
  { key: 'paginated', label: 'Table Report', icon: Table2, description: 'Professional A4 document with sections, tables, and KPI summaries', color: '#475569' },
];

function CreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [reportType, setReportType] = useState('dashboard');
  const [submitting, setSubmitting] = useState(false);
  const t = useTheme();

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
              <h2 className="text-sm font-bold" style={{ color: t.text }}>Create New Report</h2>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>New Template</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textSecondary }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: t.accent }}>Report Type</label>
            <div className="grid grid-cols-2 gap-3">
              {REPORT_TYPES.map((rt) => {
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
                      <div className="text-xs font-bold" style={{ color: selected ? rt.color : t.text }}>{rt.label}</div>
                      <div className="text-[10px] mt-0.5 leading-snug" style={{ color: t.textSecondary }}>{rt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>Report Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Production Summary" autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
              style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>Description (optional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." rows={2}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none transition-colors"
              style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg transition-colors" style={{ color: t.textSecondary }}>Cancel</button>
            <button type="submit" disabled={!name.trim() || submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: t.accent, color: t.btnText }}>
              {submitting ? 'Creating...' : 'Create Report'}
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
  const { templates, loading, createTemplate, deleteTemplate, duplicateTemplate, clearAllTemplates } = useReportTemplates();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const t = useTheme();

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
  const handleDelete = (id) => { if (window.confirm('Delete this report? This cannot be undone.')) deleteTemplate(id); };
  const handleClearAll = () => {
    if (window.confirm('Remove all report templates? This cannot be undone.')) clearAllTemplates();
  };

  const sc = (status) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    return { bg: t.dark ? cfg.darkBg : cfg.lightBg, color: t.dark ? cfg.darkColor : cfg.lightColor };
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
            <h1 className="text-xl font-bold" style={{ color: t.text }}>Report Builder</h1>
            <p className="text-sm mt-1" style={{ color: t.textSecondary }}>Create and manage report templates</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: t.accent, color: t.btnText, '--tw-ring-color': t.accent, '--tw-ring-offset-color': t.pageBg }}>
            <Plus size={16} strokeWidth={2.5} /> New Report
          </button>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-6 mb-6 px-4 py-2.5 rounded-lg"
          style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          {[
            { label: 'Total', value: stats.total, color: t.accent },
            { label: 'Dashboards', value: stats.dashboards, color: t.dark ? '#38bdf8' : '#0284c7' },
            { label: 'Table Reports', value: stats.tableReports, color: t.dark ? '#94a3b8' : '#475569' },
            { label: 'Drafts', value: stats.drafts, color: t.dark ? '#94a3b8' : '#64748b' },
            { label: 'Released', value: stats.released, color: t.dark ? '#34d399' : '#059669' },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-1.5" style={i < arr.length - 1 ? { paddingRight: '1.5rem', borderRight: `1px solid ${t.border}` } : undefined}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-xs font-medium" style={{ color: t.textMuted }}>{s.label}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </motion.div>

        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: t.textMuted }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports..."
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
                  >{s}</button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {templates.length > 0 && (
              <button onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 shadow-sm"
                style={{ color: t.textSecondary, border: `1px solid ${t.border}`, background: t.surface }}>
                <Trash2 size={14} /> Clear all
              </button>
            )}
            <div className="flex items-center rounded-lg p-1 shadow-sm" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
              <button onClick={() => setViewMode('table')} className="p-2 rounded transition-colors"
                style={{ background: viewMode === 'table' ? t.accentBg : 'transparent', color: viewMode === 'table' ? t.accent : t.textSecondary }}
                onMouseEnter={(e) => { if (viewMode !== 'table') e.currentTarget.style.color = t.text; }}
                onMouseLeave={(e) => { if (viewMode !== 'table') e.currentTarget.style.color = t.textSecondary; }}
              >
                <FileText size={16} />
              </button>
              <button onClick={() => setViewMode('grid')} className="p-2 rounded transition-colors"
                style={{ background: viewMode === 'grid' ? t.accentBg : 'transparent', color: viewMode === 'grid' ? t.accent : t.textSecondary }}
                onMouseEnter={(e) => { if (viewMode !== 'grid') e.currentTarget.style.color = t.text; }}
                onMouseLeave={(e) => { if (viewMode !== 'grid') e.currentTarget.style.color = t.textSecondary; }}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-5 px-6 py-5" style={{ borderBottom: `1px solid ${t.border}` }}>
                <div className="w-16 h-12 rounded-lg animate-pulse" style={{ background: t.surfaceAlt }} />
                <div className="flex-1 space-y-3">
                  <div className="h-4 rounded w-48 animate-pulse" style={{ background: t.border }} />
                  <div className="h-3 rounded w-32 animate-pulse" style={{ background: t.surfaceAlt }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-32 text-center rounded-xl shadow-sm relative overflow-hidden"
            style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px', color: t.text }}></div>
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 relative z-10"
              style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, boxShadow: `0 8px 30px rgba(0,0,0,0.12)` }}>
              <FileText size={36} style={{ color: t.accent }} />
            </div>
            <h3 className="text-lg font-bold mb-2 relative z-10" style={{ color: t.text }}>
              {search || statusFilter !== 'all' ? 'No matching reports' : 'No reports yet'}
            </h3>
            <p className="text-sm mb-8 max-w-sm relative z-10" style={{ color: t.textSecondary }}>
              {search ? 'Try adjusting your search or filters to find what you are looking for.' : 'Get started by creating your first report template to monitor your data.'}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110 shadow-md hover:shadow-lg relative z-10"
                style={{ background: t.accent, color: t.btnText }}>
                <Plus size={16} /> Create First Report
              </button>
            )}
          </motion.div>
        ) : viewMode === 'table' ? (
          <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div className="grid grid-cols-[1.5fr_140px_140px_100px_120px_80px] items-center px-6 py-4 text-[11px] uppercase tracking-wider font-bold"
              style={{ color: t.textMuted, borderBottom: `1px solid ${t.border}`, background: t.dark ? 'rgba(10,15,26,0.5)' : 'rgba(0,0,0,0.02)' }}>
              <span>Report Name</span><span>Type</span><span>Status</span><span>Widgets</span><span>Modified</span><span className="text-right">Actions</span>
            </div>
            <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {filtered.map((tp) => {
              const { status, reportType, widgetCount } = getReportMeta(tp);
              const s = sc(status);
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
              return (
                <motion.div variants={itemVariants} key={tp.id} onClick={() => handleOpen(tp.id)}
                  className="grid grid-cols-[1.5fr_140px_140px_100px_120px_80px] items-center px-6 py-4 cursor-pointer transition-all duration-200 group"
                  style={{ borderBottom: `1px solid ${t.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.surfaceAlt, border: `1px solid ${t.border}` }}>
                      {reportType === 'paginated'
                        ? <Table2 size={16} style={{ color: t.textMuted }} strokeWidth={1.5} />
                        : <LayoutGrid size={16} style={{ color: t.textMuted }} strokeWidth={1.5} />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{tp.name || 'Untitled'}</p>
                      {tp.description && <p className="text-xs truncate mt-0.5" style={{ color: t.textSecondary }}>{tp.description}</p>}
                    </div>
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: t.textSecondary }}>
                    {reportType === 'paginated' ? 'Table Report' : 'Dashboard'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider w-fit px-2.5 py-1 rounded-md"
                    style={{ background: s.bg, color: s.color }}>{cfg.label}</span>
                  <span className="text-sm font-mono font-medium" style={{ color: t.textSecondary }}>{widgetCount}</span>
                  <span className="text-xs font-medium" style={{ color: t.textMuted }}>{timeAgo(tp.updated_at)}</span>
                  <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onClick={(e) => { e.stopPropagation(); duplicateTemplate(tp.id); }}
                      className="p-2 rounded-lg transition-colors hover:bg-white/10 hover:text-white" style={{ color: t.textSecondary }} title="Duplicate">
                      <Copy size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(tp.id); }}
                      className="p-2 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400" style={{ color: t.textSecondary }} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
            </motion.div>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((tp) => {
              const { status, reportType, widgetCount } = getReportMeta(tp);
              const s = sc(status);
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
              return (
                <motion.div variants={itemVariants} key={tp.id} onClick={() => handleOpen(tp.id)}
                  className="group rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1"
                  style={{ background: t.surface, border: `1px solid ${t.border}` }}>
                  <div className="p-5 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ background: t.surfaceAlt, border: `1px solid ${t.border}` }}>
                        {reportType === 'paginated'
                          ? <Table2 size={16} style={{ color: t.textMuted }} strokeWidth={1.5} />
                          : <LayoutGrid size={16} style={{ color: t.textMuted }} strokeWidth={1.5} />
                        }
                      </div>
                      <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ background: s.bg, color: s.color }}>{cfg.label}</span>
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{tp.name || 'Untitled'}</p>
                    {tp.description && <p className="text-[11px] mt-1 line-clamp-2 leading-relaxed" style={{ color: t.textSecondary }}>{tp.description}</p>}
                    <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${t.border}` }}>
                      <span className="text-[10px] font-medium" style={{ color: t.textMuted }}>{timeAgo(tp.updated_at)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium" style={{ color: t.textMuted }}>
                          {reportType === 'paginated' ? 'Table Report' : 'Dashboard'}
                        </span>
                        {widgetCount > 0 && (
                          <span className="text-[10px] font-medium tabular-nums" style={{ color: t.textMuted }}>
                            {widgetCount} widget{widgetCount !== 1 ? 's' : ''}
                          </span>
                        )}
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
      </div>
    </motion.div>
  );
}
