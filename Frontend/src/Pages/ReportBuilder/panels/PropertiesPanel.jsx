import { useState, useMemo } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Database, Palette, AlertTriangle, Sliders, MousePointer, Tag, FunctionSquare, Grid3x3, Type, SeparatorHorizontal } from 'lucide-react';
import FormulaEditor from '../formulas/FormulaEditor';

/* ── Shared UI primitives (Report Builder design system) ───────── */

function Section({ icon: Icon, title, children, defaultOpen = true, isFirst = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border-b border-[var(--rb-border)] last:border-0${!isFirst ? ' border-t border-t-[var(--rb-border)]' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="rb-section-header w-full flex items-center gap-2 py-3 px-5 hover:bg-[var(--rb-surface)] transition-colors text-left"
      >
        {Icon && <Icon size={16} className="text-[var(--rb-accent)]" />}
        <span className="flex-1">{title}</span>
        {open ? <ChevronDown size={16} className="opacity-60" /> : <ChevronRight size={16} className="opacity-60" />}
      </button>
      {open && <div className="px-5 pb-4 pt-1 space-y-4">{children}</div>}
    </div>
  );
}

/* Aggregation micro-descriptions */
const AGGREGATION_DESCRIPTIONS = {
  last: 'Most recent value',
  avg: 'Average over time range',
  sum: 'Total accumulated',
  min: 'Lowest recorded',
  max: 'Highest recorded',
  count: 'Number of data points',
  delta: 'Change from first to last',
};

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="rb-label block">{label}</label>
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
      className={`rb-input-base w-full ${mono ? 'font-mono' : ''}`}
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
    <label className="flex items-center justify-between cursor-pointer gap-3">
      <span className="rb-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${value ? 'bg-[var(--rb-accent)]' : 'bg-[var(--rb-border)]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
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
        className="w-9 h-9 rounded-lg border border-[var(--rb-border)] cursor-pointer bg-transparent p-0"
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#hex"
        className="rb-input-base flex-1 font-mono"
      />
    </div>
  );
}

/* ── Tag Picker (inline) ──────────────────────────────────────── */

