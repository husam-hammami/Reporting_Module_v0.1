import { useState, useEffect, useMemo, useCallback, useContext, useRef } from 'react';
import { ClipboardList, ChevronDown, RefreshCw, Search, Calendar, Clock, CheckCircle2, Loader2, Layers, Download, Printer } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import axios from '../../API/axios';
import { toast } from 'react-toastify';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';
import {
  resolveJobLogsSegmentRow,
  resolveJobLogsSegmentDescriptorByRowId,
  normalizeJobLogsSegmentsPlacement,
  PaginatedReportPreview,
  collectPaginatedTagNames,
  collectPaginatedTagAggregations,
  buildTagDecimalLookup,
} from '../ReportBuilder/PaginatedReportBuilder';
import {
  JOB_LOGS_CARD_SEGMENT_ROW,
  JOB_LOGS_VALUE_START_END,
  JOB_LOGS_VALUE_UNIQUE,
  jobLogsGroupHasRenderableContent,
  normalizeJobLogsGroup,
  partitionJobLogsTagsByMode,
} from '../../utils/jobLogsDetailGroups';
import { useAvailableTags } from '../../Hooks/useReportBuilder';
import { fetchPaginatedHistoricalData } from '../../utils/paginatedHistoricalFetch';
import { exportAsPDF as exportAsPDFUtil } from '../../utils/exportReport';

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

function jobLogsSegmentRowDefFromDescriptor(desc) {
  if (!desc?.row?.id) return null;
  return {
    rowId: desc.row.id,
    segCell: desc.segCell || {},
    companionCells: desc.companionCells || [],
    sectionLabel: desc.section?.label || '',
  };
}

