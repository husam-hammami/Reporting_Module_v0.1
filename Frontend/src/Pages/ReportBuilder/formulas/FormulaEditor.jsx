import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, CheckCircle2, X, Plus, Zap,
  Code2, Blocks, Search,
} from 'lucide-react';
import { validateFormula, evaluateFormula, AVAILABLE_FUNCTIONS } from './formulaEngine';

/* ── Operator buttons ──────────────────────────────────────────── */

const OPERATORS = [
  { symbol: '+', label: 'Add' },
  { symbol: '-', label: 'Subtract' },
  { symbol: '*', label: 'Multiply' },
  { symbol: '/', label: 'Divide' },
  { symbol: '(', label: '(' },
  { symbol: ')', label: ')' },
];

/* ── Parse formula string into visual blocks ───────────────────── */

function parseToBlocks(formula) {
  if (!formula) return [];
  const blocks = [];
  const regex = /\{([^}]+)\}|([A-Z_]+)\s*\(|([+\-*/%()])|([\d.]+)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(formula)) !== null) {
    // Capture whitespace/filler between tokens
    if (match.index > lastIndex) {
      const gap = formula.slice(lastIndex, match.index).trim();
      if (gap) blocks.push({ type: 'raw', value: gap });
    }
    if (match[1]) {
      blocks.push({ type: 'tag', value: match[1] });
    } else if (match[2]) {
      blocks.push({ type: 'function', value: match[2] });
      blocks.push({ type: 'operator', value: '(' });
    } else if (match[3]) {
      blocks.push({ type: 'operator', value: match[3] });
    } else if (match[4]) {
      blocks.push({ type: 'number', value: match[4] });
    }
    lastIndex = match.index + match[0].length;
  }
  // Trailing content
  if (lastIndex < formula.length) {
    const tail = formula.slice(lastIndex).trim();
    if (tail) blocks.push({ type: 'raw', value: tail });
  }
  return blocks;
}

/* ── Rebuild formula string from blocks ────────────────────────── */

