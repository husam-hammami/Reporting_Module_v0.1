import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPen, FaPrint, FaExpand, FaCompress, FaFilePdf, FaImage } from 'react-icons/fa';
import { Tooltip } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { exportAsPNG, exportAsPDF } from '../../utils/exportReport';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import { useReportCanvas, useAvailableTags, collectWidgetTagNames, collectDataPanelScopedHistorianRequests } from '../../Hooks/useReportBuilder';
import {
  groupDataPanelScopedHistorianRequests,
  fetchDataPanelScopedHistorianValues,
} from './utils/dataPanelTimeScope';
import TabSelector from '../../Components/ui/TabSelector';
import { useTagHistory } from '../../Hooks/useTagHistory';
import WidgetRenderer, { CARDLESS_WIDGET_TYPES, INVISIBLE_WRAPPER_TYPES } from './widgets/WidgetRenderer';
import axios from '../../API/axios';
import { useSocket } from '../../Context/SocketContext';
import { useEmulator } from '../../Context/EmulatorContext';
import { useThumbnailCapture } from './ThumbnailCaptureContext';
import LiveDataIndicator from '../../Components/Common/LiveDataIndicator';
import { ReportTableTabLinkProvider } from './context/ReportTableTabLinkContext';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './reportBuilderTheme.css';

const GRID_COLS_DEFAULT = 12;
const GRID_ROW_H_DEFAULT = 40;
const GRID_MARGIN = [6, 6];
const GRID_PADDING = [8, 8];

