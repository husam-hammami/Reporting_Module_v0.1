import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X, Settings2, GripVertical, ChevronDown } from 'lucide-react';
import { evaluateFormula } from '../formulas/formulaEngine';
import FormulaEditor from '../formulas/FormulaEditor';
import WidgetRenderer from './WidgetRenderer';

import { getCachedMappings, refreshMappingsCache } from '../../../utils/mappingsCache';

// Trigger initial cache load
refreshMappingsCache();

function resolveLookup(mapping, inputValue) {
  if (inputValue == null) return mapping?.fallback || '—';
  const key = String(Math.round(Number(inputValue)));
  const mapped = mapping?.lookup?.[key];
  if (mapped !== undefined && mapped !== null) return mapped;
  // No mapping match: show raw tag value until it matches a map value
  return inputValue;
}

/* ── Resolve a column's live value from PLC tags ───────────────── */

function resolveColumnValue(col, tagValues) {
  const src = col.sourceType || 'tag';

  if (src === 'tag') {
    const raw = tagValues?.[col.tagName];
    if (raw == null) return null;
    const num = Number(raw);
    return isNaN(num) ? raw : num;
  }

  if (src === 'formula') {
    const result = evaluateFormula(col.formula || '', tagValues);
    if (result == null) return null;
    const num = Number(result);
    return isNaN(num) ? result : num;
  }

  if (src === 'group') {
    const vals = (col.groupTags || []).map((t) => Number(tagValues?.[t]) || 0);
    if (vals.length === 0) return null;
    const agg = col.aggregation || 'avg';
    if (agg === 'sum') return vals.reduce((a, b) => a + b, 0);
    if (agg === 'min') return Math.min(...vals);
    if (agg === 'max') return Math.max(...vals);
    if (agg === 'count') return vals.length;
    if (agg === 'delta') return vals.length < 2 ? 0 : vals[vals.length - 1] - vals[0];
    return vals.reduce((a, b) => a + b, 0) / vals.length; // avg
  }

  if (src === 'mapping' && col.mappingName) {
    const mappings = getCachedMappings();
    const mapping = mappings.find((m) => (m.name || m.id) === col.mappingName);
    if (!mapping) return null;
    const inputValue = tagValues?.[mapping.input_tag];
    return resolveLookup(mapping, inputValue);
  }

  if (src === 'static') return col.staticValue ?? '';
  return null;
}

/* ── What to show when there's no live value (design-time hint) ── */

function getColumnHint(col) {
  const src = col.sourceType || 'tag';
  if (src === 'tag' && col.tagName) return col.tagName;
  if (src === 'formula' && col.formula) {
    const short = col.formula.length > 40 ? col.formula.slice(0, 38) + '…' : col.formula;
    return `ƒ ${short}`;
  }
  if (src === 'group' && (col.groupTags || []).length > 0) {
    const names = col.groupTags.slice(0, 2).join(', ');
    const rest = col.groupTags.length > 2 ? ` +${col.groupTags.length - 2}` : '';
    return names ? `${names}${rest}` : `Group (${col.groupTags.length})`;
  }
  if (src === 'mapping' && col.mappingName) return `Map: ${col.mappingName}`;
  if (src === 'static') return col.staticValue || '—';
  return null; // nothing configured
}

