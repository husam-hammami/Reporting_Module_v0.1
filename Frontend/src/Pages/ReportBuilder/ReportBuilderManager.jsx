import { useState, useMemo, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Trash2, Search, LayoutGrid, BarChart3, FileText, X } from 'lucide-react';
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
  draft: { dot: 'bg-gray-400 dark:bg-gray-500', text: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800/60', label: 'Draft' },
  validated: { dot: 'bg-blue-500 dark:bg-blue-400', text: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/30', label: 'Validated' },
  published: { dot: 'bg-emerald-500 dark:bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', label: 'Published' },
};

const FILTER_TABS = ['all', 'draft', 'validated', 'published'];

function CreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const shouldReduce = useReducedMotion();

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try { await onCreate({ name: name.trim(), description: desc.trim() }); setName(''); setDesc(''); onClose(); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={shouldReduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={shouldReduce ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-xl border shadow-2xl p-6"
        style={{
          background: 'var(--rb-panel)',
          borderColor: 'var(--rb-border)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--rb-text)' }}>Create New Report</h2>
          <button onClick={onClose} className="p-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/40" style={{ color: 'var(--rb-text-muted)' }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--rb-text-muted)' }}>Report Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Production Summary" autoFocus className="rb-input-base w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--rb-text-muted)' }}>Description (optional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." rows={2} className="rb-input-base w-full resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} flex-shrink-0`} />
      {config.label}
    </span>
  );
}

const TemplateCard = forwardRef(function TemplateCard({ template, onOpen, onDuplicate, onDelete, index, shouldReduce }, ref) {
  const status = template.status || 'draft';
  const widgetCount = (() => {
    try {
      const lc = template?.layout_config;
      if (!lc) return 0;
      const parsed = typeof lc === 'string' ? JSON.parse(lc) : lc;
      return parsed?.widgets?.length || 0;
    } catch { return 0; }
  })();

  return (
    <motion.div
      ref={ref}
      layout
      initial={shouldReduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={shouldReduce ? { duration: 0 } : {
        duration: 0.35,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group relative rounded-xl overflow-hidden cursor-pointer max-w-sm"
      style={{
        background: 'var(--rb-panel)',
        border: '1px solid var(--rb-border)',
        boxShadow: 'var(--rb-elevation-1)',
        transition: 'box-shadow 250ms cubic-bezier(0.16,1,0.3,1), border-color 150ms ease, transform 250ms cubic-bezier(0.16,1,0.3,1)',
      }}
      whileHover={shouldReduce ? undefined : { y: -2, transition: { duration: 0.2 } }}
      onClick={() => onOpen(template.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--rb-elevation-3)';
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--rb-accent) 30%, var(--rb-border))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--rb-elevation-1)';
        e.currentTarget.style.borderColor = 'var(--rb-border)';
      }}
    >
      <div className="relative h-48 w-full overflow-hidden">
        <ReportThumbnail template={template} />
        <div className="absolute top-2.5 right-2.5">
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="p-4" style={{ borderTop: '1px solid var(--rb-border-subtle, var(--rb-border))' }}>
        <h3 className="text-[12px] font-semibold truncate" style={{ color: 'var(--rb-text)' }}>{template.name}</h3>
        {template.description && (
          <p className="text-[10px] mt-0.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--rb-text-muted)' }}>{template.description}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-medium tabular-nums" style={{ color: 'var(--rb-text-muted)' }}>{timeAgo(template.updated_at)}</span>
            {widgetCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold" style={{ background: 'var(--rb-accent-subtle)', color: 'var(--rb-accent)' }}>
                <LayoutGrid size={8} />
                {widgetCount}
              </span>
            )}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(template.id); }}
              className="p-1.5 rounded-md transition-colors duration-150"
              style={{ color: 'var(--rb-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-subtle)'; e.currentTarget.style.color = 'var(--rb-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--rb-text-muted)'; }}
              title="Duplicate"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(template.id); }}
              className="p-1.5 rounded-md transition-colors duration-150"
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
    <div ref={tabsRef} className="relative flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
      {FILTER_TABS.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className="relative px-3 py-1.5 text-[10px] font-semibold rounded-md capitalize z-10"
          style={{
            color: value === s ? 'var(--rb-accent)' : 'var(--rb-text-muted)',
            background: value === s ? 'var(--rb-accent-subtle)' : 'transparent',
            transition: shouldReduce ? 'none' : 'color 150ms ease, background 150ms ease',
          }}
        >
          {s}
        </button>
      ))}
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

  const handleOpen = (id) => navigate(`/report-builder/${id}`);
  const handleCreate = async (data) => {
    const created = await createTemplate(data);
    if (created?.id) navigate(`/report-builder/${created.id}`);
  };
  const handleDelete = (id) => { if (window.confirm('Delete this report? This cannot be undone.')) deleteTemplate(id); };
  const handleClearAll = () => {
    if (window.confirm('Remove all report templates? This cannot be undone.')) clearAllTemplates();
  };

  return (
    <div className="report-builder min-h-[calc(100vh-80px)] p-6" style={{ background: 'var(--rb-surface)' }}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6"
        >
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2.5" style={{ color: 'var(--rb-text)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--rb-accent-subtle)' }}>
                <BarChart3 size={18} style={{ color: 'var(--rb-accent)' }} />
              </div>
              Report Builder
            </h1>
            <p className="text-[11px] mt-1 ml-[42px]" style={{ color: 'var(--rb-text-muted)' }}>Design visual reports with drag-and-drop components</p>
          </div>
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-lg transition-all duration-150"
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
                <Trash2 size={13} />
                Clear all
              </button>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="rb-btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              Create Report
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={shouldReduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center"
        >
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rb-text-muted)' }} />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports..."
              className="rb-input-base w-full pl-9 pr-3 py-2"
            />
          </div>
          <FilterTabs value={statusFilter} onChange={setStatusFilter} />
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl overflow-hidden" style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }}>
                <div className="h-48" style={{ background: 'var(--rb-surface)' }} />
                <div className="p-4 space-y-2.5">
                  <div className="h-3 rounded w-3/4" style={{ background: 'var(--rb-border)' }} />
                  <div className="h-2.5 rounded w-1/2" style={{ background: 'var(--rb-surface)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduce ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
              <FileText size={28} style={{ color: 'var(--rb-text-muted)', opacity: 0.5 }} />
            </div>
            <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--rb-text)' }}>
              {search || statusFilter !== 'all' ? 'No matching reports' : 'No reports yet'}
            </h3>
            <p className="text-[11px] mb-6 max-w-xs leading-relaxed" style={{ color: 'var(--rb-text-muted)' }}>
              {search
                ? 'Try adjusting your search term or clearing filters'
                : 'Create your first report to start building visual dashboards with drag-and-drop widgets'}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={() => setShowCreate(true)} className="rb-btn-primary inline-flex items-center gap-1.5">
                <Plus size={14} />
                Create Report
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
