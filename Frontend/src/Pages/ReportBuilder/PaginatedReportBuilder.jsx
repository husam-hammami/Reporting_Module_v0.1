/**
 * PaginatedReportBuilder — A4 page-oriented report designer.
 *
 * Sections: header, kpi-row, table, signature-block, text-block, spacer.
 * Data sources: tags, formulas, mappings (same model as existing widgets).
 * Output: Professional paginated document for PDF/print.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Eye, Plus, Trash2, ChevronDown, ChevronUp,
  Table2, Hash, Type, Minus, Copy, X, Check,
  AlignLeft, AlignCenter, AlignRight, LayoutTemplate, PenLine,
  Monitor, FileText, Send, Undo2, RefreshCw, ClipboardList, GripVertical, List,
  Layers,
} from 'lucide-react';
import { Tooltip } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useReportCanvas, useAvailableTags, useAvailableFormulas } from '../../Hooks/useReportBuilder';
import { evaluateFormula, extractTagRefs, parseFormulaTagReferences } from './formulas/formulaEngine';
import { getCachedMappings, refreshMappingsCache } from '../../utils/mappingsCache';
import { useBranding } from '../../Context/BrandingContext';
import HerculesLogoPng from '../../Assets/Hercules_New.png';
import AsmLogoPng from '../../Assets/Asm_Logo.png';
import axios from '../../API/axios';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

refreshMappingsCache();

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ══════════════════════════════════════════════════════════════════ */

/* Predefined units for cell display; __checkbox__ = show 1/0 as checkbox, __custom__ = use customUnit text */
const PREDEFINED_UNITS = [
  { value: '', label: 'None' },
  { value: '%', label: '%' },
  { value: 'kg', label: 'kg' },
  { value: 't', label: 't' },
  { value: 't/h', label: 't/h' },
  { value: '°C', label: '°C' },
  { value: 'm³/h', label: 'm³/h' },
  { value: '__checkbox__', label: 'Checkbox (1=Yes, 0=No)' },
  { value: '__custom__', label: 'Custom…' },
];

function effectiveUnit(cell) {
  if (!cell) return '';
  if (cell.unit === '__custom__') return cell.customUnit ?? '';
  if (cell.unit === '__checkbox__') return '';
  return cell.unit ?? '';
}

function UnitSelector({ cell, onChange, className = '' }) {
  const selectValue = PREDEFINED_UNITS.some((u) => u.value === cell.unit) ? cell.unit : '__custom__';
  const sizeClass = className || 'text-[11px]';
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...cell, unit: v, ...(v !== '__custom__' ? {} : { customUnit: cell.customUnit ?? cell.unit ?? '' }) });
        }}
        className={`rb-input-base ${sizeClass} py-0.5 px-1 flex-shrink-0`}
        title="Unit or display type"
      >
        {PREDEFINED_UNITS.map((u) => (
          <option key={u.value || 'none'} value={u.value}>{u.label}</option>
        ))}
      </select>
      {selectValue === '__custom__' && (
        <input
          type="text"
          value={cell.unit === '__custom__' ? (cell.customUnit ?? '') : (cell.unit ?? '')}
          onChange={(e) => onChange({ ...cell, unit: '__custom__', customUnit: e.target.value })}
          placeholder="Unit"
          className={`rb-input-base ${sizeClass} py-0.5 px-1 w-12 flex-shrink-0`}
        />
      )}
    </div>
  );
}

/* ── Resolve cell display label for config mode (shows tag/formula names, not live values) ── */
const AGG_LABELS = {
  last: 'Last',
  first: 'First',
  delta: 'Δ',
  avg: 'Avg',
  sum: 'Sum',
  min: 'Min',
  max: 'Max',
  count: 'Count',
  unique_in_range: 'Unique',
  silo_segments: 'Silo IDs',
  silo_first: 'Silo first',
  silo_last: 'Silo last',
  silo_delta: 'Silo Δ',
};
const AGG_COLORS = {
  delta: '#e67e22',
  first: '#8e44ad',
  last: '#2c3e50',
  avg: '#2980b9',
  sum: '#27ae60',
  min: '#16a085',
  max: '#c0392b',
  count: '#7f8c8d',
  unique_in_range: '#6b21a8',
  silo_segments: '#0f3460',
  silo_first: '#5b21b6',
  silo_last: '#155e75',
  silo_delta: '#c2410c',
};

/* Plain-text label (used in row header summaries) */
function resolveCellConfigLabel(cell) {
  if (!cell) return '—';
  const src = cell.sourceType || 'static';
  if (src === 'static') return cell.value || '(empty)';
  if (src === 'tag') {
    if (!cell.tagName) return '(no tag)';
    const agg = cell.aggregation || 'last';
    if (agg === 'silo_segments') return `Silo IDs: ${cell.tagName}`;
    const aggLabel = agg !== 'last' ? `${AGG_LABELS[agg] || agg} ` : '';
    return `${aggLabel}${cell.tagName}`;
  }
  if (src === 'formula') return cell.formula ? `ƒ ${cell.formula}` : '(no formula)';
  if (src === 'group') {
    const tags = (cell.groupTags || []).filter(Boolean);
    return tags.length > 0 ? `${(cell.aggregation || 'avg').toUpperCase()}(${tags.length} tags)` : '(no tags)';
  }
  if (src === 'mapping') return cell.mappingName ? `Map: ${cell.mappingName}` : '(no mapping)';
  return '—';
}

