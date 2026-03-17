import { useState, useMemo, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Trash2, Search, LayoutGrid, BarChart3, FileText, X, Zap, Layers, Table2 } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useReportTemplates } from '../../Hooks/useReportBuilder';
import ReportThumbnail from './ReportThumbnail';

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

const STATUS_CONFIG = {
  draft: {
    color: '#6b7280',
    bg: '#f3f4f6',
    darkBg: 'rgba(100,116,139,0.15)',
    darkColor: '#94a3b8',
    label: 'Draft',
  },
  validated: {
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.06)',
    darkBg: 'rgba(34,211,238,0.08)',
    darkColor: '#22d3ee',
    label: 'Validated',
  },
  published: {
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
    darkBg: 'rgba(52,211,153,0.10)',
    darkColor: '#34d399',
    label: 'Published',
  },
};

const FILTER_TABS = ['all', 'draft', 'validated', 'published'];

const REPORT_TYPES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutGrid,
    description: 'Drag-and-drop canvas with widgets (charts, KPIs, gauges, tables)',
    color: '#0284c7',
  },
  {
    key: 'paginated',
    label: 'Paginated Report',
    icon: Table2,
    description: 'Professional A4 document with sections, tables, and KPI summaries',
    color: '#7c3aed',
  },
];

function CreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [reportType, setReportType] = useState('dashboard');
  const [submitting, setSubmitting] = useState(false);
  const shouldReduce = useReducedMotion();

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
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={shouldReduce ? false : { opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={shouldReduce ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{
          background: 'var(--rb-panel)',
          border: '1px solid var(--rb-border)',
          boxShadow: 'var(--rb-elevation-4)',
        }}
      >
        <div className="px-6 pt-5 pb-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--rb-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--rb-accent-subtle)' }}
            >
              <Plus size={16} style={{ color: 'var(--rb-accent)' }} />
            </div>
            <div>
              <h2 className="text-[13px] font-bold" style={{ color: 'var(--rb-text)' }}>Create New Report</h2>
              <p className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--rb-text-muted)' }}>New Template</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: 'var(--rb-text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-subtle)'; e.currentTarget.style.color = 'var(--rb-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--rb-text-muted)'; }}
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Report Type Selection */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--rb-accent)' }}>Report Type</label>
            <div className="grid grid-cols-2 gap-3">
              {REPORT_TYPES.map((rt) => {
                const selected = reportType === rt.key;
                return (
                  <button
                    key={rt.key}
                    type="button"
                    onClick={() => setReportType(rt.key)}
                    className="relative flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all duration-200"
                    style={{
                      border: `2px solid ${selected ? rt.color : 'var(--rb-border)'}`,
                      background: selected ? `${rt.color}08` : 'var(--rb-surface)',
                      boxShadow: selected ? `0 0 16px ${rt.color}20` : 'none',
                    }}
                  >
                    {selected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: rt.color }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${rt.color}15`, border: `1px solid ${rt.color}25` }}>
                      <rt.icon size={20} style={{ color: rt.color }} />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: selected ? rt.color : 'var(--rb-text)' }}>{rt.label}</div>
                      <div className="text-[9px] mt-0.5 leading-snug" style={{ color: 'var(--rb-text-muted)' }}>{rt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--rb-accent)' }}>Report Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Production Summary" autoFocus className="rb-input-base w-full" />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--rb-accent)' }}>Description (optional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." rows={2} className="rb-input-base w-full resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rb-btn-ghost">Cancel</button>
            <button type="submit" disabled={!name.trim() || submitting} className="rb-btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Creating...' : 'Create Report'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

const TemplateCard = forwardRef(function TemplateCard({ template, onOpen, onDuplicate, onDelete, index, shouldReduce }, ref) {
  const status = template.status || 'draft';
  const reportType = (() => {
    try {
      const lc = template?.layout_config;
      if (!lc) return 'dashboard';
      const parsed = typeof lc === 'string' ? JSON.parse(lc) : lc;
      return parsed?.reportType || 'dashboard';
    } catch { return 'dashboard'; }
  })();
  const widgetCount = (() => {
    try {
      const lc = template?.layout_config;
      if (!lc) return 0;
      const parsed = typeof lc === 'string' ? JSON.parse(lc) : lc;
      if (parsed?.reportType === 'paginated') return parsed?.paginatedSections?.length || 0;
      return parsed?.widgets?.length || 0;
    } catch { return 0; }
  })();

  return (
    <motion.div
      ref={ref}
      layout
      initial={shouldReduce ? false : { opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
      transition={shouldReduce ? { duration: 0 } : {
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group relative rounded-lg overflow-hidden cursor-pointer max-w-sm"
      style={{
        background: 'var(--rb-panel)',
        border: '1px solid var(--rb-border)',
        borderTop: `3px solid ${STATUS_CONFIG[status]?.color || '#6b7280'}`,
        borderRadius: 'var(--rb-radius-lg)',
        boxShadow: 'var(--rb-elevation-2)',
        transition: 'var(--transition-normal)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--rb-elevation-3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--rb-elevation-2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
      onClick={() => onOpen(template.id)}
    >
        <div className="relative h-36 w-full overflow-hidden">
          <ReportThumbnail template={template} />
          <div className="absolute top-3 right-3 z-10">
            <StatusBadge status={status} />
          </div>
        </div>

        <div className="p-4 pt-3 relative" style={{ borderTop: '1px solid var(--rb-border)' }}>
          <h3 className="text-sm font-bold truncate" style={{ color: 'var(--rb-text)' }}>{template.name}</h3>
          {template.description && (
            <p className="text-[10px] mt-1 line-clamp-2 leading-relaxed" style={{ color: 'var(--rb-text-muted)' }}>{template.description}</p>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-semibold tabular-nums uppercase tracking-wider" style={{ color: 'var(--rb-text-muted)' }}>{timeAgo(template.updated_at)}</span>
              {widgetCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold"
                  style={{
                    background: 'var(--rb-accent-subtle)',
                    color: 'var(--rb-accent)',
                    borderRadius: '4px',
                  }}
                >
                  <Layers size={8} />
                  {widgetCount}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold"
                style={{
                  background: reportType === 'paginated' ? 'rgba(124, 58, 237, 0.08)' : 'var(--rb-accent-subtle)',
                  color: reportType === 'paginated' ? '#7c3aed' : 'var(--rb-accent)',
                  borderRadius: '4px',
                }}
              >
                {reportType === 'paginated' ? <Table2 size={8} /> : <LayoutGrid size={8} />}
                {reportType === 'paginated' ? 'Paginated' : 'Dashboard'}
              </span>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(template.id); }}
                className="p-1.5 rounded-lg transition-all duration-150"
                style={{ color: 'var(--rb-text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-subtle)'; e.currentTarget.style.color = 'var(--rb-accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--rb-text-muted)'; }}
                title="Duplicate"
              >
                <Copy size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(template.id); }}
                className="p-1.5 rounded-lg transition-all duration-150"
                style={{ color: 'var(--rb-text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-danger-subtle)'; e.currentTarget.style.color = 'var(--rb-danger)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--rb-text-muted)'; }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
    </motion.div>
  );
});

function FilterTabs({ value, onChange }) {
  const tabsRef = useRef(null);
  const shouldReduce = useReducedMotion();

  return (
    <div ref={tabsRef} className="relative flex gap-1 p-1 rounded-xl"
      style={{
        background: 'var(--rb-surface)',
        border: '1px solid var(--rb-border)',
      }}
    >
      {FILTER_TABS.map((s) => {
        const isActive = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="relative px-3.5 py-1.5 text-[10px] font-bold rounded-lg capitalize z-10 uppercase tracking-wider"
            style={{
              color: isActive ? 'var(--rb-accent)' : 'var(--rb-text-muted)',
              background: isActive ? 'var(--rb-accent-subtle)' : 'transparent',
              border: isActive ? '1.5px solid var(--rb-accent)' : '1.5px solid var(--rb-border)',
              transition: shouldReduce ? 'none' : 'all 200ms cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

export default function ReportBuilderManager() {
  const navigate = useNavigate();
  const { templates, loading, createTemplate, deleteTemplate, duplicateTemplate, clearAllTemplates } = useReportTemplates();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const shouldReduce = useReducedMotion();

  const filtered = useMemo(() => {
    let list = templates;
    if (statusFilter !== 'all') list = list.filter((t) => (t.status || 'draft') === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }
    return list;
  }, [templates, search, statusFilter]);

  const getReportType = (t) => {
    try {
      const lc = typeof t?.layout_config === 'string' ? JSON.parse(t.layout_config) : (t?.layout_config || {});
      return lc.reportType || 'dashboard';
    } catch { return 'dashboard'; }
  };

  const handleOpen = (id) => {
    const t = templates.find((t) => t.id === id);
    const rt = getReportType(t);
    if (rt === 'paginated') navigate(`/report-builder/${id}/paginated`);
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

  return (
    <div className="report-builder min-h-[calc(100vh-80px)] p-6" style={{ background: 'var(--rb-canvas)' }}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'var(--rb-accent-subtle)',
                  border: '1px solid rgba(56, 189, 248, 0.15)',
                }}
              >
                <BarChart3 size={20} style={{ color: 'var(--rb-accent)' }} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--rb-text)' }}>
                  Report Builder
                </h1>
                <p className="text-[9px] uppercase tracking-widest font-semibold mt-0.5" style={{ color: 'var(--rb-text-muted)' }}>Template Manager</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-200"
                style={{
                  color: 'var(--rb-text-muted)',
                  border: '1px solid var(--rb-border)',
                  background: 'var(--rb-panel)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--rb-danger)';
                  e.currentTarget.style.color = 'var(--rb-danger)';
                  e.currentTarget.style.background = 'var(--rb-danger-subtle)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--rb-border)';
                  e.currentTarget.style.color = 'var(--rb-text-muted)';
                  e.currentTarget.style.background = 'var(--rb-panel)';
                }}
              >
                <Trash2 size={12} />
                Clear all
              </button>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="rb-btn-primary inline-flex items-center gap-2"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span className="text-[11px] font-bold uppercase tracking-wider">Create Report</span>
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row gap-3 mb-8 items-start sm:items-center"
        >
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rb-text-muted)' }} />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports..."
              className="rb-input-base w-full pl-9 pr-3 py-2.5"
            />
          </div>
          <FilterTabs value={statusFilter} onChange={setStatusFilter} />
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }}>
                <div className="h-48 relative overflow-hidden">
                  <div className="absolute inset-0 animate-pulse" style={{ background: 'var(--rb-surface)' }} />
                  <div className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, var(--rb-accent-subtle) 50%, transparent 100%)',
                      animation: 'shimmer 2s infinite',
                    }}
                  />
                </div>
                <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--rb-border)' }}>
                  <div className="h-3.5 rounded-full w-3/4 animate-pulse" style={{ background: 'var(--rb-border)' }} />
                  <div className="h-2.5 rounded-full w-1/2 animate-pulse" style={{ background: 'var(--rb-surface)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduce ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center justify-center py-28 text-center"
          >
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--rb-surface)',
                  border: '1px solid var(--rb-border)',
                }}
              >
                <FileText size={32} style={{ color: 'var(--rb-accent)', opacity: 0.6 }} />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: 'var(--rb-accent)',
                }}
              >
                <Zap size={12} style={{ color: 'white' }} />
              </div>
            </div>
            <h3 className="text-base font-extrabold mb-2" style={{ color: 'var(--rb-text)' }}>
              {search || statusFilter !== 'all' ? 'No matching reports' : 'No reports yet'}
            </h3>
            <p className="text-[11px] mb-8 max-w-sm leading-relaxed" style={{ color: 'var(--rb-text-muted)' }}>
              {search
                ? 'Try adjusting your search term or clearing filters'
                : 'Launch your first report to start building visual dashboards with drag-and-drop widgets'}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={() => setShowCreate(true)}
                className="rb-btn-primary inline-flex items-center gap-2"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Create Report</span>
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filtered.map((t, i) => (
                <TemplateCard key={t.id} template={t} index={i} onOpen={handleOpen} onDuplicate={duplicateTemplate} onDelete={handleDelete} shouldReduce={shouldReduce} />
              ))}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {showCreate && <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