function getSourceBadge(col) {
  const src = col.sourceType || 'tag';
  if (src === 'formula') return { label: 'FORMULA', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' };
  if (src === 'group') return { label: 'GROUP', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  if (src === 'mapping') return { label: 'MAPPING', cls: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' };
  if (src === 'static') return { label: 'STATIC', cls: 'bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-400/20' };
  return { label: 'TAG', cls: 'bg-[#0e74901a] text-brand dark:text-cyan-400 border-[#0e749033]' };
}

/* ── Format cell for display ───────────────────────────────────── */

function formatCellDisplay(value, col, showUnit = false) {
  const format = col.format || 'number';
  const decimals = col.decimals ?? 1;
  const unit = showUnit && col.unit ? ` ${col.unit}` : '';

  if (format === 'boolean') {
    const checked = value != null && value !== '' && (typeof value === 'number' ? value !== 0 : !!value);
    return { type: 'boolean', checked };
  }

  if (format === 'percentage') {
    const num = Number(value);
    if (num == null || isNaN(num)) return { type: 'text', text: '\u2014' };
    return { type: 'text', text: `${num.toFixed(decimals)} %` };
  }

  if (format === 'weight') {
    const num = Number(value);
    if (num == null || isNaN(num)) return { type: 'text', text: '\u2014' };
    return { type: 'text', text: `${num.toFixed(decimals)}${unit || ' kg'}` };
  }

  if (value == null) return { type: 'text', text: null };
  if (typeof value === 'number' && !isNaN(value)) return { type: 'text', text: `${value.toFixed(decimals)}${unit}` };
  return { type: 'text', text: `${String(value)}${unit}` };
}

/* ── Get threshold color ───────────────────────────────────────── */

function getThresholdColor(value, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  for (const rule of rules) {
    if (rule.condition === 'above' && num > rule.value) return rule.color;
    if (rule.condition === 'below' && num < rule.value) return rule.color;
    if (rule.condition === 'between' && num >= rule.value && num <= rule.valueTo) return rule.color;
    if (rule.condition === 'equals' && num === rule.value) return rule.color;
  }
  return null;
}

/* ── Compute aggregation across column values ──────────────────── */

function computeAggregation(values, aggType) {
  const nums = values.map((v) => Number(v)).filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  switch (aggType) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    case 'count': return nums.length;
    default: return nums.reduce((a, b) => a + b, 0);
  }
}

function defaultStaticCellConfig() {
  return {
    sourceType: 'static',
    staticValue: '',
    aggregation: 'last',
    format: 'number',
    decimals: 1,
    groupTags: [],
    mappingName: '',
    formula: '',
  };
}

/* ── Drill-down: rewrite {ROW_KEY} placeholders in a widget config ── */

function rewriteTagsForRow(widgetConfig, rowKey, separator = '_') {
  if (!widgetConfig || !rowKey) return widgetConfig;
  const json = JSON.stringify(widgetConfig);
  const resolved = json.replace(/\{ROW_KEY\}/g, rowKey);
  try { return JSON.parse(resolved); } catch { return widgetConfig; }
}

/* ── Tag select (simple dropdown for inline editing) ───────────── */

function TagSelect({ tags, value, onChange }) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return safeTags;
    const q = search.toLowerCase();
    return safeTags.filter((t) => t.tag_name?.toLowerCase().includes(q) || t.display_name?.toLowerCase().includes(q));
  }, [safeTags, search]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rb-input-base w-full text-left truncate"
      >
        {value || <span className="text-[var(--rb-text-muted)]">Select tag...</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute z-50 mt-2 w-full rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl max-h-60 overflow-hidden">
            <div className="p-2 border-b border-[var(--rb-border)]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags..."
                autoFocus
                className="rb-input-base w-full py-2"
              />
            </div>
            <div className="overflow-y-auto max-h-44">
              {filtered.length === 0 ? (
                <p className="rb-caption px-4 py-4 text-center">No tags found</p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.tag_name}
                    type="button"
                    onClick={() => {
                      onChange(t.tag_name);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={`w-full px-4 py-2 text-left rb-body hover:bg-[var(--rb-accent-subtle)] transition-colors ${
                      value === t.tag_name ? 'bg-[var(--rb-accent-subtle)]' : ''
                    }`}
                    title={t.display_name || t.tag_name}
                  >
                    {t.display_name || t.tag_name}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TABLE WIDGET — Column-only, Power BI–style
   
   - Each column = a data field (tag, formula, group, or static).
   - One row of live PLC values.
   - User can add aggregation rows (Sum, Avg, Min, Max, Count).
   - Double-click column header or cell to edit.
   - Shows tag name / formula hint when no live data.
   ══════════════════════════════════════════════════════════════════ */

const LAYOUT_ROW_HEIGHT_DEFAULT = 40;
/** In preview, table body height ≈ (layoutH * rowHeight) - title - padding. Use same min in builder so dimensions match. */
function tableBodyMinHeight(layoutH, layoutRowHeight) {
  const h = Number(layoutH);
  const rh = Number(layoutRowHeight) || LAYOUT_ROW_HEIGHT_DEFAULT;
  if (!Number.isFinite(h) || h < 1) return undefined;
  const total = h * rh;
  const reserved = 56; // title + padding
  return Math.max(60, total - reserved);
}

export default function TableWidget({ config, tagValues, isPreview, isSelected, onUpdate, widgetId, tags, layoutH, layoutRowHeight, isReportBuilderWorkspace, savedFormulas = [], tagHistory }) {
  const safeConfig = config || {};
  const columns = Array.isArray(safeConfig.tableColumns) ? safeConfig.tableColumns : [];
  const summaryRows = Array.isArray(safeConfig.summaryRows) ? safeConfig.summaryRows : [];
  const rawStaticRows = Array.isArray(safeConfig.staticDataRows) ? safeConfig.staticDataRows : [];
  const sectionHeaders = Array.isArray(safeConfig.sectionHeaders) ? safeConfig.sectionHeaders : [];
  const reportHeader = safeConfig.reportHeader || null;
  const showUnitsInCells = safeConfig.showUnitsInCells || false;
  const staticDataRows = useMemo(() => {
    const n = columns.length;
    if (n === 0) return [];
    const def = defaultStaticCellConfig();
    const normalizeCell = (cell) => {
      if (cell != null && typeof cell === 'object' && cell.sourceType != null) {
        return { ...def, ...cell };
      }
      return { ...def, sourceType: 'static', staticValue: String(cell ?? '') };
    };
    return rawStaticRows.map((row) => {
      const arr = Array.isArray(row) ? [...row] : [];
      while (arr.length < n) arr.push('');
      return arr.slice(0, n).map(normalizeCell);
    });
  }, [rawStaticRows, columns.length]);
  const compact = safeConfig.compact || false;
  const striped = safeConfig.striped || false;
  const headerBg = safeConfig.headerBg || '';
  const headerColor = safeConfig.headerColor || '';
  const rowBg = safeConfig.rowBg || '';
  const stripedRowBg = safeConfig.stripedRowBg || '';
  const borderColor = safeConfig.borderColor || '';
  const sectionHeaderBg = safeConfig.sectionHeaderBg || '';
  const sectionHeaderColor = safeConfig.sectionHeaderColor || '';

  const canEdit = Boolean(isSelected && onUpdate && widgetId);
  /** Allow horizontal scroll everywhere so wide tables remain usable. */
  const fitInContainer = false;
  const tableBodyMin = canEdit ? tableBodyMinHeight(layoutH, layoutRowHeight) : undefined;

  /* ── Drill-down config ── */
  const drillDown = safeConfig.drillDown || {};
  const drillDownEnabled = !!drillDown.enabled;
  const drillDownKeyCol = drillDown.keyColumn ?? 0;
  const drillDownSep = drillDown.prefixSeparator ?? '_';
  const drillDownWidgets = Array.isArray(drillDown.detailWidgets) ? drillDown.detailWidgets : [];
  const drillDownGridCols = drillDown.detailGridCols || 2;

  /* ── Editing state ── */
  const [editingCol, setEditingCol] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editingStaticCell, setEditingStaticCell] = useState(null);
  const [draftStaticCell, setDraftStaticCell] = useState(null);
  const [showTotalsOptions, setShowTotalsOptions] = useState(false);
  const [activeRowKey, setActiveRowKey] = useState(null);

  const openEditor = useCallback((mode, index, colDef) => {
    setEditingCol({ mode, index });
    setDraft(colDef ? { ...colDef } : {
      label: `Column ${columns.length + 1}`,
      sourceType: 'tag',
      tagName: '',
      formula: '',
      groupTags: [],
      aggregation: 'last',
      staticValue: '',
      unit: '',
      decimals: 1,
      align: 'left',
      width: 120,
      format: 'number',
      thresholds: [],
    });
  }, [columns.length]);

  const closeEditor = useCallback(() => {
    setEditingCol(null);
    setDraft(null);
  }, []);

  const saveColumn = useCallback(() => {
    if (!onUpdate || !widgetId || !editingCol || !draft) return;
    const cols = [...columns];
    if (editingCol.mode === 'add') {
      cols.push(draft);
    } else if (editingCol.mode === 'edit' && typeof editingCol.index === 'number') {
      cols[editingCol.index] = draft;
    }
    onUpdate(widgetId, { config: { ...safeConfig, tableColumns: cols } });
    closeEditor();
  }, [onUpdate, widgetId, editingCol, draft, columns, safeConfig, closeEditor]);

  const deleteColumn = useCallback((index) => {
    if (!onUpdate || !widgetId) return;
    const cols = columns.filter((_, i) => i !== index);
    onUpdate(widgetId, { config: { ...safeConfig, tableColumns: cols } });
    if (editingCol?.mode === 'edit' && editingCol?.index === index) closeEditor();
  }, [onUpdate, widgetId, columns, safeConfig, editingCol, closeEditor]);

  /* ── Summary row management ── */
  const addSummaryRow = useCallback((aggType) => {
    if (!onUpdate || !widgetId) return;
    const labels = { sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max', count: 'Count' };
    const newRows = [...summaryRows, { label: labels[aggType] || aggType, aggregation: aggType }];
    onUpdate(widgetId, { config: { ...safeConfig, summaryRows: newRows } });
    setShowTotalsOptions(false);
  }, [onUpdate, widgetId, summaryRows, safeConfig]);

  const removeSummaryRow = useCallback((index) => {
    if (!onUpdate || !widgetId) return;
    const newRows = summaryRows.filter((_, i) => i !== index);
    onUpdate(widgetId, { config: { ...safeConfig, summaryRows: newRows } });
  }, [onUpdate, widgetId, summaryRows, safeConfig]);

  /* ── Static (simple) data row management ── */
  const addStaticRow = useCallback(() => {
    if (!onUpdate || !widgetId) return;
    const newRow = columns.length ? columns.map(() => ({ ...defaultStaticCellConfig() })) : [];
    const newRows = [...rawStaticRows, newRow];
    onUpdate(widgetId, { config: { ...safeConfig, staticDataRows: newRows } });
  }, [onUpdate, widgetId, rawStaticRows, safeConfig, columns.length]);

  const removeStaticRow = useCallback((index) => {
    if (!onUpdate || !widgetId) return;
    const newRows = rawStaticRows.filter((_, i) => i !== index);
    const staticOffset = 1;
    const boundary = index + staticOffset;
    const updatedHeaders = sectionHeaders
      .filter(sh => sh.beforeRowIndex !== boundary)
      .map(sh => {
        if (sh.beforeRowIndex > boundary) return { ...sh, beforeRowIndex: sh.beforeRowIndex - 1 };
        return sh;
      });
    onUpdate(widgetId, { config: { ...safeConfig, staticDataRows: newRows, sectionHeaders: updatedHeaders } });
  }, [onUpdate, widgetId, rawStaticRows, safeConfig, sectionHeaders]);

  /* ── Section header management ── */
  const addSectionHeader = useCallback((label, beforeRowIndex) => {
    if (!onUpdate || !widgetId) return;
    const newHeaders = [...sectionHeaders, { label: label || 'Section', beforeRowIndex: beforeRowIndex ?? staticDataRows.length }];
    onUpdate(widgetId, { config: { ...safeConfig, sectionHeaders: newHeaders } });
  }, [onUpdate, widgetId, sectionHeaders, safeConfig, staticDataRows.length]);

  const removeSectionHeader = useCallback((index) => {
    if (!onUpdate || !widgetId) return;
    const newHeaders = sectionHeaders.filter((_, i) => i !== index);
    onUpdate(widgetId, { config: { ...safeConfig, sectionHeaders: newHeaders } });
  }, [onUpdate, widgetId, sectionHeaders, safeConfig]);

  const updateSectionHeader = useCallback((index, updates) => {
    if (!onUpdate || !widgetId) return;
    const newHeaders = sectionHeaders.map((sh, i) => i === index ? { ...sh, ...updates } : sh);
    onUpdate(widgetId, { config: { ...safeConfig, sectionHeaders: newHeaders } });
  }, [onUpdate, widgetId, sectionHeaders, safeConfig]);

  /* ── Report header management ── */
  const updateReportHeader = useCallback((updates) => {
    if (!onUpdate || !widgetId) return;
    const current = reportHeader || { show: false, title: '', dateRange: '', lineStatus: '', lineName: '', producedTotal: '', consumedTotal: '' };
    onUpdate(widgetId, { config: { ...safeConfig, reportHeader: { ...current, ...updates } } });
  }, [onUpdate, widgetId, reportHeader, safeConfig]);

  const updateStaticCellConfig = useCallback((rowIndex, colIndex, cellConfig) => {
    if (!onUpdate || !widgetId) return;
    const newRows = staticDataRows.map((row, ri) =>
      ri !== rowIndex ? row : row.map((cell, ci) => (ci === colIndex ? cellConfig : cell))
    );
    onUpdate(widgetId, { config: { ...safeConfig, staticDataRows: newRows } });
  }, [onUpdate, widgetId, staticDataRows, safeConfig]);

  const openEditorForStaticCell = useCallback((rowIndex, colIndex) => {
    const cellConfig = staticDataRows[rowIndex]?.[colIndex];
    if (!cellConfig) return;
    setEditingStaticCell({ rowIndex, colIndex });
    setDraftStaticCell({ ...cellConfig });
  }, [staticDataRows]);

  const closeStaticCellEditor = useCallback(() => {
    setEditingStaticCell(null);
    setDraftStaticCell(null);
  }, []);

  const saveStaticCellConfig = useCallback(() => {
    if (!editingStaticCell || !draftStaticCell) return;
    const { rowIndex, colIndex } = editingStaticCell;
    updateStaticCellConfig(rowIndex, colIndex, draftStaticCell);
    closeStaticCellEditor();
  }, [editingStaticCell, draftStaticCell, updateStaticCellConfig, closeStaticCellEditor]);

  /* ── Build section header lookup (which rows have headers before them) ── */
  const sectionHeaderMap = useMemo(() => {
    const map = {};
    sectionHeaders.forEach((sh, idx) => {
      const key = sh.beforeRowIndex ?? 0;
      if (!map[key]) map[key] = [];
      map[key].push({ ...sh, _idx: idx });
    });
    return map;
  }, [sectionHeaders]);

  /* ── Drill-down row key resolver ── */
  const getRowKeyValue = useCallback((rowType, rowIndex) => {
    if (!drillDownEnabled) return null;
    if (rowType === 'live') {
      const col = columns[drillDownKeyCol];
      if (!col) return null;
      const val = resolveColumnValue(col, tagValues);
      return val != null ? String(val) : null;
    }
    if (rowType === 'static') {
      const cell = staticDataRows[rowIndex]?.[drillDownKeyCol];
      if (!cell) return null;
      const val = resolveColumnValue(cell, tagValues);
      return val != null ? String(val) : null;
    }
    return null;
  }, [drillDownEnabled, columns, drillDownKeyCol, staticDataRows, tagValues]);

  const handleRowClick = useCallback((rowKey) => {
    if (!drillDownEnabled || !rowKey) return;
    setActiveRowKey((prev) => (prev === rowKey ? null : rowKey));
  }, [drillDownEnabled]);

  /* ── Compute one row of live values ── */
  const rowValues = useMemo(() => {
    return columns.map((col) => resolveColumnValue(col, tagValues));
  }, [columns, tagValues]);

  /* ── Compute each summary row's values ── */
  const summaryData = useMemo(() => {
    return summaryRows.map((sr) => {
      return columns.map((col, ci) => {
        // For now with one data row, aggregate that single value
        // When multiple data rows exist in future, aggregate across them
        return computeAggregation([rowValues[ci]], sr.aggregation);
      });
    });
  }, [summaryRows, columns, rowValues]);

  /* ── Empty state ── */
  if (columns.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden relative" style={{ padding: '6px 8px' }}>
        {safeConfig.title && (
          <h4 className="rb-widget-title mb-1.5 truncate">{safeConfig.title}</h4>
        )}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="rb-caption mb-4 text-[var(--rb-text-muted)]">Add columns to build your table</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => openEditor('add')}
              className="rb-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rb-body"
            >
              <Plus size={14} /> Add first column
            </button>
          )}
        </div>
        {editingCol && draft && (
          <ColumnEditor
            draft={draft}
            setDraft={setDraft}
            onSave={saveColumn}
            onCancel={closeEditor}
            onDelete={null}
            tags={tags}
            tagValues={tagValues}
            savedFormulas={savedFormulas}
            isNew={editingCol.mode === 'add'}
            isStaticCell={false}
          />
        )}
      </div>
    );
  }


  const totalColSpan = columns.length + (canEdit ? 1 : 0);

  const renderSectionHeaderRows = (beforeRowIndex) => {
    const headers = sectionHeaderMap[beforeRowIndex];
    if (!headers || headers.length === 0) return null;
    return headers.map((sh) => (
      <tr key={`section-header-${sh._idx}`} className="rb-section-header-row">
        <td
          colSpan={totalColSpan}
          className="text-left"
          style={{
            ...(sectionHeaderBg ? { backgroundColor: sectionHeaderBg } : {}),
            ...(sectionHeaderColor ? { color: sectionHeaderColor } : {}),
            ...(borderColor ? { borderColor } : {}),
          }}
        >
          <span className="flex items-center gap-2">
            {sh.label}
            {canEdit && (
              <button
                type="button"
                onClick={() => removeSectionHeader(sh._idx)}
                className="rb-btn-ghost p-1 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] opacity-0 group-hover:opacity-100"
                style={{ opacity: 1 }}
                title="Remove section header"
              >
                <X size={10} />
              </button>
            )}
          </span>
        </td>
      </tr>
    ));
  };

  return (
    <div className={`flex flex-col h-full overflow-hidden relative rb-production-table ${compact ? 'rb-table-compact' : ''}`} style={{ padding: '6px 8px' }}>
      {reportHeader?.show && (
        <div className="rb-report-header mb-2 pb-2" style={{ borderBottom: `1px solid ${borderColor || 'var(--rb-border)'}` }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {reportHeader.title && (
                <h3 className="text-sm font-bold text-[var(--rb-text)] mb-0.5">{reportHeader.title}</h3>
              )}
              {reportHeader.dateRange && (
                <p className="rb-caption text-[var(--rb-text-muted)]">{reportHeader.dateRange}</p>
              )}
              {(reportHeader.lineName || reportHeader.lineStatus) && (
                <div className="mt-1">
                  {reportHeader.lineName && (
                    <span className="text-xs font-semibold text-[var(--rb-accent)] mr-2">{reportHeader.lineName}</span>
                  )}
                  {reportHeader.lineStatus && (
                    <span className="text-xs text-[var(--rb-text-muted)]">Status: {reportHeader.lineStatus}</span>
                  )}
                </div>
              )}
            </div>
            {(reportHeader.producedTotal || reportHeader.consumedTotal) && (
              <div className="text-right flex-shrink-0">
                {reportHeader.producedTotal && (
                  <p className="text-xs"><span className="font-semibold text-[var(--rb-text)]">Produced:</span> <span className="font-mono rb-tabular-nums">{reportHeader.producedTotal}</span></p>
                )}
                {reportHeader.consumedTotal && (
                  <p className="text-xs"><span className="font-semibold text-[var(--rb-text)]">Consumed:</span> <span className="font-mono rb-tabular-nums">{reportHeader.consumedTotal}</span></p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {safeConfig.title && !reportHeader?.show && (
        <h4 className="rb-heading mb-1.5 truncate rb-table-title">{safeConfig.title}</h4>
      )}

      {columns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center py-8 px-4">
          <div>
            <p className="text-[12px] font-medium text-[var(--rb-text-muted)] mb-1">No columns configured</p>
            {canEdit && <p className="text-[10px] text-[var(--rb-text-muted)]/60">Open the Properties panel to add table columns</p>}
          </div>
        </div>
      ) : null}

      {columns.length > 0 && <div
        className="flex-1 min-h-0 overflow-auto"
        style={tableBodyMin != null ? { minHeight: `${tableBodyMin}px` } : undefined}
      >
        <table
          className="w-full rb-body border-collapse"
          style={{
            ...(borderColor && { borderColor }),
          }}
        >
          <thead>
            <tr
              className="rb-table-header-row"
              style={{
                ...(headerBg ? { backgroundColor: headerBg } : {}),
                ...(headerColor ? { color: headerColor } : {}),
              }}
            >
              {columns.map((col, ci) => {
                const colMinWidth = col.width || 100;
                return (
                <th
                  key={ci}
                  onDoubleClick={canEdit ? () => openEditor('edit', ci, col) : undefined}
                  className={`text-left ${canEdit ? 'cursor-pointer hover:bg-[var(--rb-accent-subtle)]/50 transition-colors group select-none' : ''}`}
                  style={{
                    minWidth: Math.max(colMinWidth, 80),
                    textAlign: col.align || 'left',
                    ...(borderColor ? { borderColor } : {}),
                  }}
                  title={canEdit ? `${col.label || `Col ${ci + 1}`}${col.unit ? ` (${col.unit})` : ''} — Double-click to edit` : undefined}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="line-clamp-2 leading-tight">{col.label || `Col ${ci + 1}`}</span>
                    {col.unit && <span className="text-[9px] font-normal normal-case opacity-60 flex-shrink-0 tracking-normal">({col.unit})</span>}
                    {canEdit && <Settings2 size={12} className="opacity-0 group-hover:opacity-50 transition-opacity ml-auto flex-shrink-0" />}
                  </span>
                </th>
              );
              })}
              {canEdit && (
                <th className="w-[72px]" style={{ ...(borderColor ? { borderColor } : {}), ...(headerBg ? { backgroundColor: headerBg } : {}) }}>
                  <button
                    type="button"
                    onClick={() => openEditor('add')}
                    className="flex items-center justify-center w-full py-2 rb-caption text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)]/50 rounded transition-colors"
                    title="Add column"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {renderSectionHeaderRows(0)}
            {/* ── Live data row ── */}
            <tr
              className={`rb-table-body-row ${striped ? 'rb-row-striped' : ''} ${drillDownEnabled ? 'rb-table-row-clickable' : ''} ${activeRowKey && activeRowKey === getRowKeyValue('live') ? 'rb-table-row-active' : ''}`}
              style={{
                ...(rowBg ? { backgroundColor: rowBg } : {}),
              }}
              onClick={drillDownEnabled ? () => handleRowClick(getRowKeyValue('live')) : undefined}
            >
              {columns.map((col, ci) => {
                const rawValue = rowValues[ci];
                const formatted = formatCellDisplay(rawValue, col, showUnitsInCells);
                const thresholdColor = getThresholdColor(rawValue, col.thresholds);
                const isNumeric = col.sourceType !== 'static';
                const hint = getColumnHint(col);
                const badge = getSourceBadge(col);
                const hasLiveValue = formatted.text !== null;
                const showResolvedValue = !!isPreview;
                const displayText = showResolvedValue
                  ? (hasLiveValue ? formatted.text : (hint || '—'))
                  : (hint || 'Not configured');

                return (
                  <td
                    key={ci}
                    onDoubleClick={canEdit ? () => openEditor('edit', ci, col) : undefined}
                    className={`${canEdit ? 'cursor-pointer select-none' : ''}  ${isNumeric ? 'rb-cell-numeric' : ''} ${thresholdColor ? 'rb-cell-threshold' : ''}`}
                    style={{
                      ...(borderColor ? { borderColor } : {}),
                      textAlign: col.align || 'left',
                      ...(thresholdColor ? { color: thresholdColor } : {}),
                                          }}
                    title={canEdit ? (hint ? `${badge.label}: ${hint}` : 'Double-click to edit') : undefined}
                  >
                    {showResolvedValue && formatted.type === 'boolean' ? (
                      <span className="rb-checkbox-cell inline-flex items-center justify-center w-[18px] h-[18px] rounded-[3px] border-2 border-[var(--rb-border)] bg-[var(--rb-input)] print:border-gray-400">
                        {formatted.checked ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--rb-accent)] print:text-blue-600" /></svg>
                        ) : null}
                      </span>
                    ) : (
                      showResolvedValue ? (
                        <span className={`${hasLiveValue ? '' : 'rb-cell-hint'}`}>
                          {displayText}
                        </span>
                      ) : (
                        <span
                          className={`leading-tight min-w-0 break-words ${hint ? 'rb-cell-numeric text-[var(--rb-text-muted)]' : 'rb-cell-hint'}`}
                          title={canEdit && hint ? `${badge.label}: ${hint}` : displayText}
                        >
                          {displayText}
                        </span>
                      )
                    )}
                  </td>
                );
              })}
              {canEdit && <td className="px-2 py-1.5" style={{ ...(borderColor ? { borderColor } : {}) }} />}
            </tr>

            {/* ── Static (configurable) data rows with section headers ── */}
            {staticDataRows.map((rowCells, ri) => {
              const rowIndex = ri + 1;
              const isStriped = striped && (ri + 2) % 2 === 0;
              return (
                <React.Fragment key={`static-group-${ri}`}>
                  {renderSectionHeaderRows(rowIndex)}
                  <tr
                    className={`rb-table-body-row ${isStriped ? 'rb-row-striped' : ''} ${drillDownEnabled ? 'rb-table-row-clickable' : ''} ${activeRowKey && activeRowKey === getRowKeyValue('static', ri) ? 'rb-table-row-active' : ''}`}
                    style={{
                      ...(isStriped && stripedRowBg ? { backgroundColor: stripedRowBg } : {}),
                      ...(!isStriped && rowBg ? { backgroundColor: rowBg } : {}),
                      ...(borderColor ? { borderColor } : {}),
                    }}
                    onClick={drillDownEnabled ? () => handleRowClick(getRowKeyValue('static', ri)) : undefined}
                  >
                    {columns.map((col, ci) => {
                      const cellConfig = rowCells[ci];
                      const rawValue = resolveColumnValue(cellConfig, tagValues);
                      const formatted = formatCellDisplay(rawValue, cellConfig, showUnitsInCells);
                      const thresholdColor = getThresholdColor(rawValue, cellConfig.thresholds);
                      const hint = getColumnHint(cellConfig);
                      const badge = getSourceBadge(cellConfig);
                      const hasValue = formatted.text !== null;
                      const showResolvedValue = !!isPreview;
                      const displayText = showResolvedValue
                        ? (hasValue ? formatted.text : (hint || '—'))
                        : (hint || 'Double-click to set');
                      const numericAlign = (cellConfig.format === 'number' || cellConfig.format === 'percentage' || cellConfig.format === 'weight') && cellConfig.sourceType !== 'static';
                      const isNumericCell = cellConfig?.sourceType !== 'static';
                      return (
                        <td
                          key={ci}
                          onDoubleClick={canEdit ? () => openEditorForStaticCell(ri, ci) : undefined}
                          className={`${canEdit ? 'cursor-pointer select-none' : ''}  ${isNumericCell ? 'rb-cell-numeric' : ''} ${thresholdColor ? 'rb-cell-threshold' : ''}`}
                          style={{
                            ...(borderColor ? { borderColor } : {}),
                            textAlign: numericAlign ? 'right' : (col.align || 'left'),
                            ...(thresholdColor ? { color: thresholdColor } : {}),
                                                      }}
                          title={canEdit ? (hint ? `${badge.label}: ${hint}` : 'Double-click to edit cell') : undefined}
                        >
                          {showResolvedValue && formatted.type === 'boolean' ? (
                            <span className="rb-checkbox-cell inline-flex items-center justify-center w-[18px] h-[18px] rounded-[3px] border-2 border-[var(--rb-border)] bg-[var(--rb-input)] print:border-gray-400">
                              {formatted.checked ? (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--rb-accent)] print:text-blue-600" /></svg>
                              ) : null}
                            </span>
                          ) : (
                            <span className={`${hasValue || showResolvedValue ? '' : 'rb-cell-hint'}`}>
                              {displayText}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {canEdit && (
                      <td className="px-2 py-1.5" style={{ ...(borderColor ? { borderColor } : {}) }}>
                        <button
                          type="button"
                          onClick={() => removeStaticRow(ri)}
                          className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                          title="Remove row"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}

            {/* ── Summary / aggregation rows ── */}
            {summaryData.map((sValues, si) => {
              const sr = summaryRows[si];
              return (
                <tr
                  key={`summary-${si}`}
                  className="rb-summary-row"
                  style={{
                    ...(borderColor ? { borderColor } : {}),
                  }}
                >
                  {columns.map((col, ci) => {
                    const val = sValues[ci];
                    const isFirst = ci === 0;
                    const summaryText = isPreview
                      ? (val != null ? val.toFixed(col.decimals ?? 1) : '\u2014')
                      : `${(sr.aggregation || 'sum').toUpperCase()}(${col.label || `Col ${ci + 1}`})`;
                    return (
                      <td
                        key={ci}
                        className={`rb-cell-numeric `}
                        style={{ ...(borderColor ? { borderColor } : {}), textAlign: col.align || 'left' }}
                      >
                        {isFirst && (
                          <span className="mr-2 font-sans font-semibold text-[11px] uppercase tracking-wider opacity-70">
                            {sr.label}
                          </span>
                        )}
                        <span>{summaryText}</span>
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="px-2 py-1.5" style={{ ...(borderColor ? { borderColor } : {}) }}>
                      <button
                        type="button"
                        onClick={() => removeSummaryRow(si)}
                        className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                        title="Remove row"
                      >
                        <X size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {/* ── Add row button ── */}
            {canEdit && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-3 border-b"
                  style={{ ...(borderColor ? { borderColor } : {}) }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {!showTotalsOptions ? (
                      <>
                        <button
                          type="button"
                          onClick={addStaticRow}
                          className="rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:border-[var(--rb-accent)]/50 hover:bg-[var(--rb-accent-subtle)] transition-colors"
                        >
                          <Plus size={12} /> New row
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const label = prompt('Section header label:', 'Section');
                            if (label) addSectionHeader(label, staticDataRows.length + 1);
                          }}
                          className="rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--rb-text-muted)]/30 text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:border-[var(--rb-accent)]/50 hover:bg-[var(--rb-accent-subtle)] transition-colors"
                        >
                          <GripVertical size={12} /> Section header
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTotalsOptions(true)}
                          className="rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--rb-accent)]/50 text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] transition-colors"
                        >
                          <Plus size={12} /> Add totals row
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="rb-caption text-[var(--rb-text-muted)] mr-1">Choose aggregation</span>
                        {[
                          { key: 'sum', label: 'Sum', icon: 'Σ' },
                          { key: 'avg', label: 'Avg', icon: 'x̄' },
                          { key: 'min', label: 'Min', icon: '↓' },
                          { key: 'max', label: 'Max', icon: '↑' },
                          { key: 'count', label: 'Count', icon: '#' },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => addSummaryRow(opt.key)}
                            className="rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--rb-border)] hover:text-[var(--rb-accent)] hover:border-[var(--rb-accent)]/50 transition-colors"
                          >
                            <span className="font-mono rb-caption">{opt.icon}</span>
                            {opt.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setShowTotalsOptions(false)}
                          className="rb-btn-ghost rb-body px-2.5 py-1.5 rounded-lg"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>}

      {/* ── Drill-down detail panel ── */}
      {drillDownEnabled && activeRowKey && drillDownWidgets.length > 0 && (
        <div className="rb-drilldown-panel mt-2">
          <div className="rb-drilldown-header">
            <span className="flex items-center gap-2">
              <ChevronDown size={14} className="text-[var(--rb-accent)]" />
              <span className="text-[12px] font-bold text-[var(--rb-text)]">Details: {activeRowKey}</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveRowKey(null)}
              className="p-1 rounded text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] transition-colors"
              title="Close detail panel"
            >
              <X size={14} />
            </button>
          </div>
          <div className="rb-drilldown-grid" style={{ gridTemplateColumns: `repeat(${drillDownGridCols}, 1fr)` }}>
            {drillDownWidgets.map((dw) => {
              const rewrittenConfig = rewriteTagsForRow(dw.config, activeRowKey, drillDownSep);
              const rewrittenWidget = { ...dw, config: rewrittenConfig };
              return (
                <div
                  key={dw.id}
                  className="rb-drilldown-widget-cell"
                  style={{ minHeight: `${(dw.h || 2) * 80}px` }}
                >
                  <WidgetRenderer
                    widget={rewrittenWidget}
                    tagValues={tagValues}
                    isPreview={isPreview}
                    tags={tags}
                    tagHistory={tagHistory}
                    savedFormulas={savedFormulas}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {drillDownEnabled && activeRowKey && drillDownWidgets.length === 0 && canEdit && (
        <div className="rb-drilldown-panel mt-2">
          <div className="rb-drilldown-header">
            <span className="flex items-center gap-2">
              <ChevronDown size={14} className="text-[var(--rb-accent)]" />
              <span className="text-[12px] font-bold text-[var(--rb-text)]">Details: {activeRowKey}</span>
            </span>
            <button type="button" onClick={() => setActiveRowKey(null)} className="p-1 rounded text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] transition-colors"><X size={14} /></button>
          </div>
          <p className="text-[11px] text-[var(--rb-text-muted)] text-center py-6">
            No detail widgets configured. Open Properties panel &rarr; Drill-Down section to add widgets.
          </p>
        </div>
      )}

      {/* ── Column editor panel (slides in from right) ── */}
      {editingCol && draft && (
        <ColumnEditor
          draft={draft}
          setDraft={setDraft}
          onSave={saveColumn}
          onCancel={closeEditor}
          onDelete={editingCol.mode === 'edit' ? () => deleteColumn(editingCol.index) : null}
          tags={tags}
          tagValues={tagValues}
          savedFormulas={savedFormulas}
          isNew={editingCol.mode === 'add'}
          isStaticCell={false}
        />
      )}
      {/* ── Static cell editor (same panel, for row cells) ── */}
      {editingStaticCell && draftStaticCell && (
        <ColumnEditor
          draft={draftStaticCell}
          setDraft={setDraftStaticCell}
          onSave={saveStaticCellConfig}
          onCancel={closeStaticCellEditor}
          onDelete={null}
          tags={tags}
          tagValues={tagValues}
          savedFormulas={savedFormulas}
          isNew={false}
          isStaticCell={true}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   COLUMN EDITOR — Right-side panel for add/edit column
   Shows name, type, tag/formula/group/static config.
   Uses the full FormulaEditor for formula columns.
   ══════════════════════════════════════════════════════════════════ */

function ColumnEditor({ draft, setDraft, onSave, onCancel, onDelete, tags, tagValues, savedFormulas = [], isNew, isStaticCell = false }) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeFormulas = Array.isArray(savedFormulas) ? savedFormulas : [];
  const [activePane, setActivePane] = useState('source');
  const patch = (updates) => setDraft((d) => ({ ...d, ...updates }));

  const typeBtn = (value, label, activeClass) => (
    <button
      key={value} type="button"
      onClick={() => patch({ sourceType: value })}
      className={`text-[12px] font-medium px-3 py-2 rounded-lg border transition-colors ${
        draft.sourceType === value ? activeClass : 'border-[var(--rb-border)] text-[var(--rb-text-muted)] bg-[var(--rb-panel)] hover:border-[#9dcde6]'
      }`}
    >{label}</button>
  );

  const inputCls = 'w-full text-[12px] rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] text-[var(--rb-text)] placeholder-[#8898aa] px-3 py-2.5 focus:outline-none focus:border-brand focus:ring-1 focus:ring-[#0e74904d] transition-colors';
  const labelCls = 'text-[11px] font-medium text-[var(--rb-text-muted)] mb-1.5 block';
  const tabCls = (active) => `text-[12px] font-medium px-4 py-2 rounded-lg border transition-colors ${active ? 'border-brand bg-brand-subtle text-brand' : 'border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)]'}`;

  return createPortal(
    <div className="report-builder fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center" onClick={onCancel} style={{ isolation: 'isolate' }}>
      <div
        className="bg-[var(--rb-panel)] rounded-xl border border-[var(--rb-border)] shadow-2xl w-full max-w-[520px] max-h-[80vh] flex flex-col overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rb-border)] flex-shrink-0">
          <h2 className="text-[15px] font-bold text-[var(--rb-text)]">
            {isStaticCell ? 'Edit cell' : (isNew ? 'Add Column' : 'Edit Column')}
          </h2>
          <button onClick={onCancel} className="p-1.5 rounded-md text-[var(--rb-text-muted)] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-2.5 border-b border-[var(--rb-border)] flex gap-2 flex-shrink-0">
          <button type="button" onClick={() => setActivePane('source')} className={tabCls(activePane === 'source')}>Source</button>
          <button type="button" onClick={() => setActivePane('format')} className={tabCls(activePane === 'format')}>Format</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {activePane === 'source' ? (
            <>
              {!isStaticCell && (
                <div>
                  <label className={labelCls}>Column Name</label>
                  <input type="text" value={draft.label || ''} onChange={(e) => patch({ label: e.target.value })} placeholder="e.g. Motor Speed" autoFocus className={inputCls} />
                </div>
              )}

              <div>
                <label className={labelCls}>{isStaticCell ? 'Cell value type' : 'Data Type'}</label>
                <div className="grid grid-cols-5 gap-2">
                  {typeBtn('tag', 'Tag', 'border-brand bg-brand-subtle text-brand')}
                  {typeBtn('formula', 'Formula', 'border-[#7c3aed] bg-[#f5f3ff] text-[#7c3aed]')}
                  {typeBtn('group', 'Group', 'border-[#d97706] bg-[#fffbeb] text-[#d97706]')}
                  {typeBtn('mapping', 'Mapping', 'border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400')}
                  {typeBtn('static', 'Static', 'border-[#6b7f94] bg-[var(--rb-surface)] text-[#6b7f94]')}
                </div>
              </div>

              {(draft.sourceType || 'tag') === 'tag' && (
                <div>
                  <label className={labelCls}>PLC Tag</label>
                  <TagSelect tags={safeTags} value={draft.tagName} onChange={(v) => patch({ tagName: v })} />
                </div>
              )}

              {draft.sourceType === 'formula' && (
                <>
                  {safeFormulas.length > 0 && (
                    <div>
                      <label className={labelCls}>Saved formulas</label>
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          const f = safeFormulas.find(sf => sf.id === v);
                          if (f) patch({ formula: f.formula });
                        }}
                        className={inputCls}
                      >
                        <option value="">— Pick a saved formula —</option>
                        {safeFormulas.map(f => (
                          <option key={f.id} value={f.id}>{f.name}{f.unit ? ` (${f.unit})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Formula</label>
                    <FormulaEditor value={draft.formula || ''} onChange={(v) => patch({ formula: v })} tags={safeTags} tagValues={tagValues || {}} />
                  </div>
                </>
              )}

              {draft.sourceType === 'group' && (
                <>
                  <div>
                    <label className={labelCls}>Tags in Group</label>
                    <div className="space-y-2">
                      {(draft.groupTags || []).map((gt, gi) => (
                        <div key={gi} className="flex items-center gap-2">
                          <div className="flex-1"><TagSelect tags={safeTags} value={gt} onChange={(v) => { const next = [...(draft.groupTags || [])]; next[gi] = v; patch({ groupTags: next }); }} /></div>
                          <button type="button" onClick={() => patch({ groupTags: (draft.groupTags || []).filter((_, k) => k !== gi) })} className="p-1.5 rounded-md text-[var(--rb-text-muted)] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"><X size={14} /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => patch({ groupTags: [...(draft.groupTags || []), ''] })} className="text-[11px] text-brand hover:underline">+ Add tag</button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Aggregation</label>
                    <select value={draft.aggregation || 'avg'} onChange={(e) => patch({ aggregation: e.target.value })} className={inputCls}>
                      <option value="avg">Average</option><option value="sum">Sum</option><option value="min">Min</option><option value="max">Max</option><option value="count">Count</option>
                    </select>
                  </div>
                </>
              )}

              {draft.sourceType === 'mapping' && (
                <div>
                  <label className={labelCls}>Mapping</label>
                  <select
                    value={draft.mappingName || ''}
                    onChange={(e) => patch({ mappingName: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">— Select mapping —</option>
                    {getCachedMappings().map((m) => (
                      <option key={m.id || m.name} value={m.name || m.id || ''}>{m.name || m.id || 'Unnamed'}</option>
                    ))}
                  </select>
                </div>
              )}

              {draft.sourceType === 'static' && (
                <div>
                  <label className={labelCls}>Static Value</label>
                  <input type="text" value={draft.staticValue || ''} onChange={(e) => patch({ staticValue: e.target.value })} placeholder="Text or number" className={inputCls} />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className={labelCls}>Display Settings</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Format</span>
                    <select value={draft.format || 'number'} onChange={(e) => patch({ format: e.target.value })} className={inputCls}>
                      <option value="number">Number</option><option value="percentage">Percentage</option><option value="weight">Weight</option><option value="boolean">Checkbox</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Decimals</span>
                    <input type="number" value={draft.decimals ?? 1} onChange={(e) => patch({ decimals: e.target.value === '' ? '' : Number(e.target.value) })} className={inputCls} />
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Unit</span>
                    <input type="text" value={draft.unit || ''} onChange={(e) => patch({ unit: e.target.value })} placeholder="e.g. RPM" className={inputCls} />
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--rb-text-muted)] block mb-1">Align</span>
                    <select value={draft.align || 'left'} onChange={(e) => patch({ align: e.target.value })} className={inputCls}>
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </select>
                  </div>
                </div>
              </div>

              {(draft.sourceType === 'tag' || draft.sourceType === 'formula' || draft.sourceType === 'group') && (
                <div>
                  <label className={labelCls}>Column Thresholds (color cell by value)</label>
                  <div className="space-y-2">
                    {(draft.thresholds || []).map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-surface)]">
                        <input
                          type="color"
                          value={rule.color || '#ef4444'}
                          onChange={(e) => {
                            const next = [...(draft.thresholds || [])];
                            next[i] = { ...next[i], color: e.target.value };
                            patch({ thresholds: next });
                          }}
                          className="w-6 h-6 rounded border border-[var(--rb-border)] cursor-pointer p-0 flex-shrink-0"
                        />
                        <select
                          value={rule.condition || 'above'}
                          onChange={(e) => {
                            const next = [...(draft.thresholds || [])];
                            next[i] = { ...next[i], condition: e.target.value };
                            patch({ thresholds: next });
                          }}
                          className="flex-1 min-w-0 text-xs rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] text-[var(--rb-text)] px-2 py-1.5"
                        >
                          <option value="above">Above</option>
                          <option value="below">Below</option>
                          <option value="between">Between</option>
                          <option value="equals">Equals</option>
                        </select>
                        <input
                          type="number"
                          value={rule.value ?? 0}
                          onChange={(e) => {
                            const next = [...(draft.thresholds || [])];
                            next[i] = { ...next[i], value: Number(e.target.value) };
                            patch({ thresholds: next });
                          }}
                          className="w-16 font-mono text-xs rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] text-[var(--rb-text)] px-2 py-1.5"
                        />
                        {rule.condition === 'between' && (
                          <>
                            <span className="text-[10px] text-[var(--rb-text-muted)]">to</span>
                            <input
                              type="number"
                              value={rule.valueTo ?? 0}
                              onChange={(e) => {
                                const next = [...(draft.thresholds || [])];
                                next[i] = { ...next[i], valueTo: Number(e.target.value) };
                                patch({ thresholds: next });
                              }}
                              className="w-16 font-mono text-xs rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] text-[var(--rb-text)] px-2 py-1.5"
                            />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => patch({ thresholds: (draft.thresholds || []).filter((_, j) => j !== i) })}
                          className="p-1.5 text-[var(--rb-text-muted)] hover:text-[#dc2626] rounded transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => patch({ thresholds: [...(draft.thresholds || []), { condition: 'above', value: 0, valueTo: 0, color: '#ef4444' }] })}
                      className="text-[11px] text-brand hover:underline"
                    >
                      + Add threshold rule
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--rb-border)] flex-shrink-0 space-y-2">
          <div className="flex gap-2">
            {activePane === 'source' ? (
              <button type="button" onClick={() => setActivePane('format')} className="flex-1 py-2.5 text-[12px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
                Next: Format
              </button>
            ) : (
              <button type="button" onClick={onSave} className="flex-1 py-2.5 text-[12px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
                {isNew ? 'Add Column' : 'Save'}
              </button>
            )}
            <button type="button" onClick={onCancel} className="py-2.5 px-4 text-[12px] font-medium rounded-lg border border-[var(--rb-border)] text-[var(--rb-text-muted)] hover:bg-[var(--rb-surface)] transition-colors">
              Cancel
            </button>
          </div>
          {onDelete && (
            <button type="button" onClick={onDelete} className="w-full text-[12px] font-medium text-[#dc2626] hover:bg-[#fef2f2] rounded-lg py-2 flex items-center justify-center gap-2 transition-colors">
              <Trash2 size={13} /> Remove column
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
