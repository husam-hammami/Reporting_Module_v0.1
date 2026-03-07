import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaPrint, FaExpand, FaCompress, FaClock, FaFilePdf, FaImage } from 'react-icons/fa';
import { exportAsPNG, exportAsPDF } from '../../utils/exportReport';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import { useReportCanvas, useReportTemplates, useAvailableTags, collectWidgetTagNames, collectWidgetTagAggregations } from '../../Hooks/useReportBuilder';
import { useTagHistory } from '../../Hooks/useTagHistory';
import { useEmulator } from '../../Context/EmulatorContext';
import { useSocket } from '../../Context/SocketContext';
import WidgetRenderer, { CARDLESS_WIDGET_TYPES, INVISIBLE_WRAPPER_TYPES } from '../ReportBuilder/widgets/WidgetRenderer';
import ReportThumbnail from '../ReportBuilder/ReportThumbnail';
import '../ReportBuilder/reportBuilderTheme.css';
import axios from '../../API/axios';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const STATUS_STYLE = {
  draft: 'text-gray-400 bg-gray-500/10',
  validated: 'text-brand bg-[#0e74901a]',
  published: 'text-emerald-500 bg-emerald-500/10',
};

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

const GRID_COLS_DEFAULT = 12;
const GRID_ROW_H_DEFAULT = 40;
const GRID_MARGIN = [8, 8];
const GRID_PADDING = [0, 0];

/* ── Time filter presets ─────────────────────────────────────── */

const TIME_PRESETS = [
  { id: 'live', label: 'Live' },
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'shift', label: 'Shift' },
  { id: 'custom', label: 'Custom' },
];

