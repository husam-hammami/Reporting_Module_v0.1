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
  Monitor, FileText,
} from 'lucide-react';
import { Tooltip } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useReportCanvas, useAvailableTags } from '../../Hooks/useReportBuilder';
import { evaluateFormula, extractTagRefs } from './formulas/formulaEngine';
import { getCachedMappings, refreshMappingsCache } from '../../utils/mappingsCache';
import axios from '../../API/axios';

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
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...cell, unit: v, ...(v !== '__custom__' ? {} : { customUnit: cell.customUnit ?? cell.unit ?? '' }) });
        }}
        className={`rb-input-base text-[10px] py-1 px-2 flex-shrink-0 ${className}`}
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
          className="rb-input-base text-[10px] py-1 px-2 w-16 flex-shrink-0"
        />
      )}
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

function resolveCellValue(cell, tagValues) {
  if (!cell) return '—';
  if (cell.sourceType === 'static') return cell.value ?? '';
  if (cell.sourceType === 'tag') {
    const raw = tagValues?.[cell.tagName];
    if (raw == null) return '—';
    const n = Number(raw);
    if (isNaN(n)) return raw;
    if (cell.unit === '__checkbox__') return { type: 'boolean', checked: n === 1 || n === '1' };
    const d = cell.decimals ?? 1;
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
    const d = cell.decimals ?? 1;
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
    const d = cell.decimals ?? 1;
    const formatted = Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    const suffix = effectiveUnit(cell);
    return suffix ? `${formatted} ${suffix}` : formatted;
  }
  if (cell.sourceType === 'mapping') {
    const mappings = getCachedMappings();
    const mapping = mappings?.find((m) => (m.name || m.id) === cell.mappingName);
    if (!mapping) return '—';
    const raw = tagValues?.[mapping.input_tag];
    return resolveLookup(mapping, raw);
  }
  return '—';
}

function resolveKpiValue(kpi, tagValues) {
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
  }, tagValues);
}

/** Never render the boolean object as a React child; use 'Yes'/'No' for checkbox cells. */
function renderResolvedValue(resolved) {
  if (resolved && typeof resolved === 'object' && resolved.type === 'boolean') {
    return resolved.checked ? 'Yes' : 'No';
  }
  return resolved;
}

/* ── Check if a row should be hidden (bin inactive) ──────────────── */

function isRowHidden(row, section, tagValues) {
  if (!row.hideWhenInactive) return false;
  const refCol = row.hideReferenceCol ?? 0;
  const cell = row.cells?.[refCol];
  if (!cell) return false;
  const resolved = resolveCellValue(cell, tagValues);
  if (resolved && typeof resolved === 'object' && resolved.type === 'boolean') return false;
  // Hide when resolved value is 0, "0", "0.0", or dash (no data)
  if (resolved === '—' || resolved === '') return true;
  const num = Number(String(resolved).replace(/[^0-9.\-]/g, ''));
  return !isNaN(num) && num === 0;
}

/* ── Collect all tag names from paginated config ─────────────────── */

