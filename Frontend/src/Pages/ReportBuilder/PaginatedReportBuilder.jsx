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
  Table2, Hash, Type, Minus, Copy, X,
  AlignLeft, AlignCenter, AlignRight, LayoutTemplate, PenLine,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReportCanvas, useAvailableTags } from '../../Hooks/useReportBuilder';
import { evaluateFormula, extractTagRefs } from './formulas/formulaEngine';
import { getCachedMappings, refreshMappingsCache } from '../../utils/mappingsCache';

refreshMappingsCache();

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ══════════════════════════════════════════════════════════════════ */

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

function resolveCellValue(cell, tagValues) {
  if (!cell) return '—';
  if (cell.sourceType === 'static') return cell.value ?? '';
  if (cell.sourceType === 'tag') {
    const raw = tagValues?.[cell.tagName];
    if (raw == null) return '—';
    const n = Number(raw);
    if (isNaN(n)) return raw;
    const d = cell.decimals ?? 1;
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    return cell.unit ? `${formatted} ${cell.unit}` : formatted;
  }
  if (cell.sourceType === 'formula') {
    const result = evaluateFormula(cell.formula || '', tagValues);
    if (result == null) return '—';
    const n = Number(result);
    if (isNaN(n)) return result;
    const d = cell.decimals ?? 1;
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    return cell.unit ? `${formatted} ${cell.unit}` : formatted;
  }
  if (cell.sourceType === 'mapping') {
    const mappings = getCachedMappings();
    const mapping = mappings?.find((m) => m.mapping_name === cell.mappingName);
    if (!mapping) return '—';
    const raw = tagValues?.[cell.tagName];
    const key = String(Math.round(Number(raw)));
    return mapping.lookup?.[key] ?? raw ?? '—';
  }
  return '—';
}

function resolveKpiValue(kpi, tagValues) {
  return resolveCellValue({
    sourceType: kpi.sourceType || 'tag',
    tagName: kpi.tagName,
    formula: kpi.formula,
    unit: kpi.unit,
    decimals: kpi.decimals,
  }, tagValues);
}

/* ── Collect all tag names from paginated config ─────────────────── */

