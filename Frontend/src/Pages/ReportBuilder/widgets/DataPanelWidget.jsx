import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Trash2 } from 'lucide-react';
import { evaluateFormula } from '../formulas/formulaEngine';
import FormulaEditor from '../formulas/FormulaEditor';

let _fid = Date.now();
const fieldId = () => `dpf-${_fid++}-${Math.random().toString(36).slice(2, 6)}`;

const LEGACY_GRID_COLS = 6;
const clampPct = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number(n) || 0));

/** Migrate row/col/colSpan grid fields to % box when left/top/width/height missing */
function normalizeField(f, gridCols = LEGACY_GRID_COLS) {
  const hasFreeform = f.left != null && f.top != null && f.width != null && f.height != null;
  if (hasFreeform) {
    return {
      ...f,
      left: clampPct(f.left),
      top: clampPct(f.top),
      width: clampPct(f.width, 4, 100),
      height: clampPct(f.height, 4, 100),
    };
  }
  const row = f.row ?? 0;
  const col = f.col ?? 0;
  const span = Math.max(1, f.colSpan || 1);
  const colW = 100 / gridCols;
  const left = clampPct(col * colW);
  const width = clampPct(Math.min(span * colW, 100 - left), 4, 100);
  const top = clampPct(row * 12);
  const height = clampPct(10, 4, 100 - top);
  return { ...f, left, top, width, height };
}

function resolveFieldValue(field, tagValues) {
  const src = field.sourceType || 'static';
  if (src === 'static') return field.staticValue ?? '';
  if (src === 'tag') {
    const raw = tagValues?.[field.tagName];
    if (raw == null) return null;
    const num = Number(raw);
    return isNaN(num) ? raw : num;
  }
  if (src === 'formula') {
    const result = evaluateFormula(field.formula || '', tagValues);
    if (result == null) return null;
    const num = Number(result);
    return isNaN(num) ? result : num;
  }
  return null;
}

function formatFieldValue(value, field) {
  if (value == null) return null;
  const decimals = field.decimals ?? 1;
  const unit = field.unit ? ` ${field.unit}` : '';
  if (typeof value === 'number' && !isNaN(value)) return `${value.toFixed(decimals)}${unit}`;
  return `${String(value)}${unit}`;
}

function getFieldHint(field) {
  const src = field.sourceType || 'static';
  if (src === 'tag' && field.tagName) return field.tagName;
  if (src === 'formula' && field.formula) return `ƒ ${field.formula.length > 20 ? field.formula.slice(0, 18) + '…' : field.formula}`;
  if (src === 'static') return field.staticValue || '';
  return '';
}

function defaultField(index = 0) {
  const left = snapPct(clampPct(5 + (index * 7) % 55));
  const top = snapPct(clampPct(5 + (index * 11) % 45));
  return {
    id: fieldId(),
    left,
    top,
    width: 20,
    height: SNAP_STEP,
    sourceType: 'static',
    staticValue: '',
    tagName: '',
    formula: '',
    aggregation: 'last',
    unit: '',
    decimals: 1,
    format: 'number',
    fontWeight: '',
    fontSize: '',
    align: 'left',
    verticalAlign: 'center',
    cellBg: '',
    cellColor: '',
    showBorder: true,
    borderColor: '',
    borderWidth: '1',
    borderRadius: '2',
    boxShadow: '',
  };
}

const SNAP_STEP = 5; // snap to 5% grid increments

function roundPct(n) {
  return Math.round(n * 10) / 10;
}

function snapPct(n) {
  return Math.round(n / SNAP_STEP) * SNAP_STEP;
}

