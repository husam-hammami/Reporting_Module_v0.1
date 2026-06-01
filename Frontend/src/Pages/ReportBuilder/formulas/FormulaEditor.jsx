import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, CheckCircle2, X, Plus, Zap,
  Code2, Blocks, Search, Hash,
} from 'lucide-react';
import { validateFormula, evaluateFormula, AVAILABLE_FUNCTIONS } from './formulaEngine';

const OPERATORS = [
  { symbol: '+', label: 'Add' },
  { symbol: '-', label: 'Subtract' },
  { symbol: '*', label: 'Multiply' },
  { symbol: '/', label: 'Divide' },
  { symbol: '(', label: '(' },
  { symbol: ')', label: ')' },
];

function parseToBlocks(formula) {
  if (!formula) return [];
  const blocks = [];
  const regex = /\{([^}]+)\}|([A-Z_]+)\s*\(|([+\-*/%()])|([\d.]+)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(formula)) !== null) {
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
  if (lastIndex < formula.length) {
    const tail = formula.slice(lastIndex).trim();
    if (tail) blocks.push({ type: 'raw', value: tail });
  }
  return blocks;
}

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

function BlockChip({ block, onRemove, tagMeta }) {
  const baseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all duration-150';

  const styleMap = {
    tag: `${baseClasses} bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] border-[color-mix(in_srgb,var(--rb-accent)_25%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]`,
    function: `${baseClasses} bg-[var(--rb-warning-subtle)] text-[var(--rb-warning)] border-[color-mix(in_srgb,var(--rb-warning)_25%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]`,
    operator: `${baseClasses} bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border-[var(--rb-border)] min-w-[28px] justify-center font-mono text-[12px]`,
    number: `${baseClasses} bg-[var(--rb-surface)] text-[var(--rb-text)] border-[var(--rb-border)] font-mono tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.04)]`,
    raw: `${baseClasses} bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border-[var(--rb-border)]`,
  };

  const displayName = block.type === 'tag' && tagMeta?.[block.value]
    ? tagMeta[block.value]
    : block.value;

  return (
    <span className={styleMap[block.type] || styleMap.raw}>
      {block.type === 'tag' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--rb-accent)] flex-shrink-0 opacity-70" />}
      {block.type === 'function' && <Zap size={10} className="flex-shrink-0 opacity-70" />}
      <span className={block.type === 'number' || block.type === 'function' ? 'font-mono' : ''}>
        {displayName}
      </span>
      {onRemove && (block.type === 'tag' || block.type === 'function' || block.type === 'number') && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 p-0.5 rounded-full text-current opacity-40 hover:opacity-100 hover:bg-[rgba(0,0,0,0.08)] dark:hover:bg-[rgba(255,255,255,0.1)] transition-all duration-150"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export default function FormulaEditor({ value, onChange, tags, tagValues, onSaveAsSignal }) {
  const editorRef = useRef(null);
  const [mode, setMode] = useState('visual');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showFuncPicker, setShowFuncPicker] = useState(false);
  const [showNumberInput, setShowNumberInput] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [cursorIndex, setCursorIndex] = useState(Infinity);
  const blockAreaRef = useRef(null);
  const tagTriggerRef = useRef(null);

  const portalThemeClass = useMemo(() => {
    if (!editorRef.current) return 'report-builder';
    const rb = editorRef.current.closest('.report-builder');
    if (rb && rb.classList.contains('dark-mode')) return 'report-builder dark-mode';
    return 'report-builder';
  }, [showTagPicker, showFuncPicker]);
  const funcTriggerRef = useRef(null);
  const [tagPickerRect, setTagPickerRect] = useState(null);
  const [funcPickerRect, setFuncPickerRect] = useState(null);

  useEffect(() => {
    if (!showTagPicker || !tagTriggerRef.current) return setTagPickerRect(null);
    const rect = tagTriggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const dropdownH = 300;
    const spaceBelow = vh - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const openAbove = spaceBelow < 150 || (spaceBelow < dropdownH && spaceAbove > spaceBelow);
    const pickerWidth = Math.max(280, rect.width);
    if (openAbove) {
      const maxH = Math.min(dropdownH, spaceAbove);
      setTagPickerRect({ bottom: vh - rect.top + 6, left: rect.left, width: pickerWidth, maxH, flipUp: true });
    } else {
      const maxH = Math.min(dropdownH, spaceBelow);
      setTagPickerRect({ top: rect.bottom + 6, left: rect.left, width: pickerWidth, maxH, flipUp: false });
    }
  }, [showTagPicker]);

  useEffect(() => {
    if (!showFuncPicker || !funcTriggerRef.current) return setFuncPickerRect(null);
    const rect = funcTriggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const dropdownH = 280;
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openAbove = spaceBelow < 140 || (spaceBelow < dropdownH && spaceAbove > spaceBelow);
    const pickerWidth = Math.max(240, rect.width);
    if (openAbove) {
      const maxH = Math.min(dropdownH, spaceAbove);
      setFuncPickerRect({ bottom: vh - rect.top + 6, left: rect.left, width: pickerWidth, maxH, flipUp: true });
    } else {
      const maxH = Math.min(dropdownH, spaceBelow);
      setFuncPickerRect({ top: rect.bottom + 6, left: rect.left, width: pickerWidth, maxH, flipUp: false });
    }
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
  const effectiveCursor = Math.min(Math.max(0, cursorIndex), blocks.length);

  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return safeTags;
    const q = tagSearch.toLowerCase();
    return safeTags.filter((t) =>
      t.tag_name?.toLowerCase().includes(q) ||
      t.display_name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }, [safeTags, tagSearch]);

  const insertAtCursor = useCallback((text) => {
    const newTokens = parseToBlocks(text);
    if (!newTokens.length) return;
    const pos = effectiveCursor;
    const newBlocks = [...blocks];
    newBlocks.splice(pos, 0, ...newTokens);
    onChange(blocksToFormula(newBlocks));
    setCursorIndex(pos + newTokens.length);
  }, [blocks, effectiveCursor, onChange]);

  const addTag = useCallback((tagName) => {
    insertAtCursor(`{${tagName}}`);
    setShowTagPicker(false);
    setTagSearch('');
    setTimeout(() => blockAreaRef.current?.focus(), 0);
  }, [insertAtCursor]);

  const addFunction = useCallback((fn) => {
    insertAtCursor(`${fn.name}(`);
    setShowFuncPicker(false);
    setTimeout(() => blockAreaRef.current?.focus(), 0);
  }, [insertAtCursor]);

  const addOperator = useCallback((op) => {
    insertAtCursor(op);
    setTimeout(() => blockAreaRef.current?.focus(), 0);
  }, [insertAtCursor]);

  const addNumber = useCallback(() => {
    if (!numberInput.trim()) return;
    insertAtCursor(numberInput.trim());
    setNumberInput('');
    setShowNumberInput(false);
    setTimeout(() => blockAreaRef.current?.focus(), 0);
  }, [numberInput, insertAtCursor]);

  const removeBlock = useCallback((index) => {
    const newBlocks = blocks.filter((_, i) => i !== index);
    onChange(blocksToFormula(newBlocks));
    setCursorIndex((prev) => {
      const clamped = Math.min(prev, blocks.length);
      return clamped > index ? clamped - 1 : clamped;
    });
  }, [blocks, onChange]);

  const clearAll = useCallback(() => { onChange(''); setCursorIndex(0); }, [onChange]);

  const handleBlockAreaKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCursorIndex((prev) => Math.max(0, Math.min(prev, blocks.length) - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCursorIndex((prev) => Math.min(blocks.length, Math.min(prev, blocks.length) + 1));
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const pos = effectiveCursor;
      if (pos > 0) {
        const newBlocks = blocks.filter((_, i) => i !== pos - 1);
        onChange(blocksToFormula(newBlocks));
        setCursorIndex(pos - 1);
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      const pos = effectiveCursor;
      if (pos < blocks.length) {
        const newBlocks = blocks.filter((_, i) => i !== pos);
        onChange(blocksToFormula(newBlocks));
      }
    }
  }, [blocks, effectiveCursor, onChange]);

  return (
    <div ref={editorRef} className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="rb-segmented-control">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`inline-flex items-center gap-1.5 ${mode === 'visual' ? 'active' : ''}`}
          >
            <Blocks size={12} />
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('advanced')}
            className={`inline-flex items-center gap-1.5 ${mode === 'advanced' ? 'active' : ''}`}
          >
            <Code2 size={12} />
            Advanced
          </button>
        </div>
        {value?.trim() && (
          <div className="flex items-center gap-1.5">
            {validation.valid ? (
              <span className="rb-formula-validation success" style={{ padding: '4px 10px' }}>
                <CheckCircle2 size={12} /> Valid
              </span>
            ) : (
              <span className="rb-formula-validation error" style={{ padding: '4px 10px' }}>
                <AlertCircle size={12} /> {validation.errors.filter((e) => e.type !== 'warning').length} error{validation.errors.filter((e) => e.type !== 'warning').length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {mode === 'visual' ? (
        <>
          <div
            ref={blockAreaRef}
            tabIndex={0}
            onKeyDown={handleBlockAreaKeyDown}
            onClick={() => { setCursorIndex(blocks.length); blockAreaRef.current?.focus(); }}
            className="min-h-[72px] px-3.5 py-3 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-input)] flex flex-wrap items-center gap-2 content-start transition-colors duration-150 focus-within:border-[var(--rb-accent)] focus-within:shadow-[0_0_0_3px_var(--rb-accent-subtle)] cursor-text outline-none"
          >
            {blocks.length === 0 ? (
              <span className="text-[12px] italic text-[var(--rb-text-muted)] select-none pointer-events-none">
                Click here, then use buttons below to build formula
              </span>
            ) : (
              <>
                {blocks.map((block, i) => (
                  <Fragment key={`${i}-${block.value}`}>
                    <span
                      onClick={(e) => { e.stopPropagation(); setCursorIndex(i); blockAreaRef.current?.focus(); }}
                      className="inline-flex items-center self-stretch cursor-text py-1"
                      style={{ width: effectiveCursor === i ? 4 : 2, flexShrink: 0 }}
                    >
                      {effectiveCursor === i && <span className="w-[2px] h-5 rounded-full bg-[var(--rb-accent)] animate-pulse" />}
                    </span>
                    <span onClick={(e) => { e.stopPropagation(); setCursorIndex(i + 1); blockAreaRef.current?.focus(); }}>
                      <BlockChip block={block} onRemove={() => removeBlock(i)} tagMeta={tagMeta} />
                    </span>
                  </Fragment>
                ))}
                {/* Cursor zone after last block + trailing click area */}
                <span
                  onClick={(e) => { e.stopPropagation(); setCursorIndex(blocks.length); blockAreaRef.current?.focus(); }}
                  className="inline-flex items-center flex-1 self-stretch cursor-text min-w-[20px] min-h-[28px] py-1"
                >
                  {effectiveCursor === blocks.length && <span className="w-[2px] h-5 rounded-full bg-[var(--rb-accent)] animate-pulse" />}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); clearAll(); }}
                  className="ml-1 p-1.5 rounded-full text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] transition-all duration-150"
                  title="Clear all"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <button
                ref={tagTriggerRef}
                type="button"
                onClick={() => { setShowTagPicker(!showTagPicker); setShowFuncPicker(false); setShowNumberInput(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[color-mix(in_srgb,var(--rb-accent)_30%,transparent)] bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] hover:bg-[color-mix(in_srgb,var(--rb-accent)_15%,transparent)] active:scale-[0.97] transition-all duration-150 text-[11px] font-semibold tracking-wide uppercase"
              >
                <Plus size={12} />
                Tag
              </button>
              {showTagPicker && tagPickerRect && createPortal(
                <div className={portalThemeClass}>
                  <div className="fixed inset-0 z-[100000]" onClick={() => { setShowTagPicker(false); setTagSearch(''); }} aria-hidden />
                  <div
                    className="fixed z-[100001] rb-formula-dropdown overflow-hidden"
                    style={{
                      ...(tagPickerRect.flipUp
                        ? { bottom: tagPickerRect.bottom }
                        : { top: tagPickerRect.top }),
                      left: Math.max(8, Math.min(tagPickerRect.left, window.innerWidth - tagPickerRect.width - 8)),
                      width: tagPickerRect.width,
                      maxHeight: tagPickerRect.maxH,
                    }}
                  >
                    <div className="p-2.5 border-b border-[var(--rb-border-subtle)] bg-[var(--rb-surface)]">
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--rb-text-muted)]" />
                        <input
                          type="text"
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Search tags..."
                          autoFocus
                          className="rb-input-base w-full pl-9 pr-3 py-2 text-[12px] rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto py-1" style={{ maxHeight: Math.max(100, (tagPickerRect.maxH || 300) - 52) }}>
                      {filteredTags.length === 0 ? (
                        <p className="text-[12px] text-[var(--rb-text-muted)] px-4 py-4 text-center">No tags found</p>
                      ) : (
                        filteredTags.map((tag) => (
                          <button
                            key={tag.tag_name}
                            type="button"
                            onClick={() => addTag(tag.tag_name)}
                            className="rb-formula-dropdown-item w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-medium text-[var(--rb-text)] truncate">{tag.display_name || tag.tag_name}</span>
                              {tag.unit && <span className="text-[10px] font-medium text-[var(--rb-text-muted)] shrink-0 px-1.5 py-0.5 rounded bg-[var(--rb-surface)]">{tag.unit}</span>}
                            </div>
                            {tag.description && (
                              <p className="text-[10px] mt-0.5 truncate text-[var(--rb-text-muted)]">{tag.description}</p>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>

            <span className="rb-toolbar-divider" style={{ height: 16 }} />
            {['+', '-', '*', '/'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => addOperator(sym)}
                title={OPERATORS.find(o => o.symbol === sym)?.label}
                className="w-8 h-8 flex items-center justify-center text-[13px] font-mono font-bold rounded-lg bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border border-[var(--rb-border)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] active:scale-[0.93] transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                {sym}
              </button>
            ))}
            <span className="rb-toolbar-divider" style={{ height: 16 }} />
            {['(', ')'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => addOperator(sym)}
                className="w-8 h-8 flex items-center justify-center text-[13px] font-mono font-bold rounded-lg bg-[var(--rb-surface)] text-[var(--rb-text-muted)] border border-[var(--rb-border)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] active:scale-[0.93] transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                {sym}
              </button>
            ))}
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
                    className="rb-input-base w-16 font-mono py-1.5 text-[12px] rounded-lg tabular-nums"
                  />
                  <button type="button" onClick={addNumber} className="p-1.5 text-[var(--rb-success)] hover:bg-[var(--rb-success-subtle)] rounded-lg transition-all duration-150"><CheckCircle2 size={14} /></button>
                  <button type="button" onClick={() => setShowNumberInput(false)} className="p-1.5 text-[var(--rb-text-muted)] hover:bg-[var(--rb-surface)] rounded-lg transition-all duration-150"><X size={14} /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowNumberInput(true); setShowFuncPicker(false); setShowTagPicker(false); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-surface)] text-[var(--rb-text-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] active:scale-[0.97] transition-all duration-150 text-[11px] font-semibold tracking-wide"
                >
                  <Hash size={11} />
                  123
                </button>
              )}
            </div>

            <div className="relative">
              <button
                ref={funcTriggerRef}
                type="button"
                onClick={() => { setShowFuncPicker(!showFuncPicker); setShowTagPicker(false); setShowNumberInput(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-surface)] text-[var(--rb-text-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] active:scale-[0.97] transition-all duration-150 text-[11px] font-semibold tracking-wide"
              >
                <Zap size={11} />
                Fn
              </button>
              {showFuncPicker && funcPickerRect && createPortal(
                <div className={portalThemeClass}>
                  <div className="fixed inset-0 z-[100000]" onClick={() => setShowFuncPicker(false)} aria-hidden />
                  <div
                    className="fixed z-[100001] rb-formula-dropdown overflow-y-auto py-1"
                    style={{
                      ...(funcPickerRect.flipUp
                        ? { bottom: funcPickerRect.bottom }
                        : { top: funcPickerRect.top }),
                      left: Math.max(8, Math.min(funcPickerRect.left, window.innerWidth - funcPickerRect.width - 8)),
                      width: funcPickerRect.width,
                      maxHeight: funcPickerRect.maxH,
                    }}
                  >
                    {AVAILABLE_FUNCTIONS.map((fn) => (
                      <button
                        key={fn.name}
                        type="button"
                        onClick={() => addFunction(fn)}
                        className="rb-formula-dropdown-item w-full text-left"
                      >
                        <span className="rb-formula-tag-chip font-semibold">{fn.name}()</span>
                        <p className="text-[10px] mt-1 text-[var(--rb-text-muted)]">{fn.description}</p>
                      </button>
                    ))}
                  </div>
                </div>,
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
            className="rb-input-base w-full py-3 font-mono resize-none rounded-lg"
          />
          <p className="rb-caption text-[var(--rb-text-muted)] leading-relaxed">
            Use {'{'}<span className="font-mono">TagName</span>{'}'} for tags. Functions: {AVAILABLE_FUNCTIONS.map((f) => f.name).join(', ')}
          </p>
        </div>
      )}

      {validation.errors.length > 0 && (
        <div className="space-y-1.5">
          {validation.errors.map((err, i) => (
            <div key={i} className={`rb-formula-validation ${err.type === 'warning' ? 'warning' : 'error'}`}>
              <AlertCircle size={12} className="flex-shrink-0" />
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {previewValue !== null && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--rb-text-muted)]">Result</span>
          <span className="text-[13px] font-mono font-bold tabular-nums text-[var(--rb-text)]">
            {typeof previewValue === 'number' ? previewValue.toFixed(2) : String(previewValue)}
          </span>
        </div>
      )}

      {onSaveAsSignal && value?.trim() && validation.valid && (
        <button
          onClick={onSaveAsSignal}
          className="w-full py-2.5 text-[12px] font-medium text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] rounded-lg transition-all duration-150 border border-dashed border-[color-mix(in_srgb,var(--rb-accent)_40%,transparent)] active:scale-[0.99]"
        >
          Save as reusable computed signal
        </button>
      )}
    </div>
  );
}
