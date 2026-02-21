import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPen, FaPrint, FaExpand, FaCompress, FaFilePdf, FaImage } from 'react-icons/fa';
import { Tooltip } from '@mui/material';
import { exportAsPNG, exportAsPDF } from '../../utils/exportReport';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import { useReportCanvas, useAvailableTags, collectWidgetTagNames } from '../../Hooks/useReportBuilder';
import { useTagHistory } from '../../Hooks/useTagHistory';
import WidgetRenderer, { CARDLESS_WIDGET_TYPES, INVISIBLE_WRAPPER_TYPES } from './widgets/WidgetRenderer';
import axios from '../../API/axios';
import { useSocket } from '../../Context/SocketContext';
import { useEmulator } from '../../Context/EmulatorContext';
import LiveDataIndicator from '../../Components/Common/LiveDataIndicator';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './reportBuilderTheme.css';

/* ── Grid: match ReportBuilderCanvas exactly for pixel-perfect consistency ── */
const GRID_COLS_DEFAULT = 12;
const GRID_ROW_H_DEFAULT = 40;
const GRID_MARGIN = [8, 8];
const GRID_PADDING = [0, 0];

/**
 * Full-screen read-only preview with live PLC data.
 * Uses react-grid-layout (same as ReportBuilderCanvas) for consistent dimensions.
 */
export default function ReportBuilderPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { template, widgets, loading } = useReportCanvas(id);
  const { tags: availableTags } = useAvailableTags();
  const [liveTagValues, setLiveTagValues] = useState({});
  const [lastDataUpdate, setLastDataUpdate] = useState(Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const scrollContainerRef = useRef(null);
  const { containerRef, width: gridWidth } = useContainerWidth();
  const { socket } = useSocket();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();

  /* Measure grid container width (same pattern as ReportBuilderCanvas). */
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

  // Collect all tag names used by widgets (dataSource, series, columns, silo extras)
  const usedTagNames = useMemo(() => collectWidgetTagNames(widgets), [widgets]);

  // Fetch initial tag values via REST (backend returns { tag_values: { ... } })
  useEffect(() => {
    if (usedTagNames.length === 0) return;
    const fetchValues = async () => {
      try {
        const res = await axios.get('/api/live-monitor/tags', {
          params: { tags: usedTagNames.join(',') },
        });
        const data = res.data?.tag_values ?? res.data?.data ?? res.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setLiveTagValues((prev) => ({ ...prev, ...data }));
          setLastDataUpdate(Date.now());
        }
      } catch (err) {
        console.error('Failed to fetch tag values:', err);
      }
    };
    fetchValues();
    const interval = setInterval(fetchValues, 5000);
    return () => clearInterval(interval);
  }, [usedTagNames]);

  // Live WebSocket updates
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data?.tag_values && typeof data.tag_values === 'object') {
        setLiveTagValues((prev) => ({ ...prev, ...data.tag_values }));
        setLastDataUpdate(Date.now());
      }
    };
    socket.on('live_tag_data', handler);
    return () => socket.off('live_tag_data', handler);
  }, [socket]);

  /* Align with ReportBuilderCanvas: when emulator on, use emulator + fallback for unknown tags; else REST/WS */
  const tagValues = useMemo(() => {
    if (emulatorOn && emulatorValues) {
      const base = { ...emulatorValues };
      const t = Date.now() / 1000;
      for (const tag of usedTagNames) {
        if (tag && !(tag in base)) {
          base[tag] = Number((50 + 15 * Math.sin((2 * Math.PI * t) / 200)).toFixed(2));
        }
      }
      return base;
    }
    return { ...liveTagValues };
  }, [liveTagValues, emulatorOn, emulatorValues, usedTagNames]);

  // Reset LiveDataIndicator when emulator values change
  useEffect(() => {
    if (emulatorOn && emulatorValues) {
      setLastDataUpdate(Date.now());
    }
  }, [emulatorOn, emulatorValues]);

  const tagHistory = useTagHistory(usedTagNames, tagValues);

  // Print
  const handlePrint = () => window.print();

  // Export handlers
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

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
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
          static: true,
        })),
    [widgets],
  );

  const widgetMap = useMemo(
    () => new Map((Array.isArray(widgets) ? widgets : []).filter((w) => w?.id).map((w) => [w.id, w])),
    [widgets],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading preview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-70px)] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#080f1a] border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <Tooltip title="Back to editor" placement="bottom" arrow disableInteractive>
            <button
              onClick={() => navigate(`/report-builder/${id}`)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <FaArrowLeft className="text-sm" />
            </button>
          </Tooltip>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {template?.name || 'Preview'}
          </h1>
          <span className="text-[10px] text-brand bg-brand-subtle dark:bg-cyan-900/20 px-2 py-0.5 rounded-full font-medium">
            Preview Mode
          </span>
          <LiveDataIndicator lastUpdated={lastDataUpdate} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/report-builder/${id}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50 transition-colors"
          >
            <FaPen className="text-[10px]" />
            Edit
          </button>
          <Tooltip title="Toggle fullscreen" placement="bottom" arrow disableInteractive>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              {fullscreen ? <FaCompress className="text-sm" /> : <FaExpand className="text-sm" />}
            </button>
          </Tooltip>
          <div className="relative group">
            <Tooltip title="Export options" placement="bottom" arrow disableInteractive>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-brand hover:bg-brand-hover transition-colors">
                <FaPrint className="text-[10px]" />
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </Tooltip>
            <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={handlePrint} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg flex items-center gap-2">
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

      {/* Preview body — full width; scrollable with mouse wheel */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 bg-gray-50 dark:bg-[#0b111e] overflow-y-auto overflow-x-hidden overscroll-behavior-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onWheelCapture={handleWheelCapture}
      >
        <div id="report-print-section" className={`w-full mx-auto ${pageMode === 'a4' ? 'max-w-[1200px]' : 'max-w-full'}`}>
          {/* Compact report header */}
          <div className="mb-1 print:mb-2 px-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {template?.name || 'Report'}
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Generated: {new Date().toLocaleString()}
            </p>
          </div>

          {/* Widgets grid — same react-grid-layout as ReportBuilderCanvas for consistent dimensions */}
          {!(Array.isArray(widgets) && widgets.length > 0) ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No widgets in this report. Go back to the canvas to add widgets.
              </p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="report-builder rb-canvas-dots rb-canvas-perspective rb-layout-readonly pt-3 pb-6 px-6"
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
                    <div
                      key={item.i}
                      className={`${cardClass} flex flex-col min-h-0 relative`}
                    >
                      <WidgetRenderer
                        widget={widget}
                        tagValues={tagValues}
                        isPreview
                        tagHistory={tagHistory}
                      />
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