function getDateRange(preset) {
  const now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'day': return { from: sod, to: now };
    case 'week': { const d = now.getDay(); const diff = d === 0 ? 6 : d - 1; const m = new Date(sod); m.setDate(m.getDate() - diff); return { from: m, to: now }; }
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    default: return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   REPORT LIST
   ══════════════════════════════════════════════════════════════════ */

function ReportList({ onSelect }) {
  const { templates, loading } = useReportTemplates();

  if (loading) return <div className="text-center py-16 text-[12px] text-[#8898aa]">Loading...</div>;

  if (templates.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-[14px] font-semibold text-[#3a4a5c] dark:text-[#c1ccd9] mb-1">No reports yet</h3>
        <p className="text-[12px] text-[#8898aa] max-w-sm mx-auto">Build a report in Report Builder first.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
      {templates.map((t) => {
        const status = t.status || 'draft';
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="text-left bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-gray-700/30 rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:shadow-gray-900/5 dark:hover:shadow-cyan-500/3 transition-all duration-150 group"
          >
            {/* Preview area — real report thumbnail */}
            <div className="relative h-56 w-full flex items-stretch overflow-hidden">
              <ReportThumbnail template={t} />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide rounded ${STATUS_STYLE[status] || STATUS_STYLE.draft}`}>
                  {status}
                </span>
              </div>
            </div>
            {/* Info */}
            <div className="p-3.5">
              <h3 className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-brand transition-colors">{t.name || 'Untitled'}</h3>
              {t.description && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{t.description}</p>
              )}
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[9px] text-gray-400 dark:text-gray-500">{timeAgo(t.updated_at)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SINGLE REPORT VIEW
   ══════════════════════════════════════════════════════════════════ */

function SingleReportView({ reportId, onBack }) {
  const { template, widgets, loading } = useReportCanvas(reportId);
  const { tags } = useAvailableTags();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const { socket } = useSocket();

  const [timePreset, setTimePreset] = useState('live');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shiftsConfig, setShiftsConfig] = useState(null);
  const [selectedShift, setSelectedShift] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [liveTagValues, setLiveTagValues] = useState({});
  const [liveError, setLiveError] = useState(null);
  const [historicalTagValues, setHistoricalTagValues] = useState({});
  const [historicalTagHistory, setHistoricalTagHistory] = useState(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState(null);
  const scrollContainerRef = useRef(null);
  const { containerRef, width: gridWidth } = useContainerWidth();

  const [measuredGridWidth, setMeasuredGridWidth] = useState(0);
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === 'number') setMeasuredGridWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [Array.isArray(widgets) ? widgets.length : 0]);

  const effectiveGridWidth = measuredGridWidth > 0 ? measuredGridWidth : (gridWidth || 1200);

  const handleWheelCapture = useCallback((e) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nextScrollTop = el.scrollTop + e.deltaY;
    el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, nextScrollTop));
    e.preventDefault();
  }, []);

  const usedTagNames = useMemo(() => collectWidgetTagNames(widgets), [widgets]);
  const tagAggregations = useMemo(() => collectWidgetTagAggregations(widgets), [widgets]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live mode: fetch tag values from backend (REST + polling)
  React.useEffect(() => {
    if (timePreset !== 'live' || usedTagNames.length === 0) return;
    let errorShown = false;
    const fetchValues = async () => {
      try {
        const res = await axios.get('/api/live-monitor/tags', {
          params: { tags: usedTagNames.join(',') },
        });
        const data = res.data?.tag_values ?? res.data?.data ?? res.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setLiveTagValues((prev) => ({ ...prev, ...data }));
          setLiveError(null);
        }
      } catch (err) {
        console.error('Failed to fetch tag values:', err);
        if (!errorShown) {
          setLiveError(err.response?.data?.error || err.message || 'Failed to fetch live data');
          errorShown = true;
        }
      }
    };
    setLiveError(null);
    fetchValues();
    const interval = setInterval(fetchValues, 5000);
    return () => clearInterval(interval);
  }, [timePreset, usedTagNames]);

  // Live mode: WebSocket updates
  React.useEffect(() => {
    if (timePreset !== 'live' || !socket) return;
    const handler = (data) => {
      if (data?.tag_values && typeof data.tag_values === 'object') {
        setLiveTagValues((prev) => ({ ...prev, ...data.tag_values }));
      }
    };
    socket.on('live_tag_data', handler);
    return () => socket.off('live_tag_data', handler);
  }, [timePreset, socket]);

  // Fetch shift schedule for the Shift time preset
  useEffect(() => {
    axios.get('/api/settings/shifts')
      .then(res => setShiftsConfig(res.data))
      .catch(() => {});
  }, []);

  const dateRange = useMemo(() => {
    if (timePreset === 'custom') {
      return { from: customFrom ? new Date(customFrom) : new Date(), to: customTo ? new Date(customTo) : new Date() };
    }
    if (timePreset === 'shift' && selectedShift !== '' && shiftsConfig?.shifts) {
      const idx = parseInt(selectedShift);
      const shift = shiftsConfig.shifts[idx];
      if (shift) {
        const today = new Date();
        const [startH, startM] = shift.start.split(':').map(Number);
        const [endH, endM] = shift.end.split(':').map(Number);
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startH, startM, 0);
        const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endH, endM, 0);
        if (to <= from) to.setDate(to.getDate() + 1);
        return { from, to };
      }
    }
    return getDateRange(timePreset);
  }, [timePreset, customFrom, customTo, selectedShift, shiftsConfig]);

  // Historical mode: fetch tag values from historian, grouped by aggregation type.
  // Different widgets may need different aggregations (sum, avg, delta, last, etc.),
  // so we group tags by their widget's configured aggregation and fire parallel requests.
  React.useEffect(() => {
    if (timePreset === 'live' || usedTagNames.length === 0) return;
    if (!dateRange?.from || !dateRange?.to) return;

    let cancelled = false;
    setHistoricalLoading(true);
    setHistoricalError(null);

    const fetchHistorical = async () => {
      try {
        const fromISO = dateRange.from instanceof Date ? dateRange.from.toISOString() : dateRange.from;
        const toISO = dateRange.to instanceof Date ? dateRange.to.toISOString() : dateRange.to;

        // Group tags by aggregation type
        const aggGroups = {}; // { 'last': [tag1,tag2], 'sum': [tag3], ... }
        usedTagNames.forEach((tagName) => {
          const agg = tagAggregations[tagName] || 'last';
          if (!aggGroups[agg]) aggGroups[agg] = [];
          aggGroups[agg].push(tagName);
        });

        // Fire parallel requests per aggregation type
        const entries = Object.entries(aggGroups);
        const results = await Promise.all(
          entries.map(([agg, tagNames]) =>
            axios.get('/api/historian/by-tags', {
              params: { tag_names: tagNames.join(','), from: fromISO, to: toISO, aggregation: agg },
            }).then((res) => res.data?.data || {})
              .catch(() => ({})) // individual failures don't block others
          )
        );

        if (!cancelled) {
          // Merge all results into a single object
          const merged = {};
          results.forEach((data) => Object.assign(merged, data));
          setHistoricalTagValues(merged);
          setHistoricalLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch historical data:', err);
          setHistoricalError(err.response?.data?.error || err.message || 'Failed to load historical data');
          setHistoricalLoading(false);
        }
      }
    };

    fetchHistorical();
    return () => { cancelled = true; };
  }, [timePreset, usedTagNames, tagAggregations, dateRange]);

  // Historical mode: fetch time-series data for chart widgets.
  // Charts need arrays of {t, v} per tag (not single aggregated values).
  const chartTagNames = useMemo(() => {
    const names = new Set();
    if (!Array.isArray(widgets)) return [];
    widgets.forEach((w) => {
      if (w.type === 'chart' || w.type === 'barchart') {
        const series = w.config?.series || [];
        series.forEach((s) => {
          const tn = s.dataSource?.tagName || s.tagName;
          if (tn) names.add(tn);
        });
      }
    });
    return Array.from(names);
  }, [widgets]);

  React.useEffect(() => {
    if (timePreset === 'live') {
      setHistoricalTagHistory(null);
      return;
    }
    if (chartTagNames.length === 0) return;
    if (!dateRange?.from || !dateRange?.to) return;

    let cancelled = false;
    // Clear previous data immediately so chart rebuilds with new timeframe
    setHistoricalTagHistory(null);

    const fetchTimeSeries = async () => {
      try {
        const fromISO = dateRange.from instanceof Date ? dateRange.from.toISOString() : dateRange.from;
        const toISO = dateRange.to instanceof Date ? dateRange.to.toISOString() : dateRange.to;

        const res = await axios.get('/api/historian/time-series', {
          params: { tag_names: chartTagNames.join(','), from: fromISO, to: toISO, max_points: 500 },
        });

        if (!cancelled) {
          const seriesData = res.data?.data || {};
          const hasData = Object.values(seriesData).some((arr) => Array.isArray(arr) && arr.length >= 2);
          if (hasData) {
            setHistoricalTagHistory(seriesData);
          } else {
            // No historical data in DB — leave null so charts use live accumulation
            setHistoricalTagHistory(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch time-series data:', err);
          setHistoricalTagHistory(null);
        }
      }
    };

    fetchTimeSeries();
    return () => { cancelled = true; };
  }, [timePreset, chartTagNames, dateRange]);

  const tagValues = useMemo(() => {
    if (timePreset !== 'live') return historicalTagValues;
    const base = { ...liveTagValues };
    if (emulatorOn && emulatorValues) Object.assign(base, emulatorValues);
    return base;
  }, [timePreset, liveTagValues, emulatorOn, emulatorValues, historicalTagValues]);

  const liveTagHistory = useTagHistory(usedTagNames, tagValues);
  // In historical mode, prefer backend time-series data for charts (full timeframe);
  // in live mode, use the accumulated live tag history from useTagHistory.
  const tagHistory = useMemo(() => {
    if (timePreset !== 'live' && historicalTagHistory) {
      // Only use historical data for tags that actually have data points
      const merged = { ...liveTagHistory };
      for (const [tagName, points] of Object.entries(historicalTagHistory)) {
        if (Array.isArray(points) && points.length >= 2) {
          merged[tagName] = points;
        }
      }
      return merged;
    }
    return liveTagHistory;
  }, [timePreset, liveTagHistory, historicalTagHistory]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const el = document.getElementById('report-print-section');
      await exportAsPDF(el, template?.name || 'report');
    } finally { setExporting(false); }
  };
  const handleExportPNG = async () => {
    setExporting(true);
    try {
      const el = document.getElementById('report-print-section');
      await exportAsPNG(el, template?.name || 'report');
    } finally { setExporting(false); }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.(); setFullscreen(true); }
    else { document.exitFullscreen?.(); setFullscreen(false); }
  };

  const gridCols = template?.layout_config?.grid?.cols ?? GRID_COLS_DEFAULT;
  const gridRowH = template?.layout_config?.grid?.rowHeight ?? GRID_ROW_H_DEFAULT;
  const pageMode = template?.layout_config?.grid?.pageMode || 'a4';

  const layout = useMemo(
    () =>
      (Array.isArray(widgets) ? widgets : [])
        .filter((w) => w && typeof w === 'object')
        .map((w) => ({
          i: String(w.id),
          x: Number.isFinite(w.x) ? Math.max(0, w.x) : 0,
          y: Number.isFinite(w.y) ? Math.max(0, w.y) : 0,
          w: w.w >= 1 ? w.w : 3,
          h: w.h >= 1 ? w.h : 2,
          static: true, /* read-only: no drag/resize on reporting page */
        })),
    [widgets],
  );

  const widgetMap = useMemo(
    () => new Map((Array.isArray(widgets) ? widgets : []).filter((w) => w?.id).map((w) => [w.id, w])),
    [widgets],
  );

  if (loading) return <div className="flex items-center justify-center h-[calc(100vh-64px)] text-[12px] text-[#8898aa]">Loading report...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#f8f9fb] dark:bg-[#060c18]">
      {/* ── Toolbar: back + title | date/time + time filters (left, centered) | actions ── */}
      <div className="bg-white dark:bg-[#131b2d] border-b border-[#e3e9f0] dark:border-[#1e2d40] px-4 py-3 flex items-center gap-4 flex-shrink-0 print:hidden">
        {/* Left: back + report name */}
        <button onClick={onBack} className="p-2 rounded-md text-[#6b7f94] hover:text-brand hover:bg-brand-subtle transition-colors flex-shrink-0">
          <FaChevronLeft size={14} />
        </button>
        <span className="text-[14px] font-semibold text-[#2a3545] dark:text-[#e1e8f0] truncate min-w-0">{template?.name || 'Report'}</span>

        {/* Center/left: current date & time + time filter buttons (visible, middle-aligned) */}
        <div className="flex items-center gap-4 flex-1 justify-center min-w-0">
          <span className="text-[13px] font-medium text-[#3a4a5c] dark:text-[#c1ccd9] whitespace-nowrap tabular-nums" title="Current date and time">
            {now.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setTimePreset(p.id)}
                className={`px-3 py-2 text-[12px] font-semibold rounded-lg border-2 transition-colors ${
                  timePreset === p.id
                    ? 'border-brand bg-brand-subtle text-brand dark:bg-[#0f2840] dark:text-brand dark:border-brand'
                    : 'border-[#e3e9f0] dark:border-[#1e2d40] text-[#5a6d80] dark:text-[#8898aa] hover:border-[#0e749080] hover:bg-[#f0f7ff] dark:hover:bg-[#131b2d]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: fullscreen + print */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={toggleFullscreen} className="p-2 rounded-lg text-[#6b7f94] hover:text-brand hover:bg-brand-subtle transition-colors border border-transparent hover:border-[#e3e9f0]" title="Fullscreen">
            {fullscreen ? <FaCompress size={14} /> : <FaExpand size={14} />}
          </button>
          <div className="relative group">
            <button className="inline-flex items-center gap-2 px-3 py-2 text-[12px] font-semibold rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
              <FaPrint size={12} /> {exporting ? 'Exporting...' : 'Export'}
            </button>
            <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={() => window.print()} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg flex items-center gap-2">
                <FaPrint className="text-[10px]" /> Print
              </button>
              <button onClick={handleExportPDF} disabled={exporting} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50">
                <FaFilePdf className="text-[10px]" /> Export PDF
              </button>
              <button onClick={handleExportPNG} disabled={exporting} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg flex items-center gap-2 disabled:opacity-50">
                <FaImage className="text-[10px]" /> Export PNG
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Custom date range (only when custom selected) ── */}
      {timePreset === 'custom' && (
        <div className="bg-white dark:bg-[#131b2d] border-b border-[#e3e9f0] dark:border-[#1e2d40] px-4 py-2 flex items-center gap-3 print:hidden">
          <label className="text-[10px] font-medium text-[#6b7f94]">From</label>
          <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="text-[11px] rounded-md border border-[#e3e9f0] bg-white dark:bg-[#131b2d] px-2 py-1 text-[#3a4a5c] focus:outline-none focus:border-brand" />
          <label className="text-[10px] font-medium text-[#6b7f94]">To</label>
          <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="text-[11px] rounded-md border border-[#e3e9f0] bg-white dark:bg-[#131b2d] px-2 py-1 text-[#3a4a5c] focus:outline-none focus:border-brand" />
        </div>
      )}

      {/* ── Shift selector (when shift selected) ── */}
      {timePreset === 'shift' && (
        <div className="bg-white dark:bg-[#131b2d] border-b border-[#e3e9f0] dark:border-[#1e2d40] px-4 py-2 flex items-center gap-3 print:hidden">
          {shiftsConfig?.shifts?.length > 0 ? (
            <>
              <label className="text-[10px] font-medium text-[#6b7f94]">Shift</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-brand"
              >
                <option value="">Select shift...</option>
                {shiftsConfig.shifts.map((s, i) => (
                  <option key={i} value={i}>{s.name} ({s.start} - {s.end})</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <FaClock size={9} className="text-[#d97706]" />
              <span className="text-[10px] font-medium text-[#d97706]">No shifts configured — go to Engineering &gt; Shifts</span>
            </>
          )}
        </div>
      )}

      {/* ── Status indicator ── */}
      {timePreset === 'live' ? (
        <div className={`border-b px-4 py-1 flex items-center gap-2 print:hidden ${
          liveError
            ? 'bg-[#fef2f2] dark:bg-[#1a0c0c] border-[#fca5a5]/30'
            : emulatorOn
              ? 'bg-[#ecfdf5] dark:bg-[#0d2e1f] border-[#a7f3d0] dark:border-[#065f46]'
              : 'bg-[#fffbeb] dark:bg-[#1a1800] border-[#fcd34d]/30'
        }`}>
          {liveError
            ? <><span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" /><span className="text-[10px] font-medium text-[#ef4444]">{liveError}</span></>
            : emulatorOn
              ? <><span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" /><span className="text-[10px] font-medium text-[#059669]">Live</span></>
              : <><FaClock size={9} className="text-[#d97706]" /><span className="text-[10px] font-medium text-[#d97706]">Emulator off — enable in Engineering</span></>
          }
        </div>
      ) : (
        <div className={`border-b px-4 py-1 flex items-center gap-2 print:hidden ${
          historicalLoading
            ? 'bg-[#eff6ff] dark:bg-[#0c1a2e] border-[#93c5fd]/30'
            : historicalError
              ? 'bg-[#fef2f2] dark:bg-[#1a0c0c] border-[#fca5a5]/30'
              : Object.keys(historicalTagValues).length > 0
                ? 'bg-[#f0f9ff] dark:bg-[#0c1e2e] border-[#7dd3fc]/30'
                : 'bg-[#fffbeb] dark:bg-[#1a1800] border-[#fcd34d]/30'
        }`}>
          {historicalLoading ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" /><span className="text-[10px] font-medium text-[#3b82f6]">Loading historical data...</span></>
          ) : historicalError ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" /><span className="text-[10px] font-medium text-[#ef4444]">{historicalError}</span></>
          ) : Object.keys(historicalTagValues).length > 0 ? (
            <><FaClock size={9} className="text-[#0284c7]" /><span className="text-[10px] font-medium text-[#0284c7]">
              Historical — {dateRange?.from?.toLocaleDateString?.()} {dateRange?.from?.toLocaleTimeString?.(undefined, {hour:'2-digit',minute:'2-digit'})} to {dateRange?.to?.toLocaleDateString?.()} {dateRange?.to?.toLocaleTimeString?.(undefined, {hour:'2-digit',minute:'2-digit'})} ({Object.keys(historicalTagValues).length} tags)
            </span></>
          ) : (
            <><FaClock size={9} className="text-[#d97706]" /><span className="text-[10px] font-medium text-[#d97706]">No historical data for this period</span></>
          )}
        </div>
      )}

      {/* ── Report content: full width; scrollable with mouse wheel ── */}
      <div
        ref={scrollContainerRef}
        className="report-builder flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-behavior-auto"
        style={{ WebkitOverflowScrolling: 'touch', background: 'var(--rb-canvas)' }}
        onWheelCapture={handleWheelCapture}
      >
        <div id="report-print-section" className={`w-full min-w-0 mx-auto ${pageMode === 'a4' ? 'max-w-[1200px]' : 'max-w-full'}`}>
          {!(Array.isArray(widgets) && widgets.length > 0) ? (
            <div className="text-center py-16 text-[12px] text-[#6b7f94] dark:text-[#8898aa]">No widgets in this report.</div>
          ) : (
            <div
              ref={containerRef}
              className="report-builder rb-canvas-perspective rb-layout-readonly pt-3 pb-6 px-6"
              style={{ minHeight: '100%', width: '100%', boxSizing: 'border-box' }}
            >
              <GridLayout
                className="layout"
                layout={layout}
                width={effectiveGridWidth}
                cols={gridCols}
                rowHeight={gridRowH}
                margin={GRID_MARGIN}
                containerPadding={GRID_PADDING}
                compactType={null}
                allowOverlap={true}
                isDraggable={false}
                isResizable={false}
                static
                useCSSTransforms={true}
              >
                {layout.map((item) => {
                  const widget = widgetMap.get(item.i);
                  if (!widget) return null;
                  const wt = widget.type;
                  const isInvisible = wt === 'text';
                  const showCard = isInvisible
                    ? false
                    : CARDLESS_WIDGET_TYPES.has(wt)
                      ? widget.config?.showCard === true
                      : widget.config?.showCard !== false;
                  const cardClass = isInvisible
                    ? 'overflow-visible flex flex-col min-h-0'
                    : showCard
                      ? 'rounded-lg rb-widget-card overflow-hidden flex flex-col'
                      : 'overflow-hidden flex flex-col min-h-0 p-0.5';
                  return (
                    <div key={item.i} className={`${cardClass} flex flex-col min-h-0 relative`}>
                      <WidgetRenderer widget={widget} tagValues={tagValues} isPreview={true} isSelected={false} tags={tags} tagHistory={tagHistory} />
                      {widget.config?.showSeparator && (
                        <div
                          className="absolute left-0 right-0 bottom-0 pointer-events-none"
                          style={{
                            borderBottom: `${widget.config.separatorThickness || 1}px ${widget.config.separatorStyle || 'solid'} ${widget.config.separatorColor || '#d1d5db'}`,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </GridLayout>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ══════════════════════════════════════════════════════════════════ */

export default function ReportViewer() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (id) return <SingleReportView reportId={id} onBack={() => navigate('/reporting')} />;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f8f9fb] dark:bg-[#060c18]">
      <div className="px-5 py-4 border-b border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d]">
        <h1 className="text-[15px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">Reporting</h1>
        <p className="text-[11px] text-[#8898aa] mt-0.5">Select a report to view with live or historical data</p>
      </div>
      <ReportList onSelect={(rid) => navigate(`/reporting/${rid}`)} />
    </div>
  );
}