/** Compact segment table for a Job Logs card (same data as paginated silo row). */
function JobLogsSegmentCardTable({
  theme,
  rowDef,
  segments,
  loading,
  error,
}) {
  if (!rowDef) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="animate-spin" style={{ color: theme.accent }} />
        <span className="text-xs" style={{ color: theme.textMuted }}>Loading…</span>
      </div>
    );
  }
  if (error) {
    return <p className="text-xs py-1" style={{ color: '#f87171' }}>{error}</p>;
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    return (
      <p className="text-xs py-1" style={{ color: theme.textMuted }}>
        No silo segments in this order window.
      </p>
    );
  }
  const driverLabel = rowDef.segCell?.tagName || 'ID';
  return (
    <div className="overflow-x-auto min-w-0">
      <table className="w-full text-[9px] md:text-[10px]">
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <th className="text-left px-1 py-0.5 font-semibold whitespace-nowrap" style={{ color: theme.textMuted }}>{driverLabel}</th>
            {(rowDef.companionCells || []).map((c, i) => (
              <th key={`h-${c.tagName}-${i}`} className="text-right px-1 py-0.5 font-semibold whitespace-nowrap" style={{ color: theme.textMuted }}>
                <span className="font-mono">{c.tagName}</span>
                <span className="lowercase ml-0.5" style={{ color: theme.textMuted }}>({shortAggLabel(c.aggregation)})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, idx) => {
            const valueIndex = indexSegmentValues(seg.values);
            return (
              <tr key={`${seg.t_start}-${idx}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td className="px-1 py-0.5 font-mono font-semibold" style={{ color: theme.accent }}>
                  {formatTagCell(seg.silo_id)}
                </td>
                {(rowDef.companionCells || []).map((c, i) => {
                  const key = `${c.tagName}::${c.aggregation || 'last'}`;
                  const entry = valueIndex[key];
                  return (
                    <td key={`c-${key}-${i}`} className="px-1 py-0.5 text-right font-mono whitespace-nowrap" style={{ color: theme.textSecondary }}>
                      {entry ? formatTagCell(entry.value) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Shared silo segment list (loading / error / blocks) for side panel or inline card. */
function SiloSegmentBlocks({
  theme,
  segmentRowDef,
  segmentLoading,
  segmentError,
  segmentData,
}) {
  if (segmentLoading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center flex-1">
        <Loader2 size={14} className="animate-spin" style={{ color: theme.accent }} />
        <span className="text-xs" style={{ color: theme.textMuted }}>Loading…</span>
      </div>
    );
  }
  if (segmentError) {
    return <p className="text-xs py-1" style={{ color: '#f87171' }}>{segmentError}</p>;
  }
  if (!segmentData.length) {
    return (
      <p className="text-xs py-1" style={{ color: theme.textMuted }}>
        No silo segments in this window.
      </p>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-2 pr-0.5">
      {segmentData.map((seg, idx) => {
        const valueIndex = indexSegmentValues(seg.values);
        return (
          <div
            key={`${seg.t_start}-${idx}`}
            className="rounded-md p-2 text-[10px]"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
          >
            <div className="flex flex-wrap gap-2 mb-1.5 pb-1.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div>
                <div className="text-[9px] uppercase font-semibold" style={{ color: theme.textMuted }}>Start</div>
                <div className="font-mono text-[10px] mt-0.5 whitespace-nowrap" style={{ color: theme.text }}>
                  {formatSegmentTimestamp(seg.t_start)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-semibold" style={{ color: theme.textMuted }}>End</div>
                <div className="font-mono text-[10px] mt-0.5 whitespace-nowrap" style={{ color: theme.text }}>
                  {formatSegmentTimestamp(seg.t_end)}
                </div>
              </div>
              <div className="ml-auto">
                <div className="text-[9px] uppercase font-semibold" style={{ color: theme.textMuted }}>Silo</div>
                <div className="font-mono text-xs font-bold mt-0.5 text-right" style={{ color: theme.accent }}>
                  {seg.silo_id ?? '—'}
                </div>
              </div>
            </div>
            <dl className="grid gap-0.5">
              {(segmentRowDef.companionCells || []).map((c, i) => {
                const key = `${c.tagName}::${c.aggregation || 'last'}`;
                const entry = valueIndex[key];
                const label = `${c.tagName} (${shortAggLabel(c.aggregation)})`;
                return (
                  <div key={`${key}-${i}`} className="flex justify-between gap-2 text-[10px]">
                    <dt className="font-mono truncate min-w-0" title={label} style={{ color: theme.textSecondary }}>
                      {c.tagName}
                      <span className="lowercase ml-0.5" style={{ color: theme.textMuted }}>({shortAggLabel(c.aggregation)})</span>
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
  );
}

export default function JobLogsPage() {
  const theme = useTheme();
  const { tags: availableTags } = useAvailableTags();

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [detailData, setDetailData] = useState({});
  /** Grouped cards — normalized from layout-tags API (see jobLogsDetailGroups util). */
  const [detailGroups, setDetailGroups] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Silo segment row resolved from layout_config.paginatedSections (auto-first or jobLogsSegmentPointer).
  const [segmentRowDef, setSegmentRowDef] = useState(null);
  /** 'side' | 'inline' | 'hidden' — from layout_config.jobLogsSegmentsPlacement */
  const [segmentsPlacement, setSegmentsPlacement] = useState('side');
  const [segmentData, setSegmentData] = useState([]);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState(null);
  /** Per Job Logs card with jobLogsCardMode segment_row: { loading, error, segments, rowDef }. */
  const [segmentCardsByGroupId, setSegmentCardsByGroupId] = useState({});

  /** Paginated template (same layout as PDF report viewer). */
  const [paginatedSections, setPaginatedSections] = useState([]);
  const [paginatedPageMode, setPaginatedPageMode] = useState('a4');
  const printReportRef = useRef(null);
  const [printTagValues, setPrintTagValues] = useState({});
  const [printExpandedRows, setPrintExpandedRows] = useState({});
  const [printDateRange, setPrintDateRange] = useState(null);
  const [printFetchLoading, setPrintFetchLoading] = useState(false);
  const [printFetchError, setPrintFetchError] = useState(null);
  const [pdfExporting, setPdfExporting] = useState(false);

  const tagDecimalByName = useMemo(() => buildTagDecimalLookup(availableTags), [availableTags]);

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
      setSegmentCardsByGroupId({});
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
      setSegmentsPlacement('side');
      setPaginatedSections([]);
      setPaginatedPageMode('a4');
      return;
    }
    let cancelled = false;
    axios.get(`/api/report-builder/templates/${selectedTemplateId}`)
      .then((res) => {
        if (cancelled) return;
        const raw = res.data?.data?.layout_config;
        const layout = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
        setPaginatedSections(Array.isArray(layout.paginatedSections) ? layout.paginatedSections : []);
        setPaginatedPageMode(layout.grid?.pageMode === 'full' ? 'full' : 'a4');
        setSegmentsPlacement(normalizeJobLogsSegmentsPlacement(layout?.jobLogsSegmentsPlacement));
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
        setSegmentsPlacement('side');
        setPaginatedSections([]);
        setPaginatedPageMode('a4');
      });
    return () => { cancelled = true; };
  }, [selectedTemplateId]);

  // Load detail when a job is selected (per-tag start/end vs unique_in_range; segment cards load separately).
  useEffect(() => {
    if (!selectedJob) {
      setDetailData({});
      setDetailGroups([]);
      setSegmentCardsByGroupId({});
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
        let groupsNormalized;
        if (Array.isArray(rawGroups) && rawGroups.length > 0) {
          groupsNormalized = rawGroups.map((g, i) => normalizeJobLogsGroup(g, i));
        } else if (flatTags.length > 0) {
          groupsNormalized = [{
            id: 'default',
            title: 'Tag values at order start / end',
            tags: flatTags.map((t) => ({ tagName: t, jobLogsValueMode: JOB_LOGS_VALUE_START_END })),
          }];
        } else {
          groupsNormalized = [];
        }

        const { startEndTags, uniqueTags } = partitionJobLogsTagsByMode(groupsNormalized);
        setDetailGroups(groupsNormalized);

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

        if (startEndTags.length === 0 && uniqueTags.length === 0) {
          setDetailData({});
          return;
        }

        const requests = [];
        if (startEndTags.length > 0) {
          const baseParams = {
            tag_names: startEndTags.join(','),
            from: fromParam,
            to: toParam,
          };
          requests.push(
            axios.get('/api/historian/by-tags', { params: { ...baseParams, aggregation: 'first' } }),
            axios.get('/api/historian/by-tags', { params: { ...baseParams, aggregation: 'last' } }),
          );
        }
        if (uniqueTags.length > 0) {
          requests.push(
            axios.get('/api/historian/by-tags', {
              params: {
                tag_names: uniqueTags.join(','),
                from: fromParam,
                to: toParam,
                aggregation: 'unique_in_range',
              },
            }),
          );
        }

        return Promise.all(requests).then((results) => {
          let i = 0;
          let firstVals = {};
          let lastVals = {};
          let uniqueVals = {};
          if (startEndTags.length > 0) {
            firstVals = results[i].data?.data || results[i].data?.tag_values || {};
            i += 1;
            lastVals = results[i].data?.data || results[i].data?.tag_values || {};
            i += 1;
          }
          if (uniqueTags.length > 0) {
            uniqueVals = results[i].data?.data || results[i].data?.tag_values || {};
          }
          const seMerged = mergeTagStartEnd(firstVals, lastVals);
          const merged = {};
          for (const t of startEndTags) {
            const r = seMerged[t] || {};
            merged[t] = { mode: 'start_end', start: r.start, end: r.end, total: r.total };
          }
          for (const t of uniqueTags) {
            merged[t] = { mode: 'unique_in_range', unique: uniqueVals[t] };
          }
          setDetailData(merged);
        });
      })
      .catch(err => {
        console.warn('Detail load error:', err);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedJob, selectedTemplateId]);

  // Row-segments for Job Logs cards configured as segment_row (may differ from side-panel pointer row).
  useEffect(() => {
    if (!selectedJob?.start_time || !selectedTemplateId) {
      setSegmentCardsByGroupId({});
      return undefined;
    }
    const { start_time, end_time } = selectedJob;
    const segmentGroups = detailGroups.filter(
      (g) => g.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW && g.segmentRowId,
    );
    if (segmentGroups.length === 0) {
      setSegmentCardsByGroupId({});
      return undefined;
    }
    if (!Array.isArray(paginatedSections) || paginatedSections.length === 0) {
      const empty = {};
      segmentGroups.forEach((g) => {
        empty[g.id] = { loading: false, error: 'Layout not loaded', segments: [], rowDef: null };
      });
      setSegmentCardsByGroupId(empty);
      return undefined;
    }

    const metaByGroupId = {};
    const rowsPayload = [];
    for (const g of segmentGroups) {
      const desc = resolveJobLogsSegmentDescriptorByRowId(paginatedSections, g.segmentRowId);
      const rowDef = desc ? jobLogsSegmentRowDefFromDescriptor(desc) : null;
      const segCell = rowDef?.segCell || {};
      if (!rowDef || !segCell.tagName) {
        metaByGroupId[g.id] = { rowDef: null, rowId: null };
        continue;
      }
      metaByGroupId[g.id] = { rowDef, rowId: rowDef.rowId };
      rowsPayload.push({
        row_id: rowDef.rowId,
        segment_tag: segCell.tagName,
        min_segment_seconds: segCell.segmentMinSeconds ?? 60,
        ignore_values: segCell.segmentIgnoreValues ?? [0],
        companion_cells: rowDef.companionCells || [],
        merge_duplicates: segCell.segmentMergeDuplicates !== false,
      });
    }

    let cancelled = false;
    setSegmentCardsByGroupId((prev) => {
      const m = { ...prev };
      for (const g of segmentGroups) {
        const meta = metaByGroupId[g.id];
        m[g.id] = {
          loading: true,
          error: meta?.rowDef ? null : 'Silo row not found',
          segments: [],
          rowDef: meta?.rowDef || null,
        };
      }
      return m;
    });

    if (rowsPayload.length === 0) {
      return () => { cancelled = true; };
    }

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

    axios.post('/api/historian/row-segments', { from: fromParam, to: toParam, rows: rowsPayload }, { timeout: 20000 })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.rows || {};
        setSegmentCardsByGroupId((prev) => {
          const m = { ...prev };
          for (const g of segmentGroups) {
            const meta = metaByGroupId[g.id];
            if (!meta?.rowId) {
              m[g.id] = {
                loading: false,
                error: 'Silo row not found',
                segments: [],
                rowDef: null,
              };
              continue;
            }
            const segs = rows[meta.rowId];
            m[g.id] = {
              loading: false,
              error: null,
              rowDef: meta.rowDef,
              segments: Array.isArray(segs) ? segs : [],
            };
          }
          return m;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err.response?.data?.error || err.message || 'Failed to load silo segments';
        setSegmentCardsByGroupId((prev) => {
          const m = { ...prev };
          for (const g of segmentGroups) {
            m[g.id] = {
              loading: false,
              error: msg,
              segments: [],
              rowDef: metaByGroupId[g.id]?.rowDef || null,
            };
          }
          return m;
        });
      });

    return () => { cancelled = true; };
  }, [selectedJob, selectedTemplateId, detailGroups, paginatedSections]);

  // Fetch silo segment data for the selected order using the row resolved from layout_config.
  // Mirrors PaginatedReportViewer's POST to /api/historian/row-segments but reuses Job Logs'
  // wall-time window so the segment table aligns with the flat Start/End/Total table.
  useEffect(() => {
    if (!selectedJob || !selectedTemplateId || !segmentRowDef || segmentsPlacement === 'hidden') {
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
  }, [selectedJob, selectedTemplateId, segmentRowDef, segmentsPlacement]);

  // Paginated report snapshot for PDF/print (same layout as Paginated Report viewer).
  useEffect(() => {
    if (!selectedJob?.start_time || !Array.isArray(paginatedSections) || paginatedSections.length === 0) {
      setPrintTagValues({});
      setPrintExpandedRows({});
      setPrintDateRange(null);
      setPrintFetchLoading(false);
      setPrintFetchError(null);
      return undefined;
    }
    const fromD = parseOrderWallTime(selectedJob.start_time);
    const toD = selectedJob.end_time ? parseOrderWallTime(selectedJob.end_time) : new Date();
    if (!fromD || !toD || Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
      setPrintDateRange(null);
      setPrintTagValues({});
      setPrintExpandedRows({});
      setPrintFetchError('Invalid order times');
      setPrintFetchLoading(false);
      return undefined;
    }
    setPrintDateRange({ from: fromD, to: toD });

    const tagNames = collectPaginatedTagNames(paginatedSections);
    const tagAggGroups = collectPaginatedTagAggregations(paginatedSections);
    if (tagNames.length === 0) {
      setPrintTagValues({});
      setPrintExpandedRows({});
      setPrintFetchError(null);
      setPrintFetchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPrintFetchLoading(true);
    setPrintFetchError(null);
    const fromISO = fromD.toISOString();
    const toISO = toD.toISOString();

    fetchPaginatedHistoricalData({
      sections: paginatedSections,
      tagNames,
      tagAggGroups,
      fromISO,
      toISO,
    })
      .then(({ tagValues, expandedRows }) => {
        if (cancelled) return;
        setPrintTagValues(tagValues || {});
        setPrintExpandedRows(expandedRows || {});
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Job Logs paginated print fetch:', err);
        setPrintFetchError(err?.response?.data?.error || err?.message || 'Failed to load print data');
        setPrintTagValues({});
        setPrintExpandedRows({});
      })
      .finally(() => {
        if (!cancelled) setPrintFetchLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedJob, paginatedSections]);

  const selectedTemplate = useMemo(() =>
    templates.find(t => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const handleOrderPdf = useCallback(async () => {
    if (!printReportRef.current || !selectedJob) return;
    setPdfExporting(true);
    const el = printReportRef.current.querySelector('.paginated-preview-root')
      || printReportRef.current.firstElementChild
      || printReportRef.current;
    const prevOverflow = el.style.overflow;
    try {
      el.classList.add('rb-pdf-export');
      if (paginatedPageMode === 'a4') el.classList.add('rb-pdf-export-paginated-a4');
      el.style.overflow = 'visible';
      const safeName = `${selectedJob.order_name || 'order'}_${selectedTemplate?.name || 'report'}`.replace(/[^\w\-]+/g, '_');
      await exportAsPDFUtil(el, safeName, { orientation: 'portrait', pageMode: 'a4' });
    } catch (err) {
      console.error('Job Logs PDF export failed:', err);
      toast.error('PDF export failed');
    } finally {
      el.style.overflow = prevOverflow;
      el.classList.remove('rb-pdf-export-paginated-a4', 'rb-pdf-export');
      setPdfExporting(false);
    }
  }, [selectedJob, selectedTemplate, paginatedPageMode]);

  const handleOrderPrint = useCallback(() => {
    if (!printDateRange) {
      toast.error('Report data not ready for print');
      return;
    }
    window.print();
  }, [printDateRange]);

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
    <>
    <div className="jl-job-logs-screen h-[100dvh] min-h-0 flex flex-col overflow-hidden" style={{ background: theme.pageBg, color: theme.text }}>
      {/* Header */}
      <div className="px-4 py-3 md:px-6 flex items-center justify-between flex-shrink-0"
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

      <div className="flex-1 flex flex-col min-h-0 gap-2 px-3 py-2 md:px-4 md:py-3 overflow-hidden">
        {/* Jobs card (top) — fixed share of viewport; table scrolls inside */}
        <div
          className="rounded-lg overflow-hidden flex flex-col shrink-0 h-[min(32vh,280px)] sm:h-[min(34vh,300px)] md:h-[min(36vh,320px)]"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            boxShadow: cardShadow,
          }}
        >
          <div className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 flex-shrink-0"
            style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div>
              <h2 className="text-xs md:text-sm font-bold" style={{ color: theme.text }}>Jobs (last 100 orders)</h2>
              {selectedTemplate?.name ? (
                <p className="text-[10px] md:text-xs mt-0.5 truncate max-w-[70vw]" style={{ color: theme.textMuted }}>Layout: {selectedTemplate.name}</p>
              ) : null}
            </div>
          </div>

          <div className="px-3 py-2 flex items-center gap-2 flex-wrap flex-shrink-0"
            style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt }}>
            <div className="relative flex-1 min-w-[160px] max-w-md">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: theme.textMuted }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search orders..."
                className="w-full pl-7 pr-2 py-1 rounded-md text-xs md:text-sm"
                style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>
            <span className="text-[10px] md:text-xs font-medium whitespace-nowrap" style={{ color: theme.textMuted }}>
              {total} order{total !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin" style={{ color: theme.accent }} />
                <span className="ml-2 text-xs" style={{ color: theme.textMuted }}>Loading orders…</span>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <ClipboardList size={32} style={{ color: theme.textMuted }} />
                <p className="text-sm" style={{ color: theme.textMuted }}>
                  {jobs.length === 0 ? 'No orders found for this layout' : 'No matching orders'}
                </p>
              </div>
            ) : (
              <table className="w-full text-[11px] md:text-xs">
                <thead className="sticky top-0 z-[1] shadow-sm">
                  <tr style={{ background: theme.surfaceAlt, borderBottom: `1px solid ${theme.border}` }}>
                    <th className="text-left px-2 py-1.5 md:px-3 font-semibold whitespace-nowrap" style={{ color: theme.textSecondary }}>Ident</th>
                    <th className="text-left px-2 py-1.5 md:px-3 font-semibold whitespace-nowrap" style={{ color: theme.textSecondary }}>Start</th>
                    <th className="text-left px-2 py-1.5 md:px-3 font-semibold whitespace-nowrap hidden sm:table-cell" style={{ color: theme.textSecondary }}>End</th>
                    <th className="text-left px-2 py-1.5 md:px-3 font-semibold whitespace-nowrap" style={{ color: theme.textSecondary }}>Dur.</th>
                    <th className="text-left px-2 py-1.5 md:px-3 font-semibold whitespace-nowrap" style={{ color: theme.textSecondary }}>Status</th>
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
                        <td className="px-2 py-1.5 md:px-3 font-semibold" style={{ color: theme.accent }}>
                          {job.order_name}
                        </td>
                        <td className="px-2 py-1.5 md:px-3 whitespace-nowrap" style={{ color: theme.text }}>
                          {formatDateTime(job.start_time)}
                        </td>
                        <td className="px-2 py-1.5 md:px-3 whitespace-nowrap hidden sm:table-cell" style={{ color: theme.text }}>
                          {formatDateTime(job.end_time)}
                        </td>
                        <td className="px-2 py-1.5 md:px-3 whitespace-nowrap" style={{ color: theme.textSecondary }}>
                          {formatDuration(job.duration_seconds)}
                        </td>
                        <td className="px-2 py-1.5 md:px-3">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium"
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

        {/* Detail: fills remaining height; inner panels scroll */}
        <div
          className="rounded-lg flex flex-col flex-1 min-h-0 overflow-hidden"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            boxShadow: cardShadow,
          }}
        >
          {!selectedJob ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] py-8 gap-2 px-4">
              <ClipboardList size={28} style={{ color: theme.textMuted }} />
              <p className="text-xs md:text-sm text-center" style={{ color: theme.textMuted }}>Select an order to view details</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 gap-2 p-2 md:p-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 flex-shrink-0 pb-2"
                style={{ borderBottom: `1px solid ${theme.border}` }}
              >
                <div className="min-w-0">
                  <h2 className="text-base md:text-lg font-bold truncate" style={{ color: theme.text }}>
                    {selectedJob.order_name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] md:text-xs" style={{ color: theme.textSecondary }}>
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
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: selectedJob.status === 'running' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                        color: selectedJob.status === 'running' ? theme.statusRunning : theme.statusCompleted,
                      }}>
                      {selectedJob.status === 'running' ? 'Running' : 'Completed'}
                    </span>
                  </div>
                </div>
                {paginatedSections.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {printFetchError && (
                      <span className="text-[10px] max-w-[200px] truncate" style={{ color: '#f87171' }} title={printFetchError}>
                        {printFetchError}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => { void handleOrderPdf(); }}
                      disabled={printFetchLoading || pdfExporting || !printDateRange}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wide disabled:opacity-45"
                      style={{
                        background: theme.accent,
                        color: '#fff',
                        border: 'none',
                      }}
                      title="Export this order as paginated report PDF"
                    >
                      <Download size={14} />
                      {pdfExporting ? 'PDF…' : 'PDF'}
                    </button>
                    <button
                      type="button"
                      onClick={handleOrderPrint}
                      disabled={printFetchLoading || !printDateRange}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wide disabled:opacity-45"
                      style={{
                        background: theme.surfaceAlt,
                        color: theme.text,
                        border: `1px solid ${theme.border}`,
                      }}
                      title="Print paginated report layout for this order"
                    >
                      <Printer size={14} />
                      Print
                    </button>
                  </div>
                )}
              </div>

              {(() => {
                const showSideSegments = Boolean(segmentRowDef && segmentsPlacement === 'side');
                const showInlineSegments = Boolean(segmentRowDef && segmentsPlacement === 'inline');
                const hasTagCards = detailGroups.some((g) => jobLogsGroupHasRenderableContent(g));
                const showCardsGrid = detailLoading || hasTagCards || showInlineSegments;
                return (
                  <div className={`grid gap-2 flex-1 min-h-0 grid-rows-1 ${showSideSegments ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                    <div
                      className="rounded-md px-2 py-2 md:px-3 flex flex-col min-h-0 h-full min-w-0 overflow-hidden"
                      style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}
                    >
                      <div className="flex-shrink-0 mb-1.5">
                        <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                          Order detail
                        </h3>
                        <p className="text-[9px] md:text-[10px] leading-tight" style={{ color: theme.textMuted }}>
                          Start / end, unique values in the order, or silo segment tables — set per card in Report Builder.
                        </p>
                      </div>

                      {detailLoading ? (
                        <div className="flex items-center gap-2 py-6 justify-center flex-1">
                          <Loader2 size={14} className="animate-spin" style={{ color: theme.accent }} />
                          <span className="text-xs" style={{ color: theme.textMuted }}>Loading…</span>
                        </div>
                      ) : !showCardsGrid ? (
                        <p className="text-xs py-1" style={{ color: theme.textMuted }}>
                          No tags configured. Use Report Builder → Job logs cards.
                          {segmentRowDef && segmentsPlacement === 'hidden'
                            ? ' Silo segments are hidden for this layout.'
                            : ''}
                        </p>
                      ) : (
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5 min-w-0 w-full">
                          <div
                            className="grid gap-2 auto-rows-min w-full"
                            style={{
                              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                            }}
                          >
                            {detailGroups.filter((g) => jobLogsGroupHasRenderableContent(g)).map((group) => {
                              if (group.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW) {
                                const st = segmentCardsByGroupId[group.id] || {
                                  loading: true,
                                  error: null,
                                  segments: [],
                                  rowDef: null,
                                };
                                return (
                                  <div
                                    key={group.id}
                                    className="rounded-md flex flex-col min-h-0 min-w-0 border overflow-hidden"
                                    style={{ background: theme.surface, borderColor: theme.border }}
                                  >
                                    <div
                                      className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 truncate flex-shrink-0 flex items-center gap-1"
                                      style={{ color: theme.text, background: theme.surfaceAlt, borderBottom: `1px solid ${theme.border}` }}
                                      title={group.title}
                                    >
                                      <Layers size={11} style={{ color: theme.textMuted }} />
                                      {group.title}
                                    </div>
                                    <div className="px-1.5 py-1 flex-1 min-h-0 min-w-0 overflow-auto">
                                      <JobLogsSegmentCardTable
                                        theme={theme}
                                        rowDef={st.rowDef}
                                        segments={st.segments}
                                        loading={st.loading}
                                        error={st.error}
                                      />
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={group.id}
                                  className="rounded-md flex flex-col min-h-0 min-w-0 border overflow-hidden"
                                  style={{ background: theme.surface, borderColor: theme.border }}
                                >
                                  <div
                                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 truncate flex-shrink-0"
                                    style={{ color: theme.text, background: theme.surfaceAlt, borderBottom: `1px solid ${theme.border}` }}
                                    title={group.title}
                                  >
                                    {group.title}
                                  </div>
                                  <div className="overflow-x-auto min-h-0">
                                    <table className="w-full text-[9px] md:text-[10px]">
                                      <thead>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                          <th className="text-left px-1.5 py-0.5 font-semibold align-bottom" style={{ color: theme.textMuted }}>Tag</th>
                                          <th className="text-right px-1 py-0.5 font-semibold whitespace-nowrap" style={{ color: theme.textMuted }}>Start</th>
                                          <th className="text-right px-1 py-0.5 font-semibold whitespace-nowrap" style={{ color: theme.textMuted }}>End</th>
                                          <th className="text-right px-1.5 py-0.5 font-semibold whitespace-nowrap" style={{ color: theme.accent }}>Δ</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(group.tags || []).map((entry, idx) => {
                                          const tagName = typeof entry === 'string' ? entry : entry?.tagName;
                                          const isUnique = typeof entry === 'object' && entry?.jobLogsValueMode === JOB_LOGS_VALUE_UNIQUE;
                                          const r = detailData[tagName] && typeof detailData[tagName] === 'object' ? detailData[tagName] : {};
                                          const startCell = isUnique || r.mode === 'unique_in_range'
                                            ? formatTagCell(r.unique)
                                            : formatTagCell(r.start);
                                          const endCell = isUnique || r.mode === 'unique_in_range' ? '—' : formatTagCell(r.end);
                                          const deltaCell = isUnique || r.mode === 'unique_in_range'
                                            ? '—'
                                            : (r.total !== null && r.total !== undefined ? formatTagCell(r.total) : '—');
                                          return (
                                            <tr key={`${group.id}-${tagName}-${idx}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                              <td className="px-1.5 py-0.5 font-mono align-top max-w-[100px] md:max-w-[160px]">
                                                <span className="block truncate" title={tagName} style={{ color: theme.text }}>
                                                  {tagName}
                                                  {(isUnique || r.mode === 'unique_in_range') && (
                                                    <span className="block text-[8px] font-sans normal-case opacity-75" style={{ color: theme.textMuted }}>Unique in order</span>
                                                  )}
                                                </span>
                                              </td>
                                              <td className="px-1 py-0.5 text-right font-mono align-top break-words whitespace-pre-wrap max-w-[140px]" style={{ color: theme.textSecondary }}>{startCell}</td>
                                              <td className="px-1 py-0.5 text-right font-mono align-top whitespace-nowrap" style={{ color: theme.textSecondary }}>{endCell}</td>
                                              <td className="px-1.5 py-0.5 text-right font-mono font-semibold align-top whitespace-nowrap" style={{ color: theme.accent }}>
                                                {deltaCell}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}

                            {showInlineSegments && segmentRowDef && (
                              <div
                                className="rounded-md flex flex-col min-h-0 min-w-0 border overflow-hidden"
                                style={{ background: theme.surface, borderColor: theme.border }}
                              >
                                <div
                                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 truncate flex-shrink-0 flex items-center gap-1"
                                  style={{ color: theme.text, background: theme.surfaceAlt, borderBottom: `1px solid ${theme.border}` }}
                                  title="Silo segments"
                                >
                                  <Layers size={11} style={{ color: theme.textMuted }} />
                                  Silo segments
                                </div>
                                <div className="px-2 py-1.5 flex flex-col min-h-0 flex-1 overflow-hidden">
                                  <p className="text-[9px] md:text-[10px] mb-1 leading-tight flex-shrink-0" style={{ color: theme.textSecondary }}>
                                    Driver: <span className="font-mono">{segmentRowDef.segCell?.tagName || '?'}</span>
                                    {segmentRowDef.sectionLabel ? (
                                      <span className="ml-1" style={{ color: theme.textMuted }}>({segmentRowDef.sectionLabel})</span>
                                    ) : null}
                                  </p>
                                  <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                                    <SiloSegmentBlocks
                                      theme={theme}
                                      segmentRowDef={segmentRowDef}
                                      segmentLoading={segmentLoading}
                                      segmentError={segmentError}
                                      segmentData={segmentData}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {showSideSegments && segmentRowDef && (
                      <div
                        className="rounded-md px-2 py-2 md:px-3 flex flex-col min-h-0 h-full min-w-0 overflow-hidden"
                        style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}
                      >
                        <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1 flex-wrap"
                          style={{ color: theme.textMuted }}>
                          <Layers size={11} />
                          Silo segments
                        </h3>
                        <p className="text-[9px] md:text-[10px] mb-1.5 leading-tight" style={{ color: theme.textSecondary }}>
                          Driver: <span className="font-mono">{segmentRowDef.segCell?.tagName || '?'}</span>
                          {segmentRowDef.sectionLabel ? (
                            <span className="ml-1" style={{ color: theme.textMuted }}>({segmentRowDef.sectionLabel})</span>
                          ) : null}
                        </p>
                        <SiloSegmentBlocks
                          theme={theme}
                          segmentRowDef={segmentRowDef}
                          segmentLoading={segmentLoading}
                          segmentError={segmentError}
                          segmentData={segmentData}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>

    {selectedJob && paginatedSections.length > 0 && printDateRange && (
      <div
        className="jl-job-logs-print-target"
        style={{
          position: 'fixed',
          left: '-12000px',
          top: 0,
          width: paginatedPageMode === 'a4' ? '794px' : '100%',
          maxWidth: '100%',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      >
        <div ref={printReportRef}>
          <PaginatedReportPreview
            sections={paginatedSections}
            tagValues={printTagValues}
            dateRange={printDateRange}
            compact={paginatedPageMode === 'full'}
            isPreviewMode
            tagDecimalByName={tagDecimalByName}
            expandedRows={printExpandedRows}
            jobLogOrderTitle={selectedJob.order_name}
            hideHeaderStatus
          />
        </div>
      </div>
    )}
    </>
  );
}