export function collectPaginatedTagNames(sections) {
  const names = new Set();
  if (!Array.isArray(sections)) return [];
  const mappings = getCachedMappings();
  sections.forEach((s) => {
    if (s.type === 'kpi-row' && Array.isArray(s.kpis)) {
      s.kpis.forEach((k) => {
        if (k.tagName) names.add(k.tagName);
        if (k.formula) extractTagRefs(k.formula).forEach((t) => names.add(t));
        if (k.sourceType === 'group' && Array.isArray(k.groupTags)) k.groupTags.forEach((t) => { if (t) names.add(t); });
        if (k.sourceType === 'mapping' && k.mappingName) {
          const m = mappings?.find((mx) => (mx.name || mx.id) === k.mappingName);
          if (m?.input_tag) names.add(m.input_tag);
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
            }
          });
        }
      });
      if (s.summaryFormula) extractTagRefs(s.summaryFormula).forEach((t) => names.add(t));
    }
  });
  return [...names];
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
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--rb-border)' }}>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Add Section</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"><X size={14} style={{ color: 'var(--rb-text-muted)' }} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {SECTION_TYPES.map((s) => (
          <button
            key={s.type}
            onClick={() => { onAdd(s.type); onClose(); }}
            className="flex items-start gap-2.5 p-3 rounded-lg text-left transition-all duration-150 hover:shadow-md"
            style={{ border: '1px solid var(--rb-border)', background: 'var(--rb-surface)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--rb-accent)'; e.currentTarget.style.background = 'var(--rb-accent-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rb-border)'; e.currentTarget.style.background = 'var(--rb-surface)'; }}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'var(--rb-accent-subtle)', border: '1px solid rgba(56,189,248,0.12)' }}>
              <s.icon size={14} style={{ color: 'var(--rb-accent)' }} />
            </div>
            <div>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--rb-text)' }}>{s.label}</div>
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