function TagPicker({ tags, value, onChange, placeholder = 'Select tag...' }) {
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
        {value || <span className="text-[var(--rb-text-muted)]">{placeholder}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute z-50 mt-2 w-full rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl max-h-56 overflow-hidden">
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
                <p className="rb-caption px-4 py-4 text-center">No tags found</p>
              ) : (() => {
                const plcTags = filtered.filter(t => !t.source_type || t.source_type === 'PLC');
                const formulaTags = filtered.filter(t => t.source_type === 'Formula');
                const otherTags = filtered.filter(t => t.source_type && t.source_type !== 'PLC' && t.source_type !== 'Formula');
                const renderTag = (tag) => (
                  <button
                    key={tag.tag_name}
                    onClick={() => { onChange(tag.tag_name); setOpen(false); setSearch(''); }}
                    className={`w-full px-4 py-2 text-left rb-body hover:bg-[var(--rb-accent-subtle)] transition-colors ${value === tag.tag_name ? 'bg-[var(--rb-accent-subtle)]' : ''}`}
                  >
                    <span className="font-medium">{tag.display_name || tag.tag_name}</span>
                    {tag.unit && <span className="ml-1 rb-caption">({tag.unit})</span>}
                  </button>
                );
                const sectionHeader = (label) => (
                  <div key={label} className="px-4 py-1.5 rb-caption font-semibold uppercase tracking-wide bg-[var(--rb-surface)] border-b border-[var(--rb-border)] sticky top-0">{label}</div>
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

/* ── Rich Formula Dropdown ─────────────────────────────────────── */

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
          <div className="rb-formula-dropdown absolute z-50 mt-1 w-full">
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
              <div className="px-3 py-4 text-center rb-caption text-[var(--rb-text-muted)]">No formulas found</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Data Source Section ───────────────────────────────────────── */

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
                { value: 'delta', label: 'Delta (Change)' },
              ]}
            />
            {AGGREGATION_DESCRIPTIONS[ds.aggregation] && (
              <p className="rb-caption text-[var(--rb-text-muted)] mt-1 ml-0.5">↳ {AGGREGATION_DESCRIPTIONS[ds.aggregation]}</p>
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
                className="rb-caption text-[var(--rb-accent)] hover:underline"
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
                { value: 'delta', label: 'Delta (Change)' },
              ]}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

/* ── Display Section ──────────────────────────────────────────── */

function DisplaySection({ widgetType, config, onUpdate, tags = [] }) {
  return (
    <Section icon={Palette} title={widgetType === 'image' ? 'Image' : widgetType === 'text' ? 'Text' : 'Display'} defaultOpen={true}>
      {widgetType !== 'image' && widgetType !== 'text' && (
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

      {(widgetType === 'kpi' || widgetType === 'stat' || widgetType === 'gauge' || widgetType === 'silo') && (
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

          {/* ── Reference / Target Lines ── */}
          <div className="mt-3 pt-3 border-t border-[var(--rb-border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="rb-caption font-semibold tracking-wide uppercase" style={{ fontSize: '9px' }}>Reference Lines</span>
              <button
                onClick={() => {
                  const annotations = [...(config.annotations || []), { label: 'Target', value: 0, color: '#ef4444' }];
                  onUpdate({ annotations });
                }}
                className="text-[9px] font-medium text-brand hover:underline"
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
                  className="rb-input flex-1"
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
                  className="rb-input"
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
                  className="text-[10px] text-red-400 hover:text-red-500 font-bold px-1"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            {(!config.annotations || config.annotations.length === 0) && (
              <p className="text-[9px] text-[#8898aa] italic">No reference lines. Click + Add to create one.</p>
            )}
          </div>
        </>
      )}

      {widgetType === 'table' && (
        <>
          <Toggle label="Striped rows" value={config.striped} onChange={(v) => onUpdate({ striped: v })} />
          <Toggle label="Compact" value={config.compact} onChange={(v) => onUpdate({ compact: v })} />
          {/* Compact color groups */}
          <Field label="Header colors">
            <div className="rb-color-group">
              <span className="rb-caption mr-1">bg</span>
              <input type="color" value={config.headerBg || '#1e293b'} onChange={(e) => onUpdate({ headerBg: e.target.value })} className="rb-color-swatch" />
              <span className="rb-caption mr-1">text</span>
              <input type="color" value={config.headerColor || '#ffffff'} onChange={(e) => onUpdate({ headerColor: e.target.value })} className="rb-color-swatch" />
            </div>
          </Field>
          <Field label="Row colors">
            <div className="rb-color-group">
              <span className="rb-caption mr-1">bg</span>
              <input type="color" value={config.rowBg || '#ffffff'} onChange={(e) => onUpdate({ rowBg: e.target.value })} className="rb-color-swatch" />
              <span className="rb-caption mr-1">alt</span>
              <input type="color" value={config.stripedRowBg || '#f8fafc'} onChange={(e) => onUpdate({ stripedRowBg: e.target.value })} className="rb-color-swatch" />
              <span className="rb-caption mr-1">border</span>
              <input type="color" value={config.borderColor || '#e2e8f0'} onChange={(e) => onUpdate({ borderColor: e.target.value })} className="rb-color-swatch" />
            </div>
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
              className="rb-caption text-[var(--rb-danger)] hover:underline"
            >
              Remove image
            </button>
          )}
        </>
      )}
    </Section>
  );
}

/* ── Thresholds Section ───────────────────────────────────────── */

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
        <p className="rb-caption mb-3 text-[var(--rb-text-muted)]">No threshold rules defined</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={i} className="rb-threshold-rule flex items-center gap-2 p-2.5 rounded-lg bg-[var(--rb-surface)]" style={{ borderLeft: `3px solid ${rule.color}` }}>
              <input
                type="color"
                value={rule.color}
                onChange={(e) => updateRule(i, { color: e.target.value })}
                className="w-6 h-6 rounded-md border border-[var(--rb-border)] cursor-pointer bg-transparent p-0 flex-shrink-0"
              />
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
                className="rb-input-base w-16 font-mono text-xs"
              />
              {rule.condition === 'between' && (
                <>
                  <span className="rb-caption">to</span>
                  <input
                    type="number"
                    value={rule.valueTo}
                    onChange={(e) => updateRule(i, { valueTo: Number(e.target.value) })}
                    className="rb-input-base w-16 font-mono text-xs"
                  />
                </>
              )}
              <button onClick={() => removeRule(i)} className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button onClick={addRule} className="rb-caption text-[var(--rb-accent)] hover:underline mt-2">
        + Add threshold rule
      </button>
    </Section>
  );
}

