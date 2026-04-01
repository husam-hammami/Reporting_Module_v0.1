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
import ReportListingPage from '../../Components/Reports/ReportListingPage';
import PaginatedReportView from './PaginatedReportViewer';
import TimePeriodTabs, { VIEWER_TABS } from './TimePeriodTabs';
import useTimePeriod from '../../Hooks/useTimePeriod';
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
const GRID_MARGIN = [6, 6];
const GRID_PADDING = [0, 0];


/* ══════════════════════════════════════════════════════════════════
   REPORT LIST
   ══════════════════════════════════════════════════════════════════ */

function getReportType(t) {
  try {
    const lc = typeof t?.layout_config === 'string' ? JSON.parse(t.layout_config) : (t?.layout_config || {});
    return lc.reportType || 'dashboard';
  } catch { return 'dashboard'; }
}

function ReportList({ onSelect, filterType }) {
  const { templates, loading } = useReportTemplates();

  if (loading) return <div className="text-center py-16 text-[12px] text-[#8898aa]">Loading...</div>;

  // When filterType is set (Dashboards / Table Reports pages), only show released reports of that type
  const filtered = filterType
    ? templates.filter((t) => {
        const rt = getReportType(t);
        const matchesType = filterType === 'dashboard' ? rt !== 'paginated' : rt === 'paginated';
        return matchesType && t.status === 'released';
      })
    : templates;

  if (filtered.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-[14px] font-semibold text-[#3a4a5c] dark:text-[#c1ccd9] mb-1">
          {filterType ? 'No released reports' : 'No reports yet'}
        </h3>
        <p className="text-[12px] text-[#8898aa] max-w-sm mx-auto">
          {filterType ? 'Release a report from the Builder to see it here.' : 'Build a report in Report Builder first.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
      {filtered.map((t) => {
        const status = t.status || 'draft';
        const reportType = getReportType(t);
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="text-left bg-white/90 dark:bg-[#091422] border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-150 group backdrop-blur-sm"
          >
            {/* Preview area — real report thumbnail */}
            <div className="relative h-56 w-full flex items-stretch overflow-hidden">
              <ReportThumbnail template={t} />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                {reportType === 'paginated' && (
                  <span className="px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide rounded bg-purple-500/10 text-purple-500">
                    Paginated
                  </span>
                )}
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

function SingleReportView({ reportId, onBack, siblingReports, onSelectReport }) {
  const { template, widgets, loading } = useReportCanvas(reportId);
  const { tags } = useAvailableTags();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const { socket } = useSocket();

  // Detect paginated report type and render dedicated viewer
  const isPaginated = useMemo(() => {
    if (!template) return false;
    const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
    return lc.reportType === 'paginated';
  }, [template]);

  const [shiftsConfig, setShiftsConfig] = useState(null);
  const { state: timePeriod, dateRange, actions: tpActions } = useTimePeriod('live', shiftsConfig);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'tabular'
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [tablePage, setTablePage] = useState({}); // { [widgetId]: pageNumber }
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
    if (timePeriod.tab !== 'live' || usedTagNames.length === 0) return;
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
  }, [timePeriod.tab, usedTagNames]);

  // Live mode: WebSocket updates
  React.useEffect(() => {
    if (timePeriod.tab !== 'live' || !socket) return;
    const handler = (data) => {
      if (data?.tag_values && typeof data.tag_values === 'object') {
        setLiveTagValues((prev) => ({ ...prev, ...data.tag_values }));
      }
    };
    socket.on('live_tag_data', handler);
    return () => socket.off('live_tag_data', handler);
  }, [timePeriod.tab, socket]);

  // Fetch shift schedule for the Shift time preset
  useEffect(() => {
    axios.get('/api/settings/shifts')
      .then(res => setShiftsConfig(res.data))
      .catch(() => {});
  }, []);


  // Historical mode: fetch tag values from historian, grouped by aggregation type.
  // Different widgets may need different aggregations (sum, avg, delta, last, etc.),
  // so we group tags by their widget's configured aggregation and fire parallel requests.
  React.useEffect(() => {
    if (timePeriod.tab === 'live' || usedTagNames.length === 0) return;
    if (!dateRange?.from || !dateRange?.to) return;

    let cancelled = false;
    setHistoricalLoading(true);
    setHistoricalError(null);

    const fetchHistorical = async () => {
      try {
        const fromISO = dateRange.from.toISOString();
        const toISO   = dateRange.to.toISOString();

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
  }, [timePeriod.tab, usedTagNames, tagAggregations, dateRange]);

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
    if (timePeriod.tab === 'live') {
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
        const fromISO = dateRange.from.toISOString();
        const toISO   = dateRange.to.toISOString();

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
  }, [timePeriod.tab, chartTagNames, dateRange]);

  const tagValues = useMemo(() => {
    if (timePeriod.tab !== 'live') return historicalTagValues;
    const base = { ...liveTagValues };
    if (emulatorOn && emulatorValues) Object.assign(base, emulatorValues);
    return base;
  }, [timePeriod.tab, liveTagValues, emulatorOn, emulatorValues, historicalTagValues]);

  const liveTagHistory = useTagHistory(usedTagNames, tagValues);
  // In historical mode, prefer backend time-series data for charts (full timeframe);
  // in live mode, use the accumulated live tag history from useTagHistory.
  const tagHistory = useMemo(() => {
    if (timePeriod.tab !== 'live' && historicalTagHistory) {
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
  }, [timePeriod.tab, liveTagHistory, historicalTagHistory]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const el = document.getElementById('report-print-section');
      // Add PDF-export class for optimized styling during capture
      el.classList.add('rb-pdf-export');

      // For tabular mode: temporarily remove max-width constraint and expand container
      const scrollContainer = scrollContainerRef.current;
      const prevScrollOverflow = scrollContainer?.style.overflow;
      const prevScrollHeight = scrollContainer?.style.height;
      const prevScrollMaxHeight = scrollContainer?.style.maxHeight;
      const prevScrollFlex = scrollContainer?.style.flex;
      if (scrollContainer) {
        scrollContainer.style.overflow = 'visible';
        scrollContainer.style.height = 'auto';
        scrollContainer.style.maxHeight = 'none';
        scrollContainer.style.flex = 'none';
      }

      // Wait a frame for styles to apply
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      await exportAsPDF(el, template?.name || 'report', {
        pageMode,
        orientation: viewMode === 'tabular' ? 'landscape' : 'auto',
      });

      // Restore original styles
      el.classList.remove('rb-pdf-export');
      if (scrollContainer) {
        scrollContainer.style.overflow = prevScrollOverflow || '';
        scrollContainer.style.height = prevScrollHeight || '';
        scrollContainer.style.maxHeight = prevScrollMaxHeight || '';
        scrollContainer.style.flex = prevScrollFlex || '';
      }
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

  const hasTableWidgets = useMemo(() =>
    Array.isArray(widgets) && widgets.some((w) => w?.type === 'table'),
    [widgets]
  );

  // Sort widgets by y then x position for tabular flow
  const sortedWidgets = useMemo(() => {
    if (!Array.isArray(widgets)) return [];
    return [...widgets].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  }, [widgets]);

  const gridCols = template?.layout_config?.grid?.cols ?? GRID_COLS_DEFAULT;
  const gridRowH = template?.layout_config?.grid?.rowHeight ?? GRID_ROW_H_DEFAULT;
  const pageMode = template?.layout_config?.grid?.pageMode || 'a4';
  const dashboardHeader = template?.layout_config?.dashboardHeader;

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

  if (!loading && isPaginated) {
    return <PaginatedReportView reportId={reportId} onBack={onBack} siblingReports={siblingReports} onSelectReport={onSelectReport} />;
  }

  if (loading) return <div className="flex items-center justify-center h-[calc(100vh-80px)] text-[12px] text-[#8898aa]">Loading report...</div>;

  return (
    <div className="rb-report-viewer-outer flex flex-col h-[calc(100vh-80px)] bg-transparent">
      {/* ── Toolbar: back + report selector (centered) | actions ── */}
      <div
        className={`backdrop-blur-sm border-b px-3 py-1.5 flex items-center gap-3 flex-shrink-0 print:hidden ${
          dashboardHeader
            ? 'border-transparent'
            : 'bg-white/90 dark:bg-[#0a1525] border-[#e3e9f0] dark:border-gray-700 py-3'
        }`}
        style={dashboardHeader ? {
          background: dashboardHeader.bg || 'linear-gradient(135deg, #0f1b2d 0%, #1a3a5c 100%)',
          color: dashboardHeader.color || '#ffffff',
        } : undefined}
      >
        {/* Left: back */}
        <button onClick={onBack} className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${dashboardHeader ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-[#6b7f94] hover:text-brand hover:bg-brand-subtle'}`}>
          <FaChevronLeft size={12} />
        </button>
        {/* Dashboard title + logo inline */}
        {dashboardHeader && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {dashboardHeader.showLogo !== false && (
              <img src="/api/branding/logo" alt="" style={{ height: 22, width: 'auto', borderRadius: 3 }} onError={(e) => { e.target.style.display = 'none'; }} />
            )}
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {dashboardHeader.title || template?.name || 'Dashboard'}
            </span>
          </div>
        )}

        {/* Center: report tab bar or name + date/time */}
        <div className="flex items-center gap-3 flex-1 justify-center min-w-0">
          {siblingReports?.length > 1 ? (
            <div className="flex items-center gap-1 overflow-x-auto max-w-full">
              {siblingReports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectReport?.(String(r.id))}
                  className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg whitespace-nowrap transition-colors ${
                    String(r.id) === String(reportId)
                      ? 'bg-brand text-white'
                      : 'text-[#6b7f94] hover:text-brand hover:bg-brand-subtle'
                  }`}
                >
                  {r.name || 'Untitled'}
                </button>
              ))}
            </div>
          ) : !dashboardHeader ? (
            <span className="text-[14px] font-semibold text-[#2a3545] dark:text-[#e1e8f0] truncate">{template?.name || 'Report'}</span>
          ) : null}
          {dashboardHeader ? (
            <TimePeriodTabs
              tabs={VIEWER_TABS}
              activeTab={timePeriod.tab}
              onTabChange={tpActions.setTab}
              customFrom={timePeriod.customFrom}
              customTo={timePeriod.customTo}
              onCustomFrom={tpActions.setCustomFrom}
              onCustomTo={tpActions.setCustomTo}
              shiftsConfig={shiftsConfig}
              selectedShift={timePeriod.selectedShift}
              onShiftChange={tpActions.setShift}
              compact
              variant="dark"
            />
          ) : (
            <span className="text-[12px] font-medium text-[#8898aa] whitespace-nowrap tabular-nums hidden sm:inline" title="Current date and time">
              {now.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {/* Right: view toggle + fullscreen + print */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasTableWidgets && (
            <div className="flex rounded-lg border border-[#e3e9f0] dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 text-[12px] font-semibold transition-colors ${viewMode === 'grid' ? 'bg-brand text-white' : 'text-[#6b7f94] hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                title="Grid layout"
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('tabular')}
                className={`px-3 py-2 text-[12px] font-semibold transition-colors ${viewMode === 'tabular' ? 'bg-brand text-white' : 'text-[#6b7f94] hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                title="Tabular layout — tables expand full width with pagination"
              >
                Tabular
              </button>
            </div>
          )}
          <button onClick={toggleFullscreen} className={`p-2 rounded-lg transition-colors border border-transparent ${dashboardHeader ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-[#6b7f94] hover:text-brand hover:bg-brand-subtle hover:border-[#e3e9f0]'}`} title="Fullscreen">
            {fullscreen ? <FaCompress size={14} /> : <FaExpand size={14} />}
          </button>
          <div className="relative group">
            <button className={`inline-flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${dashboardHeader ? 'bg-white/15 hover:bg-white/25 text-white border border-white/20' : 'bg-brand hover:bg-brand-hover text-white'}`}>
              <FaPrint size={12} /> {exporting ? 'Exporting...' : 'Export'}
            </button>
            <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={() => window.print()} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg flex items-center gap-2">
                <FaPrint className="text-[10px]" /> Print
              </button>
              <button onClick={handleExportPDF} disabled={exporting} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50">
                <FaFilePdf className="text-[10px]" /> Export PDF
              </button>
              <button onClick={handleExportPNG} disabled={exporting} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50">
                <FaImage className="text-[10px]" /> Export PNG
              </button>
              <button
                onClick={() => {
                  const from = timePeriod?.from?.toISOString?.() || '';
                  const to = timePeriod?.to?.toISOString?.() || '';
                  window.open(`/api/report-builder/templates/${reportId}/export?format=xlsx&from=${from}&to=${to}`, '_blank');
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg flex items-center gap-2"
              >
                <FaFilePdf className="text-[10px]" /> Export Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Time period tabs (hidden when dashboard header merges it into toolbar) ── */}
      {!dashboardHeader && (
        <TimePeriodTabs
          tabs={VIEWER_TABS}
          activeTab={timePeriod.tab}
          onTabChange={tpActions.setTab}
          customFrom={timePeriod.customFrom}
          customTo={timePeriod.customTo}
          onCustomFrom={tpActions.setCustomFrom}
          onCustomTo={tpActions.setCustomTo}
          shiftsConfig={shiftsConfig}
          selectedShift={timePeriod.selectedShift}
          onShiftChange={tpActions.setShift}
        />
      )}

      {/* ── Status indicator — hidden when dashboardHeader is active ── */}
      {!dashboardHeader && (() => {
        let bg, dot, msg;
        if (timePeriod.tab === 'live') {
          if (liveError) {
            bg  = 'bg-[#fef2f2] dark:bg-[#1a0c0c] border-[#fca5a5]/30';
            dot = <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0" />;
            msg = <span className="text-[11px] font-medium text-[#ef4444]">{liveError}</span>;
          } else if (emulatorOn || Object.keys(liveTagValues).length > 0) {
            bg  = 'bg-[#ecfdf5] dark:bg-[#0d2e1f] border-[#a7f3d0] dark:border-[#065f46]';
            dot = <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse flex-shrink-0" />;
            msg = <span className="text-[11px] font-medium text-[#059669]">{emulatorOn ? 'Live (Emulator)' : 'Live'}</span>;
          } else {
            bg  = 'bg-[#fffbeb] dark:bg-[#1a1800] border-[#fcd34d]/30';
            dot = <FaClock size={9} className="text-[#d97706] flex-shrink-0" />;
            msg = <span className="text-[11px] font-medium text-[#d97706]">Waiting for live data…</span>;
          }
        } else if (historicalLoading) {
          bg  = 'bg-[#eff6ff] dark:bg-[#0c1a2e] border-[#93c5fd]/30';
          dot = <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#3b82f6]">Loading historical data…</span>;
        } else if (historicalError) {
          bg  = 'bg-[#fef2f2] dark:bg-[#1a0c0c] border-[#fca5a5]/30';
          dot = <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#ef4444]">{historicalError}</span>;
        } else if (Object.keys(historicalTagValues).length > 0) {
          bg  = 'bg-[#f0f9ff] dark:bg-[#0c1e2e] border-[#7dd3fc]/30';
          dot = <FaClock size={9} className="text-[#0284c7] flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#0284c7]">
            Historical — {dateRange?.from?.toLocaleDateString?.()} {dateRange?.from?.toLocaleTimeString?.(undefined, {hour:'2-digit',minute:'2-digit'})} to {dateRange?.to?.toLocaleDateString?.()} {dateRange?.to?.toLocaleTimeString?.(undefined, {hour:'2-digit',minute:'2-digit'})} ({Object.keys(historicalTagValues).length} tags)
          </span>;
        } else {
          bg  = 'bg-[#fffbeb] dark:bg-[#1a1800] border-[#fcd34d]/30';
          dot = <FaClock size={9} className="text-[#d97706] flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#d97706]">No historical data for this period</span>;
        }
        return (
          <div className={`border-b px-4 py-1.5 flex items-center gap-2 print:hidden transition-colors duration-300 ${bg}`}>
            {dot}{msg}
          </div>
        );
      })()}

      {/* ── Report content: full width; scrollable with mouse wheel ── */}
      <div
        ref={scrollContainerRef}
        className="report-builder rb-report-scroll-container flex-1 min-h-0 overflow-y-auto overflow-x-auto overscroll-behavior-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
          background: 'var(--rb-canvas)',
          opacity: historicalLoading ? 0.45 : 1,
          transition: 'opacity 250ms ease',
          pointerEvents: historicalLoading ? 'none' : undefined,
        }}
        onWheelCapture={handleWheelCapture}
      >
        <div id="report-print-section" className={`w-full min-w-0 mx-auto ${pageMode === 'a4' ? 'max-w-[1200px]' : 'max-w-full'}`}>
          {/* Dashboard header bar is rendered above in the toolbar when dashboardHeader is active */}

          {!(Array.isArray(widgets) && widgets.length > 0) ? (
            <div className="text-center py-16 text-[12px] text-[#6b7f94] dark:text-[#8898aa]">No widgets in this report.</div>
          ) : viewMode === 'tabular' ? (
            /* ══ Tabular View — tables render full-width with pagination ══ */
            <div className="report-builder rb-canvas-perspective rb-layout-readonly pt-3 pb-6 px-4 sm:px-6 space-y-6">
              {sortedWidgets.map((widget) => {
                if (!widget?.id) return null;
                const wt = widget.type;
                const isTable = wt === 'table';
                const isInvisible = wt === 'text';
                const showCard = isInvisible
                  ? false
                  : CARDLESS_WIDGET_TYPES.has(wt)
                    ? widget.config?.showCard === true
                    : widget.config?.showCard !== false;

                if (isTable) {
                  // Render table with pagination
                  const staticRows = widget.config?.staticDataRows || [];
                  const totalRows = staticRows.length + 1; // +1 for live data row
                  const currentPage = tablePage[widget.id] || 0;
                  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
                  const showPagination = totalRows > rowsPerPage;

                  return (
                    <div key={widget.id} className={`${showCard ? 'rb-widget-card rounded-lg' : ''}`}>
                      <div className="overflow-x-auto">
                        <WidgetRenderer widget={widget} tagValues={tagValues} isPreview={true} isSelected={false} tags={tags} tagHistory={tagHistory} />
                      </div>
                      {showPagination && (
                        <div className="rb-tabular-pagination flex items-center justify-between px-4 py-2.5 border-t border-[#e3e9f0] dark:border-gray-700 bg-white/60 dark:bg-[#0a1525]/60">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#6b7f94]">Rows per page:</span>
                            <select
                              value={rowsPerPage}
                              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setTablePage({}); }}
                              className="text-[11px] px-1.5 py-0.5 rounded border border-[#e3e9f0] dark:border-gray-700 bg-white dark:bg-[#0a1525] text-[#3a4a5c] dark:text-[#c1ccd9]"
                            >
                              <option value={10}>10</option>
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-[#6b7f94]">
                              Page {currentPage + 1} of {totalPages} ({totalRows} rows)
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setTablePage((p) => ({ ...p, [widget.id]: Math.max(0, currentPage - 1) }))}
                                disabled={currentPage === 0}
                                className="px-2 py-1 text-[11px] rounded border border-[#e3e9f0] dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() => setTablePage((p) => ({ ...p, [widget.id]: Math.min(totalPages - 1, currentPage + 1) }))}
                                disabled={currentPage >= totalPages - 1}
                                className="px-2 py-1 text-[11px] rounded border border-[#e3e9f0] dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Non-table widgets: render inline at natural size
                const minH = wt === 'chart' || wt === 'barchart' ? '300px' : wt === 'gauge' || wt === 'silo' ? '200px' : 'auto';
                const csMap = {'borderless':'rb-card-borderless','glass':'rb-card-glass','accent-top':'rb-card-accent-top'};
                const cardClass = isInvisible
                  ? ''
                  : showCard
                    ? `rounded-lg rb-widget-card overflow-hidden ${csMap[widget.config?.cardStyle] || ''}`
                    : 'overflow-hidden';
                return (
                  <div key={widget.id} className={cardClass} style={{ minHeight: minH }}>
                    <WidgetRenderer widget={widget} tagValues={tagValues} isPreview={true} isSelected={false} tags={tags} tagHistory={tagHistory} />
                  </div>
                );
              })}
            </div>
          ) : (
            /* ══ Grid View — original react-grid-layout rendering ══ */
            <div
              ref={containerRef}
              className={`report-builder rb-canvas-perspective rb-layout-readonly ${dashboardHeader ? 'pt-0 pb-3 px-1' : 'pt-3 pb-6 px-6'}`}
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
                compactType="vertical"
                allowOverlap={false}
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
                  const csMap2 = {'borderless':'rb-card-borderless','glass':'rb-card-glass','accent-top':'rb-card-accent-top'};
                  const cardClass = isInvisible
                    ? 'overflow-visible flex flex-col min-h-0'
                    : showCard
                      ? `rounded-lg rb-widget-card overflow-hidden flex flex-col ${csMap2[widget.config?.cardStyle] || ''}`
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
  const { templates } = useReportTemplates();

  const siblingReports = useMemo(() => templates.map((t) => ({ id: t.id, name: t.name })), [templates]);

  if (id) return <SingleReportView reportId={id} onBack={() => navigate('/reporting')} siblingReports={siblingReports} onSelectReport={(rid) => navigate(`/reporting/${rid}`)} />;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-transparent">
      <div className="px-5 py-4 border-b border-[#e3e9f0] dark:border-gray-700 bg-white/90 dark:bg-[#0a1525] backdrop-blur-sm">
        <h1 className="text-[15px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">Reporting</h1>
        <p className="text-[11px] text-[#8898aa] mt-0.5">Select a report to view with live or historical data</p>
      </div>
      <ReportList onSelect={(rid) => navigate(`/reporting/${rid}`)} />
    </div>
  );
}

/* ── Named exports for route-specific viewers ─────────────────── */
import { BarChart2, Table2 } from 'lucide-react';
import { useLanguage as useLanguageViewer } from '../../Hooks/useLanguage';

export function DashboardViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { templates } = useReportTemplates();
  const { t: tr } = useLanguageViewer();

  const siblingReports = useMemo(() =>
    templates
      .filter((t) => {
        const rt = getReportType(t);
        return rt !== 'paginated' && t.status === 'released';
      })
      .map((t) => ({ id: t.id, name: t.name })),
    [templates]
  );

  if (id) return <SingleReportView reportId={id} onBack={() => navigate('/dashboards')} siblingReports={siblingReports} onSelectReport={(rid) => navigate(`/dashboards/${rid}`)} />;
  return (
    <ReportListingPage
      title={tr('viewer.dashboardsTitle')}
      subtitle={tr('viewer.dashboardsSubtitle')}
      filterType="dashboard"
      baseRoute="/dashboards"
      icon={BarChart2}
    />
  );
}

export function TableReportViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { templates } = useReportTemplates();
  const { t: tr } = useLanguageViewer();

  const siblingReports = useMemo(() =>
    templates
      .filter((t) => {
        const rt = getReportType(t);
        return rt === 'paginated' && t.status === 'released';
      })
      .map((t) => ({ id: t.id, name: t.name })),
    [templates]
  );

  if (id) return <SingleReportView reportId={id} onBack={() => navigate('/reports')} siblingReports={siblingReports} onSelectReport={(rid) => navigate(`/reports/${rid}`)} />;
  return (
    <ReportListingPage
      title={tr('viewer.tableReportsTitle')}
      subtitle={tr('viewer.tableReportsSubtitle')}
      filterType="paginated"
      baseRoute="/reports"
      icon={Table2}
    />
  );
}
