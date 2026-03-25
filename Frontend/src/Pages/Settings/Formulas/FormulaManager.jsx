import React, { useState, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit3, Trash2, FlaskConical, X, Beaker } from 'lucide-react';
import FormulaEditor from '../../ReportBuilder/formulas/FormulaEditor';
import { useEmulator } from '../../../Context/EmulatorContext';
import { useAvailableTags } from '../../../Hooks/useReportBuilder';
import { evaluateFormula } from '../../ReportBuilder/formulas/formulaEngine';
import { DarkModeContext } from '../../../Context/DarkModeProvider';
import ConfirmationModal from '../../../Components/Common/ConfirmationModal';
import '../../ReportBuilder/reportBuilderTheme.css';

function useTheme() {
  const { mode } = useContext(DarkModeContext);
  const dark = mode === 'dark';
  return {
    dark,
    pageBg: dark ? '#0a0f1a' : '#f3f4f6',
    surface: dark ? '#111827' : '#ffffff',
    surfaceAlt: dark ? '#0a0f1a' : '#f9fafb',
    border: dark ? '#1e293b' : '#e5e7eb',
    text: dark ? '#f0f4f8' : '#111827',
    textSecondary: dark ? '#8899ab' : '#6b7280',
    textMuted: dark ? '#556677' : '#9ca3af',
    accent: dark ? '#22d3ee' : '#0369a1',
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    hoverBg: dark ? 'rgba(10,15,26,0.4)' : 'rgba(0,0,0,0.03)',
    modalBg: dark ? '#111827' : '#ffffff',
    modalInputBg: dark ? '#0a0f1a' : '#f9fafb',
    btnText: dark ? '#0a0f1a' : '#ffffff',
    cardHoverBorder: dark ? 'rgba(34,211,238,0.3)' : 'rgba(3,105,161,0.25)',
    unitBg: dark ? 'rgba(71,85,105,0.15)' : 'rgba(71,85,105,0.08)',
    unitColor: dark ? '#94a3b8' : '#475569',
  };
}

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
  const [editing, setEditing] = useState(undefined);
  const [draft, setDraft] = useState({ name: '', formula: '', unit: '', description: '' });
  const { tags } = useAvailableTags();
  const { tagValues, enabled: emulatorOn } = useEmulator();
  const t = useTheme();

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

  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', description: '', onConfirm: null, confirmText: '', confirmColor: 'brand' });
  const handleDelete = (id) => {
    setConfirmModal({ open: true, title: 'Delete Formula', description: 'Delete this formula?', confirmText: 'Delete', confirmColor: 'red', onConfirm: () => {
      const updated = formulas.filter(f => f.id !== id); save(updated); setFormulas(updated);
      setConfirmModal(m => ({ ...m, open: false }));
    }});
  };

  const isFormOpen = editing !== undefined;

  return (
    <div className="min-h-[calc(100vh-72px)]" style={{ background: t.pageBg }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 lg:px-12 py-6 md:py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold" style={{ color: t.text }}>Saved Formulas</h1>
            <p className="text-sm mt-1" style={{ color: t.textSecondary }}>Reusable formulas available in Report Builder</p>
          </div>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: t.accent, color: t.btnText, '--tw-ring-color': t.accent, '--tw-ring-offset-color': t.pageBg }}
          >
            <Plus size={16} strokeWidth={2.5} /> New Formula
          </button>
        </div>

        {formulas.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-32 text-center rounded-xl shadow-sm relative overflow-hidden"
            style={{ background: t.surface, border: `1px solid ${t.border}` }}
          >
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
              <FlaskConical size={36} style={{ color: t.accent }} />
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: t.text }}>No saved formulas</h3>
            <p className="text-sm mb-8 max-w-sm" style={{ color: t.textSecondary }}>Create reusable formulas to use across your reports.</p>
            <button
              onClick={openNew}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110 shadow-md hover:shadow-lg"
              style={{ background: t.accent, color: t.btnText }}
            >
              <Plus size={16} /> Create First Formula
            </button>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div
              className="grid grid-cols-[1.5fr_2fr_100px_80px] items-center px-6 py-4 text-[11px] uppercase tracking-wider font-bold"
              style={{ color: t.textMuted, borderBottom: `1px solid ${t.border}`, background: t.dark ? 'rgba(10,15,26,0.5)' : 'rgba(0,0,0,0.02)' }}
            >
              <span>Name</span>
              <span>Expression</span>
              <span>Live Value</span>
              <span className="text-right">Actions</span>
            </div>
            {formulas.map((f) => {
              const liveResult = emulatorOn ? evaluateFormula(f.formula, tagValues) : null;
              return (
                <div
                  key={f.id}
                  className="grid grid-cols-[1.5fr_2fr_100px_80px] items-center px-6 py-4 transition-all duration-200 group cursor-default"
                  style={{ borderBottom: `1px solid ${t.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <FlaskConical size={14} className="flex-shrink-0" style={{ color: t.accent }} />
                      <span className="text-[15px] font-semibold truncate" style={{ color: t.text }}>{f.name}</span>
                      {f.unit && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                          style={{ background: t.unitBg, color: t.unitColor }}
                        >
                          {f.unit}
                        </span>
                      )}
                    </div>
                    {f.description && <p className="text-xs truncate" style={{ color: t.textSecondary }}>{f.description}</p>}
                  </div>

                  <code
                    className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg truncate inline-flex items-center gap-0.5 flex-wrap"
                    style={{ color: t.textSecondary, background: t.surfaceAlt, border: `1px solid ${t.border}` }}
                  >
                    <FormulaWithChips formula={f.formula} />
                  </code>

                  <span className="text-sm font-mono font-medium" style={{ color: emulatorOn && liveResult != null ? (t.dark ? '#34d399' : '#059669') : t.textMuted }}>
                    {emulatorOn && liveResult != null
                      ? `${typeof liveResult === 'number' ? liveResult.toFixed(2) : String(liveResult)}${f.unit ? ` ${f.unit}` : ''}`
                      : '—'}
                  </span>

                  <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => openEdit(f)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: t.textSecondary }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = t.accent; e.currentTarget.style.background = t.accentBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = t.textSecondary; e.currentTarget.style.background = ''; }}
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="p-2 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400"
                      style={{ color: t.textSecondary }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isFormOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => setEditing(undefined)}
        >
          <div
            className="report-builder w-full max-w-lg rounded-xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col mx-4"
            style={{ background: t.modalBg, border: `1px solid ${t.border}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: t.accentBg }}>
                  <FlaskConical size={16} style={{ color: t.accent }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: t.text }}>{editing ? 'Edit Formula' : 'New Formula'}</h2>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>Formula Definition</p>
                </div>
              </div>
              <button onClick={() => setEditing(undefined)} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textSecondary }}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-5 min-h-0">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>Name *</label>
                <input
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                  style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}
                  placeholder="e.g. Milling Loss"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>Unit</label>
                  <input
                    value={draft.unit}
                    onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                    style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}
                    placeholder="e.g. %"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>Description</label>
                  <input
                    value={draft.description}
                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                    style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}
                    placeholder="What this calculates"
                  />
                </div>
              </div>
              <div className="relative">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>Formula Expression *</label>
                <FormulaEditor value={draft.formula} onChange={v => setDraft(d => ({ ...d, formula: v }))} tags={tags} tagValues={tagValues} />
              </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0" style={{ borderTop: `1px solid ${t.border}` }}>
              <button
                onClick={() => setEditing(undefined)}
                className="px-4 py-2 text-xs font-medium rounded-lg transition-colors"
                style={{ color: t.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!draft.name.trim() || !draft.formula.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: t.accent, color: t.btnText }}
              >
                {editing ? 'Save' : 'Create Formula'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <ConfirmationModal isOpen={confirmModal.open} title={confirmModal.title} description={confirmModal.description} onConfirm={confirmModal.onConfirm || (() => {})} onCancel={() => setConfirmModal(m => ({ ...m, open: false }))} confirmText={confirmModal.confirmText} confirmColor={confirmModal.confirmColor} />
    </div>
  );
}