function PanelHeader({ title, headerStyle, headerAlign, headerBg, headerColor, headerFontSize, panelBorder, panelBorderWidth }) {
  if (!title) return null;
  if (headerStyle === 'legend') return null;
  const align = headerAlign || 'left';
  const fs = headerFontSize || '12px';
  if (headerStyle === 'inline') {
    const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    const borderClr = panelBorder || '#e2e8f0';
    const bw = `${panelBorderWidth || 1}px`;
    return (
      <div
        className="flex items-center gap-2 flex-shrink-0 px-1"
        style={{ justifyContent: justify, margin: '0 0 -0.5px 0' }}
      >
        {(align === 'center' || align === 'right') && (
          <div className="flex-1 min-w-[12px]" style={{ borderBottom: `${bw} solid ${borderClr}` }} />
        )}
        <span
          className="font-bold whitespace-nowrap flex-shrink-0"
          style={{ fontSize: fs, color: headerColor || '#0f172a', padding: '2px 4px' }}
        >
          {title}
        </span>
        {(align === 'center' || align === 'left') && (
          <div className="flex-1 min-w-[12px]" style={{ borderBottom: `${bw} solid ${borderClr}` }} />
        )}
      </div>
    );
  }
  return (
    <div
      className="px-3 py-1.5 font-bold flex-shrink-0"
      style={{
        fontSize: fs,
        backgroundColor: headerBg || '#e2e8f0',
        color: headerColor || '#0f172a',
        textAlign: align,
        ...(panelBorder ? { borderBottom: `${panelBorderWidth || 1}px solid ${panelBorder}` } : {}),
      }}
    >
      {title}
    </div>
  );
}