export default function ReportBuilderPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { template, widgets, loading, dashboardTabs, activeTabId, allTabsWidgets, switchDashboardTab } = useReportCanvas(id);
  const { tags: availableTags } = useAvailableTags();
  const [liveTagValues, setLiveTagValues] = useState({});
  const [liveScopedTagValues, setLiveScopedTagValues] = useState({});
  const [lastDataUpdate, setLastDataUpdate] = useState(Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const scrollContainerRef = useRef(null);
  const { containerRef, width: gridWidth } = useContainerWidth();
  const { socket } = useSocket();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

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

  const usedTagNames = useMemo(() => collectWidgetTagNames(allTabsWidgets || widgets), [allTabsWidgets, widgets]);

  useEffect(() => {
    const ws = allTabsWidgets || widgets;
    let cancelled = false;
    const run = async () => {
      const scopedReqs = collectDataPanelScopedHistorianRequests(ws, new Date());
      if (scopedReqs.length === 0) {
        if (!cancelled) setLiveScopedTagValues({});
        return;
      }
      const groups = groupDataPanelScopedHistorianRequests(scopedReqs);
      const scopedValues = await fetchDataPanelScopedHistorianValues(axios, groups);
      if (!cancelled) setLiveScopedTagValues(scopedValues);
    };
    run();
    const scopedInterval = setInterval(run, 5000);
    return () => {
      cancelled = true;
      clearInterval(scopedInterval);
    };
  }, [allTabsWidgets, widgets]);

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

  const tagValues = useMemo(() => {
    if (emulatorOn && emulatorValues) {
      const base = { ...emulatorValues, ...liveScopedTagValues };
      const t = Date.now() / 1000;
      for (const tag of usedTagNames) {
        if (tag && !(tag in base)) {
          base[tag] = Number((50 + 15 * Math.sin((2 * Math.PI * t) / 200)).toFixed(2));
        }
      }
      return base;
    }
    return { ...liveTagValues, ...liveScopedTagValues };
  }, [liveTagValues, liveScopedTagValues, emulatorOn, emulatorValues, usedTagNames]);

  useEffect(() => {
    if (emulatorOn && emulatorValues) {
      setLastDataUpdate(Date.now());
    }
  }, [emulatorOn, emulatorValues]);

  const tagHistory = useTagHistory(usedTagNames, tagValues);

  const handlePrint = () => window.print();

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
  const dashboardHeaderCfg = template?.layout_config?.dashboardHeader;
  const dashboardHeader = {
    bg: 'linear-gradient(135deg, #0f1b2d 0%, #1a3a5c 100%)',
    color: '#ffffff',
    showLogo: true,
    title: template?.name || 'Dashboard',
    titleSize: 14,
    ...dashboardHeaderCfg,
  };

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

  const pageEntrance = skipAnimation
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
      };

  if (loading) {
    return (
      <div className="report-builder flex items-center justify-center h-[calc(100vh-80px)]" style={{ background: 'var(--rb-canvas)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--rb-accent)', borderTopColor: 'transparent' }} />
          <p className="rb-label">Loading preview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="report-builder h-[calc(100vh-80px)] flex flex-col overflow-hidden" style={{ background: 'var(--rb-canvas)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 print:hidden rb-panel-surface"
        style={{
          borderBottom: '1px solid var(--rb-border)',
        }}
      >
        <div className="flex items-center gap-3">
          <Tooltip title="Back to editor" placement="bottom" arrow disableInteractive>
            <button
              onClick={() => navigate(`/report-builder/${id}`)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--rb-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-subtle)'; e.currentTarget.style.color = 'var(--rb-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--rb-text-muted)'; }}
            >
              <FaArrowLeft className="text-sm" />
            </button>
          </Tooltip>
          <h1 className="rb-heading" style={{ fontSize: 'var(--rb-font-md)' }}>
            {template?.name || 'Preview'}
          </h1>
          <span
            className="rb-badge"
            style={{
              background: 'var(--rb-accent-subtle)',
              color: 'var(--rb-accent)',
              fontSize: 'var(--rb-font-xs)',
              fontWeight: 600,
            }}
          >
            Preview Mode
          </span>
          <LiveDataIndicator lastUpdated={lastDataUpdate} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/report-builder/${id}`)}
            className="rb-btn-ghost inline-flex items-center gap-1.5"
            style={{
              fontSize: 'var(--rb-font-sm)',
              border: '1px solid var(--rb-border)',
              borderRadius: 'var(--rb-radius-lg)',
            }}
          >
            <FaPen style={{ fontSize: '10px' }} />
            Edit
          </button>
          <Tooltip title="Toggle fullscreen" placement="bottom" arrow disableInteractive>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--rb-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-subtle)'; e.currentTarget.style.color = 'var(--rb-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--rb-text-muted)'; }}
            >
              {fullscreen ? <FaCompress className="text-sm" /> : <FaExpand className="text-sm" />}
            </button>
          </Tooltip>
          <div className="relative group">
            <Tooltip title="Export options" placement="bottom" arrow disableInteractive>
              <button className="rb-btn-primary inline-flex items-center gap-1.5">
                <FaPrint style={{ fontSize: '10px' }} />
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </Tooltip>
            <div
              className="absolute right-0 mt-1 w-40 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible z-50"
              style={{
                background: 'var(--rb-panel)',
                border: '1px solid var(--rb-border)',
                boxShadow: 'var(--rb-elevation-3)',
                transition: 'opacity var(--rb-transition-fast) ease, visibility var(--rb-transition-fast) ease',
              }}
            >
              <button
                onClick={handlePrint}
                className="w-full text-left px-3 py-2 flex items-center gap-2 rounded-t-lg"
                style={{ fontSize: 'var(--rb-font-sm)', color: 'var(--rb-text)', transition: 'background var(--rb-transition-fast) ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <FaPrint style={{ fontSize: '10px', color: 'var(--rb-text-muted)' }} /> Print
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="w-full text-left px-3 py-2 flex items-center gap-2 disabled:opacity-50"
                style={{ fontSize: 'var(--rb-font-sm)', color: 'var(--rb-text)', transition: 'background var(--rb-transition-fast) ease' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--rb-accent-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <FaFilePdf style={{ fontSize: '10px', color: 'var(--rb-danger)' }} /> Export PDF
              </button>
              <button
                onClick={handleExportPNG}
                disabled={exporting}
                className="w-full text-left px-3 py-2 flex items-center gap-2 rounded-b-lg disabled:opacity-50"
                style={{ fontSize: 'var(--rb-font-sm)', color: 'var(--rb-text)', transition: 'background var(--rb-transition-fast) ease' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--rb-accent-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <FaImage style={{ fontSize: '10px', color: 'var(--rb-success)' }} /> Export PNG
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Tabs (preview) */}
      {dashboardTabs?.enabled && Array.isArray(dashboardTabs.tabs) && dashboardTabs.tabs.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 print:hidden" style={{ borderBottom: '1px solid var(--rb-border)', background: 'var(--rb-surface)' }}>
          <TabSelector
            tabs={dashboardTabs.tabs.map(t => ({ id: t.id, label: t.label }))}
            activeId={activeTabId}
            onChange={switchDashboardTab}
            size="sm"
          />
        </div>
      )}

      {/* Preview body */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-behavior-auto rb-canvas-dots"
        style={{ background: 'var(--rb-canvas)', WebkitOverflowScrolling: 'touch' }}
        onWheelCapture={handleWheelCapture}
      >
        <motion.div
          id="report-print-section"
          className="w-full mx-auto"
          style={pageMode === 'a4' ? { maxWidth: 1220 } : {}}
          {...pageEntrance}
        >
          <ReportTableTabLinkProvider>
          {/* Unified dashboard header bar */}
          <div
            className="flex items-center px-4 py-2 mx-2 mt-1 mb-1 rounded-md"
            style={{
              background: dashboardHeader.bg,
              color: dashboardHeader.color,
              minHeight: 36,
            }}
          >
            {dashboardHeader.showLogo !== false && (
              <img src="/api/branding/logo" alt="" style={{ height: 24, width: 'auto', borderRadius: 3, marginRight: 10 }} onError={(e) => { e.target.style.display = 'none'; }} />
            )}
            <span style={{ fontSize: dashboardHeader.titleSize, fontWeight: 700 }}>
              {dashboardHeader.title || template?.name || 'Dashboard'}
            </span>
          </div>

          {/* Widgets grid */}
          {!(Array.isArray(widgets) && widgets.length > 0) ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rb-empty-state-icon w-14 h-14 rounded-xl flex items-center justify-center mb-4">
                <FaPen style={{ fontSize: '16px', color: 'var(--rb-text-muted)' }} />
              </div>
              <p className="rb-label">
                No widgets in this report. Go back to the canvas to add widgets.
              </p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="rb-canvas-perspective rb-layout-readonly pt-3 pb-6 px-4"
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
                  const csMap = {'borderless':'rb-card-borderless','glass':'rb-card-glass','accent-top':'rb-card-accent-top','holographic':'rb-card-holographic'};
                  const cardClass = isInvisible
                    ? 'overflow-visible flex flex-col min-h-0'
                    : showCard
                      ? `rounded rb-widget-card overflow-hidden flex flex-col ${csMap[widget.config?.cardStyle] || ''}`
                      : 'overflow-hidden flex flex-col min-h-0 p-0.5';
                  return (
                    <div
                      key={item.i}
                      className={`${cardClass} flex flex-col min-h-0 relative`}
                      style={{ '--widget-color': widget.config?.color || undefined }}
                    >
                      <WidgetRenderer
                        widget={widget}
                        widgetId={widget.id}
                        tagValues={tagValues}
                        isPreview
                        isSelected={false}
                        tags={availableTags}
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
          </ReportTableTabLinkProvider>
        </motion.div>
      </div>
    </div>
  );
}
