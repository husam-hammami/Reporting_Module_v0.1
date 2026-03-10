import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import axios from '../../API/axios';
import {
  ArrowLeft, Save, Eye, PanelLeftClose, PanelRightClose,
  PanelLeft, PanelRight, Check, Pencil, Plus, X, AlertCircle, Send,
  Undo2, Redo2, Minus, Maximize, Grid3x3, FileText, Monitor,
  Copy, Trash2, Lock, Unlock,
} from 'lucide-react';
import { Tooltip } from '@mui/material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useReportCanvas, useAvailableTags, useAvailableGroups, useAvailableFormulas, collectWidgetTagNames } from '../../Hooks/useReportBuilder';
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
const GRID_MARGIN         = [4, 4];
const GRID_PADDING        = [0, 0]; // outer container provides 12px 24px 24px 24px to match viewer

/* ── Parameter Bar ─────────────────────────────────────────────── */

function ParameterBar({ parameters, onAdd, onRemove, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd({ name: newName.trim(), type: newType, defaultValue: '', options: [] });
    setNewName('');
    setNewType('text');
    setAdding(false);
  };

  if (parameters.length === 0 && !adding) {
    return (
      <div className="flex items-center px-5 py-2.5 border-b border-[var(--rb-border)] bg-[var(--rb-surface)]">
        <button
          onClick={() => setAdding(true)}
          className="rb-caption inline-flex items-center gap-2 text-[var(--rb-text-muted)] hover:text-[var(--rb-accent)] transition-colors"
        >
          <Plus size={14} />
          Add report parameter
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--rb-border)] bg-[var(--rb-surface)] overflow-x-auto">
      {parameters.map((p, i) => (
        <div key={i} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--rb-panel)] border border-[var(--rb-border)] rb-body">
          <span className="font-medium text-[var(--rb-text)]">{p.name}</span>
          <span className="text-[var(--rb-text-muted)]">:</span>
          <input
            type="text"
            value={p.defaultValue || ''}
            onChange={(e) => onUpdate(i, { defaultValue: e.target.value })}
            placeholder="value"
            className="w-20 rb-body bg-transparent border-0 outline-none text-[var(--rb-text)] placeholder:text-[var(--rb-text-muted)]"
          />
          <button onClick={() => onRemove(i)} className="text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] transition-colors p-0.5">
            <X size={12} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="inline-flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="rb-input-base w-24"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="rb-input-base w-28"
          >
            <option value="text">Text</option>
            <option value="dateRange">Date Range</option>
            <option value="select">Select</option>
          </select>
          <button onClick={handleAdd} className="p-2 text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] rounded-md transition-colors"><Check size={14} /></button>
          <button onClick={() => setAdding(false)} className="p-2 text-[var(--rb-text-muted)] hover:bg-[var(--rb-surface)] rounded-md transition-colors"><X size={14} /></button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rb-caption inline-flex items-center gap-2 text-[var(--rb-text-muted)] hover:text-[var(--rb-accent)] transition-colors flex-shrink-0"
        >
          <Plus size={14} />
          Add
        </button>
      )}
    </div>
  );
}

/* ── Canvas Page ───────────────────────────────────────────────── */