function CellEditor({ cell, tags, onChange }) {
  const srcType = cell.sourceType || 'static';
  const safeTags = Array.isArray(tags) ? tags : [];
  const handleSourceTypeChange = (e) => {
    const v = e.target.value;
    if (v === 'group') onChange({ ...cell, sourceType: 'group', groupTags: cell.groupTags || [], aggregation: cell.aggregation || 'avg' });
    else if (v === 'mapping') onChange({ ...cell, sourceType: 'mapping', mappingName: cell.mappingName || '' });
    else onChange({ ...cell, sourceType: v });
  };
  const mappings = getCachedMappings();
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <select
        value={srcType}
        onChange={handleSourceTypeChange}
        className="rb-input-base text-[10px] py-1 px-2"
      >
        <option value="static">Static Text</option>
        <option value="tag">Single Tag</option>
        <option value="formula">Custom Formula</option>
        <option value="group">Tag Group Aggregate</option>
        <option value="mapping">Mapping Tag</option>
      </select>
      {srcType === 'static' && (
        <input
          type="text"
          value={cell.value || ''}
          onChange={(e) => onChange({ ...cell, value: e.target.value })}
          placeholder="Enter value..."
          className="rb-input-base text-[10px] py-1 px-2"
        />
      )}
      {srcType === 'tag' && (
        <div className="flex flex-col gap-1.5 min-w-0" style={{ minWidth: 'max(140px, 100%)' }}>
          <div className="flex gap-1">
            <select
              value={cell.tagName || ''}
              onChange={(e) => onChange({ ...cell, tagName: e.target.value })}
              className="rb-input-base text-[10px] py-1 px-2 flex-1 min-w-0"
              title="Select a tag"
            >
              <option value="">Select tag...</option>
              {safeTags.map((t) => (
                <option key={t.tag_name} value={t.tag_name}>{t.display_name || t.tag_name}</option>
              ))}
            </select>
          </div>
          <UnitSelector cell={cell} onChange={onChange} />
        </div>
      )}
      {srcType === 'formula' && (
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={cell.formula || ''}
            onChange={(e) => onChange({ ...cell, formula: e.target.value })}
            placeholder="{Tag1} + {Tag2}"
            className="rb-input-base text-[10px] py-1 px-2 w-full font-mono"
          />
          <UnitSelector cell={cell} onChange={onChange} />
        </div>
      )}
      {srcType === 'group' && (
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="space-y-1">
            {(cell.groupTags || []).map((gt, gi) => (
              <div key={gi} className="flex items-center gap-1">
                <select
                  value={gt || ''}
                  onChange={(e) => {
                    const next = [...(cell.groupTags || [])];
                    next[gi] = e.target.value;
                    onChange({ ...cell, groupTags: next });
                  }}
                  className="rb-input-base text-[10px] py-1 px-2 flex-1 min-w-0"
                >
                  <option value="">Select tag...</option>
                  {safeTags.map((t) => (
                    <option key={t.tag_name} value={t.tag_name}>{t.display_name || t.tag_name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => onChange({ ...cell, groupTags: (cell.groupTags || []).filter((_, k) => k !== gi) })} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20" title="Remove tag">
                  <X size={10} className="text-red-400" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => onChange({ ...cell, groupTags: [...(cell.groupTags || []), ''] })} className="text-[9px] font-semibold" style={{ color: 'var(--rb-accent)' }}>+ Add tag</button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold uppercase" style={{ color: 'var(--rb-text-muted)' }}>Aggregation</span>
            <select value={cell.aggregation || 'avg'} onChange={(e) => onChange({ ...cell, aggregation: e.target.value })} className="rb-input-base text-[10px] py-0.5 px-1.5 flex-1">
              <option value="avg">Average</option>
              <option value="sum">Sum</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
              <option value="count">Count</option>
            </select>
          </div>
          <UnitSelector cell={cell} onChange={onChange} />
        </div>
      )}
      {srcType === 'mapping' && (
        <select
          value={cell.mappingName || ''}
          onChange={(e) => onChange({ ...cell, mappingName: e.target.value })}
          className="rb-input-base text-[10px] py-1 px-2 w-full min-w-0"
          title="Select a mapping"
        >
          <option value="">— Select a mapping —</option>
          {(mappings || []).filter((m) => m.is_active !== false).map((m) => (
            <option key={m.id || m.name} value={m.name || m.id || ''}>{m.name || m.id || 'Unnamed'} → {m.output_tag_name || ''}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function HeaderSectionEditor({ section, onChange }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--rb-accent)' }}>Title</label>
        <input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} className="rb-input-base w-full text-[12px]" />
      </div>
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--rb-accent)' }}>Subtitle</label>
        <input value={section.subtitle || ''} onChange={(e) => onChange({ ...section, subtitle: e.target.value })} className="rb-input-base w-full text-[12px]" placeholder="Optional subtitle" />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--rb-text)' }}>
          <input type="checkbox" checked={section.showDateRange} onChange={(e) => onChange({ ...section, showDateRange: e.target.checked })} className="rounded" />
          Show date range
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-text-muted)' }}>Align</span>
          {['left', 'center', 'right'].map((a) => (
            <button key={a} onClick={() => onChange({ ...section, align: a })}
              className="p-1 rounded"
              style={{
                background: section.align === a ? 'var(--rb-accent-subtle)' : 'transparent',
                color: section.align === a ? 'var(--rb-accent)' : 'var(--rb-text-muted)',
              }}
            >
              {a === 'left' ? <AlignLeft size={12} /> : a === 'center' ? <AlignCenter size={12} /> : <AlignRight size={12} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiRowEditor({ section, tags, onChange }) {
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
    <div className="space-y-3">
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--rb-accent)' }}>Section Label</label>
        <input value={section.label || ''} onChange={(e) => onChange({ ...section, label: e.target.value })} className="rb-input-base w-full text-[12px]" placeholder="e.g. Summary" />
      </div>
      <div className="space-y-2">
        {section.kpis.map((kpi, i) => (
          <div key={kpi.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
            <div className="flex-1 space-y-1.5">
              <input value={kpi.label} onChange={(e) => updateKpi(i, { label: e.target.value })} className="rb-input-base w-full text-[10px]" placeholder="Label" />
              <CellEditor cell={kpi} tags={tags} onChange={(c) => updateKpi(i, c)} />
            </div>
            <button onClick={() => removeKpi(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 mt-1">
              <Trash2 size={12} className="text-red-400" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addKpi} className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg"
        style={{ color: 'var(--rb-accent)', border: '1px dashed var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
        <Plus size={12} /> Add KPI
      </button>
    </div>
  );
}

function TableSectionEditor({ section, tags, onChange }) {
  const updateColumn = (idx, updates) => {
    const columns = [...section.columns];
    columns[idx] = { ...columns[idx], ...updates };
    onChange({ ...section, columns });
  };
  const addColumn = () => {
    onChange({
      ...section,
      columns: [...section.columns, { id: sectionId(), header: 'Column', width: 'auto', align: 'left' }],
      rows: section.rows.map((r) => ({
        ...r,
        cells: [...r.cells, { sourceType: 'static', value: '' }],
      })),
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
    onChange({
      ...section,
      rows: [
        ...section.rows,
        {
          id: sectionId(),
          cells: section.columns.map(() => ({ sourceType: 'static', value: '' })),
        },
      ],
    });
  };
  const removeRow = (idx) => {
    onChange({ ...section, rows: section.rows.filter((_, i) => i !== idx) });
  };
  const duplicateRow = (idx) => {
    const row = section.rows[idx];
    const clone = { ...JSON.parse(JSON.stringify(row)), id: sectionId() };
    const rows = [...section.rows];
    rows.splice(idx + 1, 0, clone);
    onChange({ ...section, rows });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--rb-accent)' }}>Table Label</label>
        <input value={section.label || ''} onChange={(e) => onChange({ ...section, label: e.target.value })} className="rb-input-base w-full text-[12px]" placeholder="e.g. Sender" />
      </div>

      {/* Column Headers */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Columns</span>
          <button onClick={addColumn} className="flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded"
            style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
            <Plus size={10} /> Column
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {section.columns.map((col, i) => (
            <div key={col.id} className="flex items-center gap-1 p-1 rounded-md" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
              <input
                value={col.header}
                onChange={(e) => updateColumn(i, { header: e.target.value })}
                className="rb-input-base text-[10px] py-0.5 px-1.5 w-24"
              />
              <select value={col.align || 'left'} onChange={(e) => updateColumn(i, { align: e.target.value })}
                className="rb-input-base text-[9px] py-0.5 px-1 w-16">
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
              {section.columns.length > 1 && (
                <button onClick={() => removeColumn(i)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                  <X size={10} className="text-red-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data Rows */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--rb-accent)' }}>Rows ({section.rows.length})</span>
          <button onClick={addRow} className="flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded"
            style={{ color: 'var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
            <Plus size={10} /> Row
          </button>
        </div>
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {section.rows.map((row, ri) => (
            <div key={row.id} className="p-2 rounded-lg" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Row {ri + 1}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[8px]" style={{ color: 'var(--rb-text-muted)' }} title="Hide this row when the reference bin tag value is 0 (inactive)">
                    <input
                      type="checkbox"
                      checked={row.hideWhenInactive || false}
                      onChange={(e) => updateRow(ri, { hideWhenInactive: e.target.checked })}
                      className="rounded"
                      style={{ width: 12, height: 12 }}
                    />
                    Hide inactive
                  </label>
                  {row.hideWhenInactive && (
                    <select
                      value={row.hideReferenceCol ?? 0}
                      onChange={(e) => updateRow(ri, { hideReferenceCol: Number(e.target.value) })}
                      className="rb-input-base text-[8px] py-0 px-1"
                      title="Column to check — row hides when this cell's resolved value is 0"
                    >
                      {section.columns.map((col, ci) => (
                        <option key={ci} value={ci}>{col.header}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex gap-0.5">
                    <button onClick={() => duplicateRow(ri)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5" title="Duplicate row">
                      <Copy size={10} style={{ color: 'var(--rb-text-muted)' }} />
                    </button>
                    {section.rows.length > 1 && (
                      <button onClick={() => removeRow(ri)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete row">
                        <Trash2 size={10} className="text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${section.columns.length}, 1fr)` }}>
                {row.cells.map((cell, ci) => (
                  <div key={ci}>
                    <div className="text-[8px] font-semibold mb-0.5 truncate" style={{ color: 'var(--rb-text-muted)' }}>{section.columns[ci]?.header}</div>
                    <CellEditor cell={cell} tags={tags} onChange={(c) => updateCell(ri, ci, c)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--rb-text)' }}>
          <input type="checkbox" checked={section.showSummaryRow || false} onChange={(e) => onChange({ ...section, showSummaryRow: e.target.checked })} className="rounded" />
          Summary row
        </label>
        {section.showSummaryRow && (
          <>
            <input value={section.summaryLabel || ''} onChange={(e) => onChange({ ...section, summaryLabel: e.target.value })}
              className="rb-input-base text-[10px] py-1 px-2 w-24" placeholder="Label" />
            <input value={section.summaryFormula || ''} onChange={(e) => onChange({ ...section, summaryFormula: e.target.value })}
              className="rb-input-base text-[10px] py-1 px-2 flex-1 font-mono" placeholder="{Tag1} + {Tag2}" />
            <input value={section.summaryUnit || ''} onChange={(e) => onChange({ ...section, summaryUnit: e.target.value })}
              className="rb-input-base text-[10px] py-1 px-2 w-12" placeholder="Unit" />
          </>
        )}
      </div>
    </div>
  );
}

function TextBlockEditor({ section, onChange }) {
  return (
    <div className="space-y-3">
      <input value={section.content} onChange={(e) => onChange({ ...section, content: e.target.value })}
        className="rb-input-base w-full text-[12px]" placeholder="Enter text..." />
      <div className="flex items-center gap-3">
        <select value={section.fontSize || '14px'} onChange={(e) => onChange({ ...section, fontSize: e.target.value })} className="rb-input-base text-[10px] py-1 px-2">
          <option value="11px">Small (11px)</option>
          <option value="14px">Medium (14px)</option>
          <option value="18px">Large (18px)</option>
          <option value="22px">X-Large (22px)</option>
        </select>
        <select value={section.fontWeight || '600'} onChange={(e) => onChange({ ...section, fontWeight: e.target.value })} className="rb-input-base text-[10px] py-1 px-2">
          <option value="400">Normal</option>
          <option value="600">Semi-bold</option>
          <option value="700">Bold</option>
        </select>
        <div className="flex items-center gap-1">
          {['left', 'center', 'right'].map((a) => (
            <button key={a} onClick={() => onChange({ ...section, align: a })} className="p-1 rounded"
              style={{ background: section.align === a ? 'var(--rb-accent-subtle)' : 'transparent', color: section.align === a ? 'var(--rb-accent)' : 'var(--rb-text-muted)' }}>
              {a === 'left' ? <AlignLeft size={12} /> : a === 'center' ? <AlignCenter size={12} /> : <AlignRight size={12} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpacerEditor({ section, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Height:</span>
      <input type="range" min={8} max={80} value={section.height} onChange={(e) => onChange({ ...section, height: Number(e.target.value) })} className="flex-1" />
      <span className="text-[10px] font-mono tabular-nums w-8 text-right" style={{ color: 'var(--rb-text)' }}>{section.height}px</span>
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
    <div className="space-y-2">
      {section.fields.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2">
          <input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} className="rb-input-base text-[10px] py-1 px-2 w-32" placeholder="Label" />
          <input value={f.value || ''} onChange={(e) => updateField(i, { value: e.target.value })} className="rb-input-base text-[10px] py-1 px-2 flex-1" placeholder="Name (optional)" />
          {section.fields.length > 1 && (
            <button onClick={() => removeField(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={11} className="text-red-400" /></button>
          )}
        </div>
      ))}
      <button onClick={addField} className="flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded"
        style={{ color: 'var(--rb-accent)', border: '1px dashed var(--rb-accent)', background: 'var(--rb-accent-subtle)' }}>
        <Plus size={10} /> Add Field
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SECTION CARD (wrapper for each section in the builder)
   ══════════════════════════════════════════════════════════════════ */

function SectionCard({ section, tags, index, total, onUpdate, onRemove, onMove, onDuplicate }) {
  const [expanded, setExpanded] = useState(true);
  const meta = SECTION_TYPES.find((s) => s.type === section.type) || SECTION_TYPES[0];
  const Icon = meta.icon;

  const renderEditor = () => {
    switch (section.type) {
      case 'header': return <HeaderSectionEditor section={section} onChange={onUpdate} />;
      case 'kpi-row': return <KpiRowEditor section={section} tags={tags} onChange={onUpdate} />;
      case 'table': return <TableSectionEditor section={section} tags={tags} onChange={onUpdate} />;
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
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--rb-panel)', border: '1px solid var(--rb-border)', boxShadow: 'var(--rb-elevation-1)' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        style={{ borderBottom: expanded ? '1px solid var(--rb-border)' : 'none' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--rb-accent-subtle)', border: '1px solid rgba(56,189,248,0.12)' }}>
          <Icon size={13} style={{ color: 'var(--rb-accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-semibold truncate block" style={{ color: 'var(--rb-text)' }}>
            {meta.label}
            {section.label ? ` — ${section.label}` : section.title ? ` — ${section.title}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25">
            <ChevronUp size={12} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25">
            <ChevronDown size={12} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
          <button onClick={onDuplicate} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
            <Copy size={12} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
          <button onClick={onRemove} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 size={12} className="text-red-400" />
          </button>
        </div>
        <div className="ml-1">
          {expanded ? <ChevronUp size={14} style={{ color: 'var(--rb-text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--rb-text-muted)' }} />}
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
            <div className="p-4">
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
const A4_USABLE_HEIGHT = A4_PAGE_HEIGHT_PX - 2 * A4_PAGE_PADDING_PX - 20; // minus footer

export function PaginatedReportPreview({ sections, tagValues, dateRange, compact = false }) {
  const containerRef = useRef(null);
  const [pageBreaks, setPageBreaks] = useState([]);

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
  }, [compact, sections, tagValues]);

  const totalRows = (sections || []).filter((s) => s.type === 'table').reduce((sum, s) => sum + (s.rows?.length || 0), 0);

  // Build rendered sections
  const renderedSections = (sections || []).map((section) => {
    switch (section.type) {
      /* ── Header ─── */
      case 'header':
        return (
          <div key={section.id} className="mb-3" style={{ textAlign: section.align || 'center' }}>
            <h1 className="text-[18px] font-bold tracking-tight text-[#0f172a] mb-0.5">
              {section.title || 'Untitled Report'}
            </h1>
            {section.subtitle && (
              <p className="text-[11px] text-[#64748b] mb-0.5">{section.subtitle}</p>
            )}
            {section.showDateRange && dateRange && (
              <p className="text-[10px] text-[#94a3b8] font-medium">
                ({formatDate(dateRange.from)} to {formatDate(dateRange.to)})
              </p>
            )}
            <div className="mt-2 h-[1.5px] w-full" style={{ background: 'linear-gradient(90deg, #0284c7, #22d3ee, #0284c7)' }} />
          </div>
        );

      /* ── KPI Row ─── */
      case 'kpi-row':
        return (
          <div key={section.id} className="mb-2">
            {section.label && (
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{section.label}</div>
            )}
            <div className="flex justify-end gap-4 flex-wrap">
              {(section.kpis || []).map((kpi) => (
                <div key={kpi.id} className="text-right">
                  <span className="text-[9px] font-medium text-[#64748b]">{kpi.label}: </span>
                  <span className="text-[12px] font-bold text-[#0f172a] tabular-nums">{renderResolvedValue(resolveKpiValue(kpi, tagValues))}</span>
                </div>
              ))}
            </div>
          </div>
        );

      /* ── Table ─── */
      case 'table':
        return (
          <div key={section.id} className="mb-2">
            {section.label && (
              <div className="text-[11px] font-bold text-[#0f172a] mb-1">{section.label}</div>
            )}
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  {(section.columns || []).map((col) => (
                    <th
                      key={col.id}
                      className="px-2 py-1 font-bold border border-[#d1d5db] bg-[#f1f5f9] text-[#334155]"
                      style={{ textAlign: col.align || 'left', width: col.width !== 'auto' ? col.width : undefined }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(section.rows || []).filter((row) => !isRowHidden(row, section, tagValues)).map((row, ri) => (
                  <tr key={row.id} className={ri % 2 === 1 ? 'bg-[#f8fafc]' : ''}>
                    {(row.cells || []).map((cell, ci) => {
                      const col = section.columns[ci];
                      return (
                        <td
                          key={ci}
                          className="px-2 py-0.5 border border-[#e2e8f0]"
                          style={{ textAlign: col?.align || 'left' }}
                        >
                          {renderResolvedValue(resolveCellValue(cell, tagValues))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {section.showSummaryRow && (
                  <tr className="font-bold bg-[#f1f5f9]">
                    <td
                      className="px-2 py-1 border border-[#d1d5db] text-right"
                      colSpan={Math.max(1, (section.columns || []).length - 1)}
                    >
                      {section.summaryLabel || 'Total'}
                    </td>
                    <td className="px-2 py-1 border border-[#d1d5db] text-right tabular-nums">
                      {renderResolvedValue(resolveCellValue({
                        sourceType: section.summaryFormula ? 'formula' : 'static',
                        formula: section.summaryFormula,
                        value: '',
                        unit: section.summaryUnit,
                        decimals: 1,
                      }, tagValues))}
                    </td>
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
                  <div className="text-[9px] font-medium text-[#64748b] mb-6">{f.label}</div>
                  <div className="border-b border-[#cbd5e1] pb-1">
                    <span className="text-[10px] text-[#334155]">{f.value || '\u00a0'}</span>
                  </div>
                  <div className="text-[8px] text-[#94a3b8] mt-1">Date: _______________</div>
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
          {currentPageSections}
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 text-[8px] text-[#94a3b8] print:text-[7pt]">
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
        {currentPageSections}
        {!compact && (
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 text-[8px] text-[#94a3b8] print:text-[7pt]">
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
      className={`bg-white text-[#1a1a2e] font-[Inter,system-ui,sans-serif] ${compact ? '' : 'shadow-lg'}`}
      style={{
        width: compact ? '100%' : '210mm',
        padding: compact ? '12px' : '8mm 10mm',
        margin: compact ? 0 : '0 auto',
        border: compact ? 'none' : '1px solid #e5e7eb',
        borderRadius: compact ? 0 : '2px',
        lineHeight: 1.4,
      }}
    >
      {compact ? renderedSections : pagesOutput}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN BUILDER COMPONENT
   ══════════════════════════════════════════════════════════════════ */

export default function PaginatedReportBuilder() {
  const { id: templateId } = useParams();
  const navigate = useNavigate();
  const { template, loading, saving, dirty, saveLayout, updateMeta } = useReportCanvas(templateId);
  const { tags } = useAvailableTags();

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

  // Collect tag names from all sections (tables, KPIs)
  const tagNames = useMemo(() => collectPaginatedTagNames(sections), [sections]);

  // Fetch live tag values for preview (initial + refresh every 15s)
  useEffect(() => {
    if (tagNames.length === 0) return;
    const fetchValues = async () => {
      try {
        const res = await axios.post('/api/tags/get-values', { tag_names: tagNames }, { timeout: 10000 });
        if (res.data?.status === 'success' && res.data.tag_values) {
          setLiveTagValues((prev) => ({ ...prev, ...res.data.tag_values }));
        }
      } catch {
        // API unavailable (e.g. demo mode); keep previous values or empty
      }
    };
    fetchValues();
    const intervalId = setInterval(fetchValues, 15000);
    return () => clearInterval(intervalId);
  }, [tagNames.join(',')]);

  // Load sections from template
  useEffect(() => {
    if (!template || hasLoadedOnce) return;
    const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
    setSections(lc.paginatedSections || [defaultSection('header'), defaultSection('table')]);
    setReportMeta({ name: template.name || '', description: template.description || '' });
    setHasLoadedOnce(true);
  }, [template, hasLoadedOnce]);

  // Autosave debounce
  const triggerSave = useCallback((updatedSections) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!template || !templateId) return;
      const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
      const payload = { layout_config: { ...lc, paginatedSections: updatedSections, reportType: 'paginated', grid: { ...(lc.grid || {}), pageMode: lc.grid?.pageMode || 'a4' } } };
      // Use the API directly
      import('../../API/reportBuilderApi').then(({ reportBuilderApi }) => {
        reportBuilderApi.update(templateId, payload).catch(() => {});
      });
    }, 2000);
  }, [template, templateId]);

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
      reportBuilderApi.update(templateId, payload).catch(() => {});
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
          />
        </div>
      </div>
    );
  }

  /* ── EDITOR MODE ── */
  return (
    <div className="report-builder min-h-screen" style={{ background: 'var(--rb-surface)' }}>
      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-20 px-4 py-2.5 flex items-center gap-3"
        style={{ background: 'var(--rb-panel)', borderBottom: '1px solid var(--rb-border)', boxShadow: 'var(--rb-elevation-1)' }}>
        <button onClick={() => navigate('/report-builder')} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
          <ArrowLeft size={16} style={{ color: 'var(--rb-text)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <input
            value={reportMeta.name}
            onChange={(e) => setReportMeta((p) => ({ ...p, name: e.target.value }))}
            className="text-[14px] font-bold bg-transparent border-none outline-none w-full truncate"
            style={{ color: 'var(--rb-text)' }}
            placeholder="Report Name"
          />
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--rb-text-muted)' }}>
            Paginated Report Builder
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewMode(true)} className="rb-btn-ghost flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <Eye size={14} /> Preview
          </button>
          <button onClick={handleManualSave} className="rb-btn-primary flex items-center gap-1.5"
            style={{ boxShadow: '0 0 16px var(--rb-accent-glow)' }}>
            <Save size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Save</span>
          </button>
        </div>
      </div>

      {/* ── Main content: Editor + Live Preview ── */}
      <div className="flex gap-0 min-h-[calc(100vh-130px)]">
        {/* Left: Section editor list */}
        <div className="w-[540px] flex-shrink-0 overflow-y-auto p-3 space-y-2.5 min-w-0"
          style={{ borderRight: '1px solid var(--rb-border)', maxHeight: 'calc(100vh - 130px)' }}>

          <AnimatePresence mode="popLayout">
            {sections.map((section, idx) => (
              <SectionCard
                key={section.id}
                section={section}
                tags={tags}
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
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200"
              style={{
                border: '2px dashed var(--rb-border)',
                color: 'var(--rb-text-muted)',
                background: showAddPalette ? 'var(--rb-accent-subtle)' : 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--rb-accent)'; e.currentTarget.style.color = 'var(--rb-accent)'; }}
              onMouseLeave={(e) => { if (!showAddPalette) { e.currentTarget.style.borderColor = 'var(--rb-border)'; e.currentTarget.style.color = 'var(--rb-text-muted)'; } }}
            >
              <Plus size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wider">Add Section</span>
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

        {/* Right: Live preview (A4 or full) */}
        <div className="flex-1 overflow-auto p-3 relative" style={{ background: '#e5e7eb' }}>
          <div className="sticky top-0 z-10 mb-4 flex items-center justify-center">
            <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(8px)' }}>
              {pageMode === 'a4' ? 'A4 Preview — Live' : 'Full width — Live'}
            </span>
          </div>
          <div className={pageMode === 'a4' ? 'max-w-[1200px] mx-auto' : 'w-full'}>
            <PaginatedReportPreview
              sections={sections}
              tagValues={liveTagValues}
              dateRange={{ from: new Date().toISOString(), to: new Date().toISOString() }}
              compact={pageMode === 'full'}
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
