import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import axios from '../../API/axios';
import {
  ArrowLeft, Save, Eye, PanelLeftClose, PanelRightClose,
  PanelLeft, PanelRight, Check, Pencil, Plus, X, AlertCircle, Send,
  Undo2, Redo2, Minus, Maximize, FileText, Monitor,
  Copy, Trash2, Lock, Unlock, RefreshCw,
} from 'lucide-react';
import { Tooltip } from '@mui/material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useReportCanvas, useAvailableTags, useAvailableGroups, useAvailableFormulas, collectWidgetTagNames } from '../../Hooks/useReportBuilder';
import TabSelector from '../../Components/ui/TabSelector';
import { useTagHistory } from '../../Hooks/useTagHistory';
import WidgetToolbox from './panels/WidgetToolbox';
import PropertiesPanel from './panels/PropertiesPanel';
import WidgetRenderer, { CARDLESS_WIDGET_TYPES, INVISIBLE_WRAPPER_TYPES } from './widgets/WidgetRenderer';
import { WIDGET_CATALOG, createWidget } from './widgets/widgetDefaults';
import { useEmulator } from '../../Context/EmulatorContext';
import { useThumbnailCapture } from './ThumbnailCaptureContext';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './reportBuilderTheme.css';

/* ── Grid: match report viewer; compact row height for less clutter ─────── */
const GRID_COLS_DEFAULT   = 12;
const GRID_ROW_H_DEFAULT  = 40;   // row height (px) — compact layout
const GRID_MARGIN         = [6, 6];
const GRID_PADDING        = [8, 8];


/* ── Canvas Page ───────────────────────────────────────────────── */