/* Rich JSX label for the A4 preview table (compact badges, never wraps ugly) */
function renderCellConfigBadge(cell) {
  if (!cell) return <span style={{ color: '#94a3b8' }}>—</span>;
  const src = cell.sourceType || 'static';
  if (src === 'static') return <span>{cell.value || <i style={{ color: '#94a3b8' }}>(empty)</i>}</span>;
  if (src === 'tag') {
    if (!cell.tagName) return <i style={{ color: '#94a3b8' }}>(no tag)</i>;
    const agg = cell.aggregation || 'last';
    const color = AGG_COLORS[agg] || '#2c3e50';
    if (agg === 'silo_segments') {
      return (
        <span title={`Silo IDs (segments): ${cell.tagName}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
          <span style={{ background: color, color: '#fff', borderRadius: 3, padding: '0 4px', fontSize: '0.7em', fontWeight: 700, lineHeight: '1.5', whiteSpace: 'nowrap', flexShrink: 0 }}>Silo IDs</span>
          <span style={{ color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.tagName}</span>
        </span>
      );
    }
    return (
      <span title={`${AGG_LABELS[agg] || agg}: ${cell.tagName}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        {agg !== 'last' && <span style={{ background: color, color: '#fff', borderRadius: 3, padding: '0 4px', fontSize: '0.7em', fontWeight: 700, lineHeight: '1.5', whiteSpace: 'nowrap', flexShrink: 0 }}>{AGG_LABELS[agg]}</span>}
        <span style={{ color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.tagName}</span>
      </span>
    );
  }
  if (src === 'formula') return <span title={cell.formula} style={{ color: '#8e44ad' }}>{cell.formula ? <><b>ƒ</b> {cell.formula}</> : <i style={{ color: '#94a3b8' }}>(no formula)</i>}</span>;
  if (src === 'group') {
    const tags = (cell.groupTags || []).filter(Boolean);
    return tags.length > 0
      ? <span style={{ color: '#2980b9' }}><b>{(cell.aggregation || 'avg').toUpperCase()}</b>({tags.length} tags)</span>
      : <i style={{ color: '#94a3b8' }}>(no tags)</i>;
  }
  if (src === 'mapping') return cell.mappingName ? <span style={{ color: '#16a085' }}><b>Map:</b> {cell.mappingName}</span> : <i style={{ color: '#94a3b8' }}>(no mapping)</i>;
  return <span style={{ color: '#94a3b8' }}>—</span>;
}

/* ── Formula Configure Popup — opens on "Configure" button, shows visual builder + saved formulas ── */
function FormulaConfigPopup({ cell, onChange, tags, savedFormulas, onClose }) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const [search, setSearch] = React.useState('');
  const [tagSearch, setTagSearch] = React.useState('');
  const formula = cell.formula || '';

  const filteredFormulas = (savedFormulas || []).filter((f) =>
    (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.formula || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredTags = safeTags.filter((t) =>
    !tagSearch || (t.display_name || t.tag_name || '').toLowerCase().includes(tagSearch.toLowerCase())
  );

  const appendToFormula = (text) => {
    const current = formula.trim();
    const sep = current && !current.endsWith('(') && text !== ')' ? ' ' : '';
    onChange({ ...cell, formula: current + sep + text });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="w-[440px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden" style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--rb-border)', background: 'var(--rb-surface)' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Configure Formula</span>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"><X size={12} style={{ color: 'var(--rb-text-muted)' }} /></button>
        </div>

        <div className="p-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 44px)' }}>
          {/* Formula input */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-text-muted)' }}>Formula Expression</label>
            <input
              type="text"
              value={formula}
              onChange={(e) => onChange({ ...cell, formula: e.target.value })}
              placeholder="{Tag1} + {Tag2} or use buttons below"
              className="rb-input-base text-[10px] py-1 px-2 w-full font-mono"
              autoFocus
            />
          </div>

          {/* Quick operators */}
          <div className="flex items-center gap-1 flex-wrap">
            {['+', '-', '*', '/', '(', ')'].map((op) => (
              <button key={op} type="button" onClick={() => appendToFormula(op)}
                className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-mono font-bold"
                style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)', color: 'var(--rb-text)' }}>{op}</button>
            ))}
            {['SUM', 'AVG', 'MIN', 'MAX', 'IF', 'ROUND'].map((fn) => (
              <button key={fn} type="button" onClick={() => appendToFormula(`${fn}(`)}
                className="h-6 px-1.5 rounded text-[9px] font-bold"
                style={{ background: 'var(--rb-accent-subtle)', border: '1px solid var(--rb-border)', color: 'var(--rb-accent)' }}>{fn}</button>
            ))}
          </div>

          {/* Insert tag */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-text-muted)' }}>Insert Tag</label>
            <input type="text" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search tags..." className="rb-input-base text-[9px] py-0.5 px-1.5 w-full mb-1" />
            <div className="max-h-[100px] overflow-y-auto rounded" style={{ border: '1px solid var(--rb-border)' }}>
              {filteredTags.slice(0, 30).map((t) => (
                <button key={t.tag_name} type="button" onClick={() => { appendToFormula(`{${t.tag_name}}`); setTagSearch(''); }}
                  className="w-full text-left px-2 py-0.5 text-[9px] hover:bg-black/5 dark:hover:bg-white/5 truncate" style={{ color: 'var(--rb-text)' }}>
                  {t.display_name || t.tag_name}
                </button>
              ))}
            </div>
          </div>

          {/* Unit */}
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--rb-text-muted)' }}>Unit</label>
            <UnitSelector cell={cell} onChange={onChange} />
          </div>

          {/* Saved formulas */}
          {savedFormulas && savedFormulas.length > 0 && (
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-text-muted)' }}>Or pick a saved formula</label>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search saved..." className="rb-input-base text-[9px] py-0.5 px-1.5 w-full mb-1" />
              <div className="max-h-[120px] overflow-y-auto rounded" style={{ border: '1px solid var(--rb-border)' }}>
                {filteredFormulas.map((f) => (
                  <button key={f.id} type="button" onClick={() => { onChange({ ...cell, formula: f.formula, unit: f.unit || cell.unit }); }}
                    className="w-full text-left px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--rb-border)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-semibold truncate" style={{ color: 'var(--rb-text)' }}>{f.name}</div>
                      <div className="text-[9px] font-mono truncate" style={{ color: 'var(--rb-text-muted)' }}>{f.formula}</div>
                    </div>
                    {f.unit && <span className="text-[9px] font-bold px-1 rounded" style={{ background: 'var(--rb-accent-subtle)', color: 'var(--rb-accent)' }}>{f.unit}</span>}
                  </button>
                ))}
                {filteredFormulas.length === 0 && <div className="px-2 py-1.5 text-[9px]" style={{ color: 'var(--rb-text-muted)' }}>No matching formulas</div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-3 py-2" style={{ borderTop: '1px solid var(--rb-border)', background: 'var(--rb-surface)' }}>
          <button onClick={onClose} className="rb-btn-primary text-[9px] font-bold px-3 py-1 rounded">Done</button>
        </div>
      </div>
    </div>
  );
}

const SECTION_TYPES = [
  { type: 'header', label: 'Report Header', icon: LayoutTemplate, description: 'Title, subtitle, date range, logo' },
  { type: 'kpi-row', label: 'KPI Summary Row', icon: Hash, description: 'Key metrics displayed in a row' },
  { type: 'table', label: 'Data Table', icon: Table2, description: 'Tabular data with headers and rows' },
  { type: 'text-block', label: 'Text / Label', icon: Type, description: 'Section heading, note, or paragraph' },
  { type: 'spacer', label: 'Spacer', icon: Minus, description: 'Vertical space between sections' },
  { type: 'signature-block', label: 'Signature Block', icon: PenLine, description: 'Prepared by / approved by fields' },
];

let _sid = Date.now();
const sectionId = () => `ps-${_sid++}-${Math.random().toString(36).slice(2, 6)}`;

function defaultSection(type) {
  const id = sectionId();
  switch (type) {
    case 'header':
      return {
        id, type, title: 'Report Title', subtitle: '', showDateRange: true,
        showLogo: false, logoUrl: '', align: 'center',
        statusLabel: 'Status', statusSourceType: 'static', statusValue: '', statusTagName: '',
        statusMappingName: '', statusFormula: '', statusGroupTags: [], statusAggregation: 'avg',
      };
    case 'kpi-row':
      return {
        id, type, label: 'Summary',
        kpis: [
          { id: sectionId(), label: 'Produced', sourceType: 'tag', tagName: '', formula: '', unit: 'kg', decimals: 1 },
          { id: sectionId(), label: 'Consumed', sourceType: 'tag', tagName: '', formula: '', unit: 'kg', decimals: 1 },
        ],
      };
    case 'table':
      return {
        id, type, label: 'Table Section',
        columns: [
          { id: sectionId(), header: 'ID', width: 'auto', align: 'left' },
          { id: sectionId(), header: 'Product', width: 'auto', align: 'left' },
          { id: sectionId(), header: 'Weight', width: 'auto', align: 'right' },
        ],
        rows: [
          {
            id: sectionId(),
            cells: [
              { sourceType: 'static', value: '' },
              { sourceType: 'static', value: '' },
              { sourceType: 'tag', tagName: '', formula: '', unit: 'kg', decimals: 1 },
            ],
          },
        ],
        showSummaryRow: false,
        summaryLabel: 'Total',
        summaryFormula: '',
        summaryUnit: '',
      };
    case 'text-block':
      return { id, type, content: 'Section Heading', fontSize: '14px', fontWeight: '600', align: 'left', color: '' };
    case 'spacer':
      return { id, type, height: 24 };
    case 'signature-block':
      return {
        id, type,
        fields: [
          { id: sectionId(), label: 'Prepared by', value: '' },
          { id: sectionId(), label: 'Approved by', value: '' },
        ],
      };
    default:
      return { id, type: 'spacer', height: 16 };
  }
}

/* ── Resolve cell value ──────────────────────────────────────────── */

function resolveLookup(mapping, inputValue) {
  if (inputValue == null) return mapping?.fallback ?? '—';
  const key = String(Math.round(Number(inputValue)));
  const mapped = mapping?.lookup?.[key];
  if (mapped !== undefined && mapped !== null) return mapped;
  return inputValue;
}

/** Resolve the tag value key, considering per-cell aggregation namespacing.
 *  When historical data is fetched per-aggregation, non-default aggregations
 *  are stored as 'first::tagName', 'delta::tagName', etc. */
function resolveTagKey(tagName, aggregation) {
  if (!aggregation || aggregation === 'last') return tagName;
  return `${aggregation}::${tagName}`;
}

/** Merge historian + segment overlay; strip full-range `delta::tag` when row uses `silo_delta` for that tag. */
function mergeTagValuesForSiloExpandedRow(segRow, tagValues, segOverlay) {
  const merged = { ...tagValues, ...segOverlay };
  (segRow.cells || []).forEach((c) => {
    if (c.sourceType === 'tag' && c.aggregation === 'silo_delta' && c.tagName) {
      delete merged[`delta::${c.tagName}`];
    }
  });
  return merged;
}

function clampDecimals0to10(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

/** @returns {number|null} null = property unset (use tag metadata / default) */
function readExplicitDecimals(cell) {
  if (!cell) return null;
  const v = cell.decimals;
  if (v === undefined || v === null || v === '') return null;
  const num = Number(v);
  return Number.isFinite(num) ? clampDecimals0to10(num) : null;
}

function decimalsFromTagName(tagName, tagDecimalByName) {
  if (!tagName || !tagDecimalByName || typeof tagDecimalByName !== 'object') return null;
  const d = tagDecimalByName[tagName];
  return d != null && Number.isFinite(Number(d)) ? clampDecimals0to10(Number(d)) : null;
}

/** Resolve display decimal count: explicit cell.decimals wins, else tag metadata, else 0. */
function resolveFormattingDecimals(cell, tagDecimalByName, { primaryTag, weightTagName, groupTags } = {}) {
  const explicit = readExplicitDecimals(cell);
  if (explicit !== null) return explicit;
  if (primaryTag) {
    const fromTag = decimalsFromTagName(primaryTag, tagDecimalByName);
    if (fromTag !== null) return fromTag;
  }
  if (weightTagName) {
    const fromW = decimalsFromTagName(weightTagName, tagDecimalByName);
    if (fromW !== null) return fromW;
  }
  if (Array.isArray(groupTags) && groupTags.length && tagDecimalByName) {
    let maxD = null;
    for (const tn of groupTags) {
      const d = decimalsFromTagName(tn, tagDecimalByName);
      if (d !== null) maxD = maxD === null ? d : Math.max(maxD, d);
    }
    if (maxD !== null) return maxD;
  }
  return 0;
}

function resolveCellValue(cell, tagValues, rowContext = null, tagDecimalByName = null) {
  if (!cell) return '—';
  if (cell.sourceType === 'static') return cell.value ?? '';
  if (cell.sourceType === 'tag') {
    const agg = cell.aggregation || 'last';
    // silo_segments uses its own namespaced key; live mode falls back to plain last value
    const key = agg === 'silo_segments' ? `silo_segments::${cell.tagName}` : resolveTagKey(cell.tagName, agg);
    let raw = tagValues?.[key];
    // When namespaced key is missing (live mode), handle per aggregation:
    // - silo_segments → fall back to plain tagName (current live ID)
    // - delta → 0 (no time range = no change)
    // - first/avg/min/max/sum → fall back to raw value (single-point = itself)
    // - count → 1
    // - last → fall back to raw value (default)
    if (raw == null && cell.tagName) {
      if (agg === 'silo_segments') {
        raw = tagValues?.[cell.tagName] ?? null;
      } else if (agg === 'silo_first' || agg === 'silo_last') {
        // Live (no row-segments): no silo_first:: / silo_last:: keys — show current tag snapshot.
        // Historical segment rows set these keys in _segTagValues; when present, raw was already set above.
        raw = tagValues?.[cell.tagName] ?? null;
      } else if (agg === 'silo_delta') {
        // No segment window in live: 0 is honest; historical rows use silo_delta:: from overlay.
        raw = 0;
      } else if (agg === 'delta') {
        raw = 0;
      } else if (agg === 'count') {
        const base = tagValues?.[cell.tagName];
        raw = base != null ? 1 : null;
      } else {
        raw = tagValues?.[cell.tagName] ?? null;
      }
    }
    if (raw == null) return '—';
    const n = Number(raw);
    if (isNaN(n)) return raw;
    if (cell.unit === '__checkbox__') return { type: 'boolean', checked: n === 1 || n === '1' };
    const d = resolveFormattingDecimals(cell, tagDecimalByName, { primaryTag: cell.tagName });
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    const suffix = effectiveUnit(cell);
    return suffix ? `${formatted} ${suffix}` : formatted;
  }
  if (cell.sourceType === 'formula') {
    const result = evaluateFormula(cell.formula || '', tagValues);
    if (result == null) return '—';
    const n = Number(result);
    if (isNaN(n)) return result;
    if (cell.unit === '__checkbox__') return { type: 'boolean', checked: n === 1 || n === '1' };
    const d = resolveFormattingDecimals(cell, tagDecimalByName, {});
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    const suffix = effectiveUnit(cell);
    return suffix ? `${formatted} ${suffix}` : formatted;
  }
  if (cell.sourceType === 'group') {
    const vals = (cell.groupTags || []).map((t) => Number(tagValues?.[t]) || 0);
    if (vals.length === 0) return '—';
    const agg = cell.aggregation || 'avg';
    let n;
    if (agg === 'sum') n = vals.reduce((a, b) => a + b, 0);
    else if (agg === 'min') n = Math.min(...vals);
    else if (agg === 'max') n = Math.max(...vals);
    else if (agg === 'count') n = vals.length;
    else n = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (cell.unit === '__checkbox__') return { type: 'boolean', checked: n === 1 || n === '1' };
    const d = resolveFormattingDecimals(cell, tagDecimalByName, { groupTags: cell.groupTags });
    const formatted = Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    const suffix = effectiveUnit(cell);
    return suffix ? `${formatted} ${suffix}` : formatted;
  }
  if (cell.sourceType === 'mapping') {
    const mappings = getCachedMappings();
    const mapping = mappings?.find((m) => (m.name || m.id) === cell.mappingName);
    if (!mapping) return '—';

    if (mapping.output_type === 'tag_value') {
      // Determine bin_id: prefer row context (table), fall back to input_tag (KPI)
      const rawId = rowContext?.resolvedRefValue ?? tagValues?.[mapping.input_tag];
      if (rawId == null) return '—';
      const key = String(Math.round(Number(rawId)));
      const weightTagName = mapping.lookup?.[key];
      if (!weightTagName) return mapping.fallback ?? '—';

      // Read the mapped tag's live value
      const weightRaw = tagValues?.[weightTagName];
      if (weightRaw == null) return '—';
      const n = Number(weightRaw);
      if (isNaN(n)) return weightRaw;
      const d = resolveFormattingDecimals(cell, tagDecimalByName, { weightTagName });
      const formatted = n.toLocaleString(undefined, {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
      const suffix = effectiveUnit(cell);
      return suffix ? `${formatted} ${suffix}` : formatted;
    }

    // Default: text output (current behavior)
    const raw = tagValues?.[mapping.input_tag];
    return resolveLookup(mapping, raw);
  }
  return '—';
}

function resolveKpiValue(kpi, tagValues, tagDecimalByName = null) {
  return resolveCellValue({
    sourceType: kpi.sourceType || 'tag',
    tagName: kpi.tagName,
    formula: kpi.formula,
    unit: kpi.unit,
    customUnit: kpi.customUnit,
    decimals: kpi.decimals,
    groupTags: kpi.groupTags,
    aggregation: kpi.aggregation,
    mappingName: kpi.mappingName,
  }, tagValues, null, tagDecimalByName);
}

/** Build a cell-like object from header section status fields (for resolveCellValue). */
function getHeaderStatusCell(section) {
  if (!section || section.type !== 'header') return null;
  const st = section.statusSourceType || 'static';
  return {
    sourceType: st,
    value: section.statusValue,
    tagName: section.statusTagName,
    mappingName: section.statusMappingName,
    formula: section.statusFormula,
    groupTags: section.statusGroupTags || [],
    aggregation: section.statusAggregation || 'avg',
  };
}

/** Never render the boolean object as a React child; use 'Yes'/'No' for checkbox cells. */
function renderResolvedValue(resolved) {
  if (resolved && typeof resolved === 'object' && resolved.type === 'boolean') {
    return resolved.checked ? 'Yes' : 'No';
  }
  return resolved;
}

/* ── Check if a row should be hidden (bin inactive) ──────────────── */

function isRowHidden(row, section, tagValues, tagDecimalByName = null) {
  if (!row.hideWhenInactive) return false;
  const refCol = row.hideReferenceCol ?? 0;
  const cell = row.cells?.[refCol];
  if (!cell) return false;
  const resolved = resolveCellValue(cell, tagValues, null, tagDecimalByName);
  if (resolved && typeof resolved === 'object' && resolved.type === 'boolean') return false;
  // Hide when resolved value is 0, "0", "0.0", or dash (no data)
  if (resolved === '—' || resolved === '') return true;
  const num = Number(String(resolved).replace(/[^0-9.\-]/g, ''));
  return !isNaN(num) && num === 0;
}

/** tag_name → decimal_places for paginated numeric formatting when a cell has no explicit decimals. */
export function buildTagDecimalLookup(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const m = Object.create(null);
  for (const t of tags) {
    const name = t?.tag_name;
    if (!name) continue;
    const raw = t?.decimal_places;
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    m[name] = clampDecimals0to10(n);
  }
  return Object.keys(m).length ? m : null;
}

/* ── Collect all tag names from paginated config ─────────────────── */

export function collectPaginatedTagNames(sections) {
  const names = new Set();
  if (!Array.isArray(sections)) return [];
  const mappings = getCachedMappings();
  sections.forEach((s) => {
    if (s.type === 'header') {
      if (s.statusTagName) names.add(s.statusTagName);
      if (s.statusFormula) extractTagRefs(s.statusFormula).forEach((t) => names.add(t));
      if (s.statusSourceType === 'group' && Array.isArray(s.statusGroupTags)) s.statusGroupTags.forEach((t) => { if (t) names.add(t); });
      if (s.statusSourceType === 'mapping' && s.statusMappingName) {
        const m = mappings?.find((mx) => (mx.name || mx.id) === s.statusMappingName);
        if (m?.input_tag) names.add(m.input_tag);
        if (m?.output_type === 'tag_value' && m?.lookup) {
          Object.values(m.lookup).forEach((tagName) => { if (tagName && typeof tagName === 'string') names.add(tagName); });
        }
      }
    }
    if (s.type === 'kpi-row' && Array.isArray(s.kpis)) {
      s.kpis.forEach((k) => {
        if (k.tagName) names.add(k.tagName);
        if (k.formula) extractTagRefs(k.formula).forEach((t) => names.add(t));
        if (k.sourceType === 'group' && Array.isArray(k.groupTags)) k.groupTags.forEach((t) => { if (t) names.add(t); });
        if (k.sourceType === 'mapping' && k.mappingName) {
          const m = mappings?.find((mx) => (mx.name || mx.id) === k.mappingName);
          if (m?.input_tag) names.add(m.input_tag);
          if (m?.output_type === 'tag_value' && m?.lookup) {
            Object.values(m.lookup).forEach((tagName) => { if (tagName && typeof tagName === 'string') names.add(tagName); });
          }
        }
      });
    }
    if (s.type === 'table' && Array.isArray(s.rows)) {
      s.rows.forEach((row) => {
        if (Array.isArray(row.cells)) {
          row.cells.forEach((cell) => {
            if (cell.tagName) names.add(cell.tagName);
            if (cell.formula) extractTagRefs(cell.formula).forEach((t) => names.add(t));
            if (cell.sourceType === 'group' && Array.isArray(cell.groupTags)) cell.groupTags.forEach((t) => { if (t) names.add(t); });
            if (cell.sourceType === 'mapping' && cell.mappingName) {
              const m = mappings?.find((mx) => (mx.name || mx.id) === cell.mappingName);
              if (m?.input_tag) names.add(m.input_tag);
              if (m?.output_type === 'tag_value' && m?.lookup) {
                Object.values(m.lookup).forEach((tagName) => { if (tagName && typeof tagName === 'string') names.add(tagName); });
              }
            }
          });
        }
      });
      if (s.summaryFormula) extractTagRefs(s.summaryFormula).forEach((t) => names.add(t));
      // Per-column summary formulas
      (s.columns || []).forEach((col) => {
        if (col.summary?.formula) extractTagRefs(col.summary.formula).forEach((t) => names.add(t));
      });
    }
  });
  return [...names];
}

/**
 * Collect per-tag aggregation types from paginated sections.
 * Returns { aggregationType: Set<tagName> } so the viewer can fetch each group separately.
 * Tags with no explicit aggregation default to 'last'.
 */
export function collectPaginatedTagAggregations(sections) {
  const aggGroups = {}; // { 'last': Set, 'first': Set, 'delta': Set, ... }
  const addTag = (tagName, agg) => {
    if (!tagName) return;
    const a = agg || 'last';
    if (!aggGroups[a]) aggGroups[a] = new Set();
    aggGroups[a].add(tagName);
  };
  if (!Array.isArray(sections)) return {};
  const mappings = getCachedMappings();
  /** Mapping cells resolve from input_tag (+ tag_value lookup targets); historical fetch must request them (same as collectPaginatedTagNames). */
  const addMappingDependencyTags = (mappingName) => {
    if (!mappingName) return;
    const m = mappings?.find((mx) => (mx.name || mx.id) === mappingName);
    if (!m) return;
    if (m.input_tag) addTag(m.input_tag, 'last');
    if (m.output_type === 'tag_value' && m.lookup) {
      Object.values(m.lookup).forEach((tagName) => {
        if (tagName && typeof tagName === 'string') addTag(tagName, 'last');
      });
    }
  };
  sections.forEach((s) => {
    if (s.type === 'header') {
      if (s.statusTagName) addTag(s.statusTagName, 'last');
      if (s.statusSourceType === 'mapping' && s.statusMappingName) {
        addMappingDependencyTags(s.statusMappingName);
      }
    }
    if (s.type === 'kpi-row' && Array.isArray(s.kpis)) {
      s.kpis.forEach((k) => {
        if (k.tagName) addTag(k.tagName, k.aggregation);
        if (k.sourceType === 'mapping' && k.mappingName) addMappingDependencyTags(k.mappingName);
      });
    }
    if (s.type === 'table' && Array.isArray(s.rows)) {
      s.rows.forEach((row) => {
        if (Array.isArray(row.cells)) {
          row.cells.forEach((cell) => {
            if (cell.sourceType === 'tag' && cell.tagName) {
              // silo_segments drives its own endpoint — exclude from by-tags groups.
              // The tag is still collected by collectPaginatedTagNames for live polling.
              if (cell.aggregation === 'silo_segments') return;
              if (cell.aggregation === 'silo_first' || cell.aggregation === 'silo_last' || cell.aggregation === 'silo_delta') return;
              addTag(cell.tagName, cell.aggregation);
            }
            if (cell.sourceType === 'formula' && cell.formula) {
              parseFormulaTagReferences(cell.formula).forEach(({ base, explicitAgg }) => {
                if (!base) return;
                const a = explicitAgg || cell.aggregation;
                if (a === 'silo_segments' || a === 'silo_first' || a === 'silo_last' || a === 'silo_delta') return;
                addTag(base, a);
              });
            }
            if (cell.sourceType === 'mapping' && cell.mappingName) {
              addMappingDependencyTags(cell.mappingName);
            }
          });
        }
      });
    }
  });
  // Convert sets to arrays
  const result = {};
  for (const [agg, tagSet] of Object.entries(aggGroups)) {
    result[agg] = [...tagSet];
  }
  return result;
}

/* ── Silo segment row resolution (shared with viewer + Job Logs) ──── */

/**
 * Find every table row that contains a `silo_segments` driver tag cell.
 * Returns one descriptor per row with its driver cell and companion cells
 * (other tag cells on the same row), matching the contract of
 * `POST /api/historian/row-segments`.
 *
 * Output shape:
 *   [{ sectionIndex, rowIndex, section, row, segCell, companionCells:[{tagName,aggregation}] }, ...]
 *
 * Notes:
 *  - When multiple cells on a row use `silo_segments`, the FIRST is treated as the driver
 *    (mirrors the viewer's existing `find` behavior).
 *  - Only `sourceType === 'tag'` cells with a `tagName` are collected as companions
 *    (formula / static / mapping / group cells are excluded — same as the viewer).
 */
export function findSiloSegmentTableRows(sections) {
  const out = [];
  if (!Array.isArray(sections)) return out;
  sections.forEach((section, sectionIndex) => {
    if (!section || section.type !== 'table' || !Array.isArray(section.rows)) return;
    section.rows.forEach((row, rowIndex) => {
      if (!row || !Array.isArray(row.cells)) return;
      const segCell = row.cells.find(
        (c) => c && c.sourceType === 'tag' && c.aggregation === 'silo_segments' && c.tagName,
      );
      if (!segCell) return;
      const companionCells = row.cells
        .filter((c) => c && c !== segCell && c.sourceType === 'tag' && c.tagName)
        .map((c) => ({ tagName: c.tagName, aggregation: c.aggregation || 'last' }));
      out.push({
        sectionIndex,
        rowIndex,
        section,
        row,
        segCell,
        companionCells,
      });
    });
  });
  return out;
}

/**
 * Resolve the single silo-segment row that Job Logs should use.
 *
 * Selection rules:
 *  1. Enumerate all rows containing a `silo_segments` driver via `findSiloSegmentTableRows`.
 *  2. If `pointer.rowId` is set and matches a row that still has a driver, return that row.
 *  3. Otherwise return the first matching row (auto-first).
 *  4. Returns `null` when no rows have a `silo_segments` driver.
 *
 * @param {object} layoutConfig - Parsed `layout_config` JSON (must already be a plain object).
 * @param {object|null} pointer - `layout_config.jobLogsSegmentPointer` or null/undefined.
 * @returns {object|null} A descriptor from `findSiloSegmentTableRows`, or null.
 */
export function resolveJobLogsSegmentRow(layoutConfig, pointer) {
  if (!layoutConfig || typeof layoutConfig !== 'object') return null;
  const sections = Array.isArray(layoutConfig.paginatedSections) ? layoutConfig.paginatedSections : [];
  const candidates = findSiloSegmentTableRows(sections);
  if (candidates.length === 0) return null;
  const rowId = pointer && typeof pointer === 'object' ? pointer.rowId : null;
  if (rowId) {
    const match = candidates.find((c) => c.row && c.row.id === rowId);
    if (match) return match;
  }
  return candidates[0];
}

/* ══════════════════════════════════════════════════════════════════
   ADD SECTION PALETTE
   ══════════════════════════════════════════════════════════════════ */

function AddSectionPalette({ onAdd, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl overflow-hidden shadow-xl"
      style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }}
    >
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--rb-border)' }}>
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Add Section</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"><X size={12} style={{ color: 'var(--rb-text-muted)' }} /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2">
        {SECTION_TYPES.map((s) => (
          <button
            key={s.type}
            onClick={() => { onAdd(s.type); onClose(); }}
            className="flex items-start gap-2 p-2 rounded text-left transition-all duration-150 hover:shadow-md"
            style={{ border: '1px solid var(--rb-border)', background: 'var(--rb-surface)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--rb-accent)'; e.currentTarget.style.background = 'var(--rb-accent-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rb-border)'; e.currentTarget.style.background = 'var(--rb-surface)'; }}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'var(--rb-accent-subtle)', border: '1px solid rgba(15,52,96,0.15)' }}>
              <s.icon size={10} style={{ color: 'var(--rb-accent)' }} />
            </div>
            <div>
              <div className="text-[9px] font-semibold" style={{ color: 'var(--rb-text)' }}>{s.label}</div>
              <div className="text-[9px] mt-0.5 leading-snug" style={{ color: 'var(--rb-text-muted)' }}>{s.description}</div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SECTION EDITORS (Inline property editors per section type)
   ══════════════════════════════════════════════════════════════════ */

function CellEditor({ cell, tags, onChange, savedFormulas }) {
  const srcType = cell.sourceType || 'static';
  const safeTags = Array.isArray(tags) ? tags : [];
  const [showFormulaPopup, setShowFormulaPopup] = React.useState(false);
  const handleSourceTypeChange = (e) => {
    const v = e.target.value;
    if (v === 'group') onChange({ ...cell, sourceType: 'group', groupTags: cell.groupTags || [], aggregation: cell.aggregation || 'avg' });
    else if (v === 'mapping') onChange({ ...cell, sourceType: 'mapping', mappingName: cell.mappingName || '' });
    else onChange({ ...cell, sourceType: v });
  };
  const mappings = getCachedMappings();
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <select value={srcType} onChange={handleSourceTypeChange} className="rb-input-base text-[9px] py-0.5 px-1.5">
        <option value="static">Static Text</option>
        <option value="tag">Tag Value</option>
        <option value="formula">Formula</option>
        <option value="group">Tag Group</option>
        <option value="mapping">Mapping</option>
      </select>
      {srcType === 'static' && (
        <input type="text" value={cell.value || ''} onChange={(e) => onChange({ ...cell, value: e.target.value })} placeholder="Enter value..." className="rb-input-base text-[9px] py-0.5 px-1.5" />
      )}
      {srcType === 'tag' && (
        <div className="flex items-center gap-1 min-w-0">
          <select value={cell.tagName || ''} onChange={(e) => onChange({ ...cell, tagName: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1.5 flex-1 min-w-0">
            <option value="">Select tag...</option>
            {safeTags.map((t) => <option key={t.tag_name} value={t.tag_name}>{t.display_name || t.tag_name}</option>)}
          </select>
          <UnitSelector cell={cell} onChange={onChange} />
        </div>
      )}
      {srcType === 'formula' && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono truncate flex-1 min-w-0" style={{ color: 'var(--rb-text-secondary)' }}>{cell.formula || '(not set)'}</span>
          <button type="button" onClick={() => setShowFormulaPopup(true)}
            className="rb-input-base text-[9px] py-0.5 px-2 flex-shrink-0 font-bold"
            style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>Configure</button>
          {showFormulaPopup && <FormulaConfigPopup cell={cell} onChange={onChange} tags={tags} savedFormulas={savedFormulas} onClose={() => setShowFormulaPopup(false)} />}
        </div>
      )}
      {srcType === 'group' && (
        <div className="flex flex-col gap-1 min-w-0">
          <div className="space-y-0.5">
            {(cell.groupTags || []).map((gt, gi) => (
              <div key={gi} className="flex items-center gap-1">
                <select value={gt || ''} onChange={(e) => { const next = [...(cell.groupTags || [])]; next[gi] = e.target.value; onChange({ ...cell, groupTags: next }); }} className="rb-input-base text-[9px] py-0.5 px-1.5 flex-1 min-w-0">
                  <option value="">Select tag...</option>
                  {safeTags.map((t) => <option key={t.tag_name} value={t.tag_name}>{t.display_name || t.tag_name}</option>)}
                </select>
                <button type="button" onClick={() => onChange({ ...cell, groupTags: (cell.groupTags || []).filter((_, k) => k !== gi) })} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><X size={9} className="text-red-400" /></button>
              </div>
            ))}
            <button type="button" onClick={() => onChange({ ...cell, groupTags: [...(cell.groupTags || []), ''] })} className="text-[9px] font-semibold" style={{ color: 'var(--rb-accent)' }}>+ Add tag</button>
          </div>
          <div className="flex items-center gap-1">
            <select value={cell.aggregation || 'avg'} onChange={(e) => onChange({ ...cell, aggregation: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1 flex-1">
              <option value="avg">Average</option><option value="sum">Sum</option><option value="min">Min</option><option value="max">Max</option><option value="count">Count</option>
            </select>
            <UnitSelector cell={cell} onChange={onChange} />
          </div>
        </div>
      )}
      {srcType === 'mapping' && (
        <>
          <select value={cell.mappingName || ''} onChange={(e) => onChange({ ...cell, mappingName: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1.5 w-full min-w-0">
            <option value="">Select mapping...</option>
            {(mappings || []).filter((m) => m.is_active !== false).map((m) => <option key={m.id || m.name} value={m.name || m.id || ''}>{m.name || m.id || 'Unnamed'} → {m.output_tag_name || ''}</option>)}
          </select>
          {(() => { const selMapping = (mappings || []).find(m => (m.name || m.id) === cell.mappingName); return selMapping?.output_type === 'tag_value' ? <UnitSelector cell={cell} onChange={onChange} /> : null; })()}
        </>
      )}
    </div>
  );
}

/* ── Searchable tag selector for inline use ───────────────────────── */
function InlineTagSelect({ tags, value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const btnRef = React.useRef(null);
  const [dropUp, setDropUp] = React.useState(false);
  const filtered = React.useMemo(() => {
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter(t => t.tag_name?.toLowerCase().includes(q) || t.display_name?.toLowerCase().includes(q));
  }, [tags, search]);
  const selected = tags.find(t => t.tag_name === value);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 260);
    }
    setOpen(!open);
  };

  return (
    <div className="relative w-full min-w-0">
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="rb-input-base text-[11px] py-1 px-2 w-full text-left truncate"
        title={selected ? (selected.display_name || selected.tag_name) : ''}>
        {selected ? (selected.display_name || selected.tag_name) : <span style={{ color: 'var(--rb-text-muted)' }}>Select tag...</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className={`fixed z-50 w-[280px] rb-formula-dropdown overflow-hidden rounded-lg shadow-lg`}
            style={{
              ...(btnRef.current ? (() => {
                const r = btnRef.current.getBoundingClientRect();
                return dropUp
                  ? { left: r.left, bottom: window.innerHeight - r.top + 4 }
                  : { left: r.left, top: r.bottom + 4 };
              })() : { left: 0 }),
            }}>
            <div className="p-2 border-b border-[var(--rb-border-subtle)]">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tags..."
                autoFocus className="rb-input-base w-full py-1.5 px-2.5 text-[11px] rounded-md" />
            </div>
            <div className="overflow-y-auto max-h-52 py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-center" style={{ color: 'var(--rb-text-muted)' }}>No tags found</p>
              ) : filtered.map(tag => (
                <button key={tag.tag_name} type="button"
                  onClick={() => { onChange(tag.tag_name); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--rb-accent-subtle)] transition-colors ${value === tag.tag_name ? 'bg-[var(--rb-accent-subtle)] font-semibold' : ''}`}
                  style={{ color: 'var(--rb-text)' }}>
                  {tag.display_name || tag.tag_name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DecimalsCellInput({ cell, onChange }) {
  const val = cell.decimals;
  const displayVal = val === undefined || val === null || val === '' ? '' : String(val);
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-[10px] font-semibold" style={{ color: 'var(--rb-text-muted)' }} title="Decimal places. Empty uses each tag’s setting from Tag Management.">Dec:</span>
      <input
        type="number"
        min={0}
        max={10}
        placeholder="Auto"
        title="Decimal places (empty = tag default)"
        value={displayVal}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange({ ...cell, decimals: undefined });
          else {
            const n = Number(raw);
            onChange({ ...cell, decimals: Number.isFinite(n) ? clampDecimals0to10(n) : undefined });
          }
        }}
        className="rb-input-base text-[11px] py-0.5 px-1"
        style={{ width: '52px' }}
      />
    </div>
  );
}

/* ── Inline cell editor for table rows ────────────────────────────── */
function InlineCellEditor({ cell, columnName, tags, onChange, savedFormulas }) {
  const srcType = cell.sourceType || 'static';
  const safeTags = Array.isArray(tags) ? tags : [];
  const mappings = getCachedMappings();
  const [showFormulaPopup, setShowFormulaPopup] = React.useState(false);
  const handleSourceChange = (e) => {
    const v = e.target.value;
    if (v === 'group') onChange({ ...cell, sourceType: 'group', groupTags: cell.groupTags || [], aggregation: cell.aggregation || 'avg' });
    else if (v === 'mapping') onChange({ ...cell, sourceType: 'mapping', mappingName: cell.mappingName || '' });
    else onChange({ ...cell, sourceType: v });
  };

  const needsUnit = srcType === 'tag' || srcType === 'formula' || srcType === 'group';

  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      {/* Main row: label + source type + value */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide flex-shrink-0 px-1.5 py-0.5 rounded"
          style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)', whiteSpace: 'nowrap' }}>{columnName}</span>

        <select value={srcType} onChange={handleSourceChange}
          className="rb-input-base text-[11px] py-1 px-2 flex-shrink-0"
          style={{ color: 'var(--rb-text)', fontWeight: 500, minWidth: '80px' }}>
          <option value="static">Text</option>
          <option value="tag">Tag</option>
          <option value="formula">Formula</option>
          <option value="group">Group</option>
          <option value="mapping">Mapping</option>
        </select>

        <div className="min-w-0 flex items-center flex-1">
          {srcType === 'static' && (
            <input type="text" value={cell.value || ''} onChange={(e) => onChange({ ...cell, value: e.target.value })}
              placeholder="Value..." className="rb-input-base text-[11px] py-1 px-2 w-full" />
          )}
          {srcType === 'tag' && (
            <InlineTagSelect tags={safeTags} value={cell.tagName || ''} onChange={(v) => onChange({ ...cell, tagName: v })} />
          )}
          {srcType === 'formula' && (
            <>
              <span className="text-[10px] font-mono truncate flex-1 min-w-0" style={{ color: 'var(--rb-text-secondary)' }}>{cell.formula || '(not set)'}</span>
              <button type="button" onClick={() => setShowFormulaPopup(true)}
                className="rb-input-base text-[10px] py-1 px-2 flex-shrink-0 font-semibold ml-1"
                style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>Edit</button>
              {showFormulaPopup && <FormulaConfigPopup cell={cell} onChange={onChange} tags={tags} savedFormulas={savedFormulas} onClose={() => setShowFormulaPopup(false)} />}
            </>
          )}
          {srcType === 'mapping' && (
            <select value={cell.mappingName || ''} onChange={(e) => onChange({ ...cell, mappingName: e.target.value })}
              className="rb-input-base text-[11px] py-1 px-2 w-full">
              <option value="">Select mapping...</option>
              {(mappings || []).filter((m) => m.is_active !== false).map((m) => <option key={m.id || m.name} value={m.name || m.id || ''}>{m.name || m.id}</option>)}
            </select>
          )}
          {srcType === 'group' && (
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <select value={cell.aggregation || 'avg'} onChange={(e) => onChange({ ...cell, aggregation: e.target.value })}
                className="rb-input-base text-[11px] py-1 px-1.5 flex-shrink-0" style={{ width: '80px' }}>
                <option value="avg">Avg</option><option value="sum">Sum</option><option value="min">Min</option><option value="max">Max</option><option value="count">Count</option>
              </select>
              <span className="text-[10px] truncate opacity-60" style={{ color: 'var(--rb-text-secondary)' }}>
                ({(cell.groupTags || []).filter(Boolean).length} tags)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Options row: Unit + Aggregation — compact single line */}
      {needsUnit && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5 pt-1" style={{ borderTop: '1px dashed var(--rb-border)' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--rb-text-muted)' }}>Unit:</span>
            <UnitSelector cell={cell} onChange={onChange} className="text-[11px]" />
          </div>
          {(srcType === 'tag' || srcType === 'formula') && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Agg:</span>
              <select value={cell.aggregation || 'last'} onChange={(e) => onChange({ ...cell, aggregation: e.target.value })}
                className="rb-input-base text-[11px] py-0.5 px-2" style={{ minWidth: '140px' }}>
                <option value="last">Last</option>
                <option value="first">First (Start) — full range</option>
                <option value="delta">Delta (End−Start) — full range</option>
                <option value="unique_in_range">Unique in range (all stored values)</option>
                <option value="silo_first">First in silo segment</option>
                <option value="silo_last">Last in silo segment</option>
                <option value="silo_delta">Delta in silo segment</option>
                <option value="avg">Average</option>
                <option value="sum">Sum</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
                <option value="count">Count</option>
                {srcType === 'tag' && <option value="silo_segments">Silo IDs (segments)</option>}
              </select>
            </div>
          )}
          {cell.unit !== '__checkbox__' && (srcType === 'tag' || srcType === 'formula' || srcType === 'group') && (
            <DecimalsCellInput cell={cell} onChange={onChange} />
          )}
        </div>
      )}

      {/* Silo segments config fields */}
      {srcType === 'tag' && cell.aggregation === 'silo_segments' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5 pt-1" style={{ borderTop: '1px dashed var(--rb-border)' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--rb-text-muted)' }}>Min seconds:</span>
            <input type="number" min={0} placeholder="60"
              value={cell.segmentMinSeconds ?? ''}
              onChange={(e) => onChange({ ...cell, segmentMinSeconds: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="rb-input-base text-[11px] py-0.5 px-1" style={{ width: '60px' }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--rb-text-muted)' }}>Ignore IDs:</span>
            <input type="text" placeholder="0"
              value={(cell.segmentIgnoreValues || [0]).join(',')}
              onChange={(e) => {
                const vals = e.target.value.split(',').map((s) => { const n = Number(s.trim()); return isNaN(n) ? null : n; }).filter((n) => n !== null);
                onChange({ ...cell, segmentIgnoreValues: vals });
              }}
              className="rb-input-base text-[11px] py-0.5 px-1" style={{ width: '80px' }} />
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer" title="When ON, segments with the same silo ID and same product (or other text identity values) are merged into one row. Numeric weights are summed.">
            <input type="checkbox"
              checked={cell.segmentMergeDuplicates !== false}
              onChange={(e) => onChange({ ...cell, segmentMergeDuplicates: e.target.checked })} />
            <span className="text-[10px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Merge duplicates</span>
          </label>
        </div>
      )}

      {/* Row 3+: Group tag list — spans cols 2–3 */}
      {srcType === 'group' && (
        <>
          <span /> {/* col 1 spacer */}
          <div style={{ gridColumn: '2 / -1' }} className="flex flex-col gap-0.5">
            {(cell.groupTags || []).map((gt, gi) => (
              <div key={gi} className="flex items-center gap-1">
                <select value={gt || ''} onChange={(e) => { const next = [...(cell.groupTags || [])]; next[gi] = e.target.value; onChange({ ...cell, groupTags: next }); }}
                  className="rb-input-base text-[11px] py-0.5 px-1.5 flex-1 min-w-0">
                  <option value="">Select tag...</option>
                  {safeTags.map((t) => <option key={t.tag_name} value={t.tag_name}>{t.display_name || t.tag_name}</option>)}
                </select>
                <button type="button" onClick={() => onChange({ ...cell, groupTags: (cell.groupTags || []).filter((_, k) => k !== gi) })}
                  className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><X size={10} className="text-red-400" /></button>
              </div>
            ))}
            <button type="button" onClick={() => onChange({ ...cell, groupTags: [...(cell.groupTags || []), ''] })}
              className="text-[10px] font-semibold" style={{ color: 'var(--rb-accent)' }}>+ Add tag</button>
          </div>
        </>
      )}

      {/* Mapping unit row — spans cols 2–3 */}
      {srcType === 'mapping' && (() => {
        const m = (mappings || []).find(mx => (mx.name || mx.id) === cell.mappingName);
        return m?.output_type === 'tag_value' ? (
          <>
            <span />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5" style={{ borderTop: '1px dashed var(--rb-border)', gridColumn: '2 / -1' }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Unit:</span>
                <UnitSelector cell={cell} onChange={onChange} className="text-[11px]" />
              </div>
              {cell.unit !== '__checkbox__' && <DecimalsCellInput cell={cell} onChange={onChange} />}
            </div>
          </>
        ) : null;
      })()}
    </div>
  );
}

function HeaderSectionEditor({ section, tags, onChange, savedFormulas }) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const statusSource = section.statusSourceType || 'static';
  const [statusOpen, setStatusOpen] = React.useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      {/* Title & Subtitle */}
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-accent)' }}>Title</label>
          <input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} className="rb-input-base w-full text-[10px] py-0.5 px-1.5" />
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-accent)' }}>Subtitle</label>
          <input value={section.subtitle || ''} onChange={(e) => onChange({ ...section, subtitle: e.target.value })} className="rb-input-base w-full text-[10px] py-0.5 px-1.5" placeholder="Optional" />
        </div>
      </div>

      {/* Options row */}
      <div className="flex items-center justify-between py-1 px-1.5 rounded" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
        <label className="flex items-center gap-1.5 text-[9px] font-medium" style={{ color: 'var(--rb-text)' }}>
          <input type="checkbox" checked={section.showDateRange} onChange={(e) => onChange({ ...section, showDateRange: e.target.checked })} className="rounded" style={{ width: 12, height: 12 }} />
          Date range
        </label>
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--rb-border)' }}>
          {['left', 'center', 'right'].map((a) => (
            <button key={a} onClick={() => onChange({ ...section, align: a })}
              className="px-1 py-0.5 transition-colors"
              style={{ background: section.align === a ? 'var(--rb-accent)' : 'transparent', color: section.align === a ? '#fff' : 'var(--rb-text-muted)' }}>
              {a === 'left' ? <AlignLeft size={10} /> : a === 'center' ? <AlignCenter size={10} /> : <AlignRight size={10} />}
            </button>
          ))}
        </div>
      </div>

      {/* Collapsible Status */}
      <div className="rounded overflow-hidden" style={{ border: '1px solid var(--rb-border)' }}>
        <button type="button" onClick={() => setStatusOpen((o) => !o)}
          className="w-full flex items-center justify-between px-2 py-1 text-left"
          style={{ background: 'var(--rb-surface)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Status Tag</span>
          {statusOpen ? <ChevronUp size={10} style={{ color: 'var(--rb-text-muted)' }} /> : <ChevronDown size={10} style={{ color: 'var(--rb-text-muted)' }} />}
        </button>
        {statusOpen && (
          <div className="px-2 pb-2 pt-1 flex flex-col gap-1" style={{ background: 'var(--rb-surface)' }}>
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--rb-text-muted)' }}>Label</label>
              <input value={section.statusLabel ?? 'Status'} onChange={(e) => onChange({ ...section, statusLabel: e.target.value || 'Status' })} className="rb-input-base text-[9px] py-0.5 px-1.5 flex-1" placeholder="Status" />
            </div>
            <CellEditor
              cell={{
                sourceType: statusSource, value: section.statusValue, tagName: section.statusTagName,
                mappingName: section.statusMappingName, formula: section.statusFormula,
                groupTags: section.statusGroupTags || [], aggregation: section.statusAggregation || 'avg',
              }}
              tags={safeTags}
              savedFormulas={savedFormulas}
              onChange={(c) => onChange({
                ...section, statusSourceType: c.sourceType || 'static', statusValue: c.value,
                statusTagName: c.tagName, statusMappingName: c.mappingName, statusFormula: c.formula,
                statusGroupTags: c.groupTags || [], statusAggregation: c.aggregation || 'avg',
              })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function KpiRowEditor({ section, tags, onChange, savedFormulas }) {
  const updateKpi = (idx, updates) => {
    const kpis = [...section.kpis];
    kpis[idx] = { ...kpis[idx], ...updates };
    onChange({ ...section, kpis });
  };
  const addKpi = () => {
    onChange({
      ...section,
      kpis: [...section.kpis, { id: sectionId(), label: 'Value', sourceType: 'tag', tagName: '', formula: '', unit: '', decimals: 1 }],
    });
  };
  const removeKpi = (idx) => {
    onChange({ ...section, kpis: section.kpis.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-accent)' }}>Section Label</label>
        <input value={section.label || ''} onChange={(e) => onChange({ ...section, label: e.target.value })} className="rb-input-base w-full text-[10px] py-0.5 px-1.5" placeholder="e.g. Summary" />
      </div>
      <div className="flex flex-col gap-1">
        {section.kpis.map((kpi, i) => (
          <div key={kpi.id} className="rounded overflow-hidden" style={{ border: '1px solid var(--rb-border)' }}>
            <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: 'var(--rb-surface)', borderBottom: '1px solid var(--rb-border)' }}>
              <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--rb-text-muted)' }}>KPI {i + 1}</span>
              <input value={kpi.label} onChange={(e) => updateKpi(i, { label: e.target.value })} className="rb-input-base flex-1 text-[9px] py-0.5 px-1.5" placeholder="Label" />
              <button onClick={() => removeKpi(i)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                <Trash2 size={9} className="text-red-400" />
              </button>
            </div>
            <div className="px-2 py-1" style={{ background: 'var(--rb-surface)' }}>
              <CellEditor cell={kpi} tags={tags} savedFormulas={savedFormulas} onChange={(c) => updateKpi(i, c)} />
            </div>
          </div>
        ))}
      </div>
      <button onClick={addKpi} className="flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded"
        style={{ color: 'var(--rb-accent)', border: '1px dashed var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
        <Plus size={10} /> Add KPI
      </button>
    </div>
  );
}

/* Sortable wrapper for column items — provides drag handle listeners via render prop */
function SortableColumnItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ dragListeners: listeners, isDragging })}
    </div>
  );
}

function TableSectionEditor({ section, tags, onChange, savedFormulas }) {
  const [expandedRow, setExpandedRow] = React.useState(0);
  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleColumnDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.columns.findIndex((c) => c.id === active.id);
    const newIndex = section.columns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorder = (arr) => {
      const clone = [...arr];
      const [item] = clone.splice(oldIndex, 1);
      clone.splice(newIndex, 0, item);
      return clone;
    };
    onChange({
      ...section,
      columns: reorder(section.columns),
      rows: section.rows.map((r) => ({ ...r, cells: reorder(r.cells) })),
    });
  };
  const updateColumn = (idx, updates) => {
    const columns = [...section.columns];
    columns[idx] = { ...columns[idx], ...updates };
    onChange({ ...section, columns });
  };
  const updateColumnSummary = (idx, updates) => {
    const columns = [...section.columns];
    columns[idx] = { ...columns[idx], summary: { ...(columns[idx].summary || {}), ...updates } };
    onChange({ ...section, columns });
  };
  const addColumn = () => {
    onChange({
      ...section,
      columns: [...section.columns, { id: sectionId(), header: 'Column', width: 'auto', align: 'left' }],
      rows: section.rows.map((r) => ({ ...r, cells: [...r.cells, { sourceType: 'static', value: '' }] })),
    });
  };
  const removeColumn = (idx) => {
    onChange({
      ...section,
      columns: section.columns.filter((_, i) => i !== idx),
      rows: section.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== idx) })),
    });
  };
  const updateCell = (rowIdx, colIdx, cell) => {
    const rows = [...section.rows];
    const cells = [...rows[rowIdx].cells];
    cells[colIdx] = cell;
    rows[rowIdx] = { ...rows[rowIdx], cells };
    onChange({ ...section, rows });
  };
  const updateRow = (idx, updates) => {
    const rows = [...section.rows];
    rows[idx] = { ...rows[idx], ...updates };
    onChange({ ...section, rows });
  };
  const addRow = () => {
    const newIdx = section.rows.length;
    onChange({
      ...section,
      rows: [...section.rows, { id: sectionId(), cells: section.columns.map(() => ({ sourceType: 'static', value: '' })) }],
    });
    setExpandedRow(newIdx);
  };
  const removeRow = (idx) => {
    onChange({ ...section, rows: section.rows.filter((_, i) => i !== idx) });
    if (expandedRow >= section.rows.length - 1) setExpandedRow(Math.max(0, section.rows.length - 2));
  };
  const duplicateRow = (idx) => {
    const clone = { ...JSON.parse(JSON.stringify(section.rows[idx])), id: sectionId() };
    const rows = [...section.rows];
    rows.splice(idx + 1, 0, clone);
    onChange({ ...section, rows });
    setExpandedRow(idx + 1);
  };

  /* Helper: short preview text for a cell */
  const cellPreview = (cell) => {
    const src = cell.sourceType || 'static';
    if (src === 'static') return cell.value || '—';
    if (src === 'tag') return cell.tagName ? cell.tagName.split('.').pop() : '—';
    if (src === 'formula') return cell.formula ? 'ƒ(…)' : '—';
    if (src === 'mapping') return cell.mappingName || '—';
    if (src === 'group') return `Σ ${(cell.groupTags || []).length} tags`;
    return '—';
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Table Label */}
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider mb-0.5 block" style={{ color: 'var(--rb-accent)' }}>Table Label</label>
        <input value={section.label || ''} onChange={(e) => onChange({ ...section, label: e.target.value })} className="rb-input-base w-full text-[10px] py-0.5 px-1.5" placeholder="e.g. Production Data" />
      </div>

      {/* ── COLUMNS ── */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Columns ({section.columns.length})</span>
          <button onClick={addColumn} className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
            <Plus size={8} /> Add
          </button>
        </div>
        <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
          <SortableContext items={section.columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-0.5">
              {section.columns.map((col, i) => {
                const smType = col.summary?.type || 'none';
                return (
                  <SortableColumnItem key={col.id} id={col.id}>
                    {({ dragListeners, isDragging }) => (
                      <div className="rounded overflow-hidden" style={{ border: `1px solid ${isDragging ? 'var(--rb-accent)' : 'var(--rb-border)'}` }}>
                        {/* Main column row */}
                        <div className="flex items-center gap-1 py-0.5 px-1.5" style={{ background: 'var(--rb-surface)' }}>
                          <button {...dragListeners} className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none p-0.5 rounded hover:bg-black/5" title="Drag to reorder" tabIndex={-1}>
                            <GripVertical size={10} style={{ color: 'var(--rb-text-muted)' }} />
                          </button>
                          <input value={col.header} onChange={(e) => updateColumn(i, { header: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-1 min-w-0" placeholder="Name" />
                          <div className="flex rounded overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--rb-border)' }}>
                            {['left', 'center', 'right'].map((a) => (
                              <button key={a} onClick={() => updateColumn(i, { align: a })} className="px-1 py-0.5 transition-colors"
                                style={{ background: col.align === a ? 'var(--rb-accent)' : 'transparent', color: col.align === a ? '#fff' : 'var(--rb-text-muted)' }}>
                                {a === 'left' ? <AlignLeft size={8} /> : a === 'center' ? <AlignCenter size={8} /> : <AlignRight size={8} />}
                              </button>
                            ))}
                          </div>
                          <select value={smType} onChange={(e) => {
                            const v = e.target.value;
                            const columns = [...section.columns];
                            columns[i] = { ...columns[i], summary: { ...(columns[i].summary || {}), type: v, enabled: v !== 'none', label: columns[i].summary?.label || '' } };
                            // Auto-hide summary row when ALL columns are set to None
                            const anyEnabled = columns.some((c, idx) => idx === i ? v !== 'none' : (c.summary?.type && c.summary.type !== 'none'));
                            onChange({ ...section, columns, showSummaryRow: anyEnabled });
                          }} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-shrink-0" style={{ width: 'clamp(60px, 18%, 110px)' }} title="Summary row operation">
                            <option value="none">None</option>
                            <option value="label">Label</option>
                            <option value="sum">Sum</option>
                            <option value="avg">Avg</option>
                            <option value="min">Min</option>
                            <option value="max">Max</option>
                            <option value="count">Count</option>
                            <option value="formula">Formula</option>
                          </select>
                          {section.columns.length > 1 && (
                            <button onClick={() => removeColumn(i)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"><X size={8} className="text-red-400" /></button>
                          )}
                        </div>
                        {/* Summary detail row — label text + unit for aggregate ops, label text for label type, formula for formula type */}
                        {smType === 'label' && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5" style={{ background: 'var(--rb-accent-subtle)', borderTop: '1px solid var(--rb-border)', borderLeft: '3px solid var(--rb-accent)' }}>
                            <span className="text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--rb-accent)' }}>Text:</span>
                            <input value={col.summary?.label || ''} onChange={(e) => updateColumnSummary(i, { label: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-1 min-w-0" placeholder="Label text" />
                          </div>
                        )}
                        {smType === 'formula' && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5" style={{ background: 'var(--rb-accent-subtle)', borderTop: '1px solid var(--rb-border)', borderLeft: '3px solid var(--rb-accent)' }}>
                            <span className="text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--rb-accent)' }}>Label:</span>
                            <input value={col.summary?.label || ''} onChange={(e) => updateColumnSummary(i, { label: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-shrink-0" style={{ width: 'clamp(52px, 16%, 90px)' }} placeholder="Total" />
                            <span className="text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--rb-accent)' }}>ƒ:</span>
                            <input value={col.summary?.formula || ''} onChange={(e) => updateColumnSummary(i, { formula: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-1 min-w-0 font-mono" placeholder="{Tag1} + {Tag2}" />
                            <input value={col.summary?.unit || ''} onChange={(e) => updateColumnSummary(i, { unit: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-shrink-0" style={{ width: 'clamp(36px, 12%, 60px)' }} placeholder="kg" />
                          </div>
                        )}
                        {(smType === 'sum' || smType === 'avg' || smType === 'min' || smType === 'max' || smType === 'count') && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5" style={{ background: 'var(--rb-accent-subtle)', borderTop: '1px solid var(--rb-border)', borderLeft: '3px solid var(--rb-accent)' }}>
                            <span className="text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--rb-accent)' }}>Label:</span>
                            <input value={col.summary?.label || ''} onChange={(e) => updateColumnSummary(i, { label: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-1 min-w-0" placeholder="Total" />
                            <span className="text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--rb-accent)' }}>Unit:</span>
                            <input value={col.summary?.unit || ''} onChange={(e) => updateColumnSummary(i, { unit: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-shrink-0" style={{ width: 'clamp(40px, 14%, 64px)' }} placeholder="kg" />
                          </div>
                        )}
                      </div>
                    )}
                  </SortableColumnItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ── ROWS ── */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Rows ({section.rows.length})</span>
          <button onClick={addRow} className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
            <Plus size={8} /> Add
          </button>
        </div>
        <div className="flex flex-col gap-0.5 max-h-[500px] overflow-y-auto">
          {section.rows.map((row, ri) => {
            const isExpanded = expandedRow === ri;
            return (
              <div key={row.id} className="rounded" style={{ border: `1px solid ${isExpanded ? 'var(--rb-accent)' : 'var(--rb-border)'}`, overflow: isExpanded ? 'visible' : 'hidden' }}>
                {/* Row header — click to expand */}
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 cursor-pointer select-none"
                  style={{ background: isExpanded ? 'var(--rb-accent)' : 'var(--rb-surface)' }}
                  onClick={() => setExpandedRow(isExpanded ? -1 : ri)}
                >
                  <span className="text-[9px] font-bold tabular-nums w-4 flex-shrink-0" style={{ color: isExpanded ? '#fff' : 'var(--rb-text-muted)' }}>R{ri + 1}</span>
                  <span className="text-[9px] truncate flex-1 min-w-0" style={{ color: isExpanded ? 'rgba(255,255,255,0.85)' : 'var(--rb-text-secondary)' }}>
                    {row.cells.map((c, ci) => `${section.columns[ci]?.header || '?'}=${cellPreview(c)}`).join(' · ')}
                  </span>
                  <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => duplicateRow(ri)} className="p-0.5 rounded hover:bg-black/10" title="Duplicate"><Copy size={8} style={{ color: isExpanded ? 'rgba(255,255,255,0.7)' : 'var(--rb-text-muted)' }} /></button>
                    {section.rows.length > 1 && (
                      <button onClick={() => removeRow(ri)} className="p-0.5 rounded hover:bg-red-500/20" title="Delete"><Trash2 size={8} style={{ color: isExpanded ? 'rgba(255,200,200,0.9)' : undefined }} className={isExpanded ? '' : 'text-red-400'} /></button>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={9} style={{ color: 'rgba(255,255,255,0.7)' }} /> : <ChevronDown size={9} style={{ color: 'var(--rb-text-muted)' }} />}
                </div>

                {/* Expanded: cell editors */}
                {isExpanded && (
                  <div className="px-2 py-2 flex flex-col gap-2" style={{ background: 'var(--rb-panel)' }}>
                    {/* Row options */}
                    <div className="flex items-center gap-1.5 pb-1" style={{ borderBottom: '1px solid var(--rb-border)' }}>
                      <label className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--rb-text-muted)' }}>
                        <input type="checkbox" checked={row.hideWhenInactive || false} onChange={(e) => updateRow(ri, { hideWhenInactive: e.target.checked })} className="rounded" style={{ width: 10, height: 10 }} />
                        Auto-hide inactive
                      </label>
                      {row.hideWhenInactive && (
                        <select value={row.hideReferenceCol ?? 0} onChange={(e) => updateRow(ri, { hideReferenceCol: Number(e.target.value) })} className="rb-input-base text-[9px] py-0 px-1.5">
                          {section.columns.map((col, ci) => <option key={ci} value={ci}>{col.header}</option>)}
                        </select>
                      )}
                    </div>
                    {/* Cell editors — one per column, with visual separation */}
                    {row.cells.map((cell, ci) => (
                      <div key={ci} className="rounded-md px-2.5 py-2" style={{ background: ci % 2 === 0 ? 'var(--rb-surface)' : 'transparent', border: '1px solid var(--rb-border)' }}>
                        <InlineCellEditor cell={cell} columnName={section.columns[ci]?.header || `Col ${ci + 1}`} tags={tags} savedFormulas={savedFormulas} onChange={(c) => updateCell(ri, ci, c)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TextBlockEditor({ section, onChange }) {
  return (
    <div className="space-y-1.5">
      <input value={section.content} onChange={(e) => onChange({ ...section, content: e.target.value })}
        className="rb-input-base w-full text-[10px] py-0.5 px-1.5" placeholder="Enter text..." />
      <div className="flex items-center gap-2">
        <select value={section.fontSize || '14px'} onChange={(e) => onChange({ ...section, fontSize: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1.5">
          <option value="11px">Small</option>
          <option value="14px">Medium</option>
          <option value="18px">Large</option>
          <option value="22px">X-Large</option>
        </select>
        <select value={section.fontWeight || '600'} onChange={(e) => onChange({ ...section, fontWeight: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1.5">
          <option value="400">Normal</option>
          <option value="600">Semi-bold</option>
          <option value="700">Bold</option>
        </select>
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--rb-border)' }}>
          {['left', 'center', 'right'].map((a) => (
            <button key={a} onClick={() => onChange({ ...section, align: a })} className="px-1 py-0.5"
              style={{ background: section.align === a ? 'var(--rb-accent)' : 'transparent', color: section.align === a ? '#fff' : 'var(--rb-text-muted)' }}>
              {a === 'left' ? <AlignLeft size={9} /> : a === 'center' ? <AlignCenter size={9} /> : <AlignRight size={9} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpacerEditor({ section, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Height:</span>
      <input type="range" min={8} max={80} value={section.height} onChange={(e) => onChange({ ...section, height: Number(e.target.value) })} className="flex-1" />
      <span className="text-[9px] font-mono tabular-nums w-7 text-right" style={{ color: 'var(--rb-text)' }}>{section.height}px</span>
    </div>
  );
}

function SignatureBlockEditor({ section, onChange }) {
  const updateField = (idx, updates) => {
    const fields = [...section.fields];
    fields[idx] = { ...fields[idx], ...updates };
    onChange({ ...section, fields });
  };
  const addField = () => {
    onChange({ ...section, fields: [...section.fields, { id: sectionId(), label: 'Field', value: '' }] });
  };
  const removeField = (idx) => {
    onChange({ ...section, fields: section.fields.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-1">
      {section.fields.map((f, i) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1.5 w-28" placeholder="Label" />
          <input value={f.value || ''} onChange={(e) => updateField(i, { value: e.target.value })} className="rb-input-base text-[9px] py-0.5 px-1.5 flex-1" placeholder="Name (optional)" />
          {section.fields.length > 1 && (
            <button onClick={() => removeField(i)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={9} className="text-red-400" /></button>
          )}
        </div>
      ))}
      <button onClick={addField} className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
        style={{ color: 'var(--rb-accent)', border: '1px dashed var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
        <Plus size={8} /> Add Field
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SECTION CARD (wrapper for each section in the builder)
   ══════════════════════════════════════════════════════════════════ */

function SectionCard({ section, tags, index, total, onUpdate, onRemove, onMove, onDuplicate, savedFormulas }) {
  const [expanded, setExpanded] = useState(true);
  const meta = SECTION_TYPES.find((s) => s.type === section.type) || SECTION_TYPES[0];
  const Icon = meta.icon;

  const renderEditor = () => {
    switch (section.type) {
      case 'header': return <HeaderSectionEditor section={section} tags={tags} savedFormulas={savedFormulas} onChange={onUpdate} />;
      case 'kpi-row': return <KpiRowEditor section={section} tags={tags} savedFormulas={savedFormulas} onChange={onUpdate} />;
      case 'table': return <TableSectionEditor section={section} tags={tags} savedFormulas={savedFormulas} onChange={onUpdate} />;
      case 'text-block': return <TextBlockEditor section={section} onChange={onUpdate} />;
      case 'spacer': return <SpacerEditor section={section} onChange={onUpdate} />;
      case 'signature-block': return <SignatureBlockEditor section={section} onChange={onUpdate} />;
      default: return null;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg overflow-hidden"
      style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)', boxShadow: 'var(--rb-elevation-1)' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-1 px-1.5 py-1 cursor-pointer select-none"
        style={{ borderBottom: expanded ? '1px solid var(--rb-border)' : 'none' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--rb-accent-subtle)', border: '1px solid rgba(15,52,96,0.15)' }}>
          <Icon size={9} style={{ color: 'var(--rb-accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[9px] font-semibold truncate block" style={{ color: 'var(--rb-text)' }}>
            {meta.label}
            {section.label ? ` — ${section.label}` : section.title ? ` — ${section.title}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25">
            <ChevronUp size={9} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25">
            <ChevronDown size={9} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
          <button onClick={onDuplicate} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5">
            <Copy size={9} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
          <button onClick={onRemove} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 size={9} className="text-red-400" />
          </button>
        </div>
        <div className="ml-0.5">
          {expanded ? <ChevronUp size={9} style={{ color: 'var(--rb-text-muted)' }} /> : <ChevronDown size={9} style={{ color: 'var(--rb-text-muted)' }} />}
        </div>
      </div>

      {/* Body (expanded) */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="p-1.5">
              {renderEditor()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   A4 PREVIEW RENDERER (used in both builder preview and viewer)
   ══════════════════════════════════════════════════════════════════ */

/* A4 dimensions: 210mm x 297mm. With 8mm padding top/bottom, usable height per page ≈ 281mm */
const A4_PAGE_HEIGHT_PX = 1122; // 297mm ≈ 1122px at 96dpi
const A4_PAGE_PADDING_PX = 30;  // 8mm ≈ 30px
const A4_LOGO_HEADER_PX = 48; // logo header bar height
const A4_USABLE_HEIGHT = A4_PAGE_HEIGHT_PX - 2 * A4_PAGE_PADDING_PX - 20 - A4_LOGO_HEADER_PX; // minus footer & logo header

/* ── Logo header bar for paginated report pages ─────────────────── */
function ReportLogoHeader({ clientLogo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0' }}>
      <img
        src={HerculesLogoPng}
        alt="Hercules"
        style={{ height: '44px', width: 'auto', objectFit: 'contain', filter: 'brightness(0.15)' }}
        draggable={false}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {clientLogo && (
          <img
            src={clientLogo}
            alt="Client"
            style={{ height: '40px', width: 'auto', maxWidth: '140px', objectFit: 'contain' }}
            draggable={false}
          />
        )}
        <img
          src={AsmLogoPng}
          alt="ASM"
          style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
          draggable={false}
        />
      </div>
    </div>
  );
}

export function PaginatedReportPreview({ sections, tagValues, dateRange, compact = false, isPreviewMode = false, tagDecimalByName = null, expandedRows = {} }) {
  const containerRef = useRef(null);
  const [pageBreaks, setPageBreaks] = useState([]);
  const { clientLogo } = useBranding();

  const formatDate = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return d; }
  };

  // Measure content and calculate page breaks
  useEffect(() => {
    if (compact || !containerRef.current) return;
    const children = containerRef.current.children;
    if (!children || children.length === 0) return;

    const breaks = [];
    let cumHeight = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.classList.contains('paginated-page-break')) continue;
      const h = child.offsetHeight + (parseFloat(getComputedStyle(child).marginBottom) || 0);
      cumHeight += h;
      if (cumHeight > A4_USABLE_HEIGHT) {
        breaks.push(i);
        cumHeight = h; // start new page with this element
      }
    }
    // Only update if changed to avoid infinite loops
    const key = breaks.join(',');
    setPageBreaks((prev) => prev.join(',') === key ? prev : breaks);
  }, [compact, sections, tagValues, tagDecimalByName]);

  const totalRows = (sections || []).filter((s) => s.type === 'table').reduce((sum, s) => sum + (s.rows?.length || 0), 0);

  // Build rendered sections
  const renderedSections = (sections || []).map((section) => {
    switch (section.type) {
      /* ── Header ─── */
      case 'header': {
        const statusLabel = section.statusLabel || 'Status';
        const statusCell = getHeaderStatusCell(section);
        const resolvedStatus = isPreviewMode
          ? (statusCell ? renderResolvedValue(resolveCellValue(statusCell, tagValues, null, tagDecimalByName)) : '')
          : (statusCell ? resolveCellConfigLabel(statusCell) : '');
        const hasStatusConfig = section.statusSourceType === 'static' ? (section.statusValue != null && section.statusValue !== '') : (section.statusSourceType === 'tag' && section.statusTagName) || (section.statusSourceType === 'mapping' && section.statusMappingName) || (section.statusSourceType === 'formula' && section.statusFormula) || (section.statusSourceType === 'group' && Array.isArray(section.statusGroupTags) && section.statusGroupTags.some((t) => t));
        const showStatus = hasStatusConfig && resolvedStatus !== '' && resolvedStatus !== '—';
        return (
          <div key={section.id} className="mb-1" style={{ textAlign: section.align || 'center' }}>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0f172a] mb-0.5" style={{ marginTop: '2px' }}>
              {section.title || 'Untitled Report'}
            </h1>
            {section.subtitle && (
              <p className="text-[13px] text-[#64748b] mb-0.5">{section.subtitle}</p>
            )}
            {showStatus && (
              <p className="text-[13px] text-[#64748b] mb-0.5">{statusLabel}: {resolvedStatus}</p>
            )}
            {section.showDateRange && dateRange && (
              <p className="text-[12px] text-[#94a3b8] font-medium">
                ({formatDate(dateRange.from)} to {formatDate(dateRange.to)})
              </p>
            )}
            <div className="mt-1 h-[1.5px] w-full" style={{ background: 'linear-gradient(90deg, #0f3460, #1a5276, #0f3460)' }} />
          </div>
        );
      }

      /* ── KPI Row ─── */
      case 'kpi-row':
        return (
          <div key={section.id} className="mb-2">
            {section.label && (
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{section.label}</div>
            )}
            <div className="flex justify-end gap-4 flex-wrap">
              {(section.kpis || []).map((kpi) => {
                const displayValue = isPreviewMode
                  ? renderResolvedValue(resolveKpiValue(kpi, tagValues, tagDecimalByName))
                  : resolveCellConfigLabel(kpi);
                return (
                  <div key={kpi.id} className="text-right">
                    <span className="text-[11px] font-medium text-[#64748b]">{kpi.label}: </span>
                    <span className={`text-[14px] font-bold tabular-nums ${isPreviewMode ? 'text-[#0f172a]' : 'text-[#0f3460]'}`}>{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );

      /* ── Table ─── */
      case 'table':
        return (
          <div key={section.id} className="mb-2 rb-paginated-table-wrap" style={{ overflow: 'hidden', maxWidth: '100%' }}>
            {section.label && (
              <div className="text-[13px] font-bold text-[#0f172a] mb-1">{section.label}</div>
            )}
            <table className="w-full border-collapse text-[13px]" style={{ tableLayout: 'fixed', wordBreak: 'break-word' }}>
              <thead>
                <tr>
                  {(section.columns || []).map((col) => (
                    <th
                      key={col.id}
                      className="px-2 py-1.5 font-bold border border-[#d1d5db] bg-[#f1f5f9] text-[#334155]"
                      style={{ textAlign: col.align || 'left', width: col.width !== 'auto' ? col.width : undefined, overflow: 'hidden' }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Build the flat list of render rows, expanding silo_segments rows into segments
                  const renderRows = [];
                  (section.rows || []).forEach((row) => {
                    const isSegRow = isPreviewMode && Array.isArray(row.cells) &&
                      row.cells.some((c) => c.sourceType === 'tag' && c.aggregation === 'silo_segments');
                    const segList = expandedRows[row.id];
                    if (isSegRow && Array.isArray(segList) && segList.length > 0) {
                      // Replace with one render entry per segment
                      segList.forEach((segRow) => renderRows.push({
                        row: segRow,
                        _tv: mergeTagValuesForSiloExpandedRow(segRow, tagValues, segRow._segTagValues),
                      }));
                    } else {
                      if (!isRowHidden(row, section, tagValues, tagDecimalByName)) {
                        renderRows.push({ row, _tv: tagValues });
                      }
                    }
                  });
                  return renderRows.map(({ row, _tv }, ri) => {
                    const refColIdx = row.hideReferenceCol ?? 0;
                    const refCell = row.cells?.[refColIdx];
                    const resolvedRef = refCell ? resolveCellValue(refCell, _tv, null, tagDecimalByName) : null;
                    let resolvedRefValue = null;
                    if (resolvedRef != null && resolvedRef !== '—') {
                      const num = Number(String(resolvedRef).replace(/[^0-9.\-]/g, ''));
                      if (!isNaN(num)) resolvedRefValue = num;
                    }
                    const rowContext = { resolvedRefValue, refCell };
                    return (
                      <tr key={row.id} className={ri % 2 === 1 ? 'bg-[#f8fafc]' : ''}>
                        {(row.cells || []).map((cell, ci) => {
                          const col = section.columns[ci];
                          const displayValue = isPreviewMode
                            ? renderResolvedValue(resolveCellValue(cell, _tv, rowContext, tagDecimalByName))
                            : renderCellConfigBadge(cell);
                          return (
                            <td
                              key={ci}
                              className={`px-2 py-1 border border-[#e2e8f0] text-[11px]`}
                              style={{ textAlign: col?.align || 'left', overflow: 'hidden', maxWidth: 0 }}
                            >
                              {displayValue}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()}
                {/* Per-column summary row */}
                {(() => { const hasLegacyFormula = !!section.summaryFormula; const hasPerCol = (section.columns || []).some((c) => c.summary?.type && c.summary.type !== 'none'); return hasLegacyFormula || hasPerCol; })() && (
                  <tr className="font-bold bg-[#f1f5f9]">
                    {(section.columns || []).map((col, ci) => {
                      const sm = col.summary || {};
                      if (!sm.type || sm.type === 'none') {
                        const hasPerColSummary = section.columns.some((c) => c.summary?.enabled);
                        if (!hasPerColSummary) {
                          // Legacy mode — label in first cols, formula in last col
                          if (ci === 0) {
                            return (
                              <td key={ci} className="px-2 py-1 border border-[#d1d5db] text-right" colSpan={Math.max(1, (section.columns || []).length - 1)}>
                                {section.summaryLabel || 'Total'}
                              </td>
                            );
                          }
                          if (ci === (section.columns || []).length - 1 && section.summaryFormula) {
                            return (
                              <td key={ci} className="px-2 py-1 border border-[#d1d5db] text-right tabular-nums">
                                {renderResolvedValue(resolveCellValue({ sourceType: 'formula', formula: section.summaryFormula, unit: section.summaryUnit, decimals: 1 }, tagValues, null, tagDecimalByName))}
                              </td>
                            );
                          }
                          return null; // skip — covered by colSpan
                        }
                        // Per-column mode: first 'none' column shows label, rest are empty
                        if (ci === 0) {
                          return <td key={ci} className="px-2 py-1 border border-[#d1d5db] font-bold" style={{ textAlign: 'left' }}>{section.summaryLabel || 'Total'}</td>;
                        }
                        return <td key={ci} className="px-2 py-1 border border-[#d1d5db]" />;
                      }
                      if (sm.type === 'label') {
                        return <td key={ci} className="px-2 py-1 border border-[#d1d5db]" style={{ textAlign: col.align || 'left' }}>{sm.label || section.summaryLabel || 'Total'}</td>;
                      }
                      if (sm.type === 'formula') {
                        return (
                          <td key={ci} className="px-2 py-1 border border-[#d1d5db] tabular-nums" style={{ textAlign: col.align || 'right' }}>
                            {renderResolvedValue(resolveCellValue({ sourceType: 'formula', formula: sm.formula || '', unit: sm.unit || '', decimals: 1 }, tagValues, null, tagDecimalByName))}
                          </td>
                        );
                      }
                      // sum, avg, min, max, count — aggregate from expanded render rows for this column
                      const allRenderRows = (() => {
                        const rr = [];
                        (section.rows || []).forEach((row) => {
                          const segList = expandedRows[row.id];
                          const isSegRow = isPreviewMode && Array.isArray(row.cells) &&
                            row.cells.some((c) => c.sourceType === 'tag' && c.aggregation === 'silo_segments');
                          if (isSegRow && Array.isArray(segList) && segList.length > 0) {
                            segList.forEach((segRow) => rr.push({
                              row: segRow,
                              _tv: mergeTagValuesForSiloExpandedRow(segRow, tagValues, segRow._segTagValues),
                            }));
                          } else {
                            rr.push({ row, _tv: tagValues });
                          }
                        });
                        return rr;
                      })();
                      const colTagValues = allRenderRows.map(({ row: r, _tv }) => {
                        const cell = r.cells[ci];
                        if (!cell) return null;
                        const rv = resolveCellValue(cell, _tv, null, tagDecimalByName);
                        if (rv && typeof rv === 'object') return null;
                        const n = parseFloat(String(rv).replace(/[^0-9.\-]/g, ''));
                        return isNaN(n) ? null : n;
                      }).filter((v) => v !== null);
                      let aggResult = '—';
                      if (colTagValues.length > 0) {
                        if (sm.type === 'sum') aggResult = colTagValues.reduce((a, b) => a + b, 0);
                        else if (sm.type === 'avg') aggResult = colTagValues.reduce((a, b) => a + b, 0) / colTagValues.length;
                        else if (sm.type === 'min') aggResult = Math.min(...colTagValues);
                        else if (sm.type === 'max') aggResult = Math.max(...colTagValues);
                        else if (sm.type === 'count') aggResult = colTagValues.length;
                        if (typeof aggResult === 'number') {
                          aggResult = aggResult.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                          if (sm.unit) aggResult = `${aggResult} ${sm.unit}`;
                        }
                      }
                      const aggLabel = sm.label ? `${sm.label}: ` : '';
                      return (
                        <td key={ci} className="px-2 py-1 border border-[#d1d5db] tabular-nums" style={{ textAlign: col.align || 'right' }}>
                          {aggLabel}{aggResult}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );

      /* ── Text Block ─── */
      case 'text-block':
        return (
          <div key={section.id} className="mb-1.5" style={{
            fontSize: section.fontSize || '14px',
            fontWeight: section.fontWeight || '600',
            textAlign: section.align || 'left',
            color: section.color || '#0f172a',
          }}>
            {section.content}
          </div>
        );

      /* ── Spacer ─── */
      case 'spacer':
        return <div key={section.id} style={{ height: section.height || 16 }} />;

      /* ── Signature Block ─── */
      case 'signature-block':
        return (
          <div key={section.id} className="mt-6 mb-2">
            <div className="flex gap-8">
              {(section.fields || []).map((f) => (
                <div key={f.id} className="flex-1">
                  <div className="text-[11px] font-medium text-[#64748b] mb-6">{f.label}</div>
                  <div className="border-b border-[#cbd5e1] pb-1">
                    <span className="text-[12px] text-[#334155]">{f.value || '\u00a0'}</span>
                  </div>
                  <div className="text-[10px] text-[#94a3b8] mt-1">Date: _______________</div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  });

  // Insert page breaks into rendered output
  const pagesOutput = [];
  let currentPageSections = [];
  let pageNum = 1;

  renderedSections.forEach((node, idx) => {
    if (!compact && pageBreaks.includes(idx) && currentPageSections.length > 0) {
      // End current page
      pagesOutput.push(
        <div key={`page-${pageNum}`} className="paginated-page" style={{
          minHeight: compact ? 'auto' : `${A4_PAGE_HEIGHT_PX}px`,
          maxHeight: compact ? 'none' : `${A4_PAGE_HEIGHT_PX}px`,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <ReportLogoHeader clientLogo={clientLogo} />
          {currentPageSections}
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 text-[10px] text-[#94a3b8] print:text-[8pt]">
            <span>Records: {totalRows}</span>
            <span>Page {pageNum}</span>
          </div>
        </div>
      );
      // Add visual page separator (not shown in print)
      pagesOutput.push(
        <div key={`break-${pageNum}`} className="paginated-page-break print:hidden"
          style={{ height: '8px', background: '#d1d5db', margin: '0 auto', width: '100%' }} />
      );
      currentPageSections = [];
      pageNum++;
    }
    currentPageSections.push(node);
  });

  // Last page
  if (currentPageSections.length > 0) {
    pagesOutput.push(
      <div key={`page-${pageNum}`} className="paginated-page" style={{
        minHeight: compact ? 'auto' : `${A4_PAGE_HEIGHT_PX}px`,
        position: 'relative',
      }}>
        <ReportLogoHeader clientLogo={clientLogo} />
        {currentPageSections}
        {!compact && (
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 text-[10px] text-[#94a3b8] print:text-[8pt]">
            <span>{totalRows > 0 ? `Records: ${totalRows}` : ''}</span>
            <span>Page {pageNum}{pageBreaks.length > 0 ? ` of ${pageNum}` : ''}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`paginated-preview-root bg-white text-[#1a1a2e] font-[Inter,system-ui,sans-serif] ${compact ? '' : 'shadow-lg'}`}
      style={{
        width: compact ? '100%' : '210mm',
        padding: compact ? '12px' : '4mm 10mm 8mm 10mm',
        margin: compact ? 0 : '0 auto',
        border: compact ? 'none' : '1px solid #e5e7eb',
        borderRadius: compact ? 0 : '2px',
        lineHeight: 1.4,
      }}
    >
      {compact && <ReportLogoHeader clientLogo={clientLogo} />}
      {compact ? renderedSections : pagesOutput}
    </div>
  );
}

function parseTemplateLayoutConfig(template) {
  const raw = template?.layout_config;
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : { ...raw };
  } catch {
    return {};
  }
}

/**
 * Optional whitelist: layout_config.jobLogsDetailTags — tags shown in Job Logs order detail panel.
 * Empty / unset → backend uses all tags from the report layout.
 */
function JobLogsDetailTagsCard({ template, tags, sections, updateMeta }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const [pickValue, setPickValue] = useState('');

  const layout = useMemo(() => parseTemplateLayoutConfig(template), [template?.layout_config]);
  const selectedList = Array.isArray(layout.jobLogsDetailTags) ? layout.jobLogsDetailTags : [];

  const saveTags = useCallback((nextList) => {
    const base = parseTemplateLayoutConfig(template);
    if (!nextList || nextList.length === 0) {
      const rest = { ...base };
      delete rest.jobLogsDetailTags;
      updateMeta({ layout_config: rest });
      return;
    }
    updateMeta({ layout_config: { ...base, jobLogsDetailTags: nextList } });
  }, [template, updateMeta]);

  const tagOptions = useMemo(() => {
    const names = (tags || []).map((t) => t.tag_name || t).filter(Boolean);
    const q = filter.trim().toLowerCase();
    const pool = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
    const sel = new Set(selectedList);
    return pool.filter((n) => !sel.has(n)).slice(0, 120);
  }, [tags, filter, selectedList]);

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= selectedList.length) return;
    const cp = [...selectedList];
    [cp[idx], cp[j]] = [cp[j], cp[idx]];
    saveTags(cp);
  };

  const removeAt = (idx) => {
    saveTags(selectedList.filter((_, i) => i !== idx));
  };

  const addPicked = () => {
    if (!pickValue || selectedList.includes(pickValue)) return;
    saveTags([...selectedList, pickValue]);
    setPickValue('');
  };

  const mergeFromReport = () => {
    const fromReport = collectPaginatedTagNames(sections);
    const seen = new Set(selectedList);
    const merged = [...selectedList];
    for (const n of fromReport) {
      if (n && !seen.has(n)) {
        seen.add(n);
        merged.push(n);
      }
    }
    saveTags(merged);
  };

  const modeLabel = selectedList.length > 0 ? `${selectedList.length} selected` : 'all report tags';

  return (
    <div className="rounded-lg overflow-hidden mb-1"
      style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
        style={{ color: selectedList.length ? '#38bdf8' : 'var(--rb-text-muted)', background: 'var(--rb-surface)' }}>
        <span className="flex items-center gap-1.5">
          <List size={11} />
          Job logs tags ({modeLabel})
        </span>
        <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
      </button>
      {expanded && (
        <div className="px-3 py-2.5 space-y-2" style={{ borderTop: '1px solid var(--rb-border)' }}>
          <p className="text-[9px] leading-snug" style={{ color: 'var(--rb-text-muted)' }}>
            Restrict the Job Logs panel to these tags only. Leave unset (use all report tags) to include every tag from this layout.
          </p>

          {selectedList.length > 0 && (
            <ul className="space-y-0.5 max-h-32 overflow-y-auto rounded border px-1 py-0.5"
              style={{ borderColor: 'var(--rb-border)', background: 'var(--rb-surface)' }}>
              {selectedList.map((name, idx) => (
                <li key={`${name}-${idx}`} className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--rb-text)' }}>
                  <span className="flex-1 truncate font-mono" title={name}>{name}</span>
                  <button type="button" className="p-0.5 rounded hover:opacity-80" style={{ color: 'var(--rb-text-muted)' }} onClick={() => move(idx, -1)} title="Move up">
                    <ChevronUp size={10} />
                  </button>
                  <button type="button" className="p-0.5 rounded hover:opacity-80" style={{ color: 'var(--rb-text-muted)' }} onClick={() => move(idx, 1)} title="Move down">
                    <ChevronDown size={10} />
                  </button>
                  <button type="button" className="p-0.5 rounded hover:opacity-80" style={{ color: '#f87171' }} onClick={() => removeAt(idx)} title="Remove">
                    <X size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-1 items-center">
            <select
              value={pickValue}
              onChange={(e) => setPickValue(e.target.value)}
              className="rb-input-base flex-1 text-[10px] py-1 px-1 min-w-0"
            >
              <option value="">Add tag…</option>
              {tagOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button type="button" onClick={addPicked} disabled={!pickValue}
              className="rb-input-base text-[9px] font-bold uppercase px-2 py-1 shrink-0 disabled:opacity-40">
              Add
            </button>
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tag list…"
            className="rb-input-base w-full text-[10px] py-1 px-2"
          />
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={mergeFromReport}
              className="rb-input-base text-[9px] font-bold uppercase px-2 py-1">
              Merge from report
            </button>
            <button type="button" onClick={() => saveTags([])} disabled={selectedList.length === 0}
              className="rb-input-base text-[9px] font-bold uppercase px-2 py-1 disabled:opacity-40">
              Use all report tags
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Optional pointer: layout_config.jobLogsSegmentPointer = { rowId } selects which
 * `silo_segments` row Job Logs should expand for an order. Auto = first matching row.
 */
function describeSegmentRowCandidate(candidate, allCandidates) {
  const { section, sectionIndex, rowIndex, segCell, companionCells } = candidate;
  const sectionLabel = section?.label?.trim() || `Section ${sectionIndex + 1}`;
  const driverTag = segCell?.tagName || '?';
  const driverPart = `Driver: ${driverTag}`;
  const companionPart = companionCells.length > 0
    ? ` · ${companionCells.length} tag${companionCells.length === 1 ? '' : 's'}`
    : '';
  // Disambiguate when the same section has multiple silo rows — useful for the dropdown.
  const sameSection = allCandidates.filter((c) => c.sectionIndex === sectionIndex).length > 1;
  const rowSuffix = sameSection ? ` · Row ${rowIndex + 1}` : '';
  return `${sectionLabel}${rowSuffix} — ${driverPart}${companionPart}`;
}

function JobLogsSegmentRowCard({ template, sections, updateMeta }) {
  const [expanded, setExpanded] = useState(false);

  const layout = useMemo(() => parseTemplateLayoutConfig(template), [template?.layout_config]);
  const pointer = layout.jobLogsSegmentPointer && typeof layout.jobLogsSegmentPointer === 'object'
    ? layout.jobLogsSegmentPointer
    : null;
  const pointerRowId = pointer?.rowId || '';

  const candidates = useMemo(() => findSiloSegmentTableRows(sections), [sections]);

  const resolvedRowId = useMemo(() => {
    if (candidates.length === 0) return null;
    if (pointerRowId && candidates.some((c) => c.row?.id === pointerRowId)) return pointerRowId;
    return candidates[0].row?.id || null;
  }, [candidates, pointerRowId]);

  const pointerOrphan = !!pointerRowId && !candidates.some((c) => c.row?.id === pointerRowId);

  const setPointer = useCallback((rowId) => {
    const base = parseTemplateLayoutConfig(template);
    if (!rowId) {
      const rest = { ...base };
      delete rest.jobLogsSegmentPointer;
      updateMeta({ layout_config: rest });
      return;
    }
    updateMeta({ layout_config: { ...base, jobLogsSegmentPointer: { rowId } } });
  }, [template, updateMeta]);

  let statusLabel;
  let statusColor;
  if (candidates.length === 0) {
    statusLabel = 'no silo row';
    statusColor = 'var(--rb-text-muted)';
  } else if (pointerOrphan) {
    statusLabel = 'pointer invalid → auto';
    statusColor = '#f59e0b';
  } else if (pointerRowId) {
    statusLabel = 'manual';
    statusColor = '#38bdf8';
  } else if (candidates.length === 1) {
    statusLabel = 'auto · 1 row';
    statusColor = '#38bdf8';
  } else {
    statusLabel = `auto · first of ${candidates.length}`;
    statusColor = '#38bdf8';
  }

  return (
    <div className="rounded-lg overflow-hidden mb-1"
      style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
        style={{ color: statusColor, background: 'var(--rb-surface)' }}>
        <span className="flex items-center gap-1.5">
          <Layers size={11} />
          Job logs silo row ({statusLabel})
        </span>
        <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
      </button>
      {expanded && (
        <div className="px-3 py-2.5 space-y-2" style={{ borderTop: '1px solid var(--rb-border)' }}>
          <p className="text-[9px] leading-snug" style={{ color: 'var(--rb-text-muted)' }}>
            Job Logs uses the same silo segment row defined in this template. Pick a specific row when
            multiple are present; otherwise the first row with a Silo IDs (segments) cell is used.
          </p>

          {candidates.length === 0 && (
            <p className="text-[10px] italic" style={{ color: 'var(--rb-text-muted)' }}>
              No row in this template uses Silo IDs (segments). Add a table row with a cell whose
              aggregation is &quot;Silo IDs (segments)&quot; to enable the silo block on Job Logs.
            </p>
          )}

          {candidates.length === 1 && (
            <p className="text-[10px]" style={{ color: 'var(--rb-text)' }}>
              <span className="font-mono">{describeSegmentRowCandidate(candidates[0], candidates)}</span>
            </p>
          )}

          {candidates.length >= 2 && (
            <div className="space-y-1">
              <select
                value={pointerRowId && candidates.some((c) => c.row?.id === pointerRowId) ? pointerRowId : ''}
                onChange={(e) => setPointer(e.target.value || null)}
                className="rb-input-base w-full text-[10px] py-1 px-2"
              >
                <option value="">Auto — first silo row in template</option>
                {candidates.map((c) => (
                  <option key={c.row.id} value={c.row.id}>
                    {describeSegmentRowCandidate(c, candidates)}
                  </option>
                ))}
              </select>
              {resolvedRowId && (
                <p className="text-[9px]" style={{ color: 'var(--rb-text-muted)' }}>
                  Currently resolves to: <span className="font-mono">
                    {describeSegmentRowCandidate(
                      candidates.find((c) => c.row?.id === resolvedRowId) || candidates[0],
                      candidates,
                    )}
                  </span>
                </p>
              )}
            </div>
          )}

          {pointerOrphan && (
            <p className="text-[9px]" style={{ color: '#f59e0b' }}>
              Saved pointer references a row that no longer exists or no longer has Silo IDs (segments).
              Job Logs will fall back to auto-first until you re-pick a row.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Order Tracking Config Card (for Job Logs) ──────────────────── */
function OrderTrackingCard({ template, tags, updateMeta }) {
  const [expanded, setExpanded] = useState(false);
  const statusTag = template?.order_status_tag_name || '';
  const prefix = template?.order_prefix || '';
  const startVal = template?.order_start_value ?? 1;
  const stopVal = template?.order_stop_value ?? 0;

  const save = (field, value) => updateMeta({ [field]: value });

  return (
    <div className="rounded-lg overflow-hidden mb-1"
      style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
        style={{ color: statusTag ? '#34d399' : 'var(--rb-text-muted)', background: 'var(--rb-surface)' }}>
        <span className="flex items-center gap-1.5">
          <ClipboardList size={11} />
          Order Tracking {statusTag ? '(ON)' : '(OFF)'}
        </span>
        <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
      </button>
      {expanded && (
        <div className="px-3 py-2.5 space-y-2.5" style={{ borderTop: '1px solid var(--rb-border)' }}>
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--rb-text-muted)' }}>
              Status Tag (numeric 0/1)
            </label>
            <select
              value={statusTag}
              onChange={e => save('order_status_tag_name', e.target.value || null)}
              className="rb-input-base text-[10px] py-1 px-2 w-full">
              <option value="">None (disabled)</option>
              {(tags || []).map(t => (
                <option key={t.tag_name || t} value={t.tag_name || t}>
                  {t.tag_name || t} {t.data_type ? `[${t.data_type}]` : ''}
                </option>
              ))}
            </select>
          </div>
          {statusTag && (
            <>
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--rb-text-muted)' }}>
                  Order Prefix
                </label>
                <input
                  value={prefix}
                  onChange={e => save('order_prefix', e.target.value)}
                  className="rb-input-base text-[10px] py-1 px-2 w-full"
                  placeholder="e.g. MILB, FCL"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[9px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--rb-text-muted)' }}>Start</label>
                  <input type="number" value={startVal}
                    onChange={e => save('order_start_value', parseInt(e.target.value, 10) || 0)}
                    className="rb-input-base text-[10px] py-1 px-2 w-full" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--rb-text-muted)' }}>Stop</label>
                  <input type="number" value={stopVal}
                    onChange={e => save('order_stop_value', parseInt(e.target.value, 10) || 0)}
                    className="rb-input-base text-[10px] py-1 px-2 w-full" />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN BUILDER COMPONENT
   ══════════════════════════════════════════════════════════════════ */

export default function PaginatedReportBuilder() {
  const { id: templateId } = useParams();
  const navigate = useNavigate();
  const { template, loading, saving, dirty, saveLayout, updateMeta, autoSave, toggleAutoSave } = useReportCanvas(templateId);
  const { tags } = useAvailableTags();
  const { formulas: savedFormulas } = useAvailableFormulas();
  const tagDecimalByName = useMemo(() => buildTagDecimalLookup(tags), [tags]);

  // Paginated sections stored in layout_config.paginatedSections
  const [sections, setSections] = useState([]);
  const [reportMeta, setReportMeta] = useState({ name: '', description: '' });
  const [showAddPalette, setShowAddPalette] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [liveTagValues, setLiveTagValues] = useState({});
  const saveTimerRef = useRef(null);

  const pageMode = template?.layout_config?.grid?.pageMode || 'a4'; // 'a4' | 'full'
  const togglePageMode = useCallback(() => {
    const next = pageMode === 'a4' ? 'full' : 'a4';
    updateMeta({ layout_config: { ...template?.layout_config, grid: { ...(template?.layout_config?.grid || {}), pageMode: next } } });
  }, [pageMode, template, updateMeta]);

  // Collect tag names and aggregation groups from all sections
  const tagNames = useMemo(() => collectPaginatedTagNames(sections), [sections]);
  const tagAggGroups = useMemo(() => collectPaginatedTagAggregations(sections), [sections]);

  // Fetch tag values for preview — uses historian with per-aggregation grouping
  useEffect(() => {
    if (tagNames.length === 0) return;
    const fetchValues = async () => {
      try {
        const aggEntries = Object.entries(tagAggGroups);
        const hasNonLastAgg = aggEntries.some(([agg]) => agg !== 'last');

        if (hasNonLastAgg) {
          // Use historian API with 1-hour window for aggregation-aware fetch
          const now = new Date();
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          const toISO = now.toISOString();
          const fromISO = oneHourAgo.toISOString();

          const results = await Promise.all(
            aggEntries.map(([agg, tags]) =>
              axios.get('/api/historian/by-tags', {
                params: { tag_names: tags.join(','), from: fromISO, to: toISO, aggregation: agg },
                timeout: 10000,
              }).then((res) => ({ agg, data: res?.data?.tag_values || res?.data?.data || res?.data || {} }))
                .catch(() => ({ agg, data: {} }))
            )
          );
          const merged = {};
          for (const { agg, data } of results) {
            if (!data || typeof data !== 'object') continue;
            for (const [tagName, value] of Object.entries(data)) {
              if (agg === 'last') {
                merged[tagName] = value;
              } else {
                merged[`${agg}::${tagName}`] = value;
                if (!(tagName in merged)) merged[tagName] = value;
              }
            }
          }
          setLiveTagValues((prev) => ({ ...prev, ...merged }));
        } else {
          // Simple fetch — all tags just need latest values
          const res = await axios.post('/api/tags/get-values', { tag_names: tagNames }, { timeout: 10000 });
          if (res.data?.status === 'success' && res.data.tag_values) {
            setLiveTagValues((prev) => ({ ...prev, ...res.data.tag_values }));
          }
        }
      } catch {
        // API unavailable — keep previous values
      }
    };
    fetchValues();
    const intervalId = setInterval(fetchValues, 15000);
    return () => clearInterval(intervalId);
  }, [tagNames.join(','), JSON.stringify(tagAggGroups)]);

  // Load sections from template
  useEffect(() => {
    if (!template || hasLoadedOnce) return;
    const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
    setSections(lc.paginatedSections || [defaultSection('header'), defaultSection('table')]);
    setReportMeta({ name: template.name || '', description: template.description || '' });
    setHasLoadedOnce(true);
  }, [template, hasLoadedOnce]);

  // Autosave debounce — respects the autoSave toggle from the hook
  const latestSectionsRef = useRef(sections);
  latestSectionsRef.current = sections;

  const triggerSave = useCallback((updatedSections) => {
    if (!autoSave) return; // respect the toggle
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!template || !templateId) return;
      const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
      const payload = { layout_config: { ...lc, paginatedSections: updatedSections, reportType: 'paginated', grid: { ...(lc.grid || {}), pageMode: lc.grid?.pageMode || 'a4' } } };
      import('../../API/reportBuilderApi').then(({ reportBuilderApi }) => {
        reportBuilderApi.update(templateId, payload).catch((err) => {
          console.error('[PaginatedBuilder] autosave failed:', err?.response?.status, err?.message);
        });
      });
    }, 1500);
  }, [template, templateId, autoSave]);

  const updateSections = useCallback((newSections) => {
    setSections(newSections);
    triggerSave(newSections);
  }, [triggerSave]);

  const addSection = useCallback((type) => {
    updateSections([...sections, defaultSection(type)]);
  }, [sections, updateSections]);

  const updateSection = useCallback((idx, section) => {
    const next = [...sections];
    next[idx] = section;
    updateSections(next);
  }, [sections, updateSections]);

  const removeSection = useCallback((idx) => {
    updateSections(sections.filter((_, i) => i !== idx));
  }, [sections, updateSections]);

  const moveSection = useCallback((idx, dir) => {
    const next = [...sections];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    updateSections(next);
  }, [sections, updateSections]);

  const duplicateSection = useCallback((idx) => {
    const clone = { ...JSON.parse(JSON.stringify(sections[idx])), id: sectionId() };
    const next = [...sections];
    next.splice(idx + 1, 0, clone);
    updateSections(next);
  }, [sections, updateSections]);

  const handleManualSave = useCallback(() => {
    if (!template || !templateId) return;
    const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
    const payload = { layout_config: { ...lc, paginatedSections: sections, reportType: 'paginated', grid: { ...(lc.grid || {}), pageMode: lc.grid?.pageMode || 'a4' } } };
    import('../../API/reportBuilderApi').then(({ reportBuilderApi }) => {
      reportBuilderApi.update(templateId, payload)
        .then(() => console.log('[PaginatedBuilder] saved OK'))
        .catch((err) => console.error('[PaginatedBuilder] save failed:', err?.response?.status, err?.message));
    });
    if (reportMeta.name && reportMeta.name !== template.name) {
      import('../../API/reportBuilderApi').then(({ reportBuilderApi }) => {
        reportBuilderApi.update(templateId, { name: reportMeta.name }).catch(() => {});
      });
    }
  }, [template, templateId, sections, reportMeta]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualSave]);

  /* ── Resizable panel width ── */
  const [panelWidth, setPanelWidth] = useState(560);
  const resizeRef = useRef(null);
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      setPanelWidth(Math.max(320, Math.min(700, startW + delta)));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  if (loading) {
    return (
      <div className="report-builder min-h-screen flex items-center justify-center" style={{ background: 'var(--rb-surface)' }}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--rb-accent)', borderTopColor: 'transparent' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--rb-text-muted)' }}>Loading report...</span>
        </div>
      </div>
    );
  }

  /* ── PREVIEW MODE ── */
  if (previewMode) {
    return (
      <div className="report-builder min-h-screen" style={{ background: 'var(--rb-surface)' }}>
        <div className="sticky top-0 z-20 px-4 py-2 flex items-center justify-between"
          style={{ background: 'var(--rb-panel)', borderBottom: '1px solid var(--rb-border)', boxShadow: 'var(--rb-elevation-1)' }}>
          <button onClick={() => setPreviewMode(false)} className="flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--rb-text)', border: '1px solid var(--rb-border)' }}>
            <ArrowLeft size={14} /> Back to Editor
          </button>
          <span className="text-[11px] font-bold" style={{ color: 'var(--rb-text-muted)' }}>PREVIEW — {reportMeta.name || 'Untitled'}</span>
          <div />
        </div>
        <div className={`py-3 ${pageMode === 'a4' ? 'max-w-[1200px] mx-auto' : 'w-full'}`} style={{ background: '#e5e7eb' }}>
          <PaginatedReportPreview
            sections={sections}
            tagValues={liveTagValues}
            dateRange={{ from: new Date().toISOString(), to: new Date().toISOString() }}
            compact={pageMode === 'full'}
            isPreviewMode={true}
            tagDecimalByName={tagDecimalByName}
          />
        </div>
      </div>
    );
  }

  /* ── EDITOR MODE ── */
  return (
    <div className="report-builder min-h-screen" style={{ background: 'var(--rb-surface)' }}>
      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-20 px-2.5 py-1 flex items-center gap-1.5"
        style={{ background: 'var(--rb-panel)', borderBottom: '1px solid var(--rb-border)', boxShadow: 'var(--rb-elevation-1)' }}>
        <button onClick={() => navigate('/report-builder')} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
          <ArrowLeft size={12} style={{ color: 'var(--rb-text)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <input
            value={reportMeta.name}
            onChange={(e) => setReportMeta((p) => ({ ...p, name: e.target.value }))}
            className="text-[11px] font-bold bg-transparent border-none outline-none w-full truncate"
            style={{ color: 'var(--rb-text)' }}
            placeholder="Report Name"
          />
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--rb-text-muted)' }}>
            Paginated Report Builder
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip title={autoSave ? "Auto-save ON" : "Auto-save OFF"} placement="bottom" arrow disableInteractive>
            <button
              onClick={toggleAutoSave}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: autoSave ? 'rgba(52,211,153,0.15)' : 'transparent',
                color: autoSave ? '#34d399' : 'var(--rb-text-secondary)',
                border: `1px solid ${autoSave ? 'rgba(52,211,153,0.3)' : 'var(--rb-border)'}`,
              }}>
              <RefreshCw size={9} /> {autoSave ? 'Auto' : 'Manual'}
            </button>
          </Tooltip>
          <Tooltip title={template?.status === 'released' ? "Click to unrelease" : "Release report"} placement="bottom" arrow disableInteractive>
            <button
              onClick={async () => { const newStatus = template?.status === 'released' ? 'draft' : 'released'; await updateMeta({ status: newStatus }); }}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: template?.status === 'released' ? 'rgba(52,211,153,0.15)' : 'transparent',
                color: template?.status === 'released' ? '#34d399' : 'var(--rb-text-secondary)',
                border: `1px solid ${template?.status === 'released' ? 'rgba(52,211,153,0.3)' : 'var(--rb-border)'}`,
              }}>
              <Send size={9} /> {template?.status === 'released' ? 'Released' : 'Release'}
            </button>
          </Tooltip>
          <button onClick={() => setPreviewMode(true)} className="rb-btn-ghost flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5">
            <Eye size={9} /> Preview
          </button>
          <button onClick={handleManualSave} className="rb-btn-primary flex items-center gap-0.5 px-2 py-0.5"
            style={{ boxShadow: '0 0 12px var(--rb-accent-glow)' }}>
            <Save size={9} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Save</span>
          </button>
        </div>
      </div>

      {/* ── Main content: Editor + Live Preview ── */}
      <div className="flex gap-0 min-h-[calc(100vh-48px)]">
        {/* Left: Section editor list (resizable) */}
        <div className="flex-shrink-0 overflow-y-auto p-2 space-y-1.5 min-w-0 relative"
          style={{ width: `${panelWidth}px`, borderRight: '1px solid var(--rb-border)', maxHeight: 'calc(100vh - 48px)' }}>

          {/* ── Order Tracking config (collapsed by default) ── */}
          <OrderTrackingCard template={template} tags={tags} updateMeta={updateMeta} />
          <JobLogsDetailTagsCard template={template} tags={tags} sections={sections} updateMeta={updateMeta} />
          <JobLogsSegmentRowCard template={template} sections={sections} updateMeta={updateMeta} />

          <AnimatePresence mode="popLayout">
            {sections.map((section, idx) => (
              <SectionCard
                key={section.id}
                section={section}
                tags={tags}
                savedFormulas={savedFormulas}
                index={idx}
                total={sections.length}
                onUpdate={(s) => updateSection(idx, s)}
                onRemove={() => removeSection(idx)}
                onMove={(dir) => moveSection(idx, dir)}
                onDuplicate={() => duplicateSection(idx)}
              />
            ))}
          </AnimatePresence>

          {/* Add section button */}
          <div className="relative">
            <button
              onClick={() => setShowAddPalette((p) => !p)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200"
              style={{
                border: '2px dashed var(--rb-border)',
                color: 'var(--rb-text-muted)',
                background: showAddPalette ? 'var(--rb-accent-subtle)' : 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--rb-accent)'; e.currentTarget.style.color = 'var(--rb-accent)'; }}
              onMouseLeave={(e) => { if (!showAddPalette) { e.currentTarget.style.borderColor = 'var(--rb-border)'; e.currentTarget.style.color = 'var(--rb-text-muted)'; } }}
            >
              <Plus size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Add Section</span>
            </button>
            <AnimatePresence>
              {showAddPalette && (
                <div className="absolute top-full left-0 right-0 mt-2 z-30">
                  <AddSectionPalette onAdd={addSection} onClose={() => setShowAddPalette(false)} />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Resize handle */}
        <div
          ref={resizeRef}
          onMouseDown={handleResizeStart}
          className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-[var(--rb-accent)] transition-colors group relative"
          style={{ background: 'transparent' }}
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 left-0 right-0 group-hover:bg-[var(--rb-accent)] opacity-30 transition-opacity" />
        </div>

        {/* Right: Live preview (A4 or full) */}
        <div className="flex-1 overflow-auto p-2 relative" style={{ background: '#e5e7eb', maxHeight: 'calc(100vh - 48px)' }}>
          <div className="sticky top-0 z-10 mb-2 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.55)', color: 'white', backdropFilter: 'blur(8px)' }}>
              {pageMode === 'a4' ? 'A4 Preview — Live' : 'Full width — Live'}
            </span>
          </div>
          <div className={pageMode === 'a4' ? 'mx-auto' : 'w-full'} style={pageMode === 'a4' ? { maxWidth: 'min(100%, 900px)' } : undefined}>
            <PaginatedReportPreview
              sections={sections}
              tagValues={liveTagValues}
              dateRange={{ from: new Date().toISOString(), to: new Date().toISOString() }}
              compact={pageMode === 'full'}
              tagDecimalByName={tagDecimalByName}
            />
          </div>
          <div className="rb-floating-toolbar">
            <Tooltip title={pageMode === 'a4' ? 'Switch to full dashboard' : 'Switch to A4 page'} placement="top" arrow disableInteractive>
              <button onClick={togglePageMode} type="button">
                {pageMode === 'a4' ? <Monitor size={14} /> : <FileText size={14} />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