function blocksToFormula(blocks) {
  return blocks
    .map((b) => {
      if (b.type === 'tag') return `{${b.value}}`;
      if (b.type === 'function') return `${b.value}`;
      return b.value;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

/* ── Block chip component ──────────────────────────────────────── */

function BlockChip({ block, onRemove, tagMeta }) {
  const styles = {
    tag: 'bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] border-[var(--rb-accent)]/30',
    function: 'bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] border-[var(--rb-accent)]/30',
    operator: 'bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border-[var(--rb-border)]',
    number: 'bg-[var(--rb-surface)] text-[var(--rb-text)] border-[var(--rb-border)] font-mono',
    raw: 'bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border-[var(--rb-border)]',
  };

  const displayName = block.type === 'tag' && tagMeta?.[block.value]
    ? tagMeta[block.value]
    : block.value;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rb-caption font-medium rounded-md border ${styles[block.type] || styles.raw}`}>
      {block.type === 'tag' && <span className="w-2 h-2 rounded-full bg-[var(--rb-accent)] flex-shrink-0" />}
      {block.type === 'function' && <Zap size={10} className="flex-shrink-0 opacity-70" />}
      <span className={block.type === 'number' || block.type === 'function' ? 'font-mono' : ''}>
        {displayName}
      </span>
      {onRemove && (block.type === 'tag' || block.type === 'function' || block.type === 'number') && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 text-current opacity-50 hover:opacity-100 transition-opacity"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

/* ── Main: Visual Formula Editor ───────────────────────────────── */

export default function FormulaEditor({ value, onChange, tags, tagValues, onSaveAsSignal }) {
  const [mode, setMode] = useState('visual'); // 'visual' | 'advanced'
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showFuncPicker, setShowFuncPicker] = useState(false);
  const [showNumberInput, setShowNumberInput] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const tagTriggerRef = useRef(null);
  const funcTriggerRef = useRef(null);
  const [tagPickerRect, setTagPickerRect] = useState(null);
  const [funcPickerRect, setFuncPickerRect] = useState(null);

  useEffect(() => {
    if (!showTagPicker || !tagTriggerRef.current) return setTagPickerRect(null);
    const rect = tagTriggerRef.current.getBoundingClientRect();
    setTagPickerRect({ top: rect.bottom + 6, left: rect.left, width: Math.max(256, rect.width) });
  }, [showTagPicker]);

  useEffect(() => {
    if (!showFuncPicker || !funcTriggerRef.current) return setFuncPickerRect(null);
    const rect = funcTriggerRef.current.getBoundingClientRect();
    setFuncPickerRect({ top: rect.bottom + 6, left: rect.left, width: Math.max(224, rect.width) });
  }, [showFuncPicker]);

  const safeTags = Array.isArray(tags) ? tags : [];
  const tagNames = useMemo(() => safeTags.map((t) => t.tag_name), [safeTags]);
  const tagMeta = useMemo(() => {
    const m = {};
    safeTags.forEach((t) => { m[t.tag_name] = t.display_name || t.tag_name; });
    return m;
  }, [safeTags]);

  const validation = useMemo(() => validateFormula(value, tagNames), [value, tagNames]);
  const previewValue = useMemo(() => evaluateFormula(value, tagValues || {}), [value, tagValues]);
  const blocks = useMemo(() => parseToBlocks(value || ''), [value]);

  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return safeTags;
    const q = tagSearch.toLowerCase();
    return safeTags.filter((t) =>
      t.tag_name?.toLowerCase().includes(q) ||
      t.display_name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }, [safeTags, tagSearch]);

  // Visual mode: append block to formula
  const appendToFormula = useCallback((text) => {
    const current = (value || '').trim();
    const sep = current && !current.endsWith('(') && text !== ')' ? ' ' : '';
    onChange(current + sep + text);
  }, [value, onChange]);

  const addTag = useCallback((tagName) => {
    appendToFormula(`{${tagName}}`);
    setShowTagPicker(false);
    setTagSearch('');
  }, [appendToFormula]);

  const addFunction = useCallback((fn) => {
    appendToFormula(`${fn.name}(`);
    setShowFuncPicker(false);
  }, [appendToFormula]);

  const addOperator = useCallback((op) => {
    appendToFormula(op);
  }, [appendToFormula]);

  const addNumber = useCallback(() => {
    if (!numberInput.trim()) return;
    appendToFormula(numberInput.trim());
    setNumberInput('');
    setShowNumberInput(false);
  }, [numberInput, appendToFormula]);

  const removeBlock = useCallback((index) => {
    const newBlocks = blocks.filter((_, i) => i !== index);
    onChange(blocksToFormula(newBlocks));
  }, [blocks, onChange]);

  const clearAll = useCallback(() => onChange(''), [onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--rb-surface)] border border-[var(--rb-border)]">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`inline-flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium rounded transition-colors ${
              mode === 'visual' ? 'bg-[var(--rb-panel)] text-[var(--rb-text)] border border-[var(--rb-border)] shadow-sm' : 'text-[var(--rb-text-muted)] hover:text-[var(--rb-text)]'
            }`}
          >
            <Blocks size={12} />
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('advanced')}
            className={`inline-flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium rounded transition-colors ${
              mode === 'advanced' ? 'bg-[var(--rb-panel)] text-[var(--rb-text)] border border-[var(--rb-border)] shadow-sm' : 'text-[var(--rb-text-muted)] hover:text-[var(--rb-text)]'
            }`}
          >
            <Code2 size={12} />
            Advanced
          </button>
        </div>
        {value?.trim() && (
          <div className="flex items-center gap-1.5">
            {validation.valid ? (
              <span className="rb-caption inline-flex items-center gap-1 text-[var(--rb-success)]">
                <CheckCircle2 size={12} /> Valid
              </span>
            ) : (
              <span className="rb-caption inline-flex items-center gap-1 text-[var(--rb-danger)]">
                <AlertCircle size={12} /> {validation.errors.filter((e) => e.type !== 'warning').length} error{validation.errors.filter((e) => e.type !== 'warning').length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {mode === 'visual' ? (
        <>
          <div className="min-h-[64px] px-3 py-2.5 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-input)] flex flex-wrap items-center gap-2 content-start">
            {blocks.length === 0 ? (
              <span className="text-[12px] italic text-[var(--rb-text-muted)]">
                e.g. {'{Pressure_1}'} + {'{Flow_Rate_1}'} / 2 — use buttons below
              </span>
            ) : (
              <>
                {blocks.map((block, i) => (
                  <BlockChip
                    key={`${i}-${block.value}`}
                    block={block}
                    onRemove={() => removeBlock(i)}
                    tagMeta={tagMeta}
                  />
                ))}
                <button
                  onClick={clearAll}
                  className="ml-1 p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] transition-colors"
                  title="Clear all"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Insert group */}
            <div className="relative">
              <button
                ref={tagTriggerRef}
                type="button"
                onClick={() => { setShowTagPicker(!showTagPicker); setShowFuncPicker(false); setShowNumberInput(false); }}
                className="rb-badge rb-body inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--rb-accent)]/30 bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] hover:bg-[var(--rb-accent)]/15 transition-colors font-semibold"
              >
                <Plus size={12} />
                Tag
              </button>
              {showTagPicker && tagPickerRect && createPortal(
                <>
                  <div className="fixed inset-0 z-[99998]" onClick={() => { setShowTagPicker(false); setTagSearch(''); }} aria-hidden />
                  <div
                    className="fixed z-[99999] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] overflow-hidden"
                    style={{ top: tagPickerRect.top, left: tagPickerRect.left, width: tagPickerRect.width, maxHeight: 'min(280px, 50vh)' }}
                  >
                    <div className="p-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f8fafc] dark:bg-[#0b111e]">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8898aa] dark:text-[#6b7f94]" />
                        <input
                          type="text"
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Search tags..."
                          autoFocus
                          className="w-full pl-9 pr-3 py-2 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] placeholder-[#8898aa] focus:outline-none focus:ring-2 focus:ring-[#0e74904d] focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto py-1" style={{ maxHeight: 232 }}>
                      {filteredTags.length === 0 ? (
                        <p className="text-[12px] text-[#8898aa] dark:text-[#6b7f94] px-4 py-4 text-center">No tags found</p>
                      ) : (
                        filteredTags.map((tag) => (
                          <button
                            key={tag.tag_name}
                            type="button"
                            onClick={() => addTag(tag.tag_name)}
                            className="w-full px-4 py-2.5 text-left text-[12px] text-[#3a4a5c] dark:text-[#c1ccd9] hover:bg-brand-subtle dark:hover:bg-[#0f2840] active:bg-[#d6eaf8] dark:active:bg-[#162a45] transition-colors rounded-md mx-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">{tag.display_name || tag.tag_name}</span>
                              {tag.unit && <span className="text-[11px] text-[#6b7f94] dark:text-[#8898aa] shrink-0">{tag.unit}</span>}
                            </div>
                            {tag.description && (
                              <p className="text-[11px] mt-0.5 truncate text-[#6b7f94] dark:text-[#8898aa]">{tag.description}</p>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>

            {/* Arithmetic group */}
            <span className="rb-toolbar-divider" style={{ height: 16 }} />
            {['+', '-', '*', '/'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => addOperator(sym)}
                title={OPERATORS.find(o => o.symbol === sym)?.label}
                className="w-7 h-7 flex items-center justify-center text-sm font-mono font-semibold rounded-md bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border border-[var(--rb-border)] hover:border-[var(--rb-accent)]/40 hover:text-[var(--rb-text)] transition-colors"
              >
                {sym}
              </button>
            ))}
            {/* Grouping */}
            <span className="rb-toolbar-divider" style={{ height: 16 }} />
            {['(', ')'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => addOperator(sym)}
                className="w-7 h-7 flex items-center justify-center text-sm font-mono font-semibold rounded-md bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border border-[var(--rb-border)] hover:border-[var(--rb-accent)]/40 hover:text-[var(--rb-text)] transition-colors"
              >
                {sym}
              </button>
            ))}
            {/* Values group */}
            <span className="rb-toolbar-divider" style={{ height: 16 }} />
            <div className="relative">
              {showNumberInput ? (
                <div className="inline-flex items-center gap-1.5">
                  <input
                    type="number"
                    value={numberInput}
                    onChange={(e) => setNumberInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addNumber(); if (e.key === 'Escape') setShowNumberInput(false); }}
                    placeholder="0"
                    autoFocus
                    className="rb-input-base w-14 font-mono py-1.5 text-[12px] rounded-md"
                  />
                  <button type="button" onClick={addNumber} className="p-1.5 text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] rounded-md"><CheckCircle2 size={12} /></button>
                  <button type="button" onClick={() => setShowNumberInput(false)} className="p-1.5 text-[var(--rb-text-muted)] hover:bg-[var(--rb-surface)] rounded-md"><X size={12} /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowNumberInput(true); setShowFuncPicker(false); setShowTagPicker(false); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--rb-border)] bg-[var(--rb-surface)] text-[var(--rb-text-muted)] hover:border-[var(--rb-accent)]/40 hover:text-[var(--rb-text)] transition-colors text-[12px] font-medium"
                >
                  123
                </button>
              )}
            </div>

            <div className="relative">
              <button
                ref={funcTriggerRef}
                type="button"
                onClick={() => { setShowFuncPicker(!showFuncPicker); setShowTagPicker(false); setShowNumberInput(false); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--rb-border)] bg-[var(--rb-surface)] text-[var(--rb-text-muted)] hover:border-[var(--rb-accent)]/40 hover:text-[var(--rb-text)] transition-colors text-[12px] font-medium"
              >
                <Zap size={12} />
                Fn
              </button>
              {showFuncPicker && funcPickerRect && createPortal(
                <>
                  <div className="fixed inset-0 z-[99998]" onClick={() => setShowFuncPicker(false)} aria-hidden />
                  <div
                    className="fixed z-[99999] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] overflow-y-auto py-1"
                    style={{ top: funcPickerRect.top, left: funcPickerRect.left, width: funcPickerRect.width, maxHeight: 'min(260px, 45vh)' }}
                  >
                    {AVAILABLE_FUNCTIONS.map((fn) => (
                      <button
                        key={fn.name}
                        type="button"
                        onClick={() => addFunction(fn)}
                        className="w-full px-4 py-2.5 text-left text-[12px] text-[#3a4a5c] dark:text-[#c1ccd9] hover:bg-brand-subtle dark:hover:bg-[#0f2840] active:bg-[#d6eaf8] dark:active:bg-[#162a45] transition-colors rounded-md mx-1"
                      >
                        <span className="font-mono font-semibold">{fn.name}()</span>
                        <p className="text-[11px] mt-0.5 text-[#6b7f94] dark:text-[#8898aa]">{fn.description}</p>
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. ({Temperature_1} + {Temperature_2}) / 2"
            rows={3}
            className="rb-input-base w-full py-3 font-mono resize-none"
          />
          <p className="rb-caption text-[var(--rb-text-muted)] leading-relaxed">
            Use {'{'}<span className="font-mono">TagName</span>{'}'} for tags. Functions: {AVAILABLE_FUNCTIONS.map((f) => f.name).join(', ')}
          </p>
        </div>
      )}

      {validation.errors.length > 0 && (
        <div className="space-y-1">
          {validation.errors.map((err, i) => (
            <div key={i} className={`rb-formula-validation ${err.type === 'warning' ? 'warning' : 'error'}`}>
              {err.type === 'warning' ? <AlertCircle size={12} /> : <AlertCircle size={12} />}
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {previewValue !== null && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[var(--rb-surface)] border border-[var(--rb-border)]">
          <span className="text-[11px] text-[var(--rb-text-muted)]">Result:</span>
          <span className="text-[12px] font-mono font-semibold text-[var(--rb-text)]">
            {typeof previewValue === 'number' ? previewValue.toFixed(2) : String(previewValue)}
          </span>
        </div>
      )}

      {onSaveAsSignal && value?.trim() && validation.valid && (
        <button
          onClick={onSaveAsSignal}
          className="w-full py-2.5 rb-body text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] rounded-lg transition-colors border border-dashed border-[var(--rb-accent)]/40"
        >
          Save as reusable computed signal
        </button>
      )}
    </div>
  );
}
