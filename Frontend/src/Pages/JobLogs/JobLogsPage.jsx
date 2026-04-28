import { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { ClipboardList, ChevronDown, RefreshCw, Search, Calendar, Clock, CheckCircle2, Loader2, Layers } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import axios from '../../API/axios';
import { toast } from 'react-toastify';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';
import { resolveJobLogsSegmentRow } from '../ReportBuilder/PaginatedReportBuilder';

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

/**
 * Remove suffixes that wrongly label naive plant wall time as UTC (common JSON artifacts).
 * Includes HTTP-date ` GMT` / ` UTC` (Flask/json defaults) and ISO `Z` / `±00:00`.
 * Does not strip real zones like +04:00.
 */
function stripMisleadingUtcLabel(s) {
  let t = String(s).trim();
  if (!t) return t;
  t = t.replace(/\s+GMT$/i, '');
  t = t.replace(/\s+UTC$/i, '');
  t = t.replace(/[zZ]$/i, '');
  t = t.replace(/\+00:?00$/i, '');
  t = t.replace(/-00:?00$/i, '');
  return t;
}

/**
 * Parse order timestamps from the API as **plant wall time** (matches PostgreSQL naive
 * `timestamp` / local session). If JSON wrongly appends `Z` or `+00:00`, `new Date()`
 * treats the value as UTC and `toLocaleString` in +04 shifts by 4h (e.g. DB 10:50 → UI 14:50).
 */
function parseOrderWallTime(ts) {
  if (ts == null || ts === '') return null;
  const s = (typeof ts === 'string' ? ts.trim() : String(ts));
  if (!s) return null;
  const stripped = stripMisleadingUtcLabel(s);
  // Only insert `T` for ISO date forms (YYYY-MM-DD …); avoid matching weekday "Tue".
  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(stripped);
  const normalized =
    isoDate && !stripped.includes('T') ? stripped.replace(' ', 'T') : stripped;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(ts) {
  const d = parseOrderWallTime(ts);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
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
 * If `start_time` from the API is naive local but serialized with `Z` / `+00:00`,
 * passing that through to the query shifts the window; strip those so the historian
 * stays on the naive-local path (same as {@link parseOrderWallTime}).
 *
 * `toHistorianToParam` still returns real UTC ISO (with `Z`) for "now" on running jobs
 * so the backend converts a true instant to server-local.
 */
function toHistorianWallTimeParam(value) {
  if (value == null || value === '') return '';
  const s = (typeof value === 'string' ? value : new Date(value).toISOString()).trim();
  if (!s) return '';
  return stripMisleadingUtcLabel(s);
}

function toHistorianToParam(endTime) {
  if (endTime != null && endTime !== '') return toHistorianWallTimeParam(endTime);
  return new Date().toISOString();
}

/** Start of the hour after d's local hour — `archive_hour <= to` then includes the end-hour bucket (e.g. 21:00 for 20:54). */
function localHourStartAfter(d) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
  const x = new Date(t);
  x.setHours(x.getHours() + 1);
  return x;
}

function formatLocalNaiveWallISO(d) {
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Historian window for Job Logs: keep **from** at exact order start (so `first` does not pick an
 * `tag_history_archive` row for the hour before the run — that inflated totals e.g. ~64k vs ~44k).
 * Expand **to** to the start of the hour after `end_time` so `archive_hour <= to` includes the
 * bucket that contains the order end (e.g. 21:00 for 20:54).
 */
function historianOrderWallParams(start_time, end_time) {
  const fromParam = toHistorianWallTimeParam(start_time);
  if (end_time != null && end_time !== '') {
    const end = parseOrderWallTime(end_time);
    if (!end || Number.isNaN(end.getTime())) {
      return { fromParam, toParam: toHistorianWallTimeParam(end_time) };
    }
    const toParam = formatLocalNaiveWallISO(localHourStartAfter(end));
    return { fromParam, toParam };
  }
  return { fromParam, toParam: new Date().toISOString() };
}

/** Merge historian `first` + `last` maps into per-tag { start, end, total }. Total = end − start when both numeric. */
function mergeTagStartEnd(firstMap, lastMap) {
  const a = firstMap && typeof firstMap === 'object' ? firstMap : {};
  const b = lastMap && typeof lastMap === 'object' ? lastMap : {};
  const tags = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const tag of tags) {
    const start = a[tag];
    const end = b[tag];
    let total = null;
    if (start !== undefined && end !== undefined) {
      const ns = Number(start);
      const ne = Number(end);
      if (!Number.isNaN(ns) && !Number.isNaN(ne)) total = ne - ns;
    }
    out[tag] = { start, end, total };
  }
  return out;
}

function formatTagCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  const n = Number(v);
  if (!Number.isNaN(n) && v !== '' && String(v).trim() !== '') {
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(v);
}

/**
 * Normalize an aggregation label for the segment table header.
 * Backend echoes the same agg the client sent (e.g. `silo_delta`); strip the silo_
 * prefix so headers read naturally as "first / last / delta".
 */
function shortAggLabel(agg) {
  const a = String(agg || 'last').toLowerCase();
  if (a === 'silo_first') return 'first';
  if (a === 'silo_last') return 'last';
  if (a === 'silo_delta') return 'delta';
  return a;
}

/** Format an ISO/naive timestamp from `/historian/row-segments` for display in the segment table. */
function formatSegmentTimestamp(ts) {
  if (!ts) return '—';
  const stripped = stripMisleadingUtcLabel(String(ts));
  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(stripped);
  const normalized = isoDate && !stripped.includes('T') ? stripped.replace(' ', 'T') : stripped;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Index a segment's `values` array by `${tagName}::${agg}` so the segment table can render
 * one column per `companionCells` entry in the order chosen in the Report Builder.
 */
function indexSegmentValues(values) {
  const out = {};
  if (!Array.isArray(values)) return out;
  for (const entry of values) {
    if (!entry || !entry.tagName) continue;
    const agg = entry.agg || 'last';
    out[`${entry.tagName}::${agg}`] = entry;
  }
  return out;
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
  /** Grouped cards: { id, title, tags[] } — order from layout-tags API */
  const [detailGroups, setDetailGroups] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Silo segment row resolved from layout_config.paginatedSections (auto-first or jobLogsSegmentPointer).
  const [segmentRowDef, setSegmentRowDef] = useState(null);
  const [segmentData, setSegmentData] = useState([]);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState(null);

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
      setDetailGroups([]);
      setSegmentData([]);
      setSegmentError(null);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [selectedTemplateId]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Resolve silo segment row from the template's layout_config (auto-first or pointer).
  // Re-fetches only when the selected template changes, then drives segment fetches per order.
  useEffect(() => {
    if (!selectedTemplateId) {
      setSegmentRowDef(null);
      return;
    }
    let cancelled = false;
    axios.get(`/api/report-builder/templates/${selectedTemplateId}`)
      .then((res) => {
        if (cancelled) return;
        const raw = res.data?.data?.layout_config;
        const layout = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
        const pointer = layout && typeof layout === 'object' ? layout.jobLogsSegmentPointer : null;
        const resolved = resolveJobLogsSegmentRow(layout, pointer);
        if (!resolved) {
          setSegmentRowDef(null);
          return;
        }
        setSegmentRowDef({
          rowId: resolved.row?.id || `template-${selectedTemplateId}-segment`,
          segCell: resolved.segCell,
          companionCells: resolved.companionCells,
          sectionLabel: resolved.section?.label || '',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Failed to load layout_config for segment row:', err);
        setSegmentRowDef(null);
      });
    return () => { cancelled = true; };
  }, [selectedTemplateId]);

  // Load detail when a job is selected
  useEffect(() => {
    if (!selectedJob) {
      setDetailData({});
      setDetailGroups([]);
      return;
    }
    const { start_time, end_time } = selectedJob;
    if (!start_time) return;

    setDetailLoading(true);
    setDetailData({});
    setDetailGroups([]);

    axios.get(`/api/orders/layout-tags/${selectedTemplateId}`)
      .then((res) => {
        const body = res.data || {};
        const flatTags = Array.isArray(body.data) ? body.data : [];
        const rawGroups = body.groups;
        const groups =
          Array.isArray(rawGroups) && rawGroups.length > 0
            ? rawGroups.map((g, i) => ({
              id: String(g?.id || `jg-${i}`),
              title: (g?.title && String(g.title).trim()) || `Group ${i + 1}`,
              tags: Array.isArray(g?.tags) ? g.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()) : [],
            }))
            : (flatTags.length > 0
              ? [{ id: 'default', title: 'Tag values at order start / end', tags: flatTags }]
              : []);
        return { list: flatTags, groups };
      })
      .then(({ list, groups }) => {
        setDetailGroups(groups);
        if (list.length === 0) return;

        const wall = historianOrderWallParams(start_time, end_time);
        let fromParam = wall.fromParam;
        let toParam = wall.toParam;

        const fromMs = parseOrderWallTime(start_time)?.getTime() ?? NaN;
        const toMs =
          end_time != null && end_time !== ''
            ? (parseOrderWallTime(end_time)?.getTime() ?? NaN)
            : Date.now();
        if (!Number.isNaN(fromMs) && !Number.isNaN(toMs) && fromMs > toMs) {
          toParam = new Date().toISOString();
        }

        const baseParams = {
          tag_names: list.join(','),
          from: fromParam,
          to: toParam,
        };
        return Promise.all([
          axios.get('/api/historian/by-tags', { params: { ...baseParams, aggregation: 'first' } }),
          axios.get('/api/historian/by-tags', { params: { ...baseParams, aggregation: 'last' } }),
        ]).then(([resFirst, resLast]) => {
          const firstVals = resFirst.data?.data || resFirst.data?.tag_values || {};
          const lastVals = resLast.data?.data || resLast.data?.tag_values || {};
          setDetailData(mergeTagStartEnd(firstVals, lastVals));
        });
      })
      .catch(err => {
        console.warn('Detail load error:', err);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedJob, selectedTemplateId]);

  // Fetch silo segment data for the selected order using the row resolved from layout_config.
  // Mirrors PaginatedReportViewer's POST to /api/historian/row-segments but reuses Job Logs'
  // wall-time window so the segment table aligns with the flat Start/End/Total table.
  useEffect(() => {
    if (!selectedJob || !selectedTemplateId || !segmentRowDef) {
      setSegmentData([]);
      setSegmentError(null);
      setSegmentLoading(false);
      return undefined;
    }
    const { start_time, end_time } = selectedJob;
    if (!start_time) return undefined;
    const segCell = segmentRowDef.segCell || {};
    if (!segCell.tagName) {
      setSegmentData([]);
      return undefined;
    }

    let cancelled = false;
    setSegmentLoading(true);
    setSegmentError(null);
    setSegmentData([]);

    const wall = historianOrderWallParams(start_time, end_time);
    let fromParam = wall.fromParam;
    let toParam = wall.toParam;
    const fromMs = parseOrderWallTime(start_time)?.getTime() ?? NaN;
    const toMs =
      end_time != null && end_time !== ''
        ? (parseOrderWallTime(end_time)?.getTime() ?? NaN)
        : Date.now();
    if (!Number.isNaN(fromMs) && !Number.isNaN(toMs) && fromMs > toMs) {
      toParam = new Date().toISOString();
    }

    const body = {
      from: fromParam,
      to: toParam,
      rows: [{
        row_id: segmentRowDef.rowId,
        segment_tag: segCell.tagName,
        min_segment_seconds: segCell.segmentMinSeconds ?? 60,
        ignore_values: segCell.segmentIgnoreValues ?? [0],
        companion_cells: segmentRowDef.companionCells || [],
        merge_duplicates: segCell.segmentMergeDuplicates !== false,
      }],
    };

    axios.post('/api/historian/row-segments', body, { timeout: 20000 })
      .then((res) => {
        if (cancelled) return;
        const segments = res.data?.rows?.[segmentRowDef.rowId];
        setSegmentData(Array.isArray(segments) ? segments : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Segment load error:', err);
        setSegmentError(err.response?.data?.error || err.message || 'Failed to load silo segments');
        setSegmentData([]);
      })
      .finally(() => {
        if (!cancelled) setSegmentLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedJob, selectedTemplateId, segmentRowDef]);

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


  const cardShadow = theme.dark ? 'none' : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: theme.pageBg, color: theme.text }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-3">
          <ClipboardList size={20} style={{ color: theme.accent }} />
          <h1 className="text-lg font-bold">Job Logs</h1>
        </div>
        <div className="flex items-center gap-3">
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

      <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 pb-8 min-h-0 overflow-y-auto">
        {/* Jobs card (top) */}
        <div
          className="rounded-xl overflow-hidden flex flex-col flex-shrink-0"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            boxShadow: cardShadow,
          }}
        >
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
            style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: theme.text }}>Jobs (last 100 orders)</h2>
              {selectedTemplate?.name ? (
                <p className="text-xs mt-0.5" style={{ color: theme.textMuted }}>Layout: {selectedTemplate.name}</p>
              ) : null}
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt }}>
            <div className="relative flex-1 min-w-[200px] max-w-md">
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

          <div className="overflow-y-auto max-h-[min(420px,45vh)]">
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
                <thead className="sticky top-0 z-[1]">
                  <tr style={{ background: theme.surfaceAlt, borderBottom: `2px solid ${theme.border}` }}>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Ident</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Start Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>End Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Duration</th>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: theme.textSecondary }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job, rowIndex) => {
                    const isSelected = selectedJob?.id === job.id;
                    const stripeBg = rowIndex % 2 === 1 ? theme.surfaceAlt : 'transparent';
                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className="cursor-pointer transition-colors"
                        style={{
                          background: isSelected ? theme.rowSelected : stripeBg,
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = theme.rowHover; }}
                        onMouseLeave={e => {
                          if (!isSelected) e.currentTarget.style.background = stripeBg;
                        }}
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

        {/* Detail: below orders, card-based */}
        <div
          className="rounded-xl flex flex-col min-h-[200px] flex-1 min-h-0 overflow-hidden"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            boxShadow: cardShadow,
          }}
        >
          {!selectedJob ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 gap-2 px-4">
              <ClipboardList size={32} style={{ color: theme.textMuted }} />
              <p className="text-sm text-center" style={{ color: theme.textMuted }}>Select an order to view details</p>
            </div>
          ) : (
            <div className="p-4 md:p-5 flex flex-col gap-5">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4"
                style={{ borderBottom: `1px solid ${theme.border}` }}
              >
                <div>
                  <h2 className="text-xl md:text-2xl font-bold" style={{ color: theme.text }}>
                    {selectedJob.order_name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-xs" style={{ color: theme.textSecondary }}>
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
              </div>

              <div className={`grid gap-4 ${segmentRowDef ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
                {/* Tag values card */}
                <div
                  className="rounded-lg p-4 flex flex-col min-h-0"
                  style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: theme.textMuted }}>
                    Tag values at order start / end
                  </h3>
                  <p className="text-[11px] mb-3 -mt-1" style={{ color: theme.textMuted }}>
                    Historian first + last in window
                  </p>

                  {detailLoading ? (
                    <div className="flex items-center gap-2 py-10 justify-center flex-1">
                      <Loader2 size={16} className="animate-spin" style={{ color: theme.accent }} />
                      <span className="text-sm" style={{ color: theme.textMuted }}>Loading data...</span>
                    </div>
                  ) : !detailGroups.some((g) => Array.isArray(g.tags) && g.tags.length > 0) ? (
                    <p className="text-sm py-2" style={{ color: theme.textMuted }}>
                      No tags are configured for this report&apos;s Job Logs view, and none were found in the layout.
                      Add cards and tags in the paginated report (Report Builder → Job logs cards), or ensure the report references tag cells.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[min(520px,50vh)] overflow-y-auto pr-1">
                      {detailGroups.filter((g) => Array.isArray(g.tags) && g.tags.length > 0).map((group) => (
                        <div
                          key={group.id}
                          className="rounded-lg p-3 flex flex-col min-h-0"
                          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
                        >
                          <div className="text-[11px] font-bold uppercase tracking-wide mb-2 pb-2 truncate"
                            style={{ color: theme.text, borderBottom: `1px solid ${theme.border}` }}
                            title={group.title}>
                            {group.title}
                          </div>
                          <div className="space-y-2 flex-1 overflow-y-auto min-h-0 pr-0.5">
                            {group.tags.map((tag) => {
                              const r = detailData[tag] && typeof detailData[tag] === 'object' ? detailData[tag] : {};
                              return (
                                <div key={`${group.id}-${tag}`} className="rounded-md p-2" style={{ background: theme.surfaceAlt }}>
                                  <div className="text-[10px] font-semibold truncate mb-1.5 font-mono" title={tag} style={{ color: theme.text }}>{tag}</div>
                                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                                    <div>
                                      <div style={{ color: theme.textMuted }}>Start</div>
                                      <div className="font-mono mt-0.5 break-all" style={{ color: theme.textSecondary }}>{formatTagCell(r.start)}</div>
                                    </div>
                                    <div>
                                      <div style={{ color: theme.textMuted }}>End</div>
                                      <div className="font-mono mt-0.5 break-all" style={{ color: theme.textSecondary }}>{formatTagCell(r.end)}</div>
                                    </div>
                                    <div>
                                      <div style={{ color: theme.textMuted }}>Total</div>
                                      <div className="font-mono mt-0.5 break-all font-semibold" style={{ color: theme.accent }}>
                                        {r.total !== null && r.total !== undefined ? formatTagCell(r.total) : '—'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Silo segments card */}
                {segmentRowDef && (
                  <div
                    className="rounded-lg p-4 flex flex-col min-h-0"
                    style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5 flex-wrap"
                      style={{ color: theme.textMuted }}>
                      <Layers size={12} />
                      Silo segments
                    </h3>
                    <p className="text-[11px] mb-3" style={{ color: theme.textSecondary }}>
                      Driver: <span className="font-mono">{segmentRowDef.segCell?.tagName || '?'}</span>
                      {segmentRowDef.sectionLabel ? (
                        <span className="ml-1" style={{ color: theme.textMuted }}>({segmentRowDef.sectionLabel})</span>
                      ) : null}
                    </p>

                    {segmentLoading ? (
                      <div className="flex items-center gap-2 py-10 justify-center flex-1">
                        <Loader2 size={16} className="animate-spin" style={{ color: theme.accent }} />
                        <span className="text-sm" style={{ color: theme.textMuted }}>Loading silo segments...</span>
                      </div>
                    ) : segmentError ? (
                      <p className="text-sm py-2" style={{ color: '#f87171' }}>{segmentError}</p>
                    ) : segmentData.length === 0 ? (
                      <p className="text-sm py-2" style={{ color: theme.textMuted }}>
                        No silo segments detected in this order&apos;s window.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3 max-h-[min(520px,50vh)] overflow-y-auto pr-1">
                        {segmentData.map((seg, idx) => {
                          const valueIndex = indexSegmentValues(seg.values);
                          return (
                            <div
                              key={`${seg.t_start}-${idx}`}
                              className="rounded-lg p-3"
                              style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
                            >
                              <div className="flex flex-wrap gap-3 mb-3 pb-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
                                <div>
                                  <div className="text-[10px] uppercase font-semibold" style={{ color: theme.textMuted }}>Start</div>
                                  <div className="font-mono text-xs mt-0.5 whitespace-nowrap" style={{ color: theme.text }}>
                                    {formatSegmentTimestamp(seg.t_start)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase font-semibold" style={{ color: theme.textMuted }}>End</div>
                                  <div className="font-mono text-xs mt-0.5 whitespace-nowrap" style={{ color: theme.text }}>
                                    {formatSegmentTimestamp(seg.t_end)}
                                  </div>
                                </div>
                                <div className="ml-auto sm:ml-0">
                                  <div className="text-[10px] uppercase font-semibold" style={{ color: theme.textMuted }}>Silo ID</div>
                                  <div className="font-mono text-sm font-bold mt-0.5 text-right sm:text-left" style={{ color: theme.accent }}>
                                    {seg.silo_id ?? '—'}
                                  </div>
                                </div>
                              </div>
                              <dl className="grid gap-2">
                                {(segmentRowDef.companionCells || []).map((c, i) => {
                                  const key = `${c.tagName}::${c.aggregation || 'last'}`;
                                  const entry = valueIndex[key];
                                  const label = `${c.tagName} (${shortAggLabel(c.aggregation)})`;
                                  return (
                                    <div key={`${key}-${i}`} className="flex justify-between gap-3 text-xs">
                                      <dt className="font-mono truncate flex-shrink min-w-0" title={label} style={{ color: theme.textSecondary }}>
                                        {c.tagName}
                                        <span className="lowercase ml-1" style={{ color: theme.textMuted }}>({shortAggLabel(c.aggregation)})</span>
                                      </dt>
                                      <dd className="font-mono flex-shrink-0 text-right" style={{ color: theme.text }}>
                                        {entry ? formatTagCell(entry.value) : '—'}
                                      </dd>
                                    </div>
                                  );
                                })}
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
