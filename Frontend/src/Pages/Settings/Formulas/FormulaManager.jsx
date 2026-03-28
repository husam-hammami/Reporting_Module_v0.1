import React, { useState, useEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit3, Trash2, FlaskConical, X, Copy, Play, ChevronDown, ChevronRight, Search, Check, AlertCircle } from 'lucide-react';
import FormulaEditor from '../../ReportBuilder/formulas/FormulaEditor';
import { useAvailableTags } from '../../../Hooks/useReportBuilder';
import { DarkModeContext } from '../../../Context/DarkModeProvider';
import { useLanguage } from '../../../Hooks/useLanguage';
import axios from '../../../API/axios';
import { toast } from 'react-toastify';
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
    green: dark ? '#34d399' : '#059669',
    greenBg: dark ? 'rgba(52,211,153,0.1)' : 'rgba(5,150,105,0.08)',
  };
}

function FormulaChips({ formula }) {
  if (!formula) return null;
  const parts = [];
  const regex = /\{([^}]+)\}/g;
  let lastIdx = 0, match;
  while ((match = regex.exec(formula)) !== null) {
    if (match.index > lastIdx) parts.push(<span key={`t-${lastIdx}`}>{formula.slice(lastIdx, match.index)}</span>);
    parts.push(<span key={`c-${match.index}`} className="rb-formula-tag-chip">{match[1]}</span>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < formula.length) parts.push(<span key={`t-${lastIdx}`}>{formula.slice(lastIdx)}</span>);
  return <>{parts}</>;
}

const CATEGORY_LABELS = {
  dosing: 'Dosing & Weighing', grinding: 'Grinding', mixing: 'Mixing',
  pelleting: 'Pelleting', general: 'General', production: 'Production',
  quality: 'Quality', maintenance: 'Maintenance', supply_chain: 'Supply Chain',
  intake: 'Intake & Outloading', storage: 'Storage', equipment: 'Equipment',
  custom: 'Custom',
};

