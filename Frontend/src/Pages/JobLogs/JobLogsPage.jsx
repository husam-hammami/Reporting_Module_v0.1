import { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { ClipboardList, ChevronDown, RefreshCw, Search, Calendar, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import axios from '../../API/axios';
import { toast } from 'react-toastify';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

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
    inputBg: dark ? '#111827' : '#ffffff',
    rowHover: dark ? '#1a2233' : '#f0f7ff',
    rowSelected: dark ? '#0c2a3d' : '#e0f2fe',
    statusRunning: dark ? '#22c55e' : '#16a34a',
    statusCompleted: dark ? '#8899ab' : '#6b7280',
  };
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Historian `/api/historian/by-tags` uses `_parse_iso_to_naive_local`: values **without**
 * a timezone are treated as server-local wall time (matches `tag_history.timestamp`).
 * If `start_time` from the API is naive local but serialized with a trailing `Z`,
 * `new Date(...).toISOString()` treats it as UTC and shifts the instant; then
 * `from` can be **after** `to` (now in UTC), and the query returns no rows.
 *
 * Strip a trailing `Z`/`z` on wall times from the DB so the historian keeps them
 * in the naive-local path. Keep UTC `Z` on "now" for `to` when the job is running.
 */
function toHistorianWallTimeParam(value) {
  if (value == null || value === '') return '';
  const s = (typeof value === 'string' ? value : new Date(value).toISOString()).trim();
  if (!s) return '';
  if (/[zZ]$/i.test(s)) return s.replace(/[zZ]$/i, '');
  return s;
}

function toHistorianToParam(endTime) {
  if (endTime != null && endTime !== '') return toHistorianWallTimeParam(endTime);
  return new Date().toISOString();
}

export default function JobLogsPage() {
  const theme = useTheme();

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [detailData, setDetailData] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Load report templates with order tracking
  useEffect(() => {
    axios.get('/api/orders/layouts')
      .then(res => {
        const data = res.data?.data || [];
        setTemplates(data);
        if (data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load templates'));
  }, []);

  const loadJobs = useCallback(async () => {
    if (!selectedTemplateId) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/orders/jobs', {
        params: { template_id: selectedTemplateId, limit: 100 },
      });
      setJobs(res.data?.data || []);
      setTotal(res.data?.total || 0);
      setSelectedJob(null);
      setDetailData({});
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [selectedTemplateId]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Load detail when a job is selected
  useEffect(() => {
    if (!selectedJob) { setDetailData({}); return; }
    const { start_time, end_time } = selectedJob;
    if (!start_time) return;

    setDetailLoading(true);

    axios.get(`/api/orders/layout-tags/${selectedTemplateId}`)
      .then(res => res.data?.data || [])
      .then(tagNames => {
        if (!Array.isArray(tagNames) || tagNames.length === 0) return;

        let fromParam = toHistorianWallTimeParam(start_time);
        let toParam = toHistorianToParam(end_time);

        const fromMs = Date.parse(fromParam.includes('T') ? fromParam : fromParam.replace(' ', 'T'));
        const toMs = Date.parse(toParam);
        if (!Number.isNaN(fromMs) && !Number.isNaN(toMs) && fromMs > toMs) {
          toParam = new Date().toISOString();
        }

        return axios.get('/api/historian/by-tags', {
          params: {
            tag_names: tagNames.join(','),
            from: fromParam,
            to: toParam,
            aggregation: 'auto',
          },
        }).then(res => {
          const values = res.data?.data || res.data?.tag_values || res.data || {};
          setDetailData(values);
        });
      })
      .catch(err => {
        console.warn('Detail load error:', err);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedJob, selectedTemplateId]);

  const selectedTemplate = useMemo(() =>
    templates.find(t => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const filteredJobs = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(j =>
      j.order_name?.toLowerCase().includes(q) ||
      j.status?.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  return (
    <div className="min-h-screen" style={{ background: theme.pageBg, color: theme.text }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between"
        style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-3">
          <ClipboardList size={20} style={{ color: theme.accent }} />
          <h1 className="text-lg font-bold">Job Logs</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Layout selector */}
          <div className="relative">
            <select
              value={selectedTemplateId || ''}
              onChange={e => setSelectedTemplateId(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                background: theme.inputBg,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: theme.textMuted }} />
          </div>

          <button onClick={loadJobs}
            className="p-2 rounded-lg transition-colors"
            style={{ border: `1px solid ${theme.border}`, color: theme.textSecondary }}
            title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex" style={{ height: 'calc(100vh - 65px)' }}>
        {/* Left: Jobs table */}
        <div className="flex-1 flex flex-col overflow-hidden"
          style={{ borderRight: `1px solid ${theme.border}` }}>

          {/* Search bar + stats */}
          <div className="px-4 py-3 flex items-center gap-3"
            style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt }}>
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: theme.textMuted }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search orders..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
                style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>
            <span className="text-xs font-medium" style={{ color: theme.textMuted }}>
              {total} order{total !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={20} className="animate-spin" style={{ color: theme.accent }} />
                <span className="ml-2 text-sm" style={{ color: theme.textMuted }}>Loading orders...</span>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <ClipboardList size={32} style={{ color: theme.textMuted }} />
                <p className="text-sm" style={{ color: theme.textMuted }}>
                  {jobs.length === 0 ? 'No orders found for this layout' : 'No matching orders'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: theme.surfaceAlt, borderBottom: `2px solid ${theme.border}` }}>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Ident</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Start Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>End Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Duration</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map(job => {
                    const isSelected = selectedJob?.id === job.id;
                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className="cursor-pointer transition-colors"
                        style={{
                          background: isSelected ? theme.rowSelected : 'transparent',
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = theme.rowHover; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td className="px-4 py-2.5 font-semibold" style={{ color: theme.accent }}>
                          {job.order_name}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: theme.text }}>
                          {formatDateTime(job.start_time)}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: theme.text }}>
                          {formatDateTime(job.end_time)}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: theme.textSecondary }}>
                          {formatDuration(job.duration_seconds)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              background: job.status === 'running' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                              color: job.status === 'running' ? theme.statusRunning : theme.statusCompleted,
                            }}>
                            {job.status === 'running' ? <Clock size={10} /> : <CheckCircle2 size={10} />}
                            {job.status === 'running' ? 'Running' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="w-[420px] flex-shrink-0 overflow-auto"
          style={{ background: theme.surface }}>
          {!selectedJob ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <ClipboardList size={32} style={{ color: theme.textMuted }} />
              <p className="text-sm" style={{ color: theme.textMuted }}>Select an order to view details</p>
            </div>
          ) : (
            <div className="p-5">
              {/* Order header */}
              <div className="mb-5 pb-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h2 className="text-xl font-bold" style={{ color: theme.text }}>
                  {selectedJob.order_name}
                </h2>
                <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDateTime(selectedJob.start_time)}
                  </span>
                  {selectedJob.end_time && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(selectedJob.duration_seconds)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: selectedJob.status === 'running' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                      color: selectedJob.status === 'running' ? theme.statusRunning : theme.statusCompleted,
                    }}>
                    {selectedJob.status === 'running' ? 'Running' : 'Completed'}
                  </span>
                </div>
              </div>

              {/* Tag data */}
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3"
                style={{ color: theme.textMuted }}>
                Tag Values ({selectedJob.status === 'running' ? 'Latest' : 'Order Period'})
              </h3>

              {detailLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <Loader2 size={16} className="animate-spin" style={{ color: theme.accent }} />
                  <span className="text-sm" style={{ color: theme.textMuted }}>Loading data...</span>
                </div>
              ) : Object.keys(detailData).length === 0 ? (
                <p className="text-sm py-4" style={{ color: theme.textMuted }}>
                  No tag data available for this order window.
                </p>
              ) : (
                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: theme.surfaceAlt }}>
                        <th className="text-left px-3 py-2 font-semibold text-xs" style={{ color: theme.textSecondary }}>Tag</th>
                        <th className="text-right px-3 py-2 font-semibold text-xs" style={{ color: theme.textSecondary }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(detailData)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([tag, value]) => (
                          <tr key={tag} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td className="px-3 py-2 font-medium" style={{ color: theme.text }}>{tag}</td>
                            <td className="px-3 py-2 text-right font-mono" style={{ color: theme.accent }}>
                              {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value ?? '—')}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
