import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Trash2, Search, LayoutGrid, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReportTemplates } from '../../Hooks/useReportBuilder';
import ReportThumbnail from './ReportThumbnail';

/* ── Helpers ───────────────────────────────────────────────────── */

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

const STATUS_STYLE = {
  draft: 'text-gray-400 bg-gray-500/10',
  validated: 'text-brand bg-[#0e74901a]',
  published: 'text-emerald-500 bg-emerald-500/10',
};

/* ── Create Modal ──────────────────────────────────────────────── */

function CreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try { await onCreate({ name: name.trim(), description: desc.trim() }); setName(''); setDesc(''); onClose(); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-md rounded-xl bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-gray-700/40 shadow-2xl p-5"
      >
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Create New Report</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Report Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Production Summary" autoFocus className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0b111e] px-3 py-2 text-[12px] text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-[#0e749080] transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Description (optional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." rows={2} className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0b111e] px-3 py-2 text-[12px] text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-[#0e749080] resize-none transition-all" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[11px] font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors">Cancel</button>
            <button type="submit" disabled={!name.trim() || submitting} className="px-4 py-1.5 text-[11px] font-medium rounded-md text-white bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {submitting ? 'Creating...' : 'Create Report'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ── Template Card ─────────────────────────────────────────────── */

function TemplateCard({ template, onOpen, onDuplicate, onDelete }) {
  const status = template.status || 'draft';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -1 }}
      className="group relative bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-gray-700/30 rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:shadow-gray-900/5 dark:hover:shadow-cyan-500/3 transition-all duration-150 cursor-pointer max-w-sm"
      onClick={() => onOpen(template.id)}
    >
      {/* Preview area — real report thumbnail */}
      <div className="relative h-48 w-full overflow-hidden">
        <ReportThumbnail template={template} />
        {/* Badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide rounded ${STATUS_STYLE[status] || STATUS_STYLE.draft}`}>
            {status}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5">
        <h3 className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate">{template.name}</h3>
        {template.description && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{template.description}</p>
        )}
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[9px] text-gray-400 dark:text-gray-500">{timeAgo(template.updated_at)}</span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(template.id); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700/40 text-gray-400 hover:text-brand transition-colors" title="Duplicate">
              <Copy size={11} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(template.id); }} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/10 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main ──────────────────────────────────────────────────────── */

export default function ReportBuilderManager() {
  const navigate = useNavigate();
  const { templates, loading, createTemplate, deleteTemplate, duplicateTemplate, clearAllTemplates } = useReportTemplates();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

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
    <div className="min-h-[calc(100vh-80px)] p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 size={20} className="text-brand" />
            Report Builder
          </h1>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Design visual reports with drag-and-drop components</p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-lg text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700/40 hover:border-red-200 dark:hover:border-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
              Clear all templates
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium rounded-lg text-white bg-brand hover:bg-brand-hover transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0e749066] focus:ring-offset-2 dark:focus:ring-offset-[#0b111e]"
          >
            <Plus size={14} />
            Create Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#121e2c] text-[11px] text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-[#0e749080] transition-all"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'draft', 'validated', 'published'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 text-[10px] font-medium rounded-md capitalize transition-colors ${
                statusFilter === s
                  ? 'text-brand dark:text-cyan-400 bg-[#0e74901a]'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/30'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-gray-700/20 rounded-xl overflow-hidden">
              <div className="h-36 bg-gray-100 dark:bg-[#0b111e]" />
              <div className="p-3.5 space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutGrid size={36} className="text-gray-200 dark:text-gray-700 mb-3" />
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">
            {search || statusFilter !== 'all' ? 'No matching reports' : 'No reports yet'}
          </h3>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-5 max-w-xs leading-relaxed">
            {search ? 'Try a different search term' : 'Create your first report to start building visual dashboards'}
          </p>
          {!search && statusFilter === 'all' && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium rounded-lg text-white bg-brand hover:bg-brand-hover transition-colors">
              <Plus size={14} />
              Create Report
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} onOpen={handleOpen} onDuplicate={duplicateTemplate} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </AnimatePresence>
    </div>
  );
}