/* ── Tag Picker Dropdown ──────────────────────────────────────────────────── */
function TagPicker({ value, onChange, tags, theme: t }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = tags.find(tg => tg.id === value);
  const filtered = tags.filter(tg =>
    tg.tag_name?.toLowerCase().includes(search.toLowerCase()) ||
    tg.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] text-start"
        style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: selected ? t.text : t.textMuted }}>
        <span className="truncate">{selected ? (selected.display_name || selected.tag_name) : 'Select tag...'}</span>
        <ChevronDown size={12} className="flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full max-h-48 rounded-lg shadow-xl overflow-hidden"
            style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div className="p-1.5 border-b" style={{ borderColor: t.border }}>
              <div className="relative">
                <Search size={11} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: t.textMuted }} />
                <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="w-full ps-7 pe-2 py-1 rounded text-[10px] focus:outline-none"
                  style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} />
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto">
              {value && (
                <button onClick={() => { onChange(null); setOpen(false); }}
                  className="w-full text-start px-2.5 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10">
                  Clear selection
                </button>
              )}
              {filtered.slice(0, 50).map(tg => (
                <button key={tg.id} onClick={() => { onChange(tg.id); setOpen(false); setSearch(''); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] transition-colors text-start"
                  style={{ color: tg.id === value ? t.accent : t.text }}
                  onMouseEnter={e => e.currentTarget.style.background = t.hoverBg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {tg.id === value && <Check size={10} />}
                  <span className="truncate font-medium">{tg.display_name || tg.tag_name}</span>
                  {tg.unit && <span style={{ color: t.textMuted }}>{tg.unit}</span>}
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-3 text-[10px] text-center" style={{ color: t.textMuted }}>No tags found</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Variable Assignment Card ─────────────────────────────────────────────── */
function VariableAssignmentCard({ formula, assignments, onSaveAssignments, tags, onTest, testResult, theme: t }) {
  const [localAssignments, setLocalAssignments] = useState({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const map = {};
    (assignments || []).forEach(a => { map[a.variable_name] = { tag_id: a.tag_id, aggregation: a.aggregation || 'last', default_value: a.default_value }; });
    setLocalAssignments(map);
  }, [assignments]);

  const variables = formula.variables || [];
  const assignedCount = variables.filter(v => localAssignments[v.name]?.tag_id).length;
  const allAssigned = assignedCount === variables.length && variables.length > 0;

  const handleSave = () => {
    const arr = variables.map(v => ({
      variable_name: v.name,
      tag_id: localAssignments[v.name]?.tag_id || null,
      aggregation: localAssignments[v.name]?.aggregation || 'last',
      default_value: localAssignments[v.name]?.default_value ?? null,
    }));
    onSaveAssignments(arr);
  };

  return (
    <div className="rounded-lg overflow-hidden transition-all" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-start transition-colors"
        onMouseEnter={e => e.currentTarget.style.background = t.hoverBg}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {expanded ? <ChevronDown size={14} style={{ color: t.textMuted }} /> : <ChevronRight size={14} style={{ color: t.textMuted }} />}
        <FlaskConical size={14} style={{ color: t.accent }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold truncate" style={{ color: t.text }}>{formula.name}</span>
            {formula.unit && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: t.unitBg, color: t.unitColor }}>{formula.unit}</span>}
            {formula.is_builtin && <span className="text-[8px] px-1 py-0.5 rounded font-bold uppercase" style={{ background: t.accentBg, color: t.accent }}>Built-in</span>}
          </div>
          <code className="text-[10px] font-mono truncate block mt-0.5" style={{ color: t.textSecondary }}>
            <FormulaChips formula={formula.formula} />
          </code>
        </div>
        {/* Status badge */}
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0`}
          style={{ background: allAssigned ? t.greenBg : 'rgba(245,158,11,0.1)', color: allAssigned ? t.green : '#f59e0b' }}>
          {allAssigned ? `${assignedCount}/${variables.length} Ready` : `${assignedCount}/${variables.length} Configure`}
        </span>
      </button>

      {/* Expanded: Variable assignments */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${t.border}` }}>
          <p className="text-[10px] pt-3" style={{ color: t.textMuted }}>{formula.description}</p>

          {variables.map(v => (
            <div key={v.name} className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0">
                <span className="text-[10px] font-semibold" style={{ color: t.text }}>{v.name}</span>
                {v.unit && <span className="text-[9px] ms-1" style={{ color: t.textMuted }}>({v.unit})</span>}
              </div>
              <div className="flex-1">
                <TagPicker
                  value={localAssignments[v.name]?.tag_id}
                  onChange={tagId => setLocalAssignments(prev => ({ ...prev, [v.name]: { ...prev[v.name], tag_id: tagId } }))}
                  tags={tags}
                  theme={t}
                />
              </div>
              <select
                value={localAssignments[v.name]?.aggregation || 'last'}
                onChange={e => setLocalAssignments(prev => ({ ...prev, [v.name]: { ...prev[v.name], aggregation: e.target.value } }))}
                className="w-20 px-1.5 py-1.5 rounded-md text-[10px] focus:outline-none"
                style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}>
                <option value="last">Last</option>
                <option value="avg">Avg</option>
                <option value="sum">Sum</option>
                <option value="delta">Delta</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          ))}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2" style={{ borderTop: `1px solid ${t.border}` }}>
            <button onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-colors"
              style={{ background: t.accent, color: t.btnText }}>
              <Check size={10} /> Save Assignments
            </button>
            <button onClick={() => onTest(formula.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-colors"
              style={{ background: t.greenBg, color: t.green, border: `1px solid ${t.green}30` }}>
              <Play size={10} /> Test
            </button>
            {testResult && testResult.formulaId === formula.id && (
              <span className="text-[11px] font-mono font-bold" style={{ color: testResult.value != null ? t.green : '#ef4444' }}>
                {testResult.value != null ? `= ${testResult.value} ${formula.unit || ''}` : 'Error'}
                {testResult.unassigned?.length > 0 && (
                  <span className="text-[9px] ms-2 font-normal" style={{ color: '#f59e0b' }}>
                    ({testResult.unassigned.length} unassigned)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────── */
export default function FormulaManager() {
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plantType, setPlantType] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [assignments, setAssignments] = useState({}); // { formulaId: [...] }
  const [testResult, setTestResult] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=new, object=edit
  const [draft, setDraft] = useState({ name: '', formula: '', unit: '', description: '', category: 'custom', variables: [] });
  const { tags } = useAvailableTags();
  const t = useTheme();
  const { t: tr } = useLanguage();

  // Fetch plant type + formulas
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, formulasRes] = await Promise.all([
        axios.get('/api/plant-config'),
        axios.get('/api/formula-library'),
      ]);
      setPlantType(configRes.data?.plant_type || null);
      setFormulas(formulasRes.data?.data || []);
    } catch (e) {
      console.error('Failed to load formula library:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Bulk load all assignments (single API call instead of N)
  const loadAllAssignments = useCallback(async () => {
    try {
      const res = await axios.get('/api/formula-library/all-assignments');
      setAssignments(res.data?.data || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (formulas.length > 0) loadAllAssignments();
  }, [formulas, loadAllAssignments]);

  const saveAssignments = async (formulaId, arr) => {
    try {
      await axios.post(`/api/formula-library/${formulaId}/assignments`, { assignments: arr });
      toast.success('Assignments saved');
      loadAllAssignments();
    } catch { toast.error('Failed to save assignments'); }
  };

  const handleTest = async (formulaId) => {
    try {
      const res = await axios.post(`/api/formula-library/${formulaId}/test`);
      setTestResult({ formulaId, value: res.data?.value, unassigned: res.data?.unassigned_variables });
    } catch { setTestResult({ formulaId, value: null, unassigned: [] }); }
  };

  const handleClone = async (formulaId) => {
    try {
      await axios.post(`/api/formula-library/${formulaId}/clone`);
      toast.success('Formula cloned as custom');
      fetchData();
    } catch { toast.error('Failed to clone'); }
  };

  const handleDelete = async (formulaId) => {
    if (!window.confirm('Delete this formula? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/formula-library/${formulaId}`);
      toast.success('Formula deleted');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete');
    }
  };

  const handleSaveNew = async () => {
    if (!draft.name.trim() || !draft.formula.trim()) return;
    try {
      if (editing && editing.id) {
        await axios.put(`/api/formula-library/${editing.id}`, { ...draft });
      } else {
        await axios.post('/api/formula-library', { ...draft, plant_type: plantType || 'feed_mill' });
      }
      toast.success(editing?.id ? 'Formula updated' : 'Formula created');
      fetchData();
      setEditing(undefined);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    }
  };

  // Group formulas by category
  const categories = [...new Set(formulas.map(f => f.category))].sort();
  const filtered = activeCategory === 'all' ? formulas : formulas.filter(f => f.category === activeCategory);
  const configuredCount = formulas.filter(f => {
    const vars = f.variables || [];
    const assigned = (assignments[f.id] || []).filter(a => a.tag_id);
    return vars.length > 0 && assigned.length === vars.length;
  }).length;

  const isFormOpen = editing !== undefined;

  return (
    <div className="min-h-[calc(100vh-72px)]" style={{ background: t.pageBg }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 lg:px-12 py-6 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: t.text }}>{tr('formulas.title')}</h1>
            <p className="text-sm mt-1" style={{ color: t.textSecondary }}>
              {plantType ? `${plantType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} — ` : ''}
              {configuredCount}/{formulas.length} {tr('formulas.configured')}
            </p>
          </div>
          <button onClick={() => { setEditing(null); setDraft({ name: '', formula: '', unit: '', description: '', category: 'custom', variables: [] }); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110 shadow-md"
            style={{ background: t.accent, color: t.btnText }}>
            <Plus size={16} strokeWidth={2.5} /> {tr('formulas.newFormula')}
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          <button onClick={() => setActiveCategory('all')}
            className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap"
            style={{
              background: activeCategory === 'all' ? t.accent : 'transparent',
              color: activeCategory === 'all' ? t.btnText : t.textSecondary,
              border: activeCategory === 'all' ? 'none' : `1px solid ${t.border}`,
            }}>
            All ({formulas.length})
          </button>
          {categories.map(cat => {
            const count = formulas.filter(f => f.category === cat).length;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap"
                style={{
                  background: activeCategory === cat ? t.accent : 'transparent',
                  color: activeCategory === cat ? t.btnText : t.textSecondary,
                  border: activeCategory === cat ? 'none' : `1px solid ${t.border}`,
                }}>
                {CATEGORY_LABELS[cat] || cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: t.textMuted }}>{tr('common.loading')}</p>
          </div>
        )}

        {/* No plant type selected */}
        {!loading && !plantType && (
          <div className="text-center py-20 rounded-xl" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <AlertCircle size={32} className="mx-auto mb-4" style={{ color: '#f59e0b' }} />
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: t.text }}>No plant type selected</h3>
            <p className="text-[12px] max-w-sm mx-auto mb-4" style={{ color: t.textMuted }}>
              Select your plant type in Settings to load industry KPIs.
            </p>
            <p className="text-[11px] font-medium px-3 py-1.5 rounded-md inline-block" style={{ background: t.accentBg, color: t.accent }}>
              Settings &gt; System &gt; Plant Type
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && plantType && formulas.length === 0 && (
          <div className="text-center py-20 rounded-xl" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <FlaskConical size={32} className="mx-auto mb-4" style={{ color: t.accent }} />
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: t.text }}>{tr('formulas.noFormulas')}</h3>
            <p className="text-[12px] max-w-sm mx-auto" style={{ color: t.textMuted }}>{tr('formulas.noFormulasDesc')}</p>
          </div>
        )}

        {/* Formula list */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(f => (
              <div key={f.id} className="relative group">
                <VariableAssignmentCard
                  formula={f}
                  assignments={assignments[f.id]}
                  onSaveAssignments={(arr) => saveAssignments(f.id, arr)}
                  tags={tags}
                  onTest={handleTest}
                  testResult={testResult}
                  theme={t}
                />
                {/* Action buttons — top right on hover */}
                <div className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {f.is_builtin && (
                    <button onClick={() => handleClone(f.id)} title="Clone as custom"
                      className="p-1.5 rounded-md transition-colors" style={{ color: t.textMuted }}
                      onMouseEnter={e => { e.currentTarget.style.color = t.accent; e.currentTarget.style.background = t.accentBg; }}
                      onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = ''; }}>
                      <Copy size={12} />
                    </button>
                  )}
                  {!f.is_builtin && (
                    <>
                      <button onClick={() => { setEditing(f); setDraft({ name: f.name, formula: f.formula, unit: f.unit, description: f.description, category: f.category, variables: f.variables || [] }); }}
                        title="Edit" className="p-1.5 rounded-md transition-colors" style={{ color: t.textMuted }}
                        onMouseEnter={e => { e.currentTarget.style.color = t.accent; e.currentTarget.style.background = t.accentBg; }}
                        onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = ''; }}>
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => handleDelete(f.id)} title="Delete"
                        className="p-1.5 rounded-md transition-colors hover:bg-red-500/10 hover:text-red-400" style={{ color: t.textMuted }}>
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create/Edit Formula Modal ── */}
      {isFormOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => setEditing(undefined)}>
          <div className="report-builder w-full max-w-lg rounded-xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col mx-4"
            style={{ background: t.modalBg, border: `1px solid ${t.border}` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: t.accentBg }}>
                  <FlaskConical size={16} style={{ color: t.accent }} />
                </div>
                <h2 className="text-sm font-bold" style={{ color: t.text }}>{editing?.id ? tr('formulas.editFormula') : tr('formulas.newFormula')}</h2>
              </div>
              <button onClick={() => setEditing(undefined)} className="p-1.5 rounded-lg" style={{ color: t.textSecondary }}><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: t.accent }}>Name *</label>
                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}
                  placeholder="e.g. Dosing Accuracy" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: t.accent }}>Unit</label>
                  <input value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} placeholder="e.g. %" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: t.accent }}>Category</label>
                  <input value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }} placeholder="e.g. custom" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: t.accent }}>Description</label>
                <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}
                  placeholder="What this formula calculates" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: t.accent }}>Formula *</label>
                <FormulaEditor value={draft.formula} onChange={v => setDraft(d => ({ ...d, formula: v }))} tags={tags} tagValues={{}} />
              </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0" style={{ borderTop: `1px solid ${t.border}` }}>
              <button onClick={() => setEditing(undefined)} className="px-4 py-2 text-xs font-medium rounded-lg" style={{ color: t.textSecondary }}>
                {tr('common.cancel')}
              </button>
              <button onClick={handleSaveNew} disabled={!draft.name.trim() || !draft.formula.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-40"
                style={{ background: t.accent, color: t.btnText }}>
                {editing?.id ? tr('common.save') : tr('formulas.createFormula')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
