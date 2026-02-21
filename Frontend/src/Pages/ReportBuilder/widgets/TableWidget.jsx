import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X, Settings2 } from 'lucide-react';
import { evaluateFormula } from '../formulas/formulaEngine';
import FormulaEditor from '../formulas/FormulaEditor';

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
  if (src === 'static') return col.staticValue || '—';
  return null; // nothing configured
}

function getSourceBadge(col) {
  const src = col.sourceType || 'tag';
  if (src === 'formula') return { label: 'FORMULA', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' };
  if (src === 'group') return { label: 'GROUP', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  if (src === 'static') return { label: 'STATIC', cls: 'bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-400/20' };
  return { label: 'TAG', cls: 'bg-[#0e74901a] text-brand dark:text-cyan-400 border-[#0e749033]' };
}

/* ── Format cell for display ───────────────────────────────────── */

function formatCellDisplay(value, col) {
  const format = col.format || 'number';
  const decimals = col.decimals ?? 1;

  if (format === 'boolean') {
    const checked = value != null && value !== '' && (typeof value === 'number' ? value !== 0 : !!value);
    return { type: 'boolean', checked };
  }

  if (format === 'percentage') {
    const num = Number(value);
    if (num == null || isNaN(num)) return { type: 'text', text: '\u2014' };
    return { type: 'text', text: `${num.toFixed(decimals)}%` };
  }

  if (value == null) return { type: 'text', text: null }; // null = no live value, show hint
  if (typeof value === 'number' && !isNaN(value)) return { type: 'text', text: value.toFixed(decimals) };
  return { type: 'text', text: String(value) };
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

export default function TableWidget({ config, tagValues, isPreview, isSelected, onUpdate, widgetId, tags, layoutH, layoutRowHeight, isReportBuilderWorkspace, savedFormulas = [] }) {
  const safeConfig = config || {};
  const columns = Array.isArray(safeConfig.tableColumns) ? safeConfig.tableColumns : [];
  const summaryRows = Array.isArray(safeConfig.summaryRows) ? safeConfig.summaryRows : [];
  const compact = safeConfig.compact || false;
  const striped = safeConfig.striped || false;
  const headerBg = safeConfig.headerBg || '';
  const headerColor = safeConfig.headerColor || '';
  const rowBg = safeConfig.rowBg || '';
  const stripedRowBg = safeConfig.stripedRowBg || '';
  const borderColor = safeConfig.borderColor || '';

  const canEdit = Boolean(isSelected && onUpdate && widgetId);
  /** In builder workspace always fit table (no horizontal scroll); in preview allow scroll/minWidth. */
  const fitInContainer = Boolean(isReportBuilderWorkspace);
  const tableBodyMin = canEdit ? tableBodyMinHeight(layoutH, layoutRowHeight) : undefined;

  /* ── Editing state ── */
  const [editingCol, setEditingCol] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showTotalsOptions, setShowTotalsOptions] = useState(false);

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
      <div className="flex flex-col h-full p-4 overflow-hidden relative">
        {safeConfig.title && (
          <h4 className="rb-heading mb-3 truncate">{safeConfig.title}</h4>
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
          />
        )}
      </div>
    );
  }

  const cellPy = compact ? 'py-1.5' : 'py-2.5';

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden relative">
      {safeConfig.title && (
        <h4 className="rb-heading mb-3 truncate">{safeConfig.title}</h4>
      )}

      <div
        className={`flex-1 min-h-0 ${fitInContainer ? 'overflow-hidden' : 'overflow-auto'}`}
        style={tableBodyMin != null ? { minHeight: `${tableBodyMin}px` } : undefined}
      >
        <table
          className="w-full rb-body border-collapse"
          style={{
            ...(fitInContainer && { tableLayout: 'fixed' }),
            ...(borderColor && { borderColor }),
          }}
        >
          <thead>
            <tr
              className="rb-table-header-row"
              style={{
                ...(headerBg && { backgroundColor: headerBg }),
                ...(headerColor && { color: headerColor }),
                ...(!headerBg && { backgroundColor: 'var(--rb-surface)' }),
              }}
            >
              {columns.map((col, ci) => {
                const colMinWidth = fitInContainer ? undefined : (col.width || 100);
                return (
                <th
                  key={ci}
                  onDoubleClick={canEdit ? () => openEditor('edit', ci, col) : undefined}
                  className={`px-3 ${cellPy} text-left rb-label border-b-2 ${canEdit ? 'cursor-pointer hover:bg-[var(--rb-accent-subtle)]/50 transition-colors group select-none' : ''} ${fitInContainer ? 'truncate' : ''}`}
                  style={{
                    ...(colMinWidth != null && { minWidth: colMinWidth }),
                    textAlign: col.align || 'left',
                    borderColor: borderColor || 'var(--rb-border)',
                  }}
                  title={canEdit ? `${col.label || `Col ${ci + 1}`}${col.unit ? ` (${col.unit})` : ''} — Double-click to edit` : undefined}
                >
                  <span className={`flex items-center gap-1.5 min-w-0 ${canEdit ? 'truncate' : ''}`}>
                    <span className="truncate">{col.label || `Col ${ci + 1}`}</span>
                    {col.unit && <span className="rb-caption font-normal lowercase flex-shrink-0">({col.unit})</span>}
                    {canEdit && <Settings2 size={12} className="opacity-0 group-hover:opacity-50 transition-opacity ml-auto flex-shrink-0" />}
                  </span>
                </th>
              );
              })}
              {canEdit && (
                <th className={`px-2 ${cellPy} border-b-2 w-[72px]`} style={{ borderColor: borderColor || 'var(--rb-border)', backgroundColor: headerBg || 'var(--rb-surface)' }}>
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
            {/* ── Live data row ── */}
            <tr
              className="rb-table-body-row hover:opacity-90"
              style={{
                backgroundColor: striped
                  ? (rowBg || 'var(--rb-surface)')
                  : (rowBg || 'transparent'),
              }}
            >
              {columns.map((col, ci) => {
                const rawValue = rowValues[ci];
                const formatted = formatCellDisplay(rawValue, col);
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
                    className={`px-3 ${cellPy} border-b ${canEdit ? 'cursor-pointer select-none' : ''} ${fitInContainer ? 'max-w-0' : ''} ${isNumeric ? 'font-mono tabular-nums' : ''}`}
                    style={{
                      borderColor: borderColor || 'var(--rb-border)',
                      textAlign: col.align || 'left',
                      ...(thresholdColor ? { color: thresholdColor, fontWeight: 600 } : {}),
                      ...(fitInContainer && { overflow: 'hidden', textOverflow: 'ellipsis' }),
                    }}
                    title={canEdit ? (hint ? `${badge.label}: ${hint}` : 'Double-click to edit') : undefined}
                  >
                    {showResolvedValue && formatted.type === 'boolean' ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-[var(--rb-border)] bg-[var(--rb-input)]">
                        {formatted.checked ? <span className="text-xs text-[var(--rb-accent)]">&#10003;</span> : null}
                      </span>
                    ) : (
                      showResolvedValue ? (
                        <span className={`${hasLiveValue ? '' : 'rb-caption italic'} ${fitInContainer ? 'block truncate' : ''}`}>
                          {displayText}
                        </span>
                      ) : (
                        <span
                          className={`rb-body leading-tight min-w-0 ${fitInContainer ? 'truncate block' : 'break-words'} ${hint ? 'font-mono text-[var(--rb-text-muted)]' : 'rb-caption italic'}`}
                          title={canEdit && hint ? `${badge.label}: ${hint}` : displayText}
                        >
                          {displayText}
                        </span>
                      )
                    )}
                  </td>
                );
              })}
              {canEdit && <td className={`px-2 ${cellPy} border-b`} style={{ borderColor: borderColor || 'var(--rb-border)' }} />}
            </tr>

            {/* ── Summary / aggregation rows ── */}
            {summaryData.map((sValues, si) => {
              const sr = summaryRows[si];
              const rowIndex = 1 + si; // 0 = data row, 1+ = summary rows
              return (
                <tr
                  key={`summary-${si}`}
                  className="font-semibold border-t"
                  style={{
                    borderColor: borderColor || 'var(--rb-border)',
                    backgroundColor: striped
                      ? (rowIndex % 2 === 1 ? (stripedRowBg || 'var(--rb-panel)') : (rowBg || 'var(--rb-surface)'))
                      : (rowBg || 'var(--rb-surface)'),
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
                        className={`px-3 ${cellPy} border-b font-mono tabular-nums ${fitInContainer ? 'max-w-0 truncate' : ''}`}
                        style={{ borderColor: borderColor || 'var(--rb-border)', textAlign: col.align || 'left' }}
                      >
                        {isFirst && (
                          <span className="rb-caption mr-2 font-sans font-semibold">
                            {sr.label}
                          </span>
                        )}
                        <span className={fitInContainer ? 'truncate block' : ''}>{summaryText}</span>
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className={`px-2 ${cellPy} border-b`} style={{ borderColor: borderColor || 'var(--rb-border)' }}>
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
                  style={{ borderColor: borderColor || 'var(--rb-border)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {!showTotalsOptions ? (
                      <button
                        type="button"
                        onClick={() => setShowTotalsOptions(true)}
                        className="rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--rb-accent)]/50 text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] transition-colors"
                      >
                        <Plus size={12} /> Add totals row
                      </button>
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
      </div>

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

function ColumnEditor({ draft, setDraft, onSave, onCancel, onDelete, tags, tagValues, savedFormulas = [], isNew }) {
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
          <h2 className="text-[15px] font-bold text-[var(--rb-text)]">{isNew ? 'Add Column' : 'Edit Column'}</h2>
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
              <div>
                <label className={labelCls}>Column Name</label>
                <input type="text" value={draft.label || ''} onChange={(e) => patch({ label: e.target.value })} placeholder="e.g. Motor Speed" autoFocus className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Data Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {typeBtn('tag', 'Tag', 'border-brand bg-brand-subtle text-brand')}
                  {typeBtn('formula', 'Formula', 'border-[#7c3aed] bg-[#f5f3ff] text-[#7c3aed]')}
                  {typeBtn('group', 'Group', 'border-[#d97706] bg-[#fffbeb] text-[#d97706]')}
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
                      <option value="number">Number</option><option value="percentage">Percentage</option><option value="boolean">Checkbox</option>
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