/* ── Chart Series Section ─────────────────────────────────────── */

function ChartSeriesSection({ config, onUpdate, tags, tagValues, savedFormulas = [] }) {
  const series = config.series || [];
  const updateSeries = (newSeries) => onUpdate({ series: newSeries });

  const addSeries = () => {
    updateSeries([...series, {
      dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'avg' },
      label: `Series ${series.length + 1}`,
      color: '',
    }]);
  };

  const removeSeries = (i) => updateSeries(series.filter((_, j) => j !== i));

  const updateSeriesItem = (i, patch) => updateSeries(series.map((s, j) => j === i ? { ...s, ...patch } : s));

  return (
    <Section icon={Database} title="Data Series" defaultOpen={true}>
      {series.length === 0 ? (
        <p className="rb-caption mb-3 text-[var(--rb-text-muted)]">No data series added</p>
      ) : (
        <div className="space-y-3">
          {series.map((s, i) => (
            <div key={i} className="p-3 rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="rb-label">Series {i + 1}</span>
                <button onClick={() => removeSeries(i)} className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]">
                  <X size={14} />
                </button>
              </div>
              <Field label="Label">
                <TextInput value={s.label} onChange={(v) => updateSeriesItem(i, { label: v })} placeholder="Series label" />
              </Field>
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
      <button onClick={addSeries} className="rb-caption text-[var(--rb-accent)] hover:underline mt-2">
        + Add data series
      </button>
    </Section>
  );
}

/* ── Table Columns Section (Power BI–style, column-only) ──────── */

function TableColumnsSection({ config, onUpdate, tags, tagValues, savedFormulas = [] }) {
  const safeConfig = config || {};
  const columns = Array.isArray(safeConfig.tableColumns) ? safeConfig.tableColumns : [];
  const updateColumns = (newCols) => onUpdate({ tableColumns: newCols });
  const getSourcePreview = (col) => {
    const src = col.sourceType || 'tag';
    if (src === 'tag') return col.tagName || 'Not configured';
    if (src === 'formula') return col.formula ? (col.formula.length > 34 ? `${col.formula.slice(0, 32)}...` : col.formula) : 'Not configured';
    if (src === 'group') return (col.groupTags || []).length ? `${col.groupTags.slice(0, 2).join(', ')}${col.groupTags.length > 2 ? ` +${col.groupTags.length - 2}` : ''}` : 'Not configured';
    if (src === 'static') return col.staticValue || 'Not configured';
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
      unit: '',
      decimals: 1,
      align: 'left',
      width: 120,
      format: 'number',
      thresholds: [],
    }]);
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

  const SOURCE_ICONS = { tag: Tag, formula: FunctionSquare, group: Grid3x3, static: Type };

  return (
    <Section icon={Database} title="Table Columns" defaultOpen={true}>
      {/* Breadcrumb */}
      <p className="rb-caption mb-3 text-[var(--rb-text-muted)]">
        <span className="font-medium text-[var(--rb-text)]">Data Table</span>
        <span className="mx-1">&rsaquo;</span>
        {columns.length} column{columns.length !== 1 ? 's' : ''}
      </p>
      {columns.length === 0 ? (
        <p className="rb-caption mb-3 text-[var(--rb-text-muted)]">
          Define columns for your table. Each column can be a tag value, formula, group aggregate, or static text.
        </p>
      ) : (
        <div className="space-y-2">
          {columns.map((col, i) => (
            <details key={i} className="group/col rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-border)] overflow-hidden">
              <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none list-none rb-body">
                <div className="flex flex-col gap-0">
                  <button
                    onClick={(e) => { e.preventDefault(); moveColumn(i, i - 1); }}
                    disabled={i === 0}
                    className="rb-caption text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] disabled:opacity-30 leading-none py-0.5"
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); moveColumn(i, i + 1); }}
                    disabled={i === columns.length - 1}
                    className="rb-caption text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] disabled:opacity-30 leading-none py-0.5"
                  >
                    &#9660;
                  </button>
                </div>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  col.sourceType === 'tag' ? 'bg-[var(--rb-accent)]'
                  : col.sourceType === 'formula' ? 'bg-violet-500'
                  : col.sourceType === 'group' ? 'bg-amber-500'
                  : 'bg-[var(--rb-text-muted)]'
                }`} />
                <span className="flex-1 min-w-0 truncate">
                  <span className="block truncate font-medium">{col.label || `Column ${i + 1}`}</span>
                  <span className="block rb-caption font-mono truncate mt-0.5">
                    {getSourcePreview(col)}
                  </span>
                </span>
                <span className="rb-caption flex-shrink-0 inline-flex items-center gap-1">
                  {(() => { const SrcIcon = SOURCE_ICONS[col.sourceType || 'tag']; return SrcIcon ? <SrcIcon size={10} /> : null; })()}
                  {col.sourceType || 'tag'}
                </span>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeColumn(i); }}
                  className="rb-btn-ghost p-1.5 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)]"
                >
                  <X size={14} />
                </button>
              </summary>

              <div className="px-3 pb-3 pt-2 space-y-3 border-t border-[var(--rb-border)]">
                <Field label="Column header">
                  <TextInput value={col.label} onChange={(v) => updateColumn(i, { label: v })} placeholder="Column name" />
                </Field>

                <Field label="Value source">
                  <SelectInput
                    value={col.sourceType || 'tag'}
                    onChange={(v) => updateColumn(i, { sourceType: v })}
                    options={[
                      { value: 'tag', label: 'Single Tag' },
                      { value: 'formula', label: 'Custom Formula' },
                      { value: 'group', label: 'Tag Group Aggregate' },
                      { value: 'static', label: 'Static Text' },
                    ]}
                  />
                </Field>

                {/* Tag source */}
                {(col.sourceType || 'tag') === 'tag' && (
                  <Field label="Tag">
                    <TagPicker tags={tags} value={col.tagName} onChange={(v) => updateColumn(i, { tagName: v })} />
                  </Field>
                )}

                {/* Formula source */}
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

                {/* Group source */}
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
                        <button onClick={() => updateColumn(i, { groupTags: [...(col.groupTags || []), ''] })} className="rb-caption text-[var(--rb-accent)] hover:underline">
                          + Add tag
                        </button>
                      </div>
                    </Field>
                  </>
                )}

                {/* Static source */}
                {col.sourceType === 'static' && (
                  <Field label="Static value">
                    <TextInput value={col.staticValue} onChange={(v) => updateColumn(i, { staticValue: v })} placeholder="Text or number" />
                  </Field>
                )}

                {/* Aggregation for all value types (tag, formula, group) */}
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
                        { value: 'delta', label: 'Delta (Change)' },
                      ]}
                    />
                  </Field>
                )}

                {/* Formatting row */}
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

      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => addColumn('tag')} className="rb-badge rb-body px-3 py-1.5 rounded-lg bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)] hover:bg-[var(--rb-accent)]/20">
          <Plus size={12} className="inline mr-1" /> Tag
        </button>
        <button onClick={() => addColumn('formula')} className="rb-badge rb-body px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20">
          <Plus size={12} className="inline mr-1" /> Formula
        </button>
        <button onClick={() => addColumn('group')} className="rb-badge rb-body px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20">
          <Plus size={12} className="inline mr-1" /> Group
        </button>
        <button onClick={() => addColumn('static')} className="rb-badge rb-body px-3 py-1.5 rounded-lg bg-[var(--rb-surface)] text-[var(--rb-text-muted)] hover:bg-[var(--rb-border)]">
          <Plus size={12} className="inline mr-1" /> Static
        </button>
      </div>
    </Section>
  );
}

/* ── Main: Properties Panel ───────────────────────────────────── */

const HAS_DATA_SOURCE = new Set(['kpi', 'gauge', 'stat', 'silo']);
const HAS_THRESHOLDS = new Set(['kpi', 'gauge', 'stat', 'table', 'silo']);
const HAS_SERIES = new Set(['chart', 'barchart']);
const HAS_TABLE_COLUMNS = new Set(['table']);

const TAB_DATA = 'data';
const TAB_FORMAT = 'format';

export default function PropertiesPanel({ widget, onUpdate, onDelete, onClose, tags, tagValues, groups = [], savedFormulas = [] }) {
  const [activeTab, setActiveTab] = useState(TAB_DATA);

  if (!widget) {
    return (
      <div className="flex items-center justify-center h-full rb-caption p-8 text-center text-[var(--rb-text-muted)]">
        Select a widget to edit its properties
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
        <div className="flex items-center justify-between px-5 py-4">
          <p className="rb-heading text-[var(--rb-text)] truncate pr-2">{widgetTitle}</p>
          <button onClick={onClose} className="rb-btn-ghost p-2 -mr-2">
            <X size={18} />
          </button>
        </div>
        {/* Segmented control tabs */}
        <div className="px-5 py-3 border-t border-[var(--rb-border)]/80">
          <div className="rb-segmented-control">
            {[
              { id: TAB_DATA, label: 'Data' },
              { id: TAB_FORMAT, label: 'Format' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? 'active' : ''}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === TAB_DATA && (
          <>
            {HAS_DATA_SOURCE.has(widget.type) && (
              <DataSourceSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} groups={groups} savedFormulas={savedFormulas} />
            )}
            {HAS_SERIES.has(widget.type) && (
              <ChartSeriesSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} savedFormulas={savedFormulas} />
            )}
            {HAS_TABLE_COLUMNS.has(widget.type) && (
              <TableColumnsSection config={config} onUpdate={handleConfigUpdate} tags={tags} tagValues={tagValues} savedFormulas={savedFormulas} />
            )}
            {!HAS_DATA_SOURCE.has(widget.type) && !HAS_SERIES.has(widget.type) && !HAS_TABLE_COLUMNS.has(widget.type) && (
              <div className="px-5 py-6 rb-caption text-[var(--rb-text-muted)]">
                {widget.type === 'text'
                  ? 'Use the Format tab to configure this element.'
                  : 'No data options for this widget.'}
              </div>
            )}
          </>
        )}
        {activeTab === TAB_FORMAT && (
          <>
            {/* Card Appearance — moved from header */}
            {['kpi', 'gauge', 'silo', 'stat', 'chart', 'barchart', 'table', 'image'].includes(widget.type) && (
              <Section icon={Palette} title="Card Appearance" defaultOpen={true} isFirst>
                <Toggle
                  label="Show card (border & background)"
                  value={config.showCard !== false}
                  onChange={(v) => handleConfigUpdate({ showCard: v })}
                />
              </Section>
            )}
            {/* Separator Line — available for ALL widget types */}
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
          </>
        )}
      </div>

      <div className="px-5 py-4 border-t border-[var(--rb-border)] flex-shrink-0">
        <button
          onClick={() => onDelete(widget.id)}
          className="w-full flex items-center justify-center gap-2 rb-body font-medium text-[var(--rb-danger)] hover:bg-[var(--rb-danger)]/10 rounded-lg py-2.5 transition-colors"
        >
          <Trash2 size={14} />
          Remove widget
        </button>
      </div>
    </div>
  );
}