export default function ReportBuilderCanvas() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    template, widgets: rawWidgets, parameters, loading, saving, dirty, migrated,
    addWidget, addWidgetAt, updateWidget, removeWidget, updateLayout,
    addParameter, updateParameter, removeParameter,
    addComputedSignal, saveLayout, updateMeta,
    undo, redo, canUndo, canRedo,
  } = useReportCanvas(id);

  const { tags } = useAvailableTags();
  const { groups } = useAvailableGroups();
  const { formulas: savedFormulas } = useAvailableFormulas();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimations = prefersReducedMotion || isCapturing;
  const widgets = rawWidgets;
  const usedTagNames = useMemo(() => collectWidgetTagNames(widgets), [widgets]);
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
  const [showToolbox, setShowToolbox] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [gridSnap, setGridSnap] = useState(true);
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

  const handleLayoutChange = useCallback(
    (newLayout) => updateLayout(newLayout),
    [updateLayout],
  );

  const handleSelect = useCallback((wid, e) => {
    e?.stopPropagation();
    setSelectedId(wid);
    setShowProperties(true);
  }, []);

  const handleDeselect = useCallback(() => setSelectedId(null), []);

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

  /* ── Toolbox drag-and-drop onto canvas ─────────────────────── */

  const handleCanvasDragOver = useCallback((e) => {
    if (Array.from(e.dataTransfer?.types || []).includes('application/report-widget-type')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
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

    const rect = gridEl.getBoundingClientRect();
    const scrollRect = scrollEl?.getBoundingClientRect?.();
    const scrollTop = scrollEl?.scrollTop ?? 0;
    const cols = gridCols ?? GRID_COLS_DEFAULT;
    const rowH = gridRowH ?? GRID_ROW_H_DEFAULT;
    /* getBoundingClientRect returns scaled dims under transform: scale(), so dividing by zoom corrects naturally */
    const colW = (rect.width / zoom - (cols - 1) * GRID_MARGIN[0]) / cols;

    const relX = Math.max(0, Math.min(rect.width / zoom - 1, (e.clientX - rect.left) / zoom));
    const gridTopInContent = scrollRect ? rect.top - scrollRect.top + scrollTop : 0;
    const dropYInContent = scrollRect ? scrollTop + (e.clientY - scrollRect.top) : e.clientY - rect.top;
    const relY = Math.max(0, (dropYInContent - gridTopInContent) / zoom);

    const x = Math.min(cols - 1, Math.floor(relX / (colW + GRID_MARGIN[0])));
    const y = Math.max(0, Math.floor(relY / (rowH + GRID_MARGIN[1])));

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
  }, [addWidget, addWidgetAt, gridCols, gridRowH, zoom]);

  /* ── Save / Publish ────────────────────────────────────────── */

  const handleSave = useCallback(() => {
    saveLayout();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [saveLayout]);

  const handlePublish = useCallback(() => {
    updateMeta({ status: 'published' });
    saveLayout();
  }, [updateMeta, saveLayout]);

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
      if (e.key === 'Delete' && selectedId && !editingName) handleDeleteWidget(selectedId);
      if (e.key === 'Escape') { setSelectedId(null); setEditingName(false); }
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
  }, [handleSave, handleDeleteWidget, selectedId, editingName, widgets, addWidget, undo, redo, canUndo, canRedo, handleZoomIn, handleZoomOut, handleZoomReset]);

  /* ── Loading state ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="report-builder flex flex-col h-[calc(100vh-80px)] overflow-hidden">
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
    template?.status === 'published'
      ? 'bg-[var(--rb-success)]/12 text-[var(--rb-success)]'
      : template?.status === 'validated'
        ? 'bg-[var(--rb-accent)]/12 text-[var(--rb-accent)]'
        : 'bg-[var(--rb-text-muted)]/15 text-[var(--rb-text-muted)]';

  /* ═══════════════════════  RENDER  ═══════════════════════════ */
  return (
    <div className="report-builder flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-[var(--rb-surface)]">
      {/* ── Top Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 rb-panel-surface border-b border-[var(--rb-border)] flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Tooltip title="Back to reports" placement="bottom" arrow disableInteractive>
            <button onClick={() => navigate('/report-builder')} className="rb-btn-ghost p-2 -ml-2">
              <ArrowLeft size={18} />
            </button>
          </Tooltip>
          <div className="min-w-0">
            <p className="rb-heading leading-tight">Report Builder Workspace</p>
            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  ref={nameRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={finishEditName}
                  onKeyDown={(e) => e.key === 'Enter' && finishEditName()}
                  className="rb-body font-semibold bg-transparent border-b border-[var(--rb-accent)] outline-none py-0.5 min-w-[120px]"
                />
                <button onClick={finishEditName} className="p-1.5 text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] rounded-md transition-colors">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <button onClick={startEditName} className="flex items-center gap-2 group min-w-0 mt-1">
                <h1 className="rb-body font-semibold truncate">{template?.name || 'Untitled Report Layout'}</h1>
                <Pencil size={12} className="text-[var(--rb-text-muted)] group-hover:text-[var(--rb-accent)] transition-colors flex-shrink-0" />
              </button>
            )}
          </div>
          <span className={`rb-badge ${statusClass}`}>{template?.status || 'Draft'}</span>
          {dirty && (
            <span className="rb-badge bg-[var(--rb-warning)]/12 text-[var(--rb-warning)] inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rb-warning)] animate-pulse" />
              Unsaved changes
            </span>
          )}
          {migrated && (
            <span className="rb-badge bg-[var(--rb-warning)]/12 text-[var(--rb-warning)] inline-flex items-center gap-1">
              <AlertCircle size={12} /> Migrated
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip title="Components panel" placement="bottom" arrow disableInteractive>
            <button
              onClick={() => setShowToolbox(!showToolbox)}
              className={`p-2.5 rounded-lg transition-colors ${showToolbox ? 'text-[var(--rb-accent)] bg-[var(--rb-accent-subtle)]' : 'rb-btn-ghost'}`}
            >
              {showToolbox ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          </Tooltip>
          <Tooltip title="Properties panel" placement="bottom" arrow disableInteractive>
            <button
              onClick={() => setShowProperties(!showProperties)}
              className={`p-2.5 rounded-lg transition-colors ${showProperties ? 'text-[var(--rb-accent)] bg-[var(--rb-accent-subtle)]' : 'rb-btn-ghost'}`}
            >
              {showProperties ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Full buttons on desktop, icon-only on mobile */}
          <Tooltip title="Preview report" placement="bottom" arrow disableInteractive>
            <button onClick={() => navigate(`/report-builder/${id}/preview`)} className="rb-btn-ghost inline-flex items-center gap-1.5">
              <Eye size={14} /> <span className="hidden sm:inline">Preview</span>
            </button>
          </Tooltip>
          <Tooltip title="Save layout" placement="bottom" arrow disableInteractive>
            <span>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`rb-btn-success inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${saveSuccess ? '!bg-[var(--rb-success)]' : ''}`}
                style={{ transition: skipAnimations ? 'none' : 'background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease' }}
              >
                {saveSuccess ? <><Check size={14} /> <span className="hidden sm:inline">Saved</span></> : saving ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> <span className="hidden sm:inline">Saving...</span></> : <><Save size={14} /> <span className="hidden sm:inline">Save Template</span></>}
              </button>
            </span>
          </Tooltip>
          <Tooltip title="Publish report" placement="bottom" arrow disableInteractive>
            <span>
              <button
                onClick={handlePublish}
                disabled={saving}
                className="rb-btn-primary inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={14} /> <span className="hidden sm:inline">Publish</span>
              </button>
            </span>
          </Tooltip>
        </div>
      </div>

      {/* ── Parameter Bar ── */}
      <ParameterBar
        parameters={parameters}
        onAdd={addParameter}
        onRemove={removeParameter}
        onUpdate={updateParameter}
      />

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
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Canvas (scrollable, fill remaining width) ── */}
        <div className="flex-1 min-w-0 min-h-0 basis-0 relative">
          <div
            ref={canvasScrollRef}
            className={`absolute inset-0 overflow-y-auto overflow-x-auto rb-canvas-surface rb-canvas-dots ${gridSnap ? 'rb-grid-snap-active' : ''}`}
            style={{ background: 'var(--rb-canvas)' }}
            onClick={handleDeselect}
            onDragOver={handleCanvasDragOver}
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
                    isDraggable={true}
                    isResizable={true}
                    resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
                    onLayoutChange={handleLayoutChange}
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
                          className={`group transition-shadow overflow-visible ${
                            isInvisible
                              ? ''
                              : showCard
                                ? 'rounded rb-widget-card'
                                : 'rounded border border-dashed border-[var(--rb-border)]/60'
                          } ${
                            isSelected
                              ? isInvisible
                                ? 'outline outline-2 outline-[var(--rb-accent)] outline-offset-1 rounded rb-widget-selected'
                                : 'rb-widget-selected'
                              : isInvisible
                                ? 'hover:outline hover:outline-1 hover:outline-[var(--rb-accent)]/30 hover:outline-offset-1 rounded'
                                : showCard
                                  ? 'border-[var(--rb-border)] hover:border-dashed hover:border-[var(--rb-accent)]/40'
                                  : 'hover:border-[var(--rb-accent)]/50'
                          }`}
                          style={isSelected && !isInvisible ? {
                            borderColor: 'var(--rb-accent)',
                            boxShadow: '0 0 20px var(--rb-accent-glow), 0 0 0 2px color-mix(in srgb, var(--rb-accent) 18%, transparent)',
                          } : undefined}
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
                          <div className="h-full no-drag overflow-hidden">
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

          {/* ── Floating Canvas Toolbar ── */}
          <div className="rb-floating-toolbar">
            <Tooltip title="Zoom out (Ctrl+-)" placement="top" arrow disableInteractive>
              <span>
                <button onClick={handleZoomOut} disabled={zoom <= 0.5}><Minus size={14} /></button>
              </span>
            </Tooltip>
            <span className="rb-toolbar-zoom-label">{Math.round(zoom * 100)}%</span>
            <Tooltip title="Zoom in (Ctrl+=)" placement="top" arrow disableInteractive>
              <span>
                <button onClick={handleZoomIn} disabled={zoom >= 1.5}><Plus size={14} /></button>
              </span>
            </Tooltip>
            <div className="rb-toolbar-divider" />
            <Tooltip title="Fit to page" placement="top" arrow disableInteractive>
              <button onClick={handleFitToPage}><Maximize size={14} /></button>
            </Tooltip>
            <Tooltip title="Grid snap" placement="top" arrow disableInteractive>
              <button onClick={() => setGridSnap(!gridSnap)} className={gridSnap ? 'active' : ''}><Grid3x3 size={14} /></button>
            </Tooltip>
            <div className="rb-toolbar-divider" />
            <Tooltip title={pageMode === 'a4' ? 'Switch to full dashboard' : 'Switch to A4 page'} placement="top" arrow disableInteractive>
              <button onClick={togglePageMode}>
                {pageMode === 'a4' ? <Monitor size={14} /> : <FileText size={14} />}
              </button>
            </Tooltip>
            <div className="rb-toolbar-divider" />
            <Tooltip title="Undo (Ctrl+Z)" placement="top" arrow disableInteractive>
              <span>
                <button onClick={undo} disabled={!canUndo}><Undo2 size={14} /></button>
              </span>
            </Tooltip>
            <Tooltip title="Redo (Ctrl+Shift+Z)" placement="top" arrow disableInteractive>
              <span>
                <button onClick={redo} disabled={!canRedo}><Redo2 size={14} /></button>
              </span>
            </Tooltip>
          </div>
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
                widget={selectedWidget}
                onUpdate={updateWidget}
                onDelete={handleDeleteWidget}
                onClose={() => setSelectedId(null)}
                tags={tags}
                tagValues={liveTagValues}
                groups={groups}
                savedFormulas={savedFormulas}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