export function collectPaginatedTagNames(sections) {
  const names = new Set();
  if (!Array.isArray(sections)) return [];
  sections.forEach((s) => {
    if (s.type === 'kpi-row' && Array.isArray(s.kpis)) {
      s.kpis.forEach((k) => {
        if (k.tagName) names.add(k.tagName);
        if (k.formula) extractTagRefs(k.formula).forEach((t) => names.add(t));
      });
    }
    if (s.type === 'table' && Array.isArray(s.rows)) {
      s.rows.forEach((row) => {
        if (Array.isArray(row.cells)) {
          row.cells.forEach((cell) => {
            if (cell.tagName) names.add(cell.tagName);
            if (cell.formula) extractTagRefs(cell.formula).forEach((t) => names.add(t));
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
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <select
        value={srcType}
        onChange={(e) => onChange({ ...cell, sourceType: e.target.value })}
        className="rb-input-base text-[10px] py-1 px-2"
      >
        <option value="static">Static Text</option>
        <option value="tag">Tag</option>
        <option value="formula">Formula</option>
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
        <div className="flex gap-1">
          <select
            value={cell.tagName || ''}
            onChange={(e) => onChange({ ...cell, tagName: e.target.value })}
            className="rb-input-base text-[10px] py-1 px-2 flex-1 min-w-0"
          >
            <option value="">Select tag...</option>
            {tags.map((t) => (
              <option key={t.tag_name} value={t.tag_name}>{t.display_name || t.tag_name}</option>
            ))}
          </select>
          <input
            type="text"
            value={cell.unit || ''}
            onChange={(e) => onChange({ ...cell, unit: e.target.value })}
            placeholder="Unit"
            className="rb-input-base text-[10px] py-1 px-2 w-12"
          />
        </div>
      )}
      {srcType === 'formula' && (
        <div className="flex gap-1">
          <input
            type="text"
            value={cell.formula || ''}
            onChange={(e) => onChange({ ...cell, formula: e.target.value })}
            placeholder="{Tag1} + {Tag2}"
            className="rb-input-base text-[10px] py-1 px-2 flex-1 font-mono"
          />
          <input
            type="text"
            value={cell.unit || ''}
            onChange={(e) => onChange({ ...cell, unit: e.target.value })}
            placeholder="Unit"
            className="rb-input-base text-[10px] py-1 px-2 w-12"
          />
        </div>
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
        <div className="flex gap-1.5 flex-wrap">
          {section.columns.map((col, i) => (
            <div key={col.id} className="flex items-center gap-1 p-1 rounded-md" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
              <input
                value={col.header}
                onChange={(e) => updateColumn(i, { header: e.target.value })}
                className="rb-input-base text-[10px] py-0.5 px-1.5 w-20"
              />
              <select value={col.align || 'left'} onChange={(e) => updateColumn(i, { align: e.target.value })}
                className="rb-input-base text-[9px] py-0.5 px-1 w-14">
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
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {section.rows.map((row, ri) => (
            <div key={row.id} className="p-2 rounded-lg" style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold" style={{ color: 'var(--rb-text-muted)' }}>Row {ri + 1}</span>
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

export function PaginatedReportPreview({ sections, tagValues, dateRange, compact = false }) {
  const formatDate = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return d; }
  };

  return (
    <div className={`bg-white text-[#1a1a2e] font-[Inter,system-ui,sans-serif] ${compact ? '' : 'shadow-lg'}`}
      style={{
        width: compact ? '100%' : '210mm',
        minHeight: compact ? 'auto' : '297mm',
        padding: compact ? '16px' : '20mm 18mm',
        margin: compact ? 0 : '0 auto',
        border: compact ? 'none' : '1px solid #e5e7eb',
        borderRadius: compact ? 0 : '4px',
        lineHeight: 1.5,
      }}
    >
      {(sections || []).map((section) => {
        switch (section.type) {
          /* ── Header ─── */
          case 'header':
            return (
              <div key={section.id} className="mb-6" style={{ textAlign: section.align || 'center' }}>
                <h1 className="text-[20px] font-bold tracking-tight text-[#0f172a] mb-1">
                  {section.title || 'Untitled Report'}
                </h1>
                {section.subtitle && (
                  <p className="text-[12px] text-[#64748b] mb-1">{section.subtitle}</p>
                )}
                {section.showDateRange && dateRange && (
                  <p className="text-[11px] text-[#94a3b8] font-medium">
                    ({formatDate(dateRange.from)} to {formatDate(dateRange.to)})
                  </p>
                )}
                <div className="mt-3 h-[2px] w-full" style={{ background: 'linear-gradient(90deg, #0284c7, #22d3ee, #0284c7)' }} />
              </div>
            );

          /* ── KPI Row ─── */
          case 'kpi-row':
            return (
              <div key={section.id} className="mb-5">
                {section.label && (
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">{section.label}</div>
                )}
                <div className="flex justify-end gap-6 flex-wrap">
                  {(section.kpis || []).map((kpi) => (
                    <div key={kpi.id} className="text-right">
                      <span className="text-[10px] font-medium text-[#64748b]">{kpi.label}: </span>
                      <span className="text-[13px] font-bold text-[#0f172a] tabular-nums">{resolveKpiValue(kpi, tagValues)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );

          /* ── Table ─── */
          case 'table':
            return (
              <div key={section.id} className="mb-5">
                {section.label && (
                  <div className="text-[12px] font-bold text-[#0f172a] mb-2">{section.label}</div>
                )}
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr>
                      {(section.columns || []).map((col) => (
                        <th
                          key={col.id}
                          className="px-3 py-2 font-bold border border-[#d1d5db] bg-[#f1f5f9] text-[#334155]"
                          style={{ textAlign: col.align || 'left', width: col.width !== 'auto' ? col.width : undefined }}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(section.rows || []).map((row, ri) => (
                      <tr key={row.id} className={ri % 2 === 1 ? 'bg-[#f8fafc]' : ''}>
                        {(row.cells || []).map((cell, ci) => {
                          const col = section.columns[ci];
                          return (
                            <td
                              key={ci}
                              className="px-3 py-1.5 border border-[#e2e8f0]"
                              style={{ textAlign: col?.align || 'left' }}
                            >
                              {resolveCellValue(cell, tagValues)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {section.showSummaryRow && (
                      <tr className="font-bold bg-[#f1f5f9]">
                        <td
                          className="px-3 py-2 border border-[#d1d5db] text-right"
                          colSpan={Math.max(1, (section.columns || []).length - 1)}
                        >
                          {section.summaryLabel || 'Total'}
                        </td>
                        <td className="px-3 py-2 border border-[#d1d5db] text-right tabular-nums">
                          {resolveCellValue({
                            sourceType: section.summaryFormula ? 'formula' : 'static',
                            formula: section.summaryFormula,
                            value: '',
                            unit: section.summaryUnit,
                            decimals: 1,
                          }, tagValues)}
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
              <div key={section.id} className="mb-3" style={{
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
              <div key={section.id} className="mt-8 mb-4">
                <div className="flex gap-12">
                  {(section.fields || []).map((f) => (
                    <div key={f.id} className="flex-1">
                      <div className="text-[10px] font-medium text-[#64748b] mb-8">{f.label}</div>
                      <div className="border-b border-[#cbd5e1] pb-1">
                        <span className="text-[11px] text-[#334155]">{f.value || '\u00a0'}</span>
                      </div>
                      <div className="text-[9px] text-[#94a3b8] mt-1">Date: _______________</div>
                    </div>
                  ))}
                </div>
              </div>
            );

          default:
            return null;
        }
      })}

      {/* Records count footer */}
      {(() => {
        const totalRows = (sections || []).filter((s) => s.type === 'table').reduce((sum, s) => sum + (s.rows?.length || 0), 0);
        if (totalRows === 0) return null;
        return (
          <div className="mt-4 text-[9px] text-[#94a3b8]">
            Records: {totalRows}
          </div>
        );
      })()}
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
  const saveTimerRef = useRef(null);

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
      const payload = { layout_config: { ...lc, paginatedSections: updatedSections, reportType: 'paginated' } };
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
    const payload = { layout_config: { ...lc, paginatedSections: sections, reportType: 'paginated' } };
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
        <div className="py-8" style={{ background: '#e5e7eb' }}>
          <PaginatedReportPreview
            sections={sections}
            tagValues={{}}
            dateRange={{ from: new Date().toISOString(), to: new Date().toISOString() }}
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
        <div className="w-[480px] flex-shrink-0 overflow-y-auto p-4 space-y-3"
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

        {/* Right: Live A4 preview */}
        <div className="flex-1 overflow-auto p-6" style={{ background: '#e5e7eb' }}>
          <div className="sticky top-0 z-10 mb-4 flex items-center justify-center">
            <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(8px)' }}>
              A4 Preview — Live
            </span>
          </div>
          <PaginatedReportPreview
            sections={sections}
            tagValues={{}}
            dateRange={{ from: new Date().toISOString(), to: new Date().toISOString() }}
          />
        </div>
      </div>
    </div>
  );
}