export default function ReportBuilderCanvas() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    template, widgets: rawWidgets, loading, saving, dirty,
    autoSave, toggleAutoSave,
    addWidget, addWidgetAt, updateWidget, removeWidget, updateLayout, setWidgets, setDirty,
    addComputedSignal, saveLayout, updateMeta,
    undo, redo, canUndo, canRedo,
    dashboardTabs, activeTabId, allTabsWidgets,
    enableDashboardTabs, disableDashboardTabs,
    addDashboardTab, removeDashboardTab, renameDashboardTab, switchDashboardTab, duplicateDashboardTab,
  } = useReportCanvas(id);

  const dashboardLocked = template?.layout_config?.locked === true;
  const toggleDashboardLock = () => {
    const lc = template?.layout_config || {};
    updateMeta({ layout_config: { ...lc, locked: !dashboardLocked } });
  };
  const { tags } = useAvailableTags();
  const { groups } = useAvailableGroups();
  const { formulas: savedFormulas } = useAvailableFormulas();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimations = prefersReducedMotion || isCapturing;
  const widgets = rawWidgets;
  const usedTagNames = useMemo(() => collectWidgetTagNames(allTabsWidgets || widgets), [allTabsWidgets, widgets]);
  const [polledTagValues, setPolledTagValues] = useState({});
  useEffect(() => {
    if (emulatorOn || usedTagNames.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await axios.get('/api/live-monitor/tags', {
          params: { tags: usedTagNames.join(',') },
        });
        if (!cancelled && res.data?.tag_values) setPolledTagValues(prev => ({ ...prev, ...res.data.tag_values }));
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [emulatorOn, usedTagNames]);

  const liveTagValues = useMemo(() => {
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
    return polledTagValues;
  }, [emulatorOn, emulatorValues, usedTagNames, polledTagValues]);
  const tagHistory = useTagHistory(usedTagNames, liveTagValues);

  const [selectedId, setSelectedId] = useState(null);
  const [subWidgetInfo, setSubWidgetInfo] = useState(null);
  const [showToolbox, setShowToolbox] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [renamingTabId, setRenamingTabId] = useState(null);
  const [tabNameInput, setTabNameInput] = useState('');
  const tabNameRef = useRef(null);
  const [showAddTabMenu, setShowAddTabMenu] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const nameRef = useRef(null);
  const canvasScrollRef = useRef(null);
  const { containerRef, width: gridWidth } = useContainerWidth();

  /* Measure grid container content width so grid fills the canvas (no wasted space). */
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
  }, [widgets.length]); // re-run when grid mounts/unmounts so containerRef is in DOM

  const effectiveGridWidth = measuredGridWidth > 0 ? measuredGridWidth : (gridWidth || 1200);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedId) || null,
    [widgets, selectedId],
  );

  const handleSubWidgetSelect = useCallback((subWidget) => {
    if (!subWidget) {
      setSubWidgetInfo(null);
      return;
    }
    setSubWidgetInfo({ parentId: selectedId, subWidget });
    setShowProperties(true);
  }, [selectedId]);

  const editingSubWidget = useMemo(() => {
    if (!subWidgetInfo || subWidgetInfo.parentId !== selectedId) return null;
    const parent = widgets.find(w => w.id === subWidgetInfo.parentId);
    if (!parent || parent.type !== 'tabcontainer') return null;
    const tabsCfg = parent.config?.tabs || [];
    const activeTab = tabsCfg.find(t => t.id === parent.config?.activeTabId) || tabsCfg[0];
    return activeTab?.widgets?.find(w => w.id === subWidgetInfo.subWidget?.id) || null;
  }, [subWidgetInfo, selectedId, widgets]);

  const editingWidget = editingSubWidget || selectedWidget;

  const updateSubWidgetViaCanvas = useCallback((subWidgetId, updates) => {
    if (!subWidgetInfo) return;
    const parentId = subWidgetInfo.parentId;
    setWidgets((prev) => {
      const parent = prev.find(w => w.id === parentId);
      if (!parent || parent.type !== 'tabcontainer') return prev;
      const cfg = parent.config || {};
      const tabsCfg = cfg.tabs || [];
      const tcActiveTabId = cfg.activeTabId || tabsCfg[0]?.id;
      const updatedTabs = tabsCfg.map(t => {
        if (t.id !== tcActiveTabId) return t;
        return {
          ...t,
          widgets: (t.widgets || []).map(w => {
            if (w.id !== subWidgetId) return w;
            const next = { ...w, ...updates };
            if (updates.config && typeof updates.config === 'object') {
              next.config = { ...(w.config || {}), ...updates.config };
            }
            return next;
          }),
        };
      });
      return prev.map(w =>
        w.id === parentId ? { ...w, config: { ...cfg, tabs: updatedTabs } } : w
      );
    });
    setDirty(true);
  }, [subWidgetInfo, setWidgets, setDirty]);

  const editingOnUpdate = editingSubWidget ? updateSubWidgetViaCanvas : updateWidget;

  const handleSubLayoutChangeViaCanvas = useCallback((parentWidgetId, newLayout) => {
    setWidgets((prev) => {
      const parent = prev.find(w => w.id === parentWidgetId);
      if (!parent || parent.type !== 'tabcontainer') return prev;
      const cfg = parent.config || {};
      const tabsCfg = cfg.tabs || [];
      const tcActiveTabId = cfg.activeTabId || tabsCfg[0]?.id;
      const updatedTabs = tabsCfg.map(t => {
        if (t.id !== tcActiveTabId) return t;
        return {
          ...t,
          widgets: (t.widgets || []).map(w => {
            const item = newLayout.find(l => String(l.i) === String(w.id));
            if (!item) return w;
            return { ...w, x: item.x, y: item.y, w: item.w, h: item.h };
          }),
        };
      });
      return prev.map(w =>
        w.id === parentWidgetId ? { ...w, config: { ...cfg, tabs: updatedTabs } } : w
      );
    });
    setDirty(true);
  }, [setWidgets, setDirty]);

  /* Grid from template (per-report flexibility) or professional defaults */
  const gridCols = template?.layout_config?.grid?.cols ?? GRID_COLS_DEFAULT;
  const gridRowH = template?.layout_config?.grid?.rowHeight ?? GRID_ROW_H_DEFAULT;
  const pageMode = template?.layout_config?.grid?.pageMode || 'a4'; // 'a4' | 'full'
  const togglePageMode = useCallback(() => {
    const next = pageMode === 'a4' ? 'full' : 'a4';
    updateMeta({ layout_config: { ...template?.layout_config, grid: { ...(template?.layout_config?.grid || {}), pageMode: next } } });
  }, [pageMode, template, updateMeta]);

  /* ── Build layout array for RGL (free position/size, min 1x1). Only finite positions. ─── */
  const layout = useMemo(() =>
    widgets.map((w) => {
      const x = Number.isFinite(w.x) ? Math.max(0, w.x) : 0;
      const y = Number.isFinite(w.y) ? Math.max(0, w.y) : 0;
      return {
        i: String(w.id),
        x,
        y,
        w: w.w >= 1 ? w.w : 3,
        h: w.h >= 1 ? w.h : 2,
        minW: 1,
        minH: 1,
        ...(w.locked ? { static: true } : {}),
      };
    }),
    [widgets],
  );

  /* ── Callbacks ─────────────────────────────────────────────── */

  const interactingRef = useRef(false);

  const handleLayoutChange = useCallback(
    (newLayout) => {
      if (interactingRef.current) {
        interactingRef.current = false;
        updateLayout(newLayout);
      }
    },
    [updateLayout],
  );

  const handleDragStart = useCallback(() => { interactingRef.current = true; }, []);
  const handleResizeStart = useCallback(() => { interactingRef.current = true; }, []);

  const handleSelect = useCallback((wid, e) => {
    e?.stopPropagation();
    setSelectedId(wid);
    setSubWidgetInfo(null);
    setShowProperties(true);
  }, []);

  const handleDeselect = useCallback(() => { setSelectedId(null); setSubWidgetInfo(null); }, []);

  const handleWheelCapture = useCallback((e) => {
    /* Allow dropdowns/tag picker to handle their own scroll */
    if (e.target?.closest?.('[data-wheel-scroll]')) return;
    const el = canvasScrollRef.current;
    if (!el) return;
    const nextScrollTop = el.scrollTop + e.deltaY;
    el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, nextScrollTop));
    e.preventDefault();
  }, []);

  /* Place new widgets at the end by default so existing layout is never disturbed */
  const handleAddWidget = useCallback((widget) => {
    const hasExplicitPosition = Number.isFinite(widget.x) && Number.isFinite(widget.y);
    const toAdd = hasExplicitPosition
      ? widget
      : (() => {
          const nextY = widgets.length === 0 ? 0 : Math.max(...widgets.map((w) => (Number(w.y) || 0) + (Number(w.h) || 2)));
          return { ...widget, x: 0, y: nextY };
        })();
    addWidget(toAdd);
    setSelectedId(toAdd.id);
    setShowProperties(true);
  }, [addWidget, widgets]);

  const handleDeleteWidget = useCallback((wid) => {
    removeWidget(wid);
    if (selectedId === wid) setSelectedId(null);
  }, [removeWidget, selectedId]);

  const handleDuplicate = useCallback((widgetId) => {
    const w = widgets.find((w) => w.id === widgetId);
    if (!w) return;
    const dup = { ...JSON.parse(JSON.stringify(w)), id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, y: (w.y ?? 0) + (w.h ?? 2) };
    addWidget(dup);
    setSelectedId(dup.id);
  }, [widgets, addWidget]);

  const handleToggleLock = useCallback((widgetId) => {
    updateWidget(widgetId, { locked: !widgets.find((w) => w.id === widgetId)?.locked });
  }, [widgets, updateWidget]);

  /* ── Toolbox / Tag drag-and-drop onto canvas ──────────────── */

  const [isDragOver, setIsDragOver] = useState(false);

  const handleCanvasDragOver = useCallback((e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('application/report-widget-type') || types.includes('application/report-tag-name')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleCanvasDragLeave = useCallback(() => setIsDragOver(false), []);

  const _calcGridPos = useCallback((e) => {
    const scrollEl = canvasScrollRef.current;
    const gridEl = scrollEl?.querySelector('.react-grid-layout');
    if (!gridEl) return { x: 0, y: 0 };
    const rect = gridEl.getBoundingClientRect();
    const scrollRect = scrollEl?.getBoundingClientRect?.();
    const scrollTop = scrollEl?.scrollTop ?? 0;
    const cols = gridCols ?? GRID_COLS_DEFAULT;
    const rowH = gridRowH ?? GRID_ROW_H_DEFAULT;
    const colW = (rect.width / zoom - (cols - 1) * GRID_MARGIN[0]) / cols;
    const relX = Math.max(0, Math.min(rect.width / zoom - 1, (e.clientX - rect.left) / zoom));
    const gridTopInContent = scrollRect ? rect.top - scrollRect.top + scrollTop : 0;
    const dropYInContent = scrollRect ? scrollTop + (e.clientY - scrollRect.top) : e.clientY - rect.top;
    const relY = Math.max(0, (dropYInContent - gridTopInContent) / zoom);
    return {
      x: Math.min(cols - 1, Math.floor(relX / (colW + GRID_MARGIN[0]))),
      y: Math.max(0, Math.floor(relY / (rowH + GRID_MARGIN[1]))),
    };
  }, [gridCols, gridRowH, zoom]);

  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);

    // ── Tag drop (from sidebar tag list) ──
    const tagName = e.dataTransfer?.getData('application/report-tag-name');
    if (tagName) {
      const tagUnit = e.dataTransfer?.getData('application/report-tag-unit') || '';
      if (selectedId) {
        const widget = widgets.find(w => w.id === selectedId);
        if (widget?.type === 'table') {
          const cols = [...(widget.config?.columns || [])];
          cols.push({ label: tagName, sourceType: 'tag', tagName, unit: tagUnit });
          updateWidget(selectedId, { config: { ...widget.config, columns: cols } });
        } else if (['chart', 'barchart'].includes(widget?.type)) {
          const series = [...(widget.config?.series || [])];
          series.push({ label: tagName, dataSource: { tagName } });
          updateWidget(selectedId, { config: { ...widget.config, series } });
        } else {
          updateWidget(selectedId, {
            config: { ...widget.config, dataSource: { tagName }, unit: tagUnit, title: tagName }
          });
        }
      } else {
        const { x, y } = _calcGridPos(e);
        const cat = WIDGET_CATALOG.find(c => c.type === 'kpi');
        if (cat) {
          const w = createWidget(cat, 0, 0);
          w.config = { ...w.config, dataSource: { tagName }, unit: tagUnit, title: tagName };
          addWidgetAt(w, x, y);
          setSelectedId(w.id);
          setShowProperties(true);
        }
      }
      return;
    }

    // ── Widget type drop (from toolbox) ──
    const widgetType = e.dataTransfer?.getData('application/report-widget-type');
    if (!widgetType) return;
    const cat = WIDGET_CATALOG.find((w) => w.type === widgetType);
    if (!cat) return;

    const scrollEl = canvasScrollRef.current;
    const gridEl = scrollEl?.querySelector('.react-grid-layout');
    if (!gridEl) {
      addWidget(createWidget(cat));
      return;
    }

    const { x, y } = _calcGridPos(e);
    const w = createWidget(cat, 0, 0);
    addWidgetAt(w, x, y);
    setSelectedId(w.id);
    setShowProperties(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = canvasScrollRef.current?.querySelector(`[data-widget-id="${w.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
    });
  }, [addWidget, addWidgetAt, updateWidget, widgets, selectedId, _calcGridPos]);

  /* ── Save / Publish ────────────────────────────────────────── */

  const handleSave = useCallback(async () => {
    await saveLayout();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [saveLayout]);

  const isReleased = template?.status === 'released';
  const handleRelease = useCallback(async () => {
    const newStatus = isReleased ? 'draft' : 'released';
    await updateMeta({ status: newStatus });
  }, [updateMeta, isReleased]);

  /* ── Inline name edit ──────────────────────────────────────── */
  const startEditName = () => { setNameInput(template?.name || ''); setEditingName(true); setTimeout(() => nameRef.current?.focus(), 50); };
  const finishEditName = () => {
    if (nameInput.trim() && nameInput.trim() !== template?.name) updateMeta({ name: nameInput.trim() });
    setEditingName(false);
  };

  /* ── Zoom helpers ─────────────────────────────────────────── */
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);
  const handleFitToPage = useCallback(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const viewportW = el.clientWidth - 48; /* subtract px-6 padding each side */
    const fit = Math.round(Math.min(1.5, Math.max(0.5, viewportW / 1200)) * 10) / 10;
    setZoom(fit);
  }, []);

  /* ── Keyboard shortcuts ────────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && canUndo && !editingName) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && canRedo && !editingName) { e.preventDefault(); redo(); }
      if (e.key === 'Delete' && selectedId && !editingName) {
        if (subWidgetInfo) { setSubWidgetInfo(null); }
        else { handleDeleteWidget(selectedId); }
      }
      if (e.key === 'Escape') { if (subWidgetInfo) { setSubWidgetInfo(null); } else { setSelectedId(null); } setEditingName(false); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        const w = widgets.find((w) => w.id === selectedId);
        if (w) {
          const dup = { ...JSON.parse(JSON.stringify(w)), id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, y: (w.y ?? 0) + (w.h ?? 2) };
          addWidget(dup);
          setSelectedId(dup.id);
        }
      }
      /* Zoom shortcuts */
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); handleZoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); handleZoomOut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); handleZoomReset(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleDeleteWidget, selectedId, editingName, widgets, addWidget, undo, redo, canUndo, canRedo, handleZoomIn, handleZoomOut, handleZoomReset, subWidgetInfo]);

  /* ── Loading state ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="report-builder flex flex-col h-[calc(100vh-72px)] overflow-hidden">
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-[var(--rb-accent)] border-t-transparent rounded-full animate-spin" />
            <p className="rb-caption">Loading report...</p>
          </div>
        </div>
      </div>
    );
  }

  const statusClass =
    template?.status === 'released'
      ? 'bg-[var(--rb-success)]/12 text-[var(--rb-success)]'
      : 'bg-[var(--rb-text-muted)]/15 text-[var(--rb-text-muted)]';

  /* ═══════════════════════  RENDER  ═══════════════════════════ */
  return (
    <div className="report-builder flex flex-col h-[calc(100vh-72px)] overflow-hidden bg-[var(--rb-surface)]">
      {/* ── Top Toolbar ── */}
      <div className="h-12 flex items-center justify-between px-4 bg-[#111827] border-b border-[#1e293b] flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Tooltip title="Back to reports" placement="bottom" arrow disableInteractive>
            <button onClick={() => navigate('/report-builder')} className="p-1.5 hover:bg-[#1a2233] rounded-md text-[#8899ab] hover:text-[#f0f4f8] transition-colors -ml-1">
              <ArrowLeft size={18} />
            </button>
          </Tooltip>
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={finishEditName}
                  onKeyDown={(e) => e.key === 'Enter' && finishEditName()}
                  className="bg-transparent border-none font-medium text-base focus:outline-none focus:ring-1 focus:ring-[#22d3ee] rounded px-1 text-[#f0f4f8] min-w-[120px]"
                />
                <button onClick={finishEditName} className="p-1.5 text-[#22d3ee] hover:bg-[#22d3ee]/10 rounded-md transition-colors">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <button onClick={startEditName} className="flex items-center gap-2 group min-w-0">
                <h1 className="font-medium text-base text-[#f0f4f8] truncate">{template?.name || 'Untitled Report'}</h1>
                <Pencil size={12} className="text-[#556677] group-hover:text-[#22d3ee] transition-colors flex-shrink-0" />
              </button>
            )}
          </div>
          <span className="text-xs px-2 py-0.5 border border-[#1e293b] rounded bg-[#0a0f1a] text-[#556677] capitalize">{template?.status === 'released' ? 'Released' : 'Draft'}</span>
          {dirty && (
            <span className="text-xs text-[#fbbf24] inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24] animate-pulse" />
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center bg-[#1a2233] rounded-md p-0.5 border border-[#1e293b]">
            <Tooltip title="Zoom out" placement="bottom" arrow disableInteractive>
              <button onClick={handleZoomOut} className="p-1.5 hover:bg-[#1e293b] rounded text-[#8899ab] hover:text-[#f0f4f8]">
                <Minus size={16} />
              </button>
            </Tooltip>
            <button onClick={handleZoomReset} className="text-xs font-mono px-2 text-[#8899ab] hover:text-[#f0f4f8]">{Math.round(zoom * 100)}%</button>
            <Tooltip title="Zoom in" placement="bottom" arrow disableInteractive>
              <button onClick={handleZoomIn} className="p-1.5 hover:bg-[#1e293b] rounded text-[#8899ab] hover:text-[#f0f4f8]">
                <Maximize size={16} />
              </button>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-[#1e293b] mx-1" />

          <Tooltip title="Undo" placement="bottom" arrow disableInteractive>
            <button onClick={undo} disabled={!canUndo} className="p-1.5 hover:bg-[#1a2233] rounded text-[#8899ab] hover:text-[#f0f4f8] disabled:opacity-30">
              <Undo2 size={16} />
            </button>
          </Tooltip>
          <Tooltip title="Redo" placement="bottom" arrow disableInteractive>
            <button onClick={redo} disabled={!canRedo} className="p-1.5 hover:bg-[#1a2233] rounded text-[#8899ab] hover:text-[#f0f4f8] disabled:opacity-30">
              <Redo2 size={16} />
            </button>
          </Tooltip>

          <div className="w-px h-5 bg-[#1e293b] mx-1" />

          <div className="flex items-center bg-[#0a0f1a] rounded-md p-0.5 border border-[#1e293b]">
            <button
              onClick={() => { if (pageMode !== 'a4') togglePageMode(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${pageMode === 'a4' ? 'bg-[#1a2233] text-[#f0f4f8] shadow-sm' : 'text-[#556677] hover:text-[#8899ab]'}`}
            >
              <FileText size={13} />
              A4
            </button>
            <button
              onClick={() => { if (pageMode !== 'full') togglePageMode(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${pageMode === 'full' ? 'bg-[#1a2233] text-[#f0f4f8] shadow-sm' : 'text-[#556677] hover:text-[#8899ab]'}`}
            >
              <Monitor size={13} />
              Dashboard
            </button>
          </div>

          {!dashboardTabs?.enabled && (
            <Tooltip title="Enable dashboard tabs" placement="bottom" arrow disableInteractive>
              <button
                onClick={enableDashboardTabs}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-[#556677] hover:text-[#8899ab] hover:bg-[#1a2233] border border-[#1e293b] transition-all"
              >
                <Copy size={13} />
                <span className="hidden sm:inline">Tabs</span>
              </button>
            </Tooltip>
          )}

          <div className="w-px h-5 bg-[#1e293b] mx-1" />

          <Tooltip title="Preview report" placement="bottom" arrow disableInteractive>
            <button onClick={() => navigate(`/report-builder/${id}/preview`)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#1a2233] rounded-md text-[#8899ab] hover:text-[#f0f4f8] border border-transparent hover:border-[#1e293b] transition-all">
              <Eye size={14} />
              <span className="text-xs font-medium hidden sm:inline">Preview</span>
            </button>
          </Tooltip>

          <div className="w-px h-5 bg-[#1e293b] mx-1" />

          <Tooltip title={dashboardLocked ? "Unlock dashboard for editing" : "Lock dashboard to prevent changes"} placement="bottom" arrow disableInteractive>
            <button
              onClick={toggleDashboardLock}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                dashboardLocked
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                  : 'bg-[#1a2233] text-[#556677] border-[#1e293b] hover:text-[#8899ab] hover:border-[#2a3a4e]'
              }`}
            >
              {dashboardLocked ? <Lock size={13} /> : <Unlock size={13} />}
              <span className="hidden sm:inline">{dashboardLocked ? 'Locked' : ''}</span>
            </button>
          </Tooltip>

          <Tooltip title={autoSave ? "Auto-save is ON — changes save automatically" : "Auto-save is OFF — use manual Save"} placement="bottom" arrow disableInteractive>
            <button
              onClick={toggleAutoSave}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                autoSave
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-[#1a2233] text-[#556677] border-[#1e293b] hover:text-[#8899ab] hover:border-[#2a3a4e]'
              }`}
            >
              <RefreshCw size={13} className={autoSave ? 'animate-none' : ''} />
              <span className="hidden sm:inline">Auto-save {autoSave ? 'ON' : 'OFF'}</span>
            </button>
          </Tooltip>

          <Tooltip title="Save report" placement="bottom" arrow disableInteractive>
            <span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-[#0a0f1a] rounded-md transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saveSuccess ? <><Check size={14} /> <span className="text-xs hidden sm:inline">Saved</span></> : saving ? <><span className="w-3.5 h-3.5 border-2 border-[#0a0f1a]/40 border-t-[#0a0f1a] rounded-full animate-spin" /> <span className="text-xs hidden sm:inline">Saving...</span></> : <><Save size={14} /> <span className="text-xs hidden sm:inline">Save Report</span></>}
              </button>
            </span>
          </Tooltip>

          <Tooltip title={isReleased ? "Unrelease report (back to draft)" : "Release report"} placement="bottom" arrow disableInteractive>
            <span>
              <button
                onClick={handleRelease}
                disabled={saving}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors font-medium border disabled:opacity-40 disabled:cursor-not-allowed ${
                  isReleased
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                    : 'bg-[#1a2233] hover:bg-[#0a0f1a] text-[#f0f4f8] border-[#1e293b]'
                }`}
              >
                <Send size={14} /> <span className="text-xs hidden sm:inline">{isReleased ? 'Released' : 'Release'}</span>
              </button>
            </span>
          </Tooltip>

        </div>
      </div>

      {/* ── Dashboard Tabs Bar ── */}
      {dashboardTabs?.enabled && (
        <div className="h-10 flex items-center gap-2 px-4 bg-[#0d1117] border-b border-[#1e293b] flex-shrink-0">
          {renamingTabId ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={tabNameRef}
                autoFocus
                value={tabNameInput}
                onChange={(e) => setTabNameInput(e.target.value)}
                onBlur={() => { if (tabNameInput.trim()) renameDashboardTab(renamingTabId, tabNameInput.trim()); setRenamingTabId(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (tabNameInput.trim()) renameDashboardTab(renamingTabId, tabNameInput.trim()); setRenamingTabId(null); }
                  if (e.key === 'Escape') setRenamingTabId(null);
                }}
                className="bg-[#1a2233] border border-[#22d3ee] rounded px-2 py-1 text-[12px] text-[#f0f4f8] outline-none w-32"
              />
            </div>
          ) : (
            <TabSelector
              tabs={(dashboardTabs.tabs || []).map(t => ({ id: t.id, label: t.label }))}
              activeId={activeTabId}
              onChange={(tabId) => { switchDashboardTab(tabId); setSelectedId(null); }}
              size="sm"
            />
          )}
          <div className="relative">
            <Tooltip title="Add new tab" placement="bottom" arrow disableInteractive>
              <button
                onClick={() => setShowAddTabMenu(v => !v)}
                className="p-1.5 rounded-md text-[#556677] hover:text-[#22d3ee] hover:bg-[#1a2233] transition-colors"
              >
                <Plus size={14} />
              </button>
            </Tooltip>
            {showAddTabMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAddTabMenu(false)} />
                <div className="absolute z-50 mt-1 left-0 w-52 rounded-lg border border-[#1e293b] bg-[#111827] shadow-xl overflow-hidden">
                  <button
                    onClick={() => {
                      addDashboardTab(`Tab ${(dashboardTabs.tabs || []).length + 1}`);
                      setShowAddTabMenu(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-[12px] text-[#f0f4f8] hover:bg-[#1a2233] transition-colors flex items-center gap-2"
                  >
                    <Plus size={12} className="text-[#22d3ee]" /> Empty tab
                  </button>
                  {(dashboardTabs.tabs || []).length > 0 && (
                    <div className="border-t border-[#1e293b]">
                      <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#556677]">Copy from...</div>
                      {(dashboardTabs.tabs || []).map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => {
                            duplicateDashboardTab(tab.id, `${tab.label} (copy)`);
                            setShowAddTabMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-[12px] text-[#8899ab] hover:text-[#f0f4f8] hover:bg-[#1a2233] transition-colors flex items-center gap-2"
                        >
                          <Copy size={11} className="text-[#556677]" /> {tab.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {dashboardTabs.tabs?.length > 0 && (
            <Tooltip title="Rename active tab (double-click tab to rename)" placement="bottom" arrow disableInteractive>
              <button
                onClick={() => {
                  const tab = dashboardTabs.tabs?.find(t => t.id === activeTabId);
                  if (!tab) return;
                  setTabNameInput(tab.label);
                  setRenamingTabId(activeTabId);
                  setTimeout(() => tabNameRef.current?.focus(), 50);
                }}
                className="p-1.5 rounded-md text-[#556677] hover:text-[#f0f4f8] hover:bg-[#1a2233] transition-colors"
              >
                <Pencil size={12} />
              </button>
            </Tooltip>
          )}
          {dashboardTabs.tabs?.length > 1 && (
            <Tooltip title="Remove active tab" placement="bottom" arrow disableInteractive>
              <button
                onClick={() => removeDashboardTab(activeTabId)}
                className="p-1.5 rounded-md text-[#556677] hover:text-[#ef4444] hover:bg-[#1a2233] transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </Tooltip>
          )}
          <div className="ml-auto">
            <Tooltip title="Disable tabs (merge active tab to main)" placement="bottom" arrow disableInteractive>
              <button
                onClick={() => disableDashboardTabs()}
                className="text-[9px] font-medium px-2 py-1 rounded text-[#556677] hover:text-[#f0f4f8] hover:bg-[#1a2233] transition-colors"
              >
                Disable Tabs
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* ── Three-zone body: toolbox | canvas | properties ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left toolbox */}
        <AnimatePresence>
          {showToolbox && (
            <motion.div
              initial={skipAnimations ? false : { width: 0, opacity: 0, x: -20 }}
              animate={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? 220 : 260, opacity: 1, x: 0 }}
              exit={skipAnimations ? { width: 0, opacity: 0 } : { width: 0, opacity: 0, x: -20 }}
              transition={skipAnimations ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-shrink-0 rb-panel-surface border-r border-[var(--rb-border)] overflow-hidden rb-panel-left-shadow max-w-[70vw]"
            >
              <WidgetToolbox
                onAddWidget={handleAddWidget}
                tags={tags}
                groups={groups}
                widgets={widgets}
                selectedId={selectedId}
                onSelectWidget={(wid) => { setSelectedId(wid); setShowProperties(true); }}
                onHidePanel={() => setShowToolbox(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Canvas (scrollable, fill remaining width) ── */}
        <div className="flex-1 min-w-0 min-h-0 basis-0 relative">
          {!showToolbox && (
            <Tooltip title="Show widgets panel" placement="right" arrow disableInteractive>
              <button
                onClick={() => setShowToolbox(true)}
                className="absolute left-2 top-3 z-10 p-2 rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:text-[var(--rb-accent)] hover:border-[var(--rb-accent)] shadow-md transition-all"
              >
                <PanelLeft size={16} />
              </button>
            </Tooltip>
          )}
          {!showProperties && (
            <Tooltip title="Show properties panel" placement="left" arrow disableInteractive>
              <button
                onClick={() => setShowProperties(true)}
                className="absolute right-2 top-3 z-10 p-2 rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:text-[var(--rb-accent)] hover:border-[var(--rb-accent)] shadow-md transition-all"
              >
                <PanelRight size={16} />
              </button>
            </Tooltip>
          )}
          <div
            ref={canvasScrollRef}
            className={`absolute inset-0 overflow-y-auto overflow-x-auto rb-canvas-surface rb-canvas-dots ${isDragOver ? 'rb-canvas-drop-active' : ''}`}
            style={{ background: 'var(--rb-canvas)' }}
            onClick={handleDeselect}
            onDragOver={handleCanvasDragOver}
            onDragLeave={handleCanvasDragLeave}
            onDrop={handleCanvasDrop}
            onWheelCapture={handleWheelCapture}
          >
            {/* Centering wrapper */}
            <div className="flex justify-center py-4 px-2 sm:py-6 sm:px-6">
              {/* Page container — zoom via transform: scale() */}
              <div
                className={`rb-page-container w-full ${pageMode === 'a4' ? 'max-w-[1200px]' : 'max-w-full'}`}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: skipAnimations ? 'none' : 'max-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease-out',
                }}
              >
                <div ref={containerRef} className="px-2 sm:px-6 pt-3 pb-6 rb-canvas-perspective" style={{ minHeight: '100%', width: '100%', boxSizing: 'border-box' }}>
                  {widgets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="rb-empty-state-icon w-16 h-16 rounded-2xl flex items-center justify-center mb-5">
                      <Plus size={28} className="text-[var(--rb-text-muted)]" />
                    </div>
                    <h3 className="rb-heading mb-2">Start designing your report</h3>
                    <p className="rb-caption max-w-sm leading-relaxed text-[var(--rb-text-muted)]">
                      Add components from the left panel. Drag widgets to reposition, resize from the bottom-right corner.
                    </p>
                  </div>
                ) : (
                  <GridLayout
                    className="layout"
                    width={effectiveGridWidth}
                    layout={layout}
                    cols={gridCols}
                    rowHeight={gridRowH}
                    margin={GRID_MARGIN}
                    containerPadding={GRID_PADDING}
                    compactType={null}
                    allowOverlap={true}
                    isDraggable={!dashboardLocked}
                    isResizable={!dashboardLocked}
                    resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
                    onLayoutChange={handleLayoutChange}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                    draggableCancel=".no-drag"
                    draggableHandle=".widget-drag-handle"
                  >
                    {widgets.map((widget) => {
                      /* text = invisible wrapper (no border, no bg, no card — ever) */
                      const wt = widget.type;
                      const isInvisible = wt === 'text';
                      const showCard = isInvisible
                        ? false
                        : CARDLESS_WIDGET_TYPES.has(wt)
                          ? widget.config?.showCard === true
                          : widget.config?.showCard !== false;
                      const isSelected = selectedId === widget.id;
                      const isLocked = !!widget.locked;
                      return (
                        <div
                          key={String(widget.id)}
                          data-widget-id={widget.id}
                          onClick={(e) => handleSelect(widget.id, e)}
                          className={`group overflow-visible ${
                            isInvisible
                              ? ''
                              : showCard
                                ? `rounded rb-widget-card ${({'borderless':'rb-card-borderless','glass':'rb-card-glass','accent-top':'rb-card-accent-top','holographic':'rb-card-holographic'})[widget.config?.cardStyle] || ''}`
                                : 'rounded border border-dashed border-[var(--rb-border)]/60'
                          } ${
                            isSelected
                              ? isInvisible
                                ? 'outline outline-2 outline-[var(--rb-accent)] outline-offset-1 rounded rb-widget-selected'
                                : 'rb-widget-selected'
                              : isInvisible
                                ? 'hover:outline hover:outline-1 hover:outline-[var(--rb-accent)]/30 hover:outline-offset-1 rounded'
                                : showCard
                                  ? 'border-[var(--rb-border)] hover:border-[var(--rb-accent)]'
                                  : 'hover:border-[var(--rb-accent)]/50'
                          }`}
                          style={{
                            '--widget-color': widget.config?.color || undefined,
                            ...(isSelected && !isInvisible ? {
                              borderColor: 'var(--rb-accent)',
                              boxShadow: '0 0 0 2px var(--rb-accent)',
                            } : {}),
                          }}
                        >
                          {/* Selection handles (4 corners) */}
                          {isSelected && (
                            <>
                              <span className="rb-selection-handle" style={{ top: -4, left: -4 }} />
                              <span className="rb-selection-handle" style={{ top: -4, right: -4 }} />
                              <span className="rb-selection-handle" style={{ bottom: -4, left: -4 }} />
                              <span className="rb-selection-handle" style={{ bottom: -4, right: -4 }} />
                            </>
                          )}

                          {/* Floating mini-toolbar */}
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={skipAnimations ? false : { opacity: 0, scale: 0.85, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={skipAnimations ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 4 }}
                                transition={skipAnimations ? { duration: 0 } : { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
                                className="rb-widget-minitoolbar no-drag"
                              >
                                <Tooltip title="Duplicate (Ctrl+D)" placement="top" arrow disableInteractive>
                                  <button onClick={(e) => { e.stopPropagation(); handleDuplicate(widget.id); }}><Copy size={13} /></button>
                                </Tooltip>
                                <Tooltip title="Delete (Del)" placement="top" arrow disableInteractive>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteWidget(widget.id); }}><Trash2 size={13} /></button>
                                </Tooltip>
                                <Tooltip title={isLocked ? 'Unlock widget' : 'Lock widget'} placement="top" arrow disableInteractive>
                                  <button onClick={(e) => { e.stopPropagation(); handleToggleLock(widget.id); }}>
                                    {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                                  </button>
                                </Tooltip>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Locked badge */}
                          {isLocked && (
                            <div className="absolute top-1.5 right-1.5 z-10 p-1 rounded bg-[var(--rb-surface)] border border-[var(--rb-border)]">
                              <Lock size={10} className="text-[var(--rb-text-muted)]" />
                            </div>
                          )}

                          {/* Drag handle overlay */}
                          <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div
                              className="widget-drag-handle rb-drag-handle inline-flex items-center gap-1 px-1.5 py-0.5 cursor-move"
                              title="Drag widget"
                            >
                              <span className="opacity-60">⋮⋮</span>
                            </div>
                          </div>

                          {/* Widget body */}
                          <div className={`h-full no-drag ${wt === 'tabcontainer' ? 'overflow-visible' : 'overflow-hidden'}`}>
                            <WidgetRenderer
                              widget={widget}
                              tagValues={liveTagValues}
                              isSelected={isSelected}
                              onUpdateWidget={updateWidget}
                              widgetId={widget.id}
                              tags={tags}
                              isReportBuilderWorkspace
                              layoutRowHeight={gridRowH}
                              tagHistory={tagHistory}
                              savedFormulas={savedFormulas}
                              onSubWidgetSelect={wt === 'tabcontainer' ? handleSubWidgetSelect : undefined}
                              selectedSubWidgetId={wt === 'tabcontainer' && subWidgetInfo?.parentId === widget.id ? subWidgetInfo.subWidget?.id : undefined}
                              onSubLayoutChange={wt === 'tabcontainer' ? handleSubLayoutChangeViaCanvas : undefined}
                            />
                          </div>

                          {/* Separator line (replaces standalone divider widget — zero extra grid rows) */}
                          {widget.config?.showSeparator && (
                            <div
                              className="absolute left-0 right-0 bottom-0 pointer-events-none"
                              style={{
                                borderBottom: `${widget.config.separatorThickness || 1}px ${widget.config.separatorStyle || 'solid'} ${widget.config.separatorColor || 'var(--rb-border)'}`,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </GridLayout>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom floating toolbar removed — controls are now in the top toolbar */}
        </div>

        {/* Right properties panel */}
        <AnimatePresence>
          {showProperties && (
            <motion.div
              initial={skipAnimations ? false : { width: 0, opacity: 0, x: 20 }}
              animate={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? 280 : 324, opacity: 1, x: 0 }}
              exit={skipAnimations ? { width: 0, opacity: 0 } : { width: 0, opacity: 0, x: 20 }}
              transition={skipAnimations ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-shrink-0 rb-panel-surface border-l border-[var(--rb-border)] overflow-hidden rb-panel-right-shadow max-w-[85vw]"
            >
              <PropertiesPanel
                widget={editingWidget}
                onUpdate={editingOnUpdate}
                onDelete={editingSubWidget ? () => { /* sub-widget delete handled in tab container */ } : handleDeleteWidget}
                onClose={() => { if (editingSubWidget) { setSubWidgetInfo(null); } else { setSelectedId(null); } }}
                onHidePanel={() => setShowProperties(false)}
                tags={tags}
                tagValues={liveTagValues}
                groups={groups}
                savedFormulas={savedFormulas}
                isSubWidget={!!editingSubWidget}
                onBackToParent={editingSubWidget ? () => setSubWidgetInfo(null) : undefined}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
