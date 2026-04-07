import { useState, useMemo, useRef, useCallback } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, ChevronLeft, Database, Palette, AlertTriangle, Sliders, MousePointer, Tag, FunctionSquare, Grid3x3, Type, SeparatorHorizontal, ArrowRightLeft, Copy, Move, PanelRightClose, Layers } from 'lucide-react';
import { uid, WIDGET_CATALOG } from '../widgets/widgetDefaults';
import { collectOrderedDrillRowKeys, tagToRowKeyPlaceholder } from '../utils/drillDownTagPick';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import FormulaEditor from '../formulas/FormulaEditor';

function Section({ icon: Icon, title, children, defaultOpen = true, isFirst = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef(null);

  const handleToggle = useCallback(() => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && sectionRef.current) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 280);
    }
  }, [open]);

  return (
    <div ref={sectionRef} className={`border-b border-[var(--rb-border)] last:border-0${!isFirst ? ' border-t border-t-[var(--rb-border)]' : ''}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2.5 py-3 px-5 hover:bg-[var(--rb-surface)] transition-colors text-left group"
      >
        {Icon && (
          <Icon size={14} className="text-[var(--rb-text-muted)] group-hover:text-[var(--rb-accent)] transition-colors" />
        )}
        <span className="flex-1 text-[10px] font-bold text-[var(--rb-text-muted)] uppercase tracking-[0.08em]">{title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDown size={14} className="text-[var(--rb-text-muted)] group-hover:text-[var(--rb-accent)] transition-colors" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, overflow: 'visible' }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0, overflow: 'hidden' }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 pb-4 pt-1 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const AGGREGATION_DESCRIPTIONS = {
  last: 'Most recent value (end of period)',
  first: 'First value (start of period)',
  avg: 'Average over time range',
  sum: 'Total accumulated',
  min: 'Lowest recorded',
  max: 'Highest recorded',
  count: 'Number of data points',
  delta: 'Change from first to last',
};

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[9px] font-bold text-[var(--rb-text-muted)] uppercase tracking-[0.06em]">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', mono = false }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      placeholder={placeholder}
      className={`rb-input-base w-full ${mono ? 'font-mono tabular-nums' : ''}`}
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rb-input-base w-full"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-3 py-0.5">
      <span className="text-[11px] font-medium text-[var(--rb-text-muted)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
        className={`relative w-11 h-[1.375rem] rounded-full transition-all duration-200 flex-shrink-0 ${value ? 'bg-[var(--rb-accent)] shadow-[0_0_8px_var(--rb-accent-glow)]' : 'bg-[var(--rb-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]'}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[1.125rem] h-[1.125rem] rounded-full shadow-sm transition-transform duration-200 ${value ? 'translate-x-[1.125rem] bg-white' : 'bg-[var(--rb-text-muted)]'}`}
          style={{ boxShadow: value ? '0 0 4px var(--rb-accent-glow)' : '0 1px 3px rgba(0,0,0,0.15)' }}
        />
      </button>
    </label>
  );
}

function ColorInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value || 'hsl(199, 72%, 42%)'}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-md border border-[var(--rb-border)] cursor-pointer bg-transparent p-0 hover:border-[var(--rb-accent)] hover:shadow-[0_0_6px_var(--rb-accent-glow)] transition-all"
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#hex"
        className="rb-input-base flex-1 font-mono text-[11px] tabular-nums"
      />
    </div>
  );
}

function TagPicker({ tags, value, onChange, placeholder = 'Select tag...' }) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const filtered = useMemo(() => {
    if (!search.trim()) return safeTags;
    const q = search.toLowerCase();
    return safeTags.filter((t) => t.tag_name?.toLowerCase().includes(q) || t.display_name?.toLowerCase().includes(q));
  }, [safeTags, search]);

  const handleOpen = useCallback(() => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      setTimeout(() => {
        dropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="rb-input-base w-full text-left truncate"
      >
        {value || <span className="text-[var(--rb-text-muted)]">{placeholder}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div ref={dropdownRef} className="absolute z-50 mt-2 w-full rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl max-h-56 overflow-hidden backdrop-blur-sm" data-wheel-scroll>
            <div className="p-2 border-b border-[var(--rb-border)]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                autoFocus
                className="rb-input-base w-full py-2"
              />
            </div>
            <div className="overflow-y-auto max-h-44" data-wheel-scroll>
              {filtered.length === 0 ? (
                <p className="text-[9px] text-[var(--rb-text-muted)] px-4 py-4 text-center">No tags found</p>
              ) : (() => {
                const plcTags = filtered.filter(t => !t.source_type || t.source_type === 'PLC');
                const formulaTags = filtered.filter(t => t.source_type === 'Formula');
                const otherTags = filtered.filter(t => t.source_type && t.source_type !== 'PLC' && t.source_type !== 'Formula');
                const renderTag = (tag) => (
                  <button
                    key={tag.tag_name}
                    onClick={() => { onChange(tag.tag_name); setOpen(false); setSearch(''); }}
                    className={`w-full px-4 py-2 text-left text-[12px] hover:bg-[var(--rb-accent-subtle)] transition-colors ${value === tag.tag_name ? 'bg-[var(--rb-accent-subtle)] border-l-2 border-l-[var(--rb-accent)]' : ''}`}
                  >
                    <span className="font-medium text-[var(--rb-text)]">{tag.display_name || tag.tag_name}</span>
                    {tag.unit && <span className="ml-1 text-[9px] text-[var(--rb-text-muted)]">({tag.unit})</span>}
                  </button>
                );
                const sectionHeader = (label) => (
                  <div key={label} className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--rb-text-muted)] bg-[var(--rb-surface)] border-b border-[var(--rb-border)] sticky top-0">{label}</div>
                );
                return (
                  <>
                    {plcTags.length > 0 && <>{sectionHeader('PLC Tags')}{plcTags.map(renderTag)}</>}
                    {formulaTags.length > 0 && <>{sectionHeader('Formulas')}{formulaTags.map(renderTag)}</>}
                    {otherTags.length > 0 && <>{sectionHeader('Other')}{otherTags.map(renderTag)}</>}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FormulaDropdown({ savedFormulas, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return savedFormulas;
    const q = search.toLowerCase();
    return savedFormulas.filter(f => f.name?.toLowerCase().includes(q) || f.formula?.toLowerCase().includes(q));
  }, [savedFormulas, search]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rb-input-base w-full text-left truncate"
      >
        <span className="text-[var(--rb-text-muted)]">— Pick a saved formula —</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="rb-formula-dropdown absolute z-50 mt-1 w-full" data-wheel-scroll>
            {savedFormulas.length > 5 && (
              <div className="p-2 border-b border-[var(--rb-border)]">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search formulas..."
                  autoFocus
                  className="rb-input-base w-full py-1.5 text-[11px]"
                />
              </div>
            )}
            {filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { onSelect(f); setOpen(false); setSearch(''); }}
                className="rb-formula-dropdown-item w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[var(--rb-text)] truncate">{f.name}</span>
                  {f.unit && <span className="rb-badge bg-[var(--rb-surface)] text-[var(--rb-text-muted)] flex-shrink-0">{f.unit}</span>}
                </div>
                <p className="text-[10px] font-mono text-[var(--rb-text-muted)] truncate mt-0.5">{f.formula}</p>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[9px] text-[var(--rb-text-muted)]">No formulas found</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DataSourceSection({ config, onUpdate, tags, tagValues, groups = [], savedFormulas = [] }) {
  const ds = config.dataSource || { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' };
  const updateDS = (patch) => onUpdate({ dataSource: { ...ds, ...patch } });

  return (
    <Section icon={Database} title="Data Source" defaultOpen={true}>
      <Field label="Source type">
        <SelectInput
          value={ds.type}
          onChange={(v) => updateDS({ type: v })}
          options={[
            { value: 'tag', label: 'Single Tag' },
            { value: 'formula', label: 'Custom Formula' },
            { value: 'group', label: 'Tag Group Aggregate' },
          ]}
        />
      </Field>

      {ds.type === 'tag' && (
        <>
          <Field label="Tag">
            <TagPicker tags={tags} value={ds.tagName} onChange={(v) => updateDS({ tagName: v })} />
          </Field>
          <Field label="Aggregation">
            <SelectInput
              value={ds.aggregation}
              onChange={(v) => updateDS({ aggregation: v })}
              options={[
                { value: 'last', label: 'Last Value' },
                { value: 'avg', label: 'Average' },
                { value: 'sum', label: 'Sum' },
                { value: 'min', label: 'Minimum' },
                { value: 'max', label: 'Maximum' },
                { value: 'count', label: 'Count' },
                { value: 'first', label: 'First (Start)' },
                { value: 'delta', label: 'Delta (Change)' },
              ]}
            />
            {AGGREGATION_DESCRIPTIONS[ds.aggregation] && (
              <p className="text-[9px] text-[var(--rb-text-muted)] mt-1 ml-0.5">↳ {AGGREGATION_DESCRIPTIONS[ds.aggregation]}</p>
            )}
          </Field>
        </>
      )}

      {ds.type === 'formula' && (
        <>
          {savedFormulas.length > 0 && (
            <Field label="Saved formulas">
              <FormulaDropdown
                savedFormulas={savedFormulas}
                onSelect={(f) => updateDS({ formula: f.formula })}
              />
            </Field>
          )}
          <Field label="Formula">
            <FormulaEditor
              value={ds.formula}
              onChange={(v) => updateDS({ formula: v })}
              tags={tags}
              tagValues={tagValues}
            />
          </Field>
        </>
      )}

      {ds.type === 'group' && (
        <>
          {groups.length > 0 && (
            <Field label="Load from group">
              <SelectInput
                value=""
                onChange={(v) => {
                  const g = groups.find(gr => String(gr.id) === v);
                  if (g) {
                    const tagNames = (g.tags || []).map(t => t.tag_name).filter(Boolean);
                    updateDS({ groupTags: tagNames });
                  }
                }}
                options={[
                  { value: '', label: '— Pick a group preset —' },
                  ...groups.map(g => ({ value: String(g.id), label: `${g.group_name} (${g.tags?.length || 0} tags)` })),
                ]}
              />
            </Field>
          )}
          <Field label="Group tags">
            <div className="space-y-1">
              {(ds.groupTags || []).map((gt, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex-1">
                    <TagPicker tags={tags} value={gt} onChange={(v) => {
                      const next = [...(ds.groupTags || [])];
                      next[i] = v;
                      updateDS({ groupTags: next });
                    }} />
                  </div>
                  <button
                    onClick={() => updateDS({ groupTags: (ds.groupTags || []).filter((_, j) => j !== i) })}
                    className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateDS({ groupTags: [...(ds.groupTags || []), ''] })}
                className="text-[9px] font-medium text-[var(--rb-accent)] hover:underline"
              >
                + Add tag to group
              </button>
            </div>
          </Field>
          <Field label="Group aggregation">
            <SelectInput
              value={ds.aggregation}
              onChange={(v) => updateDS({ aggregation: v })}
              options={[
                { value: 'avg', label: 'Average' },
                { value: 'sum', label: 'Sum' },
                { value: 'min', label: 'Minimum' },
                { value: 'max', label: 'Maximum' },
                { value: 'count', label: 'Count' },
                { value: 'first', label: 'First (Start)' },
                { value: 'delta', label: 'Delta (Change)' },
              ]}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function DisplaySection({ widgetType, config, onUpdate, tags = [] }) {
  return (
    <Section icon={Palette} title={widgetType === 'image' ? 'Image' : widgetType === 'logo' ? 'Logo' : widgetType === 'text' ? 'Text' : 'Display'} defaultOpen={true}>
      {widgetType !== 'image' && widgetType !== 'text' && widgetType !== 'logo' && (
        <Field label="Title">
          <TextInput value={config.title} onChange={(v) => onUpdate({ title: v })} placeholder="Widget title" />
        </Field>
      )}

      {widgetType === 'text' && (
        <>
          <Field label="Content">
            <textarea
              value={config.content || ''}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder="Enter text..."
              rows={2}
              className="rb-input-base w-full resize-y"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font size">
              <SelectInput
                value={config.fontSize || '14px'}
                onChange={(v) => onUpdate({ fontSize: v })}
                options={[
                  { value: '10px', label: '10px' },
                  { value: '12px', label: '12px' },
                  { value: '14px', label: '14px' },
                  { value: '16px', label: '16px' },
                  { value: '18px', label: '18px' },
                  { value: '20px', label: '20px' },
                  { value: '24px', label: '24px' },
                  { value: '28px', label: '28px' },
                  { value: '32px', label: '32px' },
                ]}
              />
            </Field>
            <Field label="Weight">
              <SelectInput
                value={config.fontWeight || '600'}
                onChange={(v) => onUpdate({ fontWeight: v })}
                options={[
                  { value: '400', label: 'Normal' },
                  { value: '500', label: 'Medium' },
                  { value: '600', label: 'Semi-bold' },
                  { value: '700', label: 'Bold' },
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Alignment">
              <SelectInput
                value={config.align || 'left'}
                onChange={(v) => onUpdate({ align: v })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
            <Field label="Style">
              <SelectInput
                value={config.fontStyle || 'normal'}
                onChange={(v) => onUpdate({ fontStyle: v })}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'italic', label: 'Italic' },
                ]}
              />
            </Field>
          </div>
          <Field label="Color">
            <ColorInput value={config.color} onChange={(v) => onUpdate({ color: v })} />
          </Field>
        </>
      )}

      {(widgetType === 'kpi' || widgetType === 'stat' || widgetType === 'gauge' || widgetType === 'silo' || widgetType === 'sparkline' || widgetType === 'progress' || widgetType === 'hopper') && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit">
              <TextInput value={config.unit} onChange={(v) => onUpdate({ unit: v })} placeholder="Unit" />
            </Field>
            <Field label="Decimals">
              <TextInput type="number" value={config.decimals} onChange={(v) => onUpdate({ decimals: v })} />
            </Field>
          </div>
          <Field label="Color">
            <ColorInput value={config.color} onChange={(v) => onUpdate({ color: v })} />
          </Field>
          <Toggle
            label="Show title"
            value={config.showTitle !== false}
            onChange={(v) => onUpdate({ showTitle: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Title size">
              <SelectInput
                value={config.titleFontSize || 'md'}
                onChange={(v) => onUpdate({ titleFontSize: v })}
                options={[
                  { value: 'sm', label: 'Small' },
                  { value: 'md', label: 'Medium' },
                  { value: 'lg', label: 'Large' },
                ]}
              />
            </Field>
            {(widgetType === 'kpi' || widgetType === 'stat' || widgetType === 'gauge') && (
              <Field label="Value size">
                <SelectInput
                  value={config.valueFontSize || 'auto'}
                  onChange={(v) => onUpdate({ valueFontSize: v })}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'sm', label: 'Small' },
                    { value: 'md', label: 'Medium' },
                    { value: 'lg', label: 'Large' },
                    { value: 'xl', label: 'X-Large' },
                  ]}
                />
              </Field>
            )}
          </div>
          {(widgetType === 'kpi' || widgetType === 'stat') && (
            <Field label="Alignment">
              <SelectInput
                value={config.align || (widgetType === 'stat' ? 'center' : 'left')}
                onChange={(v) => onUpdate({ align: v })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
          )}
        </>
      )}

      {widgetType === 'kpi' && (
        <Toggle label="Show sparkline" value={config.showSparkline} onChange={(v) => onUpdate({ showSparkline: v })} />
      )}

      {widgetType === 'gauge' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <TextInput type="number" value={config.min} onChange={(v) => onUpdate({ min: v })} />
          </Field>
          <Field label="Max">
            <TextInput type="number" value={config.max} onChange={(v) => onUpdate({ max: v })} />
          </Field>
        </div>
      )}

      {widgetType === 'silo' && (
        <>
          <Field label="Capacity tag (optional)">
            <TagPicker tags={tags} value={config.capacityTag} onChange={(v) => onUpdate({ capacityTag: v })} placeholder="None" />
          </Field>
          <Field label="Tons tag (optional)">
            <TagPicker tags={tags} value={config.tonsTag} onChange={(v) => onUpdate({ tonsTag: v })} placeholder="Auto from level × capacity" />
          </Field>
          <Toggle label="Show tons" value={config.showTons !== false} onChange={(v) => onUpdate({ showTons: v })} />
          <Toggle label="Show capacity" value={config.showCapacity} onChange={(v) => onUpdate({ showCapacity: v })} />
        </>
      )}

      {widgetType === 'progress' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <TextInput type="number" value={config.min} onChange={(v) => onUpdate({ min: v })} />
          </Field>
          <Field label="Max">
            <TextInput type="number" value={config.max} onChange={(v) => onUpdate({ max: v })} />
          </Field>
        </div>
      )}

      {widgetType === 'hopper' && (
        <>
          <Field label="Capacity tag (optional)">
            <TagPicker tags={tags} value={config.capacityTag} onChange={(v) => onUpdate({ capacityTag: v })} placeholder="None" />
          </Field>
          <Toggle label="Show capacity" value={config.showCapacity} onChange={(v) => onUpdate({ showCapacity: v })} />
        </>
      )}

      {widgetType === 'sparkline' && (
        <Field label="Line color">
          <ColorInput value={config.color} onChange={(v) => onUpdate({ color: v })} />
        </Field>
      )}

      {widgetType === 'piechart' && (
        <>
          <Toggle label="Show legend" value={config.showLegend !== false} onChange={(v) => onUpdate({ showLegend: v })} />
          <Toggle label="Doughnut style" value={config.doughnut !== false} onChange={(v) => onUpdate({ doughnut: v })} />
        </>
      )}

      {(widgetType === 'chart' || widgetType === 'barchart') && (
        <>
          <Toggle label="Show legend" value={config.showLegend} onChange={(v) => onUpdate({ showLegend: v })} />
          <Toggle label="Show grid" value={config.showGrid} onChange={(v) => onUpdate({ showGrid: v })} />
          {widgetType === 'barchart' && (
            <Toggle label="Stacked" value={config.stacked} onChange={(v) => onUpdate({ stacked: v })} />
          )}
          <Field label="Background">
            <ColorInput value={config.backgroundColor} onChange={(v) => onUpdate({ backgroundColor: v })} />
          </Field>
          <Field label="Grid">
            <ColorInput value={config.gridColor} onChange={(v) => onUpdate({ gridColor: v })} />
          </Field>
          <Field label="Accent">
            <ColorInput value={config.accentColor} onChange={(v) => onUpdate({ accentColor: v })} />
          </Field>

          <div className="mt-3 pt-3 border-t border-[var(--rb-border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--rb-text-muted)]">Reference Lines</span>
              <button
                onClick={() => {
                  const annotations = [...(config.annotations || []), { label: 'Target', value: 0, color: '#ef4444' }];
                  onUpdate({ annotations });
                }}
                className="text-[9px] font-medium text-[var(--rb-accent)] hover:underline"
              >
                + Add
              </button>
            </div>
            {(config.annotations || []).map((ann, i) => (
              <div key={i} className="flex items-center gap-1.5 mb-1.5">
                <input
                  type="text"
                  value={ann.label || ''}
                  onChange={(e) => {
                    const annotations = [...config.annotations];
                    annotations[i] = { ...annotations[i], label: e.target.value };
                    onUpdate({ annotations });
                  }}
                  placeholder="Label"
                  className="rb-input-base flex-1"
                  style={{ fontSize: '10px', padding: '3px 5px', minWidth: 0 }}
                />
                <input
                  type="number"
                  value={ann.value ?? ''}
                  onChange={(e) => {
                    const annotations = [...config.annotations];
                    annotations[i] = { ...annotations[i], value: e.target.value === '' ? '' : Number(e.target.value) };
                    onUpdate({ annotations });
                  }}
                  placeholder="Value"
                  className="rb-input-base font-mono"
                  style={{ fontSize: '10px', padding: '3px 5px', width: '55px' }}
                />
                <input
                  type="color"
                  value={ann.color || '#ef4444'}
                  onChange={(e) => {
                    const annotations = [...config.annotations];
                    annotations[i] = { ...annotations[i], color: e.target.value };
                    onUpdate({ annotations });
                  }}
                  className="rb-color-swatch"
                  style={{ width: '20px', height: '20px' }}
                />
                <button
                  onClick={() => {
                    const annotations = config.annotations.filter((_, j) => j !== i);
                    onUpdate({ annotations });
                  }}
                  className="text-[10px] text-[var(--rb-danger)] hover:text-[var(--rb-danger)] font-bold px-1"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            {(!config.annotations || config.annotations.length === 0) && (
              <p className="text-[9px] text-[var(--rb-text-muted)] italic">No reference lines. Click + Add to create one.</p>
            )}
          </div>
        </>
      )}

      {widgetType === 'table' && (
        <>
          <Toggle label="Striped rows" value={config.striped} onChange={(v) => onUpdate({ striped: v })} />
          <Toggle label="Compact" value={config.compact} onChange={(v) => onUpdate({ compact: v })} />
          <Toggle label="Show units in cells" value={config.showUnitsInCells} onChange={(v) => onUpdate({ showUnitsInCells: v })} />
          <Toggle
            label="Report header"
            value={config.reportHeader?.show}
            onChange={(v) => onUpdate({ reportHeader: { ...(config.reportHeader || {}), show: v } })}
          />
          {config.reportHeader?.show && (
            <>
              <Field label="Report title">
                <TextInput value={config.reportHeader?.title || ''} onChange={(v) => onUpdate({ reportHeader: { ...config.reportHeader, title: v } })} placeholder="e.g. Mill-A Daily Report" />
              </Field>
              <Field label="Date range">
                <TextInput value={config.reportHeader?.dateRange || ''} onChange={(v) => onUpdate({ reportHeader: { ...config.reportHeader, dateRange: v } })} placeholder="e.g. 05/03/2026 to 06/03/2026" />
              </Field>
              <Field label="Line name">
                <TextInput value={config.reportHeader?.lineName || ''} onChange={(v) => onUpdate({ reportHeader: { ...config.reportHeader, lineName: v } })} placeholder="e.g. MIL-A" />
              </Field>
              <Field label="Line status">
                <TextInput value={config.reportHeader?.lineStatus || ''} onChange={(v) => onUpdate({ reportHeader: { ...config.reportHeader, lineStatus: v } })} placeholder="e.g. Running" />
              </Field>
              <Field label="Produced total">
                <TextInput value={config.reportHeader?.producedTotal || ''} onChange={(v) => onUpdate({ reportHeader: { ...config.reportHeader, producedTotal: v } })} placeholder="e.g. 230372.0 kg" />
              </Field>
              <Field label="Consumed total">
                <TextInput value={config.reportHeader?.consumedTotal || ''} onChange={(v) => onUpdate({ reportHeader: { ...config.reportHeader, consumedTotal: v } })} placeholder="e.g. 234994.0 kg" />
              </Field>
            </>
          )}
          <Field label="Header colors">
            <div className="rb-color-group">
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">bg</span>
              <input type="color" value={config.headerBg || '#1e293b'} onChange={(e) => onUpdate({ headerBg: e.target.value })} className="rb-color-swatch" />
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">text</span>
              <input type="color" value={config.headerColor || '#ffffff'} onChange={(e) => onUpdate({ headerColor: e.target.value })} className="rb-color-swatch" />
            </div>
          </Field>
          <Field label="Section header colors">
            <div className="rb-color-group">
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">bg</span>
              <input type="color" value={config.sectionHeaderBg || '#f1f5f9'} onChange={(e) => onUpdate({ sectionHeaderBg: e.target.value })} className="rb-color-swatch" />
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">text</span>
              <input type="color" value={config.sectionHeaderColor || '#0f172a'} onChange={(e) => onUpdate({ sectionHeaderColor: e.target.value })} className="rb-color-swatch" />
            </div>
          </Field>
          <Field label="Section header border">
            <SelectInput
              value={config.sectionHeaderBorderWidth || '1'}
              onChange={(v) => onUpdate({ sectionHeaderBorderWidth: v })}
              options={[
                { value: '1', label: 'Thin (1px)' },
                { value: '2', label: 'Medium (2px)' },
                { value: '3', label: 'Thick (3px)' },
              ]}
            />
          </Field>
          <Field label="Row colors">
            <div className="rb-color-group">
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">bg</span>
              <input type="color" value={config.rowBg || '#ffffff'} onChange={(e) => onUpdate({ rowBg: e.target.value })} className="rb-color-swatch" />
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">alt</span>
              <input type="color" value={config.stripedRowBg || '#f4f7fa'} onChange={(e) => onUpdate({ stripedRowBg: e.target.value })} className="rb-color-swatch" />
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">border</span>
              <input type="color" value={config.borderColor || '#e2e8f0'} onChange={(e) => onUpdate({ borderColor: e.target.value })} className="rb-color-swatch" />
            </div>
          </Field>
        </>
      )}

      {widgetType === 'datapanel' && (
        <>
          <Field label="Header style">
            <SelectInput
              value={config.headerStyle || 'bar'}
              onChange={(v) => onUpdate({ headerStyle: v })}
              options={[
                { value: 'bar', label: 'Solid bar' },
                { value: 'inline', label: 'Inline with line' },
                { value: 'legend', label: 'Legend (on border)' },
              ]}
            />
          </Field>
          <Field label="Header align">
            <SelectInput
              value={config.headerAlign || 'left'}
              onChange={(v) => onUpdate({ headerAlign: v })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </Field>
          <Field label="Header text size">
            <SelectInput
              value={config.headerFontSize || '12px'}
              onChange={(v) => onUpdate({ headerFontSize: v })}
              options={[
                { value: '9px', label: 'Small (9px)' },
                { value: '11px', label: 'Normal (11px)' },
                { value: '12px', label: 'Default (12px)' },
                { value: '14px', label: 'Large (14px)' },
                { value: '16px', label: 'X-Large (16px)' },
                { value: '18px', label: 'XX-Large (18px)' },
                { value: '20px', label: 'Heading (20px)' },
              ]}
            />
          </Field>
          <Field label="Header colors">
            <div className="rb-color-group">
              {(config.headerStyle || 'bar') === 'bar' && (
                <>
                  <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">bg</span>
                  <input type="color" value={config.headerBg || '#e2e8f0'} onChange={(e) => onUpdate({ headerBg: e.target.value })} className="rb-color-swatch" />
                </>
              )}
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">text</span>
              <input type="color" value={config.headerColor || '#0f172a'} onChange={(e) => onUpdate({ headerColor: e.target.value })} className="rb-color-swatch" />
            </div>
          </Field>
          <Field label="Panel border">
            <div className="rb-color-group">
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">color</span>
              <input type="color" value={config.panelBorder || '#e2e8f0'} onChange={(e) => onUpdate({ panelBorder: e.target.value })} className="rb-color-swatch" />
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">width</span>
              <SelectInput
                value={config.panelBorderWidth || '1'}
                onChange={(v) => onUpdate({ panelBorderWidth: v })}
                options={[
                  { value: '1', label: '1px' },
                  { value: '2', label: '2px' },
                  { value: '3', label: '3px' },
                ]}
              />
            </div>
          </Field>
          <Field label="Panel background">
            <div className="rb-color-group">
              <span className="text-[9px] text-[var(--rb-text-muted)] mr-1">bg</span>
              <input type="color" value={config.panelBg || '#ffffff'} onChange={(e) => onUpdate({ panelBg: e.target.value })} className="rb-color-swatch" />
            </div>
          </Field>
          <Field label="Content padding (px)">
            <TextInput type="number" value={config.contentPadding ?? 6} onChange={(v) => onUpdate({ contentPadding: Math.max(0, Number(v) || 0) })} />
          </Field>
        </>
      )}

      {widgetType === 'image' && (
        <>
          <Field label="Fit mode">
            <SelectInput
              value={config.objectFit || 'contain'}
              onChange={(v) => onUpdate({ objectFit: v })}
              options={[
                { value: 'contain', label: 'Contain' },
                { value: 'cover', label: 'Cover' },
                { value: 'fill', label: 'Stretch' },
              ]}
            />
          </Field>
          <Field label="Border radius">
            <SelectInput
              value={String(config.borderRadius || '0')}
              onChange={(v) => onUpdate({ borderRadius: v })}
              options={[
                { value: '0', label: 'None' },
                { value: '4', label: 'Small' },
                { value: '8', label: 'Medium' },
                { value: '12', label: 'Large' },
                { value: '999', label: 'Circular' },
              ]}
            />
          </Field>
          <Field label="Alt text">
            <TextInput value={config.alt} onChange={(v) => onUpdate({ alt: v })} placeholder="Image description" />
          </Field>
          {config.src && (
            <button
              onClick={() => onUpdate({ src: '' })}
              className="text-[9px] text-[var(--rb-danger)] hover:underline"
            >
              Remove image
            </button>
          )}
        </>
      )}

      {widgetType === 'logo' && (
        <>
          <div className="text-[9px] text-[var(--rb-text-muted)] mb-2">
            Auto-loads client logo from Engineering &gt; Branding settings.
          </div>
          <Field label="Fit mode">
            <SelectInput
              value={config.objectFit || 'contain'}
              onChange={(v) => onUpdate({ objectFit: v })}
              options={[
                { value: 'contain', label: 'Contain' },
                { value: 'cover', label: 'Cover' },
                { value: 'fill', label: 'Stretch' },
              ]}
            />
          </Field>
          <Field label="Border radius">
            <SelectInput
              value={String(config.borderRadius || '0')}
              onChange={(v) => onUpdate({ borderRadius: v })}
              options={[
                { value: '0', label: 'None' },
                { value: '4', label: 'Small' },
                { value: '8', label: 'Medium' },
                { value: '12', label: 'Large' },
              ]}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

const THRESHOLD_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#64748b'];

function ThresholdsSection({ config, onUpdate }) {
  const rules = config.thresholds || [];
  const updateRules = (newRules) => onUpdate({ thresholds: newRules });

  const addRule = () => {
    updateRules([...rules, { condition: 'above', value: 0, valueTo: 0, color: THRESHOLD_COLORS[rules.length % THRESHOLD_COLORS.length] }]);
  };
  const removeRule = (i) => updateRules(rules.filter((_, j) => j !== i));
  const updateRule = (i, patch) => updateRules(rules.map((r, j) => j === i ? { ...r, ...patch } : r));

  return (
    <Section icon={AlertTriangle} title="Thresholds" defaultOpen={false}>
      {rules.length === 0 ? (
        <p className="text-[9px] text-[var(--rb-text-muted)] mb-3">No threshold rules defined</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border-subtle)] transition-colors hover:border-[var(--rb-border)]"
              style={{ borderLeft: `3px solid ${rule.color}` }}
            >
              <div className="flex-shrink-0">
                <input
                  type="color"
                  value={rule.color}
                  onChange={(e) => updateRule(i, { color: e.target.value })}
                  className="w-7 h-7 rounded-md border border-[var(--rb-border)] cursor-pointer bg-transparent p-0 hover:border-[var(--rb-accent)] hover:shadow-[0_0_6px_var(--rb-accent-glow)] transition-all"
                />
              </div>
              <select
                value={rule.condition}
                onChange={(e) => updateRule(i, { condition: e.target.value })}
                className="rb-input-base flex-1 min-w-0 text-xs"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
                <option value="between">Between</option>
                <option value="equals">Equals</option>
              </select>
              <input
                type="number"
                value={rule.value}
                onChange={(e) => updateRule(i, { value: Number(e.target.value) })}
                className="rb-input-base w-16 font-mono tabular-nums text-xs"
              />
              {rule.condition === 'between' && (
                <>
                  <span className="text-[9px] text-[var(--rb-text-muted)]">to</span>
                  <input
                    type="number"
                    value={rule.valueTo}
                    onChange={(e) => updateRule(i, { valueTo: Number(e.target.value) })}
                    className="rb-input-base w-16 font-mono tabular-nums text-xs"
                  />
                </>
              )}
              <button
                onClick={() => removeRule(i)}
                className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] rounded-md transition-all"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button onClick={addRule} className="inline-flex items-center gap-1.5 text-[9px] font-medium text-[var(--rb-accent)] hover:underline mt-2">
        <Plus size={12} />
        Add threshold rule
      </button>
    </Section>
  );
}

function ChartSeriesSection({ config, onUpdate, tags, tagValues, savedFormulas = [] }) {
  const series = config.series || [];
  const updateSeries = (newSeries) => onUpdate({ series: newSeries });
  const addBtnRef = useRef(null);

  const addSeries = () => {
    updateSeries([...series, {
      dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'avg' },
      label: `Series ${series.length + 1}`,
      color: '',
    }]);
    setTimeout(() => {
      addBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const removeSeries = (i) => updateSeries(series.filter((_, j) => j !== i));

  const updateSeriesItem = (i, patch) => updateSeries(series.map((s, j) => j === i ? { ...s, ...patch } : s));

  return (
    <Section icon={Database} title="Data Series" defaultOpen={true}>
      {series.length === 0 ? (
        <p className="text-[9px] text-[var(--rb-text-muted)] mb-3">No data series added</p>
      ) : (
        <div className="space-y-3">
          {series.map((s, i) => (
            <div key={i} className="p-3 rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[var(--rb-text-muted)] uppercase tracking-[0.06em]">Series {i + 1}</span>
                <button onClick={() => removeSeries(i)} className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] rounded-md transition-all">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Label">
                    <TextInput value={s.label} onChange={(v) => updateSeriesItem(i, { label: v })} placeholder="Series label" />
                  </Field>
                </div>
                <input
                  type="color"
                  value={s.color || ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#ec4899','#8b5cf6','#06b6d4'][i % 8]}
                  onChange={(e) => updateSeriesItem(i, { color: e.target.value })}
                  title="Series color"
                  className="w-8 h-8 rounded-md border border-[var(--rb-border)] cursor-pointer bg-transparent p-0 hover:border-[var(--rb-accent)] transition-all flex-shrink-0 mb-0.5"
                />
              </div>
              <Field label="Source type">
                <SelectInput
                  value={s.dataSource?.type || 'tag'}
                  onChange={(v) => updateSeriesItem(i, { dataSource: { ...s.dataSource, type: v } })}
                  options={[
                    { value: 'tag', label: 'Single Tag' },
                    { value: 'formula', label: 'Custom Formula' },
                  ]}
                />
              </Field>
              {(s.dataSource?.type || 'tag') === 'tag' ? (
                <Field label="Tag">
                  <TagPicker tags={tags} value={s.dataSource?.tagName || ''} onChange={(v) => updateSeriesItem(i, { dataSource: { ...s.dataSource, tagName: v } })} />
                </Field>
              ) : (
                <>
                  {savedFormulas.length > 0 && (
                    <Field label="Saved formulas">
                      <SelectInput
                        value=""
                        onChange={(v) => {
                          const f = savedFormulas.find(sf => sf.id === v);
                          if (f) updateSeriesItem(i, { dataSource: { ...s.dataSource, formula: f.formula } });
                        }}
                        options={[
                          { value: '', label: '— Pick a saved formula —' },
                          ...savedFormulas.map(f => ({ value: f.id, label: `${f.name}${f.unit ? ` (${f.unit})` : ''}` })),
                        ]}
                      />
                    </Field>
                  )}
                  <Field label="Formula">
                    <FormulaEditor
                      value={s.dataSource?.formula || ''}
                      onChange={(v) => updateSeriesItem(i, { dataSource: { ...s.dataSource, formula: v } })}
                      tags={tags}
                      tagValues={tagValues}
                    />
                  </Field>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <button ref={addBtnRef} onClick={addSeries} className="inline-flex items-center gap-1.5 text-[9px] font-medium text-[var(--rb-accent)] hover:underline mt-2">
        <Plus size={12} />
        Add data series
      </button>
    </Section>
  );
}

import { getCachedMappings, refreshMappingsCache } from '../../../utils/mappingsCache';
refreshMappingsCache();

function TableColumnsSection({ config, onUpdate, tags, tagValues, savedFormulas = [] }) {
  const safeConfig = config || {};
  const columns = Array.isArray(safeConfig.tableColumns) ? safeConfig.tableColumns : [];
  const updateColumns = (newCols) => onUpdate({ tableColumns: newCols });
  const mappings = getCachedMappings();
  const addColRef = useRef(null);

  const getSourcePreview = (col) => {
    const src = col.sourceType || 'tag';
    if (src === 'tag') return col.tagName || 'Not configured';
    if (src === 'formula') return col.formula ? (col.formula.length > 34 ? `${col.formula.slice(0, 32)}...` : col.formula) : 'Not configured';
    if (src === 'group') return (col.groupTags || []).length ? `${col.groupTags.slice(0, 2).join(', ')}${col.groupTags.length > 2 ? ` +${col.groupTags.length - 2}` : ''}` : 'Not configured';
    if (src === 'static') return col.staticValue || 'Not configured';
    if (src === 'mapping') return col.mappingName || 'Not configured';
    return 'Not configured';
  };

  const addColumn = (sourceType) => {
    updateColumns([...columns, {
      label: sourceType === 'static' ? 'Label' : `Column ${columns.length + 1}`,
      sourceType: sourceType || 'tag',
      tagName: '',
      formula: '',
      groupTags: [],
      aggregation: 'last',
      staticValue: '',
      mappingName: '',
      unit: '',
      decimals: 1,
      align: 'left',
      width: 120,
      format: 'number',
      thresholds: [],
      group: '',
      cellBg: '',
      cellColor: '',
      fontWeight: '',
    }]);
    setTimeout(() => {
      addColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const removeColumn = (i) => updateColumns(columns.filter((_, j) => j !== i));
  const updateColumn = (i, patch) => updateColumns(columns.map((c, j) => j === i ? { ...c, ...patch } : c));

  const moveColumn = (from, to) => {
    if (to < 0 || to >= columns.length) return;
    const arr = [...columns];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    updateColumns(arr);
  };

  const SOURCE_ICONS = { tag: Tag, formula: FunctionSquare, group: Grid3x3, static: Type, mapping: ArrowRightLeft };

  return (
    <Section icon={Database} title="Table Columns" defaultOpen={true}>
      <p className="text-[9px] text-[var(--rb-text-muted)] mb-3">
        <span className="font-medium text-[var(--rb-text)]">Data Table</span>
        <span className="mx-1">&rsaquo;</span>
        {columns.length} column{columns.length !== 1 ? 's' : ''}
      </p>
      {columns.length === 0 ? (
        <p className="text-[9px] text-[var(--rb-text-muted)] mb-3">
          Define columns for your table. Each column can be a tag value, formula, group aggregate, or static text.
        </p>
      ) : (
        <div className="space-y-2">
          {columns.map((col, i) => (
            <details key={i} className="group/col rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] overflow-hidden">
              <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none list-none text-[12px]">
                <div className="flex flex-col gap-0">
                  <button
                    onClick={(e) => { e.preventDefault(); moveColumn(i, i - 1); }}
                    disabled={i === 0}
                    className="text-[9px] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] disabled:opacity-30 leading-none py-0.5"
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); moveColumn(i, i + 1); }}
                    disabled={i === columns.length - 1}
                    className="text-[9px] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] disabled:opacity-30 leading-none py-0.5"
                  >
                    &#9660;
                  </button>
                </div>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  col.sourceType === 'tag' ? 'bg-[var(--rb-accent)]'
                  : col.sourceType === 'formula' ? 'bg-violet-500'
                  : col.sourceType === 'group' ? 'bg-amber-500'
                  : col.sourceType === 'mapping' ? 'bg-teal-500'
                  : 'bg-[var(--rb-text-muted)]'
                }`} />
                <span className="flex-1 min-w-0 truncate">
                  <span className="block truncate font-medium text-[var(--rb-text)]">{col.label || `Column ${i + 1}`}</span>
                  <span className="block text-[9px] font-mono text-[var(--rb-text-muted)] truncate mt-0.5">
                    {getSourcePreview(col)}
                  </span>
                </span>
                <span className="text-[9px] text-[var(--rb-text-muted)] flex-shrink-0 inline-flex items-center gap-1">
                  {(() => { const SrcIcon = SOURCE_ICONS[col.sourceType || 'tag']; return SrcIcon ? <SrcIcon size={10} /> : null; })()}
                  {col.sourceType || 'tag'}
                </span>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeColumn(i); }}
                  className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] rounded-md transition-all"
                >
                  <X size={14} />
                </button>
              </summary>

              <div className="px-3 pb-3 pt-2 space-y-3 border-t border-[var(--rb-border)]">
                <Field label="Column header">
                  <TextInput value={col.label} onChange={(v) => updateColumn(i, { label: v })} placeholder="Column name" />
                </Field>

                <Field label="Header group">
                  <TextInput value={col.group || ''} onChange={(v) => updateColumn(i, { group: v })} placeholder="e.g. OnlineValues (groups columns under shared header)" />
                </Field>

                <Field label="Value source">
                  <SelectInput
                    value={col.sourceType || 'tag'}
                    onChange={(v) => updateColumn(i, { sourceType: v })}
                    options={[
                      { value: 'tag', label: 'Single Tag' },
                      { value: 'formula', label: 'Custom Formula' },
                      { value: 'group', label: 'Tag Group Aggregate' },
                      { value: 'mapping', label: 'Mapping Tag' },
                      { value: 'static', label: 'Static Text' },
                    ]}
                  />
                </Field>

                {(col.sourceType || 'tag') === 'tag' && (
                  <Field label="Tag">
                    <TagPicker tags={tags} value={col.tagName} onChange={(v) => updateColumn(i, { tagName: v })} />
                  </Field>
                )}

                {col.sourceType === 'formula' && (
                  <>
                    {savedFormulas.length > 0 && (
                      <Field label="Saved formulas">
                        <SelectInput
                          value=""
                          onChange={(v) => {
                            const f = savedFormulas.find(sf => sf.id === v);
                            if (f) updateColumn(i, { formula: f.formula });
                          }}
                          options={[
                            { value: '', label: '— Pick a saved formula —' },
                            ...savedFormulas.map(f => ({ value: f.id, label: `${f.name}${f.unit ? ` (${f.unit})` : ''}` })),
                          ]}
                        />
                      </Field>
                    )}
                    <Field label="Formula">
                      <FormulaEditor
                        value={col.formula}
                        onChange={(v) => updateColumn(i, { formula: v })}
                        tags={tags}
                        tagValues={tagValues}
                      />
                    </Field>
                  </>
                )}

                {col.sourceType === 'group' && (
                  <>
                    <Field label="Group tags">
                      <div className="space-y-1">
                        {(col.groupTags || []).map((gt, gi) => (
                          <div key={gi} className="flex items-center gap-1">
                            <div className="flex-1">
                              <TagPicker tags={tags} value={gt} onChange={(v) => {
                                const next = [...(col.groupTags || [])];
                                next[gi] = v;
                                updateColumn(i, { groupTags: next });
                              }} />
                            </div>
                            <button onClick={() => updateColumn(i, { groupTags: (col.groupTags || []).filter((_, k) => k !== gi) })} className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => updateColumn(i, { groupTags: [...(col.groupTags || []), ''] })} className="text-[9px] font-medium text-[var(--rb-accent)] hover:underline">
                          + Add tag
                        </button>
                      </div>
                    </Field>
                  </>
                )}

                {col.sourceType === 'mapping' && (
                  <Field label="Mapping">
                    <SelectInput
                      value={col.mappingName || ''}
                      onChange={(v) => updateColumn(i, { mappingName: v })}
                      options={[
                        { value: '', label: '— Select a mapping —' },
                        ...mappings.filter(m => m.is_active !== false).map(m => ({
                          value: m.name || m.id || '',
                          label: `${m.name || m.id || 'Unnamed'} → ${m.output_tag_name || ''}`,
                        })),
                      ]}
                    />
                    <p className="text-[10px] text-[var(--rb-text-muted)] mt-1">Lookup from Settings → Mappings</p>
                  </Field>
                )}

                {col.sourceType === 'static' && (
                  <Field label="Static value">
                    <TextInput value={col.staticValue} onChange={(v) => updateColumn(i, { staticValue: v })} placeholder="Text or number" />
                  </Field>
                )}

                {(col.sourceType === 'tag' || col.sourceType === 'formula' || col.sourceType === 'group') && (
                  <Field label="Aggregation">
                    <SelectInput
                      value={col.aggregation || 'last'}
                      onChange={(v) => updateColumn(i, { aggregation: v })}
                      options={[
                        { value: 'last', label: 'Last' },
                        { value: 'avg', label: 'Average' },
                        { value: 'sum', label: 'Sum' },
                        { value: 'min', label: 'Minimum' },
                        { value: 'max', label: 'Maximum' },
                        { value: 'count', label: 'Count' },
                        { value: 'first', label: 'First (Start)' },
                { value: 'delta', label: 'Delta (Change)' },
                      ]}
                    />
                  </Field>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Field label="Format">
                    <SelectInput
                      value={col.format || 'number'}
                      onChange={(v) => updateColumn(i, { format: v })}
                      options={[
                        { value: 'number', label: 'Number' },
                        { value: 'percentage', label: 'Percentage' },
                        { value: 'boolean', label: 'Checkbox' },
                      ]}
                    />
                  </Field>
                  <Field label="Unit">
                    <TextInput value={col.unit} onChange={(v) => updateColumn(i, { unit: v })} placeholder="Unit" />
                  </Field>
                  <Field label="Decimals">
                    <TextInput type="number" value={col.decimals} onChange={(v) => updateColumn(i, { decimals: v })} />
                  </Field>
                  <Field label="Align">
                    <SelectInput
                      value={col.align || 'left'}
                      onChange={(v) => updateColumn(i, { align: v })}
                      options={[
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' },
                      ]}
                    />
                  </Field>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      <div ref={addColRef} className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => addColumn('tag')} className="rb-badge text-[12px] px-3 py-1.5 rounded-lg bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] hover:bg-[var(--rb-accent)]/20 hover:shadow-[0_0_8px_var(--rb-accent-glow)] transition-all">
          <Plus size={12} className="inline mr-1" /> Tag
        </button>
        <button onClick={() => addColumn('formula')} className="rb-badge text-[12px] px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 hover:shadow-[0_0_8px_rgba(139,92,246,0.3)] transition-all">
          <Plus size={12} className="inline mr-1" /> Formula
        </button>
        <button onClick={() => addColumn('group')} className="rb-badge text-[12px] px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_8px_rgba(245,158,11,0.3)] transition-all">
          <Plus size={12} className="inline mr-1" /> Group
        </button>
        <button onClick={() => addColumn('mapping')} className="rb-badge text-[12px] px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 hover:shadow-[0_0_8px_rgba(20,184,166,0.3)] transition-all">
          <Plus size={12} className="inline mr-1" /> Mapping
        </button>
        <button onClick={() => addColumn('static')} className="rb-badge text-[12px] px-3 py-1.5 rounded-lg bg-[var(--rb-surface)] text-[var(--rb-text-muted)] hover:bg-[var(--rb-border)] transition-all">
          <Plus size={12} className="inline mr-1" /> Static
        </button>
      </div>
    </Section>
  );
}

const DRILLDOWN_WIDGET_TYPES = WIDGET_CATALOG.filter(
  (w) => ['kpi', 'chart', 'barchart', 'gauge', 'stat', 'piechart', 'sparkline', 'progress'].includes(w.type),
);

function DrillTagTemplatePicker({ tags, rowKeys, sep, onPick, hint }) {
  const [q, setQ] = useState('');
  const safeTags = Array.isArray(tags) ? tags : [];
  const filtered = useMemo(() => {
    let list = safeTags;
    if (q.trim()) {
      const qq = q.toLowerCase();
      list = safeTags.filter(
        (t) => t.tag_name?.toLowerCase().includes(qq) || t.display_name?.toLowerCase().includes(qq),
      );
    }
    return list.slice(0, 120);
  }, [safeTags, q]);

  return (
    <div className="space-y-1.5 mt-2">
      <span className="text-[9px] text-[var(--rb-text-muted)] leading-relaxed block">
        {hint || 'Choose a tag to insert as a {ROW_KEY} pattern when it matches a row id + separator.'}
      </span>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search tags..."
        className="w-full text-[11px] rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] px-2 py-1.5"
      />
      <select
        className="w-full text-[11px] rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] px-2 py-1.5"
        defaultValue=""
        onChange={(e) => {
          const tn = e.target.value;
          if (!tn) return;
          onPick(tagToRowKeyPlaceholder(tn, rowKeys, sep || '_'));
          e.target.selectedIndex = 0;
        }}
      >
        <option value="">— Pick tag → {'{ROW_KEY}'} pattern —</option>
        {filtered.map((t) => (
          <option key={t.tag_name} value={t.tag_name}>
            {t.display_name || t.tag_name}
          </option>
        ))}
      </select>
      {rowKeys.length === 0 && (
        <p className="text-[9px] text-amber-600 dark:text-amber-400 leading-relaxed">
          No row keys detected yet. Put machine ids (e.g. c32) in the key column on static or live rows.
        </p>
      )}
    </div>
  );
}

function TableRowTabLinkSection({ config, onUpdate, canvasWidgets = [], currentWidgetId }) {
  const link = config.tableRowTabLink || { enabled: false, tabContainerWidgetId: '' };
  const dd = config.drillDown || {};
  const columns = Array.isArray(config.tableColumns) ? config.tableColumns : [];
  const tabContainers = useMemo(
    () => (canvasWidgets || []).filter((w) => w && w.type === 'tabcontainer' && w.id !== currentWidgetId),
    [canvasWidgets, currentWidgetId],
  );

  const updateLink = (patch) => onUpdate({ tableRowTabLink: { ...link, ...patch } });
  const updateDD = (patch) => onUpdate({ drillDown: { ...dd, ...patch } });

  return (
    <Section icon={ArrowRightLeft} title="Row → tab container" defaultOpen={false}>
      <Toggle
        label="Link row click to tab container"
        value={!!link.enabled}
        onChange={(v) => updateLink({ enabled: v })}
      />
      {link.enabled && (
        <>
          <Field label="Tab container">
            <select
              className="w-full text-[11px] rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] px-2 py-1.5"
              value={link.tabContainerWidgetId || ''}
              onChange={(e) => updateLink({ tabContainerWidgetId: e.target.value })}
            >
              <option value="">— Select —</option>
              {tabContainers.map((w) => (
                <option key={w.id} value={w.id}>
                  {(w.config?.title || 'Tab container')} · {w.id}
                </option>
              ))}
            </select>
          </Field>
          {!dd.enabled && (
            <Field label="Row key column">
              <SelectInput
                value={String(dd.keyColumn ?? 0)}
                onChange={(v) => updateDD({ keyColumn: Number(v) })}
                options={columns.length > 0
                  ? columns.map((col, i) => ({ value: String(i), label: col.label || `Column ${i + 1}` }))
                  : [{ value: '0', label: 'No columns yet' }]
                }
              />
            </Field>
          )}
          <p className="text-[9px] text-[var(--rb-text-muted)] leading-relaxed">
            {dd.enabled
              ? 'Uses the drill-down key column for the row id. Tab labels must match that id (case-insensitive), e.g. C32 and c32.'
              : 'Choose which column holds the machine id. Tab labels must match that value (case-insensitive).'}
          </p>
          {tabContainers.length === 0 && (
            <p className="text-[9px] text-amber-600 dark:text-amber-400">Add a Tab Container widget on the canvas to select a target.</p>
          )}
        </>
      )}
    </Section>
  );
}

function DrillDownSection({ config, onUpdate, tags, tagValues, savedFormulas = [] }) {
  const dd = config.drillDown || { enabled: false, keyColumn: 0, prefixSeparator: '_', detailWidgets: [], detailGridCols: 2 };
  const columns = Array.isArray(config.tableColumns) ? config.tableColumns : [];
  const detailWidgets = Array.isArray(dd.detailWidgets) ? dd.detailWidgets : [];
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [expandedWidget, setExpandedWidget] = useState(null);

  const drillRowKeys = useMemo(() => collectOrderedDrillRowKeys(config, tagValues), [config, tagValues]);

  const updateDD = (patch) => onUpdate({ drillDown: { ...dd, ...patch } });

  const addDetailWidget = (catalogEntry) => {
    const maxBottom = detailWidgets.reduce(
      (m, w) => Math.max(m, (Number(w.y) || 0) + (Number(w.h) || 2)),
      0,
    );
    const dw = {
      id: uid(),
      type: catalogEntry.type,
      x: 0,
      y: maxBottom,
      w: Math.min(catalogEntry.defaultW || 6, 12),
      h: catalogEntry.defaultH || 2,
      config: JSON.parse(JSON.stringify(catalogEntry.defaultConfig)),
    };
    updateDD({ detailWidgets: [...detailWidgets, dw] });
    setShowAddMenu(false);
    setExpandedWidget(dw.id);
  };

  const removeDetailWidget = (id) => {
    updateDD({ detailWidgets: detailWidgets.filter((w) => w.id !== id) });
    if (expandedWidget === id) setExpandedWidget(null);
  };

  const updateDetailWidget = (id, patch) => {
    updateDD({
      detailWidgets: detailWidgets.map((w) => {
        if (w.id !== id) return w;
        const next = { ...w, ...patch };
        if (patch.config && typeof patch.config === 'object') {
          next.config = { ...(w.config || {}), ...patch.config };
        }
        return next;
      }),
    });
  };

  const HAS_DS = new Set(['kpi', 'gauge', 'stat', 'sparkline', 'progress']);
  const HAS_SR = new Set(['chart', 'barchart', 'piechart']);

  return (
    <Section icon={Layers} title="Drill-Down" defaultOpen={false}>
      <Toggle label="Enable row drill-down" value={dd.enabled} onChange={(v) => updateDD({ enabled: v })} />

      {dd.enabled && (
        <>
          <Field label="Key column (row identifier)">
            <SelectInput
              value={String(dd.keyColumn ?? 0)}
              onChange={(v) => updateDD({ keyColumn: Number(v) })}
              options={columns.length > 0
                ? columns.map((col, i) => ({ value: String(i), label: col.label || `Column ${i + 1}` }))
                : [{ value: '0', label: 'No columns yet' }]
              }
            />
          </Field>

          <Field label="Tag prefix separator">
            <TextInput value={dd.prefixSeparator ?? '_'} onChange={(v) => updateDD({ prefixSeparator: v })} placeholder="_" />
            <p className="text-[9px] text-[var(--rb-text-muted)] mt-1">
              Tags use <code className="font-mono bg-[var(--rb-surface)] px-1 rounded">{'{ROW_KEY}'}</code> placeholder, e.g. <code className="font-mono bg-[var(--rb-surface)] px-1 rounded">{'{ROW_KEY}_total_active_energy'}</code>
            </p>
          </Field>

          <p className="text-[9px] text-[var(--rb-text-muted)] leading-relaxed mt-1 mb-2">
            Detail widgets use a <strong className="text-[var(--rb-text)]">12-column</strong> grid under the table. With the table selected, drag and resize them in the builder; positions are saved on mouse up.
          </p>

          <div className="mt-3 pt-3 border-t border-[var(--rb-border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--rb-text-muted)]">
                Detail Widgets ({detailWidgets.length})
              </span>
            </div>

            {detailWidgets.length === 0 && (
              <p className="text-[9px] text-[var(--rb-text-muted)] mb-3">
                Add widgets that appear when a row is clicked. Use <code className="font-mono bg-[var(--rb-surface)] px-1 rounded">{'{ROW_KEY}'}</code> in tag names.
              </p>
            )}

            <div className="space-y-2">
              {detailWidgets.map((dw) => {
                const isExpanded = expandedWidget === dw.id;
                const dwConfig = dw.config || {};
                const catEntry = WIDGET_CATALOG.find((c) => c.type === dw.type);

                return (
                  <div key={dw.id} className="rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
                      onClick={() => setExpandedWidget(isExpanded ? null : dw.id)}
                    >
                      <ChevronRight size={12} className={`text-[var(--rb-text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <span className="flex-1 text-[12px] font-medium text-[var(--rb-text)] truncate">
                        {dwConfig.title || catEntry?.label || dw.type}
                      </span>
                      <span className="text-[9px] text-[var(--rb-text-muted)] flex-shrink-0">{dw.type}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeDetailWidget(dw.id); }}
                        className="rb-btn-ghost p-1 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[var(--rb-border)]">
                        <Field label="Title">
                          <TextInput
                            value={dwConfig.title || ''}
                            onChange={(v) => updateDetailWidget(dw.id, { config: { title: v } })}
                            placeholder="{ROW_KEY} Energy Chart"
                          />
                        </Field>

                        {HAS_DS.has(dw.type) && (
                          <>
                            <Field label="Source type">
                              <SelectInput
                                value={dwConfig.dataSource?.type || 'tag'}
                                onChange={(v) => updateDetailWidget(dw.id, { config: { dataSource: { ...(dwConfig.dataSource || {}), type: v } } })}
                                options={[
                                  { value: 'tag', label: 'Single Tag' },
                                  { value: 'formula', label: 'Custom Formula' },
                                ]}
                              />
                            </Field>
                            {(dwConfig.dataSource?.type || 'tag') === 'tag' && (
                              <Field label="Tag name (use {ROW_KEY})">
                                <TextInput
                                  value={dwConfig.dataSource?.tagName || ''}
                                  onChange={(v) => updateDetailWidget(dw.id, { config: { dataSource: { ...(dwConfig.dataSource || {}), tagName: v } } })}
                                  placeholder="{ROW_KEY}_total_active_energy"
                                />
                                <DrillTagTemplatePicker
                                  tags={tags}
                                  rowKeys={drillRowKeys}
                                  sep={dd.prefixSeparator ?? '_'}
                                  onPick={(pattern) =>
                                    updateDetailWidget(dw.id, {
                                      config: { dataSource: { ...(dwConfig.dataSource || {}), tagName: pattern } },
                                    })
                                  }
                                />
                              </Field>
                            )}
                            {dwConfig.dataSource?.type === 'formula' && (
                              <Field label="Formula (use {ROW_KEY})">
                                <TextInput
                                  value={dwConfig.dataSource?.formula || ''}
                                  onChange={(v) => updateDetailWidget(dw.id, { config: { dataSource: { ...(dwConfig.dataSource || {}), formula: v } } })}
                                  placeholder="{'{ROW_KEY}_power'} * 2"
                                />
                              </Field>
                            )}
                          </>
                        )}

                        {HAS_SR.has(dw.type) && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--rb-text-muted)]">Series</span>
                              <button
                                onClick={() => {
                                  const series = [...(dwConfig.series || []), {
                                    dataSource: { type: 'tag', tagName: '', formula: '' },
                                    label: `Series ${(dwConfig.series || []).length + 1}`,
                                    color: '',
                                  }];
                                  updateDetailWidget(dw.id, { config: { series } });
                                }}
                                className="text-[9px] font-medium text-[var(--rb-accent)] hover:underline"
                              >
                                + Add series
                              </button>
                            </div>
                            {(dwConfig.series || []).map((s, si) => (
                              <div key={si} className="p-2 rounded border border-[var(--rb-border)] space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-medium text-[var(--rb-text-muted)]">Series {si + 1}</span>
                                  <button
                                    onClick={() => {
                                      const series = (dwConfig.series || []).filter((_, j) => j !== si);
                                      updateDetailWidget(dw.id, { config: { series } });
                                    }}
                                    className="p-0.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                                <Field label="Label">
                                  <TextInput
                                    value={s.label || ''}
                                    onChange={(v) => {
                                      const series = [...(dwConfig.series || [])];
                                      series[si] = { ...series[si], label: v };
                                      updateDetailWidget(dw.id, { config: { series } });
                                    }}
                                    placeholder="Series label"
                                  />
                                </Field>
                                <Field label="Tag name (use {ROW_KEY})">
                                  <TextInput
                                    value={s.dataSource?.tagName || s.tagName || ''}
                                    onChange={(v) => {
                                      const series = [...(dwConfig.series || [])];
                                      series[si] = { ...series[si], dataSource: { ...(series[si].dataSource || {}), type: 'tag', tagName: v } };
                                      updateDetailWidget(dw.id, { config: { series } });
                                    }}
                                    placeholder="{ROW_KEY}_effective_power"
                                  />
                                  <DrillTagTemplatePicker
                                    tags={tags}
                                    rowKeys={drillRowKeys}
                                    sep={dd.prefixSeparator ?? '_'}
                                    onPick={(pattern) => {
                                      const series = [...(dwConfig.series || [])];
                                      series[si] = {
                                        ...series[si],
                                        dataSource: { ...(series[si].dataSource || {}), type: 'tag', tagName: pattern },
                                      };
                                      updateDetailWidget(dw.id, { config: { series } });
                                    }}
                                  />
                                </Field>
                              </div>
                            ))}
                          </>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Unit">
                            <TextInput
                              value={dwConfig.unit || ''}
                              onChange={(v) => updateDetailWidget(dw.id, { config: { unit: v } })}
                              placeholder="kWh"
                            />
                          </Field>
                          <Field label="Decimals">
                            <TextInput
                              type="number"
                              value={dwConfig.decimals ?? 1}
                              onChange={(v) => updateDetailWidget(dw.id, { config: { decimals: v } })}
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="relative mt-2">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="inline-flex items-center gap-1.5 text-[9px] font-medium text-[var(--rb-accent)] hover:underline"
              >
                <Plus size={12} />
                Add detail widget
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute z-50 mt-1 left-0 w-48 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl overflow-hidden">
                    {DRILLDOWN_WIDGET_TYPES.map((cat) => (
                      <button
                        key={cat.type}
                        type="button"
                        onClick={() => addDetailWidget(cat)}
                        className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--rb-accent-subtle)] transition-colors text-[var(--rb-text)]"
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

const HAS_DATA_SOURCE = new Set(['kpi', 'gauge', 'stat', 'silo', 'status', 'sparkline', 'progress', 'hopper']);
const HAS_THRESHOLDS = new Set(['kpi', 'gauge', 'stat', 'table', 'silo', 'status', 'progress', 'hopper']);
const HAS_SERIES = new Set(['chart', 'barchart', 'piechart']);
const HAS_TABLE_COLUMNS = new Set(['table']);

const TAB_DATA = 'data';
const TAB_FORMAT = 'format';

export default function PropertiesPanel({ widget, onUpdate, onDelete, onClose, onHidePanel, tags, tagValues, groups = [], savedFormulas = [], isSubWidget, onBackToParent, canvasWidgets = [] }) {
  const [activeTab, setActiveTab] = useState(TAB_DATA);
  const prefersReducedMotion = useReducedMotion();

  if (!widget) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-[var(--rb-surface)] border border-[var(--rb-border)] flex items-center justify-center mb-4">
          <MousePointer size={20} className="text-[var(--rb-text-muted)]" />
        </div>
        <p className="text-[11px] font-medium text-[var(--rb-text-muted)]">Select a widget to edit its properties</p>
      </div>
    );
  }

  const config = widget.config || {};
  const handleConfigUpdate = (updates) => {
    onUpdate(widget.id, { config: { ...config, ...updates } });
  };

  const widgetTitle = config.title || widget.type.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-[var(--rb-border)]">
        {isSubWidget && onBackToParent && (
          <button
            onClick={onBackToParent}
            className="w-full flex items-center gap-2 px-5 py-2 text-[10px] font-semibold text-[var(--rb-accent)] bg-[var(--rb-accent-subtle)] hover:bg-[var(--rb-accent-subtle)]/80 transition-colors border-b border-[var(--rb-border)]"
          >
            <ChevronLeft size={12} /> Back to Tab Container
          </button>
        )}
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--rb-accent-subtle)] border border-[var(--rb-accent)]/20">
              <Sliders size={14} className="text-[var(--rb-accent)]" />
            </span>
            <p className="text-[13px] font-bold text-[var(--rb-text)] truncate">{widgetTitle}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onClose} className="rb-btn-ghost p-2 hover:bg-[var(--rb-surface)] rounded-md transition-colors" title={isSubWidget ? 'Back to container' : 'Deselect widget'}>
              <X size={16} className="text-[var(--rb-text-muted)]" />
            </button>
            {onHidePanel && (
              <button onClick={onHidePanel} className="rb-btn-ghost p-2 -mr-2 hover:bg-[var(--rb-surface)] rounded-md transition-colors" title="Hide properties panel">
                <PanelRightClose size={16} className="text-[var(--rb-text-muted)]" />
              </button>
            )}
          </div>
        </div>
        <div className="px-5 pb-3">
          <div className="rb-segmented-control w-full">
            {[
              { id: TAB_DATA, label: 'Data', icon: Database },
              { id: TAB_FORMAT, label: 'Format', icon: Palette },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 ${activeTab === tab.id ? 'active' : ''}`}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-[var(--rb-border)] bg-[var(--rb-surface)]/50">
        <div className="flex items-center gap-1.5 mb-2">
          <Move size={11} className="text-[var(--rb-accent)]" />
          <span className="text-[9px] font-bold text-[var(--rb-accent)] uppercase tracking-[0.08em]">Layout</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: 'x', label: 'X', min: 0, max: 11 },
            { key: 'y', label: 'Y', min: 0, max: 999 },
            { key: 'w', label: 'W', min: 1, max: 12 },
            { key: 'h', label: 'H', min: 1, max: 999 },
          ].map(({ key, label, min, max }) => {
            const gridCols = 12;
            return (
            <div key={key}>
              <label className="block text-[8px] font-bold text-[var(--rb-text-muted)] uppercase tracking-[0.1em] mb-0.5 text-center">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={widget[key] ?? 0}
                onChange={(e) => {
                  let v = parseInt(e.target.value, 10);
                  if (isNaN(v)) return;
                  v = Math.max(min, Math.min(max, v));
                  if (key === 'x' && v + (widget.w || 1) > gridCols) v = gridCols - (widget.w || 1);
                  if (key === 'w' && (widget.x || 0) + v > gridCols) v = gridCols - (widget.x || 0);
                  onUpdate(widget.id, { [key]: v });
                }}
                className="rb-input-base w-full text-center font-mono tabular-nums text-[11px] font-bold"
                style={{ padding: '4px 2px' }}
              />
            </div>
          );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === TAB_DATA && (
            <motion.div
              key="data"
              initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: 8 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
            >
              {HAS_DATA_SOURCE.has(widget.type) && (
                <DataSourceSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} groups={groups} savedFormulas={savedFormulas} />
              )}
              {HAS_SERIES.has(widget.type) && (
                <ChartSeriesSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} savedFormulas={savedFormulas} />
              )}
              {HAS_TABLE_COLUMNS.has(widget.type) && (
                <TableColumnsSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} savedFormulas={savedFormulas} />
              )}
              {HAS_TABLE_COLUMNS.has(widget.type) && (
                <TableRowTabLinkSection
                  config={config}
                  onUpdate={handleConfigUpdate}
                  canvasWidgets={canvasWidgets}
                  currentWidgetId={widget.id}
                />
              )}
              {HAS_TABLE_COLUMNS.has(widget.type) && (
                <DrillDownSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} savedFormulas={savedFormulas} />
              )}
              {widget.type === 'statusbar' && (
                <Section icon={Database} title="Status Tags" defaultOpen={true}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--rb-text-muted)]">Tags</span>
                    <button
                      onClick={() => handleConfigUpdate({ tags: [...(config.tags || []), { tagName: '', label: '', onLabel: 'ON', offLabel: 'OFF', onColor: '#10b981', offColor: '#6b7280' }] })}
                      className="text-[9px] font-medium text-[var(--rb-accent)] hover:underline"
                    >+ Add tag</button>
                  </div>
                  {(config.tags || []).map((tag, i) => (
                    <div key={i} className="p-2 rounded border border-[var(--rb-border)] space-y-1.5 mb-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-[var(--rb-text-muted)]">Tag {i + 1}</span>
                        <button
                          onClick={() => {
                            const newTags = (config.tags || []).filter((_, j) => j !== i);
                            handleConfigUpdate({ tags: newTags });
                          }}
                          className="p-0.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                        ><X size={10} /></button>
                      </div>
                      <TagPicker
                        tags={tags}
                        value={tag.tagName || ''}
                        onChange={(v) => {
                          const newTags = [...(config.tags || [])];
                          const picked = tags.find(t => t.tag_name === v);
                          newTags[i] = { ...newTags[i], tagName: v, label: newTags[i].label || picked?.display_name || v };
                          handleConfigUpdate({ tags: newTags });
                        }}
                      />
                      <div className="grid grid-cols-2 gap-1">
                        <Field label="Label">
                          <TextInput value={tag.label || ''} onChange={(v) => {
                            const newTags = [...(config.tags || [])];
                            newTags[i] = { ...newTags[i], label: v };
                            handleConfigUpdate({ tags: newTags });
                          }} />
                        </Field>
                        <Field label="ON Text">
                          <TextInput value={tag.onLabel || 'ON'} onChange={(v) => {
                            const newTags = [...(config.tags || [])];
                            newTags[i] = { ...newTags[i], onLabel: v };
                            handleConfigUpdate({ tags: newTags });
                          }} />
                        </Field>
                        <Field label="OFF Text">
                          <TextInput value={tag.offLabel || 'OFF'} onChange={(v) => {
                            const newTags = [...(config.tags || [])];
                            newTags[i] = { ...newTags[i], offLabel: v };
                            handleConfigUpdate({ tags: newTags });
                          }} />
                        </Field>
                        <Field label="ON Color">
                          <ColorInput value={tag.onColor || '#10b981'} onChange={(v) => {
                            const newTags = [...(config.tags || [])];
                            newTags[i] = { ...newTags[i], onColor: v };
                            handleConfigUpdate({ tags: newTags });
                          }} />
                        </Field>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
              {widget.type === 'tabcontainer' && (
                <Section icon={Layers} title="Tab Container" defaultOpen={true}>
                  <p className="text-[9px] text-[var(--rb-text-muted)] leading-relaxed">
                    Click the tab container on the canvas to manage tabs and add widgets.
                    Double-click a tab label to rename it. Use the + button inside the widget to add tabs and sub-widgets.
                  </p>
                  <div className="pt-3 mt-3 border-t border-[var(--rb-border)] space-y-3">
                    <Toggle
                      label="Hide other tabs when a table row selects a tab"
                      value={config.hideNonMatchingTabsOnTableRowLink !== false}
                      onChange={(v) => handleConfigUpdate({ hideNonMatchingTabsOnTableRowLink: v })}
                    />
                    <p className="text-[9px] text-[var(--rb-text-muted)] leading-relaxed">
                      Applies in preview and viewer when a linked data table drives this container. Other widgets on the report are unchanged. While this tab container is selected on the canvas, all tabs stay visible for editing.
                    </p>
                    <div>
                      <span className="block text-[9px] font-bold text-[var(--rb-text-muted)] uppercase tracking-[0.06em] mb-2">
                        Always show tabs (with selected machine)
                      </span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {(Array.isArray(config.tabs) ? config.tabs : []).map((tab) => {
                          const ids = Array.isArray(config.tableRowLinkAlwaysVisibleTabIds)
                            ? config.tableRowLinkAlwaysVisibleTabIds.map(String)
                            : [];
                          const checked = ids.includes(String(tab.id));
                          return (
                            <label
                              key={tab.id}
                              className="flex items-center gap-2 text-[11px] text-[var(--rb-text)] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="rounded border-[var(--rb-border)]"
                                checked={checked}
                                onChange={(e) => {
                                  const next = new Set(ids);
                                  if (e.target.checked) next.add(String(tab.id));
                                  else next.delete(String(tab.id));
                                  handleConfigUpdate({ tableRowLinkAlwaysVisibleTabIds: [...next] });
                                }}
                              />
                              <span className="truncate">{tab.label || tab.id}</span>
                            </label>
                          );
                        })}
                      </div>
                      {(!config.tabs || config.tabs.length === 0) && (
                        <p className="text-[9px] text-[var(--rb-text-muted)] italic">No tabs yet.</p>
                      )}
                    </div>
                  </div>
                </Section>
              )}
              {!HAS_DATA_SOURCE.has(widget.type) && !HAS_SERIES.has(widget.type) && !HAS_TABLE_COLUMNS.has(widget.type) && widget.type !== 'tabcontainer' && (
                <div className="px-5 py-6 text-[9px] text-[var(--rb-text-muted)]">
                  {widget.type === 'text' || widget.type === 'logo'
                    ? 'Use the Format tab to configure this element.'
                    : 'No data options for this widget.'}
                </div>
              )}
            </motion.div>
          )}
          {activeTab === TAB_FORMAT && (
            <motion.div
              key="format"
              initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: -8 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
            >
              {['kpi', 'gauge', 'silo', 'stat', 'chart', 'barchart', 'piechart', 'table', 'image', 'status', 'sparkline', 'progress', 'hopper', 'statusbar', 'tabcontainer'].includes(widget.type) && (
                <Section icon={Palette} title="Card Appearance" defaultOpen={true} isFirst>
                  <Toggle
                    label="Show card (border & background)"
                    value={config.showCard !== false}
                    onChange={(v) => handleConfigUpdate({ showCard: v })}
                  />
                  {config.showCard !== false && (
                    <div className="mt-1">
                      <label className="rb-label block mb-1">Card Style</label>
                      <select
                        value={config.cardStyle || 'default'}
                        onChange={(e) => handleConfigUpdate({ cardStyle: e.target.value })}
                        className="rb-input-base w-full text-[11px] py-1 px-2"
                      >
                        <option value="default">Default</option>
                        <option value="borderless">Borderless</option>
                        <option value="glass">Glass</option>
                        <option value="accent-top">Accent Top</option>
                        <option value="holographic">Holographic</option>
                      </select>
                    </div>
                  )}
                </Section>
              )}
              {/* StatusBar tags are in the Data tab, not here */}
              <Section icon={SeparatorHorizontal} title="Separator Line" defaultOpen={false}>
                <Toggle
                  label="Show bottom separator"
                  value={!!config.showSeparator}
                  onChange={(v) => handleConfigUpdate({ showSeparator: v })}
                />
                {config.showSeparator && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Style">
                        <SelectInput
                          value={config.separatorStyle || 'solid'}
                          onChange={(v) => handleConfigUpdate({ separatorStyle: v })}
                          options={[
                            { value: 'solid', label: 'Solid' },
                            { value: 'dashed', label: 'Dashed' },
                            { value: 'dotted', label: 'Dotted' },
                          ]}
                        />
                      </Field>
                      <Field label="Thickness">
                        <SelectInput
                          value={String(config.separatorThickness || 1)}
                          onChange={(v) => handleConfigUpdate({ separatorThickness: Number(v) })}
                          options={[
                            { value: '1', label: '1px' },
                            { value: '2', label: '2px' },
                            { value: '3', label: '3px' },
                          ]}
                        />
                      </Field>
                    </div>
                    <Field label="Color">
                      <ColorInput
                        value={config.separatorColor || ''}
                        onChange={(v) => handleConfigUpdate({ separatorColor: v })}
                      />
                    </Field>
                  </>
                )}
              </Section>
              <DisplaySection widgetType={widget.type} config={config} onUpdate={handleConfigUpdate} tags={tags} />
              {HAS_THRESHOLDS.has(widget.type) && (
                <ThresholdsSection config={config} onUpdate={handleConfigUpdate} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-5 py-3.5 border-t border-[var(--rb-border)] flex-shrink-0">
        <button
          onClick={() => onDelete(widget.id)}
          className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] rounded-lg py-2.5 transition-all active:scale-[0.98] border border-transparent hover:border-[var(--rb-danger)]/20"
        >
          <Trash2 size={14} />
          Remove widget
        </button>
      </div>
    </div>
  );
}