export default function DataPanelWidget({ config, tagValues, isPreview, isSelected, onUpdate, widgetId, tags }) {
  const safeConfig = config || {};
  const title = safeConfig.title || '';
  const headerBg = safeConfig.headerBg || '';
  const headerColor = safeConfig.headerColor || '';
  const headerStyle = safeConfig.headerStyle || 'bar';
  const headerAlign = safeConfig.headerAlign || 'left';
  const headerFontSize = safeConfig.headerFontSize || '12px';
  const panelBg = safeConfig.panelBg || '';
  const panelBorder = safeConfig.panelBorder || '#e2e8f0';
  const panelBorderWidth = safeConfig.panelBorderWidth || '1';
  const contentPadding = safeConfig.contentPadding ?? 6;
  const gridCols = safeConfig.gridCols || LEGACY_GRID_COLS;
  const rawFields = Array.isArray(safeConfig.fields) ? safeConfig.fields : [];

  const fields = useMemo(
    () => rawFields.map((f) => normalizeField(f, gridCols)),
    [rawFields, gridCols],
  );

  const canEdit = Boolean(isSelected && onUpdate && widgetId);

  const canvasRef = useRef(null);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const dragRef = useRef(null);
  const [dragGeom, setDragGeom] = useState(null);

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const configRef = useRef(safeConfig);
  configRef.current = safeConfig;

  const commitFields = useCallback(
    (nextFields) => {
      if (!onUpdate || !widgetId) return;
      onUpdate(widgetId, { config: { ...configRef.current, fields: nextFields } });
    },
    [onUpdate, widgetId],
  );

  const addField = useCallback(() => {
    const f = defaultField(fieldsRef.current.length);
    commitFields([...fieldsRef.current, f]);
    setSelectedFieldId(f.id);
    setEditingFieldId(f.id);
    setDraft({ ...f });
  }, [commitFields]);

  const removeField = useCallback(
    (id) => {
      commitFields(fieldsRef.current.filter((f) => f.id !== id));
      setEditingFieldId((prev) => (prev === id ? null : prev));
      setDraft((prev) => (prev?.id === id ? null : prev));
      setSelectedFieldId((prev) => (prev === id ? null : prev));
    },
    [commitFields],
  );

  const saveField = useCallback(() => {
    if (!draft || !editingFieldId) return;
    const normalized = normalizeField(draft, gridCols);
    const cur = fieldsRef.current;
    const exists = cur.some((f) => f.id === editingFieldId);
    const updated = exists ? cur.map((f) => (f.id === editingFieldId ? normalized : f)) : [...cur, normalized];
    commitFields(updated);
    setEditingFieldId(null);
    setDraft(null);
  }, [draft, editingFieldId, gridCols, commitFields]);

  const closeEditor = useCallback(() => {
    setEditingFieldId(null);
    setDraft(null);
  }, []);

  const openEditor = useCallback((field) => {
    setEditingFieldId(field.id);
    setDraft({ ...normalizeField(field, gridCols) });
  }, [gridCols]);

  /* ── Drag / resize via stable refs (no stale closures) ── */
  useEffect(() => {
    const handleMove = (e) => {
      const d = dragRef.current;
      if (!d || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dxPct = ((e.clientX - d.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - d.startY) / rect.height) * 100;
      if (d.mode === 'move') {
        const left = clampPct(snapPct(d.origLeft + dxPct), 0, 100 - d.origW);
        const top = clampPct(snapPct(d.origTop + dyPct), 0, 100 - d.origH);
        setDragGeom({ id: d.id, left, top, width: d.origW, height: d.origH });
      } else if (d.mode === 'resize') {
        const w = clampPct(snapPct(d.origW + dxPct), SNAP_STEP, 100 - d.origL);
        const h = clampPct(snapPct(d.origH + dyPct), SNAP_STEP, 100 - d.origT);
        setDragGeom({ id: d.id, left: d.origL, top: d.origT, width: w, height: h });
      }
    };
    const handleUp = () => {
      const g = dragRef.current?._latestGeom;
      if (g) {
        const id = dragRef.current.id;
        const cur = fieldsRef.current;
        const patch = dragRef.current.mode === 'move'
          ? { left: g.left, top: g.top }
          : { width: g.width, height: g.height };
        const next = cur.map((f) => (f.id === id ? { ...f, ...patch } : f));
        commitFields(next);
      }
      dragRef.current = null;
      setDragGeom(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    const stored = { handleMove, handleUp };
    dragRef.current = dragRef.current || null;
    const ref = dragRef;
    ref._handlers = stored;
    return () => {
      document.removeEventListener('mousemove', stored.handleMove);
      document.removeEventListener('mouseup', stored.handleUp);
    };
  }, [commitFields]);

  useEffect(() => {
    if (dragGeom && dragRef.current) {
      dragRef.current._latestGeom = dragGeom;
    }
  }, [dragGeom]);

  const startDrag = useCallback((e, field, mode) => {
    if (!canEdit || editingFieldId) return;
    e.preventDefault();
    e.stopPropagation();
    const d = {
      mode,
      id: field.id,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: field.left,
      origTop: field.top,
      origW: field.width,
      origH: field.height,
      origL: field.left,
      origT: field.top,
      _latestGeom: null,
    };
    dragRef.current = d;
    const h = dragRef._handlers;
    if (h) {
      document.addEventListener('mousemove', h.handleMove);
      document.addEventListener('mouseup', h.handleUp);
    }
    setSelectedFieldId(field.id);
  }, [canEdit, editingFieldId]);

  if (fields.length === 0 && !canEdit) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ padding: '4px' }}>
        <PanelHeader {...{ title, headerStyle, headerAlign, headerBg, headerColor, headerFontSize, panelBorder, panelBorderWidth }} />
        <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--rb-text-muted)]">No fields configured</div>
      </div>
    );
  }

  const renderFieldBox = (field) => {
    const rawValue = resolveFieldValue(field, tagValues);
    const formatted = rawValue != null ? formatFieldValue(rawValue, field) : null;
    const showResolved = !!isPreview;
    const hint = getFieldHint(field);
    const displayText = showResolved ? ((formatted ?? hint) || '—') : (hint || 'Double-click');
    const isModalOpen = editingFieldId === field.id;
    const isSel = selectedFieldId === field.id && canEdit;
    const isDragging = dragGeom && dragGeom.id === field.id;
    const fLeft = isDragging ? dragGeom.left : field.left;
    const fTop = isDragging ? dragGeom.top : field.top;
    const fW = isDragging ? dragGeom.width : field.width;
    const fH = isDragging ? dragGeom.height : field.height;

    const vAlign = field.verticalAlign || 'center';
    const alignItems = vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';
    const bw = field.borderWidth || '1';
    const bc = field.borderColor || panelBorder || 'var(--rb-border)';
    const br = field.borderRadius || '2';

    return (
      <div
        key={field.id}
        className={`group absolute flex overflow-hidden select-none ${
          canEdit ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{
          left: `${fLeft}%`,
          top: `${fTop}%`,
          width: `${fW}%`,
          height: `${fH}%`,
          textAlign: field.align || 'left',
          fontWeight: field.fontWeight || 'normal',
          fontSize: field.fontSize || '11px',
          color: field.cellColor || 'inherit',
          alignItems,
          ...(field.cellBg ? { backgroundColor: field.cellBg } : { backgroundColor: 'var(--rb-input, #f1f5f9)' }),
          ...(field.showBorder !== false
            ? { border: `${bw}px solid ${bc}` }
            : {}),
          padding: '2px 6px',
          borderRadius: `${br}px`,
          boxSizing: 'border-box',
          ...(field.boxShadow ? { boxShadow: field.boxShadow } : {}),
          ...(isSel || isModalOpen ? { outline: '2px solid var(--rb-accent)', outlineOffset: '0px', zIndex: 2 } : { zIndex: 1 }),
        }}
        onMouseDown={(e) => {
          if (!canEdit || editingFieldId) return;
          if (e.target.closest('[data-dp-resize]')) return;
          if (e.target.closest('button')) return;
          startDrag(e, field, 'move');
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (canEdit) setSelectedFieldId(field.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (canEdit) openEditor(field);
        }}
        title={canEdit ? 'Drag to move · Double-click to edit' : undefined}
      >
        <span className="truncate w-full min-w-0 pointer-events-none">{displayText}</span>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeField(field.id);
            }}
            className="absolute top-0 right-0 p-0.5 rounded-bl bg-[var(--rb-panel)] border border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] z-10"
            title="Remove"
          >
            <X size={8} />
          </button>
        )}
        {canEdit && !editingFieldId && (
          <div
            data-dp-resize
            role="presentation"
            className="absolute bottom-0 right-0 w-2.5 h-2.5 cursor-nwse-resize bg-[var(--rb-accent)]/40 hover:bg-[var(--rb-accent)] border border-[var(--rb-border)] rounded-tl z-10"
            onMouseDown={(e) => startDrag(e, field, 'resize')}
          />
        )}
      </div>
    );
  };

  const emptyBuilder = fields.length === 0 && canEdit;

  const bw = `${panelBorderWidth}px`;
  const isLegend = headerStyle === 'legend';
  const isInline = headerStyle === 'inline';
  const removeBorderTop = title && !isLegend && !isInline;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ padding: '4px' }}>
      {!isLegend && (
        <PanelHeader {...{ title, headerStyle, headerAlign, headerBg, headerColor, headerFontSize, panelBorder, panelBorderWidth }} />
      )}

      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{
          position: 'relative',
          ...(panelBg ? { backgroundColor: panelBg } : {}),
          ...(panelBorder
            ? {
                border: `${bw} solid ${panelBorder}`,
                ...(removeBorderTop ? { borderTop: 'none' } : {}),
              }
            : {}),
          padding: `${contentPadding}px`,
        }}
      >
        {isLegend && title && (
          <div
            className="flex-shrink-0"
            style={{
              position: 'absolute',
              top: `-0.65em`,
              ...(headerAlign === 'center'
                ? { left: '50%', transform: 'translateX(-50%)' }
                : headerAlign === 'right'
                  ? { right: '12px' }
                  : { left: '12px' }),
              backgroundColor: panelBg || 'var(--rb-panel, #ffffff)',
              padding: '0 6px',
              zIndex: 3,
            }}
          >
            <span
              className="font-bold whitespace-nowrap"
              style={{ fontSize: headerFontSize || '12px', color: headerColor || '#0f172a' }}
            >
              {title}
            </span>
          </div>
        )}
        <div
          ref={canvasRef}
          className="relative flex-1 min-h-[100px] w-full"
          onMouseDown={(e) => {
            if (e.target === canvasRef.current || e.target.getAttribute('data-dp-bg') != null) {
              setSelectedFieldId(null);
            }
          }}
        >
          {/* Snap grid lines — visible when editing */}
          {canEdit && (
            <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.25 }}>
              {Array.from({ length: Math.floor(100 / SNAP_STEP) - 1 }, (_, i) => {
                const pct = (i + 1) * SNAP_STEP;
                return (
                  <React.Fragment key={pct}>
                    <div className="absolute top-0 bottom-0" style={{ left: `${pct}%`, width: '1px', background: 'var(--rb-border)' }} />
                    <div className="absolute left-0 right-0" style={{ top: `${pct}%`, height: '1px', background: 'var(--rb-border)' }} />
                  </React.Fragment>
                );
              })}
            </div>
          )}
          {emptyBuilder && (
            <div
              data-dp-bg
              className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--rb-text-muted)] pointer-events-none"
            >
              Add inputs below — drag to move, corner to resize
            </div>
          )}
          {!emptyBuilder && canEdit && (
            <div data-dp-bg className="absolute inset-0 border border-dashed border-transparent hover:border-[var(--rb-border)]/40 pointer-events-none" />
          )}
          {fields.map(renderFieldBox)}
        </div>

        {canEdit && (
          <div className="px-2 py-2 flex-shrink-0 border-t border-[var(--rb-border)]/30">
            <button
              type="button"
              onClick={addField}
              className="rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:border-[var(--rb-accent)]/50 hover:bg-[var(--rb-accent-subtle)] transition-colors text-[11px]"
            >
              <Plus size={12} /> Add input
            </button>
          </div>
        )}
      </div>

      {editingFieldId && draft && (
        <FieldEditor
          draft={draft}
          setDraft={setDraft}
          onSave={saveField}
          onCancel={closeEditor}
          onDelete={() => removeField(editingFieldId)}
          tags={tags}
          tagValues={tagValues}
        />
      )}
    </div>
  );
}

/* ── Field Editor Modal ─────────────────────────────────────────── */

function FieldEditor({ draft, setDraft, onSave, onCancel, onDelete, tags, tagValues }) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const [tagSearch, setTagSearch] = useState('');
  const patch = (u) => setDraft((d) => ({ ...d, ...u }));

  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return safeTags;
    const q = tagSearch.toLowerCase();
    return safeTags.filter(
      (t) => t.tag_name?.toLowerCase().includes(q) || t.display_name?.toLowerCase().includes(q),
    );
  }, [safeTags, tagSearch]);

  const inputCls =
    'w-full text-[12px] rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] text-[var(--rb-text)] placeholder-[#8898aa] px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-[#0e74904d] transition-colors';
  const labelCls = 'text-[11px] font-medium text-[var(--rb-text-muted)] mb-1.5 block';

  const typeBtn = (value, label, cls) => (
    <button
      key={value}
      type="button"
      onClick={() => patch({ sourceType: value })}
      className={`text-[12px] font-medium px-3 py-2 rounded-lg border transition-colors ${
        draft.sourceType === value
          ? cls
          : 'border-[var(--rb-border)] text-[var(--rb-text-muted)] bg-[var(--rb-panel)] hover:border-[#9dcde6]'
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      className="report-builder fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center"
      onClick={onCancel}
      style={{ isolation: 'isolate' }}
    >
      <div
        className="bg-[var(--rb-panel)] rounded-xl border border-[var(--rb-border)] shadow-2xl w-full max-w-[440px] max-h-[85vh] flex flex-col overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--rb-border)]">
          <h2 className="text-[14px] font-bold text-[var(--rb-text)]">Edit input</h2>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-[var(--rb-text-muted)] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Position & size (% of panel)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Left</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.left ?? 0}
                  onChange={(e) => patch({ left: clampPct(e.target.value) })}
                  className={inputCls}
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Top</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.top ?? 0}
                  onChange={(e) => patch({ top: clampPct(e.target.value) })}
                  className={inputCls}
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Width</span>
                <input
                  type="number"
                  min={4}
                  max={100}
                  step={0.5}
                  value={draft.width ?? 20}
                  onChange={(e) => patch({ width: clampPct(e.target.value, 4, 100) })}
                  className={inputCls}
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Height</span>
                <input
                  type="number"
                  min={4}
                  max={100}
                  step={0.5}
                  value={draft.height ?? 10}
                  onChange={(e) => patch({ height: clampPct(e.target.value, 4, 100) })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Value type</label>
            <div className="grid grid-cols-3 gap-2">
              {typeBtn('static', 'Static', 'border-[#6b7f94] bg-[var(--rb-surface)] text-[#6b7f94]')}
              {typeBtn('tag', 'PLC Tag', 'border-brand bg-brand-subtle text-brand')}
              {typeBtn('formula', 'Formula', 'border-[#7c3aed] bg-[#f5f3ff] text-[#7c3aed]')}
            </div>
          </div>

          {draft.sourceType === 'static' && (
            <div>
              <label className={labelCls}>Static value</label>
              <input
                type="text"
                value={draft.staticValue || ''}
                onChange={(e) => patch({ staticValue: e.target.value })}
                placeholder="Text, label, or number"
                autoFocus
                className={inputCls}
              />
            </div>
          )}

          {(draft.sourceType || 'static') === 'tag' && (
            <div>
              <label className={labelCls}>PLC tag</label>
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags..."
                className={`${inputCls} mb-2`}
              />
              <select
                value={draft.tagName || ''}
                onChange={(e) => patch({ tagName: e.target.value })}
                className={inputCls}
                size={Math.min(filteredTags.length + 1, 8)}
              >
                <option value="">— Select tag —</option>
                {filteredTags.map((t) => (
                  <option key={t.tag_name} value={t.tag_name}>
                    {t.display_name || t.tag_name}
                    {t.unit ? ` (${t.unit})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draft.sourceType === 'formula' && (
            <div>
              <label className={labelCls}>Formula</label>
              <FormulaEditor
                value={draft.formula || ''}
                onChange={(v) => patch({ formula: v })}
                tags={tags}
                tagValues={tagValues}
              />
            </div>
          )}

          {(draft.sourceType === 'tag' || draft.sourceType === 'formula') && (
            <div>
              <label className={labelCls}>Aggregation</label>
              <select
                value={draft.aggregation || 'last'}
                onChange={(e) => patch({ aggregation: e.target.value })}
                className={inputCls}
              >
                <option value="last">Last</option>
                <option value="first">First (Start)</option>
                <option value="delta">Delta (End−Start)</option>
                <option value="avg">Average</option>
                <option value="sum">Sum</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
                <option value="count">Count</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Display</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Unit</span>
                <input type="text" value={draft.unit || ''} onChange={(e) => patch({ unit: e.target.value })} placeholder="kWh" className={inputCls} />
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Decimals</span>
                <input type="number" min={0} value={draft.decimals ?? 1} onChange={(e) => patch({ decimals: Number(e.target.value) || 0 })} className={inputCls} />
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Align</span>
                <select value={draft.align || 'left'} onChange={(e) => patch({ align: e.target.value })} className={inputCls}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div className="mt-2">
              <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Vertical align</span>
              <select value={draft.verticalAlign || 'center'} onChange={(e) => patch({ verticalAlign: e.target.value })} className={inputCls}>
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Text</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Font weight</span>
                <select value={draft.fontWeight || ''} onChange={(e) => patch({ fontWeight: e.target.value })} className={inputCls}>
                  <option value="">Default</option>
                  <option value="normal">Normal</option>
                  <option value="500">Medium</option>
                  <option value="600">Semi-bold</option>
                  <option value="bold">Bold</option>
                </select>
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Font size</span>
                <select value={draft.fontSize || ''} onChange={(e) => patch({ fontSize: e.target.value })} className={inputCls}>
                  <option value="">Default (11px)</option>
                  <option value="9px">Small (9px)</option>
                  <option value="11px">Normal (11px)</option>
                  <option value="13px">Large (13px)</option>
                  <option value="16px">X-Large (16px)</option>
                  <option value="20px">XX-Large (20px)</option>
                </select>
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Text color</span>
                <div className="flex items-center gap-1">
                  <input type="color" value={draft.cellColor || '#000000'} onChange={(e) => patch({ cellColor: e.target.value })} className="w-7 h-7 rounded border border-[var(--rb-border)] cursor-pointer p-0 flex-shrink-0" />
                  <input type="text" value={draft.cellColor || ''} onChange={(e) => patch({ cellColor: e.target.value })} placeholder="inherit" className={inputCls} />
                </div>
              </div>
              <div>
                <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Background</span>
                <div className="flex items-center gap-1">
                  <input type="color" value={draft.cellBg || '#f1f5f9'} onChange={(e) => patch({ cellBg: e.target.value })} className="w-7 h-7 rounded border border-[var(--rb-border)] cursor-pointer p-0 flex-shrink-0" />
                  <input type="text" value={draft.cellBg || ''} onChange={(e) => patch({ cellBg: e.target.value })} placeholder="none" className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Border</label>
            <label className="flex items-center gap-1.5 mb-2 text-[11px] text-[var(--rb-text-muted)] cursor-pointer select-none">
              <input type="checkbox" checked={draft.showBorder !== false} onChange={(e) => patch({ showBorder: e.target.checked })} className="rounded" />
              Show border
            </label>
            {draft.showBorder !== false && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Width</span>
                  <select value={draft.borderWidth || '1'} onChange={(e) => patch({ borderWidth: e.target.value })} className={inputCls}>
                    <option value="1">1px</option>
                    <option value="2">2px</option>
                    <option value="3">3px</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Color</span>
                  <div className="flex items-center gap-1">
                    <input type="color" value={draft.borderColor || '#e2e8f0'} onChange={(e) => patch({ borderColor: e.target.value })} className="w-7 h-7 rounded border border-[var(--rb-border)] cursor-pointer p-0 flex-shrink-0" />
                    <input type="text" value={draft.borderColor || ''} onChange={(e) => patch({ borderColor: e.target.value })} placeholder="auto" className={inputCls} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Radius</span>
                  <select value={draft.borderRadius || '2'} onChange={(e) => patch({ borderRadius: e.target.value })} className={inputCls}>
                    <option value="0">None (0px)</option>
                    <option value="2">Small (2px)</option>
                    <option value="4">Medium (4px)</option>
                    <option value="8">Large (8px)</option>
                    <option value="12">X-Large (12px)</option>
                    <option value="9999">Pill</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Shadow</label>
            <select value={draft.boxShadow || ''} onChange={(e) => patch({ boxShadow: e.target.value })} className={inputCls}>
              <option value="">None</option>
              <option value="0 1px 2px rgba(0,0,0,0.05)">Subtle</option>
              <option value="0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)">Small</option>
              <option value="0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)">Medium</option>
              <option value="0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)">Large</option>
              <option value="0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)">X-Large</option>
              <option value="inset 0 2px 4px rgba(0,0,0,0.06)">Inner</option>
              <option value="0 0 0 3px rgba(14,116,144,0.15)">Glow</option>
            </select>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[var(--rb-border)] space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              className="flex-1 py-2.5 text-[12px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="py-2.5 px-4 text-[12px] font-medium rounded-lg border border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:bg-[var(--rb-surface)] transition-colors"
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="w-full text-[12px] font-medium text-[#dc2626] hover:bg-[#fef2f2] rounded-lg py-1.5 flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 size={12} /> Remove input
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
