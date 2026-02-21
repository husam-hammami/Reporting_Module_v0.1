import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FaPlus, FaEdit, FaTrash, FaFlask } from 'react-icons/fa';
import FormulaEditor from '../../ReportBuilder/formulas/FormulaEditor';
import { useEmulator } from '../../../Context/EmulatorContext';
import { useAvailableTags } from '../../../Hooks/useReportBuilder';
import { evaluateFormula } from '../../ReportBuilder/formulas/formulaEngine';
import '../../ReportBuilder/reportBuilderTheme.css';

const SEED = [
  { id: 'f1', name: 'Milling Loss', formula: '100 - {Flour_Extraction} - {Bran_Extraction}', unit: '%', description: 'Total milling loss percentage' },
  { id: 'f2', name: 'Specific Energy', formula: '{Power_Consumption} / {Mill_Throughput}', unit: 'kWh/t', description: 'Energy per ton of product' },
  { id: 'f3', name: 'Water Ratio', formula: '{Water_Used} / {Mill_Throughput}', unit: 'L/t', description: 'Water consumption per ton' },
  { id: 'f4', name: 'Extraction Total', formula: '{Flour_Extraction} + {Bran_Extraction}', unit: '%', description: 'Combined flour + bran extraction' },
];

function load() {
  try {
    const s = localStorage.getItem('system_saved_formulas');
    if (s) { const a = JSON.parse(s); if (a.length > 0) return a; }
  } catch { /* ignore */ }
  localStorage.setItem('system_saved_formulas', JSON.stringify(SEED));
  return SEED;
}

function save(arr) {
  localStorage.setItem('system_saved_formulas', JSON.stringify(arr));
  window.dispatchEvent(new Event('formulasUpdated'));
}

/* Render formula with {TagName} as accent-colored chips */
function FormulaWithChips({ formula }) {
  if (!formula) return null;
  const parts = [];
  const regex = /\{([^}]+)\}/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    if (match.index > lastIdx) parts.push(<span key={`t-${lastIdx}`}>{formula.slice(lastIdx, match.index)}</span>);
    parts.push(<span key={`c-${match.index}`} className="rb-formula-tag-chip">{match[1]}</span>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < formula.length) parts.push(<span key={`t-${lastIdx}`}>{formula.slice(lastIdx)}</span>);
  return <>{parts}</>;
}

export default function FormulaManager() {
  const [formulas, setFormulas] = useState(load);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [draft, setDraft] = useState({ name: '', formula: '', unit: '', description: '' });
  const { tags } = useAvailableTags();
  const { tagValues, enabled: emulatorOn } = useEmulator();

  const inputCls = 'w-full text-[12px] rounded-lg border border-[#e3e9f0] bg-white dark:bg-[#131b2d] dark:border-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] placeholder-[#8898aa] px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-[#0e74904d] transition-colors';
  const labelCls = 'text-[11px] font-medium text-[#6b7f94] mb-1.5 block';

  const openNew = () => { setEditing(null); setDraft({ name: '', formula: '', unit: '', description: '' }); };
  const openEdit = (f) => { setEditing(f); setDraft({ name: f.name, formula: f.formula, unit: f.unit || '', description: f.description || '' }); };
  const close = () => setEditing(undefined);

  const handleSave = () => {
    if (!draft.name.trim() || !draft.formula.trim()) return;
    let updated;
    if (editing) {
      updated = formulas.map(f => f.id === editing.id ? { ...f, ...draft } : f);
    } else {
      updated = [...formulas, { id: `f_${Date.now()}`, ...draft }];
    }
    save(updated);
    setFormulas(updated);
    setEditing(undefined);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this formula?')) return;
    const updated = formulas.filter(f => f.id !== id);
    save(updated);
    setFormulas(updated);
  };

  const isFormOpen = editing !== undefined;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">Saved Formulas</h2>
          <p className="text-[11px] text-[#8898aa] mt-0.5">Reusable formulas available in Report Builder</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
          <FaPlus size={10} /> New Formula
        </button>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {formulas.length === 0 && (
          <div className="text-center py-12 text-[12px] text-[#8898aa]">No saved formulas. Create one to reuse across reports.</div>
        )}
        {formulas.map((f) => {
          const liveResult = emulatorOn ? evaluateFormula(f.formula, tagValues) : null;
          return (
            <div key={f.id} className="bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FaFlask size={12} className="text-[#7c3aed] flex-shrink-0" />
                    <h3 className="text-[13px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{f.name}</h3>
                    {f.unit && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f5f3ff] text-[#7c3aed] font-medium">{f.unit}</span>}
                  </div>
                  {f.description && <p className="text-[11px] text-[#8898aa] mb-2">{f.description}</p>}
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] font-mono text-[#6b7f94] bg-[#f5f8fb] dark:bg-[#0d1825] px-2 py-1 rounded border border-[#e3e9f0] dark:border-[#1e2d40] truncate max-w-[400px] inline-flex items-center gap-0.5 flex-wrap"><FormulaWithChips formula={f.formula} /></code>
                    {emulatorOn && liveResult != null && (
                      <span className="text-[12px] font-semibold text-[#059669] dark:text-[#34d399] flex-shrink-0">
                        = {typeof liveResult === 'number' ? liveResult.toFixed(2) : String(liveResult)}{f.unit ? ` ${f.unit}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-3">
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded-md text-[#6b7f94] hover:text-brand hover:bg-brand-subtle transition-colors"><FaEdit size={12} /></button>
                  <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded-md text-[#6b7f94] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"><FaTrash size={12} /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit/Create modal — portal to body so dropdowns don't clip */}
      {isFormOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center" onClick={() => setEditing(undefined)}>
          <div className="report-builder bg-white dark:bg-[#131b2d] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-[#e3e9f0] dark:border-[#1e2d40] flex-shrink-0">
              <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">{editing ? 'Edit Formula' : 'New Formula'}</h2>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-4 min-h-0">
              <div>
                <label className={labelCls}>Name *</label>
                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className={inputCls} placeholder="e.g. Milling Loss" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Unit</label>
                  <input value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))} className={inputCls} placeholder="e.g. %" />
                </div>
                <div>
                  <label className={labelCls}>Description</label>
                  <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} className={inputCls} placeholder="What this calculates" />
                </div>
              </div>
              <div className="relative">
                <label className={labelCls}>Formula Expression *</label>
                <FormulaEditor value={draft.formula} onChange={v => setDraft(d => ({ ...d, formula: v }))} tags={tags} tagValues={tagValues} />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#e3e9f0] dark:border-[#1e2d40] flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setEditing(undefined)} className="px-4 py-2 text-[11px] font-medium rounded-lg border border-[#e3e9f0] text-[#6b7f94] hover:bg-[#f5f8fb] transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={!draft.name.trim() || !draft.formula.trim()} className="px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white disabled:opacity-40 transition-colors">
                {editing ? 'Save' : 'Create Formula'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
