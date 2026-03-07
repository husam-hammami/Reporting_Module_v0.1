import { useMemo, useState, useRef, useEffect } from 'react';
import { Tooltip } from '@mui/material';
import { ChevronDown, Search, Tag, LayoutGrid } from 'lucide-react';
import { WIDGET_CATALOG, createWidget } from '../widgets/widgetDefaults';

/* ── SVG icons (colored, unique per type) ────────────────────── */

const IC = { primary: '#6b7280', mid: '#9ca3af', light: '#d1d5db', muted: '#6b7f94', subtle: '#8898aa' };

function VizIcon({ type }) {
  const s = 'w-7 h-7';
  switch (type) {
    case 'kpi': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 22l5.5-5.4 4 3.8 7.2-8.4 4.3 3" stroke={IC.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><rect x="4" y="22" width="4.5" height="5" rx="1" fill={IC.light} /><rect x="11" y="19" width="4.5" height="8" rx="1" fill={IC.mid} /><rect x="18" y="14.5" width="4.5" height="12.5" rx="1" fill={IC.primary} /></svg>;
    case 'table': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke={IC.primary} strokeWidth="2" /><path d="M4 12h24M4 19h24M12 5v22M20 5v22" stroke={IC.mid} strokeWidth="1.6" /></svg>;
    case 'chart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 25h22" stroke={IC.light} strokeWidth="1.6" /><path d="M6 21l5.5-5.5 5 3.6 8-8" stroke={IC.primary} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'barchart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 26h22" stroke={IC.light} strokeWidth="1.6" /><rect x="7" y="15" width="4" height="10" rx="1.2" fill={IC.light} /><rect x="14" y="10" width="4" height="15" rx="1.2" fill={IC.mid} /><rect x="21" y="6" width="4" height="19" rx="1.2" fill={IC.primary} /></svg>;
    case 'gauge': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 22a10 10 0 0 1 20 0" stroke={IC.light} strokeWidth="3" strokeLinecap="round" /><path d="M6 22a10 10 0 0 1 5.8-9" stroke="#c4a27a" strokeWidth="3" strokeLinecap="round" /><path d="M11.8 13a10 10 0 0 1 8.4 0" stroke="#8aae8a" strokeWidth="3" strokeLinecap="round" /><path d="M16 21l5-5" stroke={IC.primary} strokeWidth="2.2" strokeLinecap="round" /><circle cx="16" cy="21" r="1.6" fill={IC.primary} /></svg>;
    case 'stat': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={IC.mid} strokeWidth="2" /><text x="16" y="21" textAnchor="middle" fill={IC.primary} fontSize="12" fontWeight="bold" fontFamily="monospace">42</text></svg>;
    case 'image': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={IC.mid} strokeWidth="1.8" /><circle cx="12" cy="13" r="2.5" stroke={IC.primary} strokeWidth="1.5" /><path d="M4 22l6-5 4 3 5-6 9 8" stroke={IC.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'repeat': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="8" width="10" height="16" rx="2" stroke={IC.mid} strokeWidth="1.8" /><rect x="18" y="8" width="10" height="16" rx="2" stroke={IC.mid} strokeWidth="1.8" /><path d="M14 16h4" stroke={IC.primary} strokeWidth="1.5" strokeLinecap="round" /><path d="M16 14v4" stroke={IC.primary} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'silo': return <svg viewBox="0 0 32 32" className={s} fill="none"><ellipse cx="16" cy="8" rx="8" ry="3" stroke={IC.mid} strokeWidth="1.8" /><path d="M8 8v16c0 1.2 3.6 2 8 2s8-.8 8-2V8" stroke={IC.mid} strokeWidth="1.8" fill="none" /><path d="M8 8v16c0 1.2 3.6 2 8 2s8-.8 8-2V8" fill="url(#silo-toolbox-fill)" fillOpacity="0.3" stroke="none" /><defs><linearGradient id="silo-toolbox-fill" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stopColor={IC.primary} /><stop offset="70%" stopColor={IC.primary} stopOpacity="0.5" /></linearGradient></defs></svg>;
    case 'text': return <svg viewBox="0 0 32 32" className={s} fill="none"><text x="6" y="22" fill={IC.primary} fontSize="16" fontWeight="bold" fontFamily="serif">T</text><path d="M18 10h8M18 16h6M18 22h4" stroke={IC.mid} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    default: return null;
  }
}

function SmallVizIcon({ type }) {
  const s = 'w-4 h-4';
  switch (type) {
    case 'kpi': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 22l5.5-5.4 4 3.8 7.2-8.4 4.3 3" stroke={IC.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'table': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke={IC.primary} strokeWidth="2.5" /><path d="M4 12h24M12 5v22" stroke={IC.mid} strokeWidth="2" /></svg>;
    case 'chart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 21l5.5-5.5 5 3.6 8-8" stroke={IC.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'barchart': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="7" y="15" width="5" height="11" rx="1" fill={IC.light} /><rect x="14" y="10" width="5" height="16" rx="1" fill={IC.mid} /><rect x="21" y="6" width="5" height="20" rx="1" fill={IC.primary} /></svg>;
    case 'gauge': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 22a10 10 0 0 1 20 0" stroke={IC.light} strokeWidth="3.5" strokeLinecap="round" /><path d="M16 21l5-5" stroke={IC.primary} strokeWidth="2.5" strokeLinecap="round" /></svg>;
    case 'stat': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={IC.mid} strokeWidth="2.5" /><text x="16" y="21" textAnchor="middle" fill={IC.primary} fontSize="14" fontWeight="bold">42</text></svg>;
    case 'image': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={IC.mid} strokeWidth="2" /><path d="M4 22l6-5 4 3 5-6 9 8" stroke={IC.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'repeat': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="8" width="10" height="16" rx="2" stroke={IC.mid} strokeWidth="2" /><rect x="18" y="8" width="10" height="16" rx="2" stroke={IC.mid} strokeWidth="2" /></svg>;
    case 'silo': return <svg viewBox="0 0 32 32" className={s} fill="none"><ellipse cx="16" cy="8" rx="8" ry="3" stroke={IC.mid} strokeWidth="2" /><path d="M8 8v16c0 1.2 3.6 2 8 2s8-.8 8-2V8" stroke={IC.mid} strokeWidth="2" fill="none" /></svg>;
    case 'text': return <svg viewBox="0 0 32 32" className={s} fill="none"><text x="8" y="22" fill={IC.primary} fontSize="18" fontWeight="bold" fontFamily="serif">T</text></svg>;
    default: return null;
  }
}

/* ── Component data: one flat list, grouped by section label ──── */

const COMPONENTS = [
  { section: 'Visualizations', type: 'kpi', label: 'KPI Card' },
  { section: 'Visualizations', type: 'table', label: 'Table' },
  { section: 'Visualizations', type: 'chart', label: 'Line Chart' },
  { section: 'Visualizations', type: 'barchart', label: 'Bar Chart' },
  { section: 'Visualizations', type: 'gauge', label: 'Gauge' },
  { section: 'Visualizations', type: 'silo', label: 'Silo' },
  { section: 'Visualizations', type: 'stat', label: 'Stat Panel' },
  { section: 'Structure', type: 'text', label: 'Text' },
  { section: 'Structure', type: 'image', label: 'Image' },
  { section: 'Structure', type: 'repeat', label: 'Repeat Panel' },
];

const TYPE_LABELS = { kpi: 'KPI', table: 'Table', chart: 'Chart', barchart: 'Bar', gauge: 'Gauge', silo: 'Silo', stat: 'Stat', text: 'Text', image: 'Image', repeat: 'Repeat' };

const SECTIONS = ['Visualizations', 'Structure', 'Tag Groups', 'Widgets'];

/* ── Collapsible wrapper with smooth height animation ────────── */

function CollapsibleSection({ isOpen, children }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(isOpen ? 'auto' : 0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!contentRef.current) return;
    if (isOpen) {
      const h = contentRef.current.scrollHeight;
      setHeight(h);
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setHeight('auto');
        setIsAnimating(false);
      }, 250);
      return () => clearTimeout(timer);
    } else {
      const h = contentRef.current.scrollHeight;
      setHeight(h);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0);
          setIsAnimating(true);
        });
      });
      const timer = setTimeout(() => setIsAnimating(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        overflow: isAnimating || !isOpen ? 'hidden' : 'visible',
        transition: isAnimating ? 'height 250ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        opacity: isOpen ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────── */

function extractWidgetDataSources(widget) {
  const c = widget.config || {};
  const tags = [];
  const formulas = [];

  if (c.dataSource?.tagName) tags.push(c.dataSource.tagName);
  if (c.dataSource?.formula) formulas.push(c.dataSource.formula);
  if (Array.isArray(c.dataSource?.groupTags)) {
    c.dataSource.groupTags.forEach((t) => { if (t) tags.push(t); });
  }

  if (c.capacityTag) tags.push(c.capacityTag);
  if (c.tonsTag) tags.push(c.tonsTag);

  if (Array.isArray(c.series)) {
    c.series.forEach((s) => {
      const tag = s?.dataSource?.tagName ?? s?.tagName;
      if (tag) tags.push(tag);
      if (s?.dataSource?.formula) formulas.push(s.dataSource.formula);
      if (Array.isArray(s?.dataSource?.groupTags)) {
        s.dataSource.groupTags.forEach((t) => { if (t) tags.push(t); });
      }
    });
  }

  if (Array.isArray(c.tags)) {
    c.tags.forEach((t) => { if (t?.tagName) tags.push(t.tagName); });
  }

  if (Array.isArray(c.tableColumns)) {
    c.tableColumns.forEach((col) => {
      if (col?.tagName) tags.push(col.tagName);
      if (col?.formula) formulas.push(col.formula);
      if (Array.isArray(col?.groupTags)) {
        col.groupTags.forEach((t) => { if (t) tags.push(t); });
      }
    });
  }

  return { tags: [...new Set(tags)], formulas: [...new Set(formulas.filter(Boolean))] };
}

function buildTagGroupSections(tags, groups, tagSearch) {
  const q = tagSearch.toLowerCase().trim();
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeGroups = Array.isArray(groups) ? groups : [];

  const filtered = q
    ? safeTags.filter(
        (t) =>
          t.tag_name?.toLowerCase().includes(q) ||
          t.display_name?.toLowerCase().includes(q) ||
          t.unit?.toLowerCase().includes(q),
      )
    : safeTags;

  const filteredSet = new Set(filtered.map((t) => t.tag_name));
  const groupedSections = [];
  const usedInGroups = new Set();

  safeGroups.forEach((g) => {
    const groupTagNames = (g.tags || []).map((t) => t.tag_name).filter(Boolean);
    const matching = groupTagNames.filter((tn) => filteredSet.has(tn));
    if (matching.length > 0) {
      const tagObjs = matching.map((tn) => filtered.find((t) => t.tag_name === tn)).filter(Boolean);
      groupedSections.push({ groupName: g.group_name, tags: tagObjs });
      matching.forEach((tn) => usedInGroups.add(tn));
    }
  });

  const ungrouped = filtered.filter((t) => !usedInGroups.has(t.tag_name));
  if (ungrouped.length > 0) {
    groupedSections.push({ groupName: 'Ungrouped', tags: ungrouped });
  }

  return { groupedSections, totalFiltered: filtered.length };
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════════ */

export default function WidgetToolbox({ onAddWidget, tags = [], groups = [], widgets = [], selectedId, onSelectWidget }) {
  const [activeType, setActiveType] = useState(null);
  const [search, setSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [openSections, setOpenSections] = useState({ Visualizations: true, Structure: true, 'Tag Groups': false, Widgets: false });
  const [openTagGroups, setOpenTagGroups] = useState({});
  const [openWidgetIds, setOpenWidgetIds] = useState({});

  const toggleSection = (name) => setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  const toggleTagGroup = (name) => setOpenTagGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  const toggleWidgetOpen = (id) => setOpenWidgetIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredComponents = useMemo(() => {
    if (!search.trim()) return COMPONENTS;
    const q = search.toLowerCase();
    return COMPONENTS.filter((c) => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [search]);

  const { groupedSections, totalFiltered } = useMemo(
    () => buildTagGroupSections(tags, groups, tagSearch),
    [tags, groups, tagSearch],
  );

  const widgetDataSources = useMemo(() => {
    const map = {};
    widgets.forEach((w) => {
      map[w.id] = extractWidgetDataSources(w);
    });
    return map;
  }, [widgets]);

  const sortedWidgets = useMemo(
    () => [...widgets].sort((a, b) => (a.y ?? 0) - (b.y ?? 0)),
    [widgets],
  );

  const widgetsWithData = useMemo(
    () => sortedWidgets.filter((w) => {
      const ds = widgetDataSources[w.id];
      return ds && (ds.tags.length > 0 || ds.formulas.length > 0);
    }),
    [sortedWidgets, widgetDataSources],
  );

  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/report-widget-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleAdd = (type) => {
    const catalogEntry = WIDGET_CATALOG.find((c) => c.type === type);
    if (catalogEntry) {
      setActiveType(type);
      onAddWidget(createWidget(catalogEntry));
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--rb-panel)]">
      <div className="rb-toolbox-header px-4 py-3">
        <p className="text-[15px] font-bold text-[var(--rb-accent)] mb-2">Components</p>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--rb-text-muted)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter components..."
            className="rb-input-base w-full pl-7 py-1.5 text-[11px]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {SECTIONS.map((sectionName) => {
          const isTagGroups = sectionName === 'Tag Groups';
          const isWidgets = sectionName === 'Widgets';
          const isViz = sectionName === 'Visualizations';
          const isOpen = openSections[sectionName];

          const items = (isTagGroups || isWidgets) ? [] : filteredComponents.filter((c) => c.section === sectionName);

          if (!isTagGroups && !isWidgets && search.trim() && items.length === 0) return null;

          return (
            <div key={sectionName} className="border-b border-[var(--rb-border)]">
              <button
                onClick={() => toggleSection(sectionName)}
                className="rb-toolbox-accordion-header"
              >
                <span className="flex items-center gap-1.5">
                  {isTagGroups && <Tag size={11} className="text-[var(--rb-accent)]" />}
                  {isWidgets && <LayoutGrid size={11} className="text-[var(--rb-accent)]" />}
                  {sectionName}
                  {isTagGroups && (
                    <span className="text-[var(--rb-text-muted)] font-normal">
                      ({Array.isArray(groups) ? groups.length : 0})
                    </span>
                  )}
                  {isWidgets && (
                    <span className="text-[var(--rb-text-muted)] font-normal">
                      ({widgetsWithData.length})
                    </span>
                  )}
                </span>
                <ChevronDown
                  size={13}
                  style={{
                    transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  }}
                />
              </button>

              <CollapsibleSection isOpen={isOpen}>
                {!isTagGroups && !isWidgets && isViz && (
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-4 gap-2">
                      {items.map(({ type, label }) => {
                        return (
                          <Tooltip key={type} title={label} placement="top" arrow disableInteractive>
                            <button
                              type="button"
                              onClick={() => handleAdd(type)}
                              draggable
                              onDragStart={(e) => onDragStart(e, type)}
                              className={`rb-toolbox-item flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg cursor-grab active:cursor-grabbing ${
                                activeType === type
                                  ? 'bg-[var(--rb-accent-subtle)] shadow-sm'
                                  : ''
                              }`}
                            >
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{
                                  background: 'var(--rb-surface)',
                                  border: '1px solid var(--rb-border)',
                                }}
                              >
                                <VizIcon type={type} />
                              </div>
                              <span className="text-[9px] font-medium text-[var(--rb-text-muted)] text-center leading-tight w-full truncate">{label.split(' ')[0]}</span>
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isTagGroups && !isWidgets && !isViz && (
                  <div className="px-3 pb-3 space-y-0.5">
                    {items.map(({ type, label }) => {
                      const cat = WIDGET_CATALOG.find((c) => c.type === type);
                      return (
                        <button
                          key={type}
                          onClick={() => handleAdd(type)}
                          draggable
                          onDragStart={(e) => onDragStart(e, type)}
                          className="rb-toolbox-item w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent hover:border-[var(--rb-accent)]/30 group text-left cursor-grab active:cursor-grabbing"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              background: 'var(--rb-surface)',
                              border: '1px solid var(--rb-border)',
                            }}
                          >
                            <VizIcon type={type} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-[var(--rb-text)] group-hover:text-[var(--rb-accent)] transition-colors">{label}</p>
                            {cat?.description && <p className="text-[9px] text-[var(--rb-text-muted)] mt-0.5 truncate">{cat.description}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isTagGroups && (
                  <div className="px-3 pb-3">
                    <div className="relative mb-2">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--rb-text-muted)] pointer-events-none" />
                      <input
                        type="text"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Search tags..."
                        className="rb-input-base w-full pl-6 py-1 text-[10px]"
                      />
                    </div>

                    {groupedSections.length === 0 ? (
                      <p className="text-[10px] text-[var(--rb-text-muted)] px-1 py-2">
                        {tagSearch.trim() ? 'No tags match search' : 'No tag groups defined. Go to Engineering \u2192 Tag Groups to create groups.'}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {groupedSections.map(({ groupName, tags: groupTags }) => {
                          const isGroupOpen = openTagGroups[groupName] !== false;
                          return (
                            <div key={groupName}>
                              <button
                                onClick={() => toggleTagGroup(groupName)}
                                className="w-full flex items-center gap-1.5 px-1 py-1 text-left rounded hover:bg-[var(--rb-surface)] transition-colors"
                              >
                                <ChevronDown
                                  size={10}
                                  style={{
                                    transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                                    transform: isGroupOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    flexShrink: 0,
                                  }}
                                  className="text-[var(--rb-text-muted)]"
                                />
                                <span className="text-[10px] font-semibold text-[var(--rb-text)] truncate flex-1">
                                  {groupName}
                                </span>
                                <span className="text-[9px] text-[var(--rb-text-muted)] bg-[var(--rb-surface)] px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  {groupTags.length}
                                </span>
                              </button>
                              {isGroupOpen && (
                                <div className="ml-3 space-y-px">
                                  {groupTags.map((tag) => (
                                    <div
                                      key={tag.tag_name}
                                      className="flex items-center gap-1.5 px-1.5 py-[3px] rounded hover:bg-[var(--rb-surface)] transition-colors cursor-default"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--rb-accent)]" style={{ opacity: 0.5 }} />
                                      <span className="text-[10px] text-[var(--rb-text-muted)] truncate flex-1">
                                        {tag.tag_name}
                                      </span>
                                      {tag.unit && (
                                        <span className="text-[8px] text-[var(--rb-text-muted)] bg-[var(--rb-surface)] px-1 py-px rounded flex-shrink-0">
                                          {tag.unit}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {isWidgets && (
                  <div className="px-3 pb-3 space-y-1">
                    {widgetsWithData.length === 0 ? (
                      <p className="text-[10px] text-[var(--rb-text-muted)] px-1 py-2">No widgets with data sources on canvas</p>
                    ) : (
                      widgetsWithData.map((w) => {
                        const ds = widgetDataSources[w.id] || { tags: [], formulas: [] };
                        const isExpanded = openWidgetIds[w.id] || false;
                        const title = w.config?.title || w.config?.dataSource?.tagName || w.type;
                        const typeLabel = TYPE_LABELS[w.type] || w.type;
                        return (
                          <div key={w.id} className="rounded-md overflow-hidden">
                            <button
                              onClick={() => toggleWidgetOpen(w.id)}
                              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-all ${
                                selectedId === w.id
                                  ? 'bg-[var(--rb-accent-subtle)] text-[var(--rb-accent)]'
                                  : 'text-[var(--rb-text)] hover:bg-[var(--rb-surface)]'
                              }`}
                            >
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                style={{ background: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}
                              >
                                <SmallVizIcon type={w.type} />
                              </div>
                              <span className="text-[10px] font-medium truncate flex-1">{title}</span>
                              <span className="text-[8px] font-semibold text-[var(--rb-text-muted)] px-1.5 py-0.5 rounded-full bg-[var(--rb-surface)] flex-shrink-0 uppercase tracking-wide">
                                {typeLabel}
                              </span>
                              <ChevronDown
                                size={10}
                                style={{
                                  transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                  flexShrink: 0,
                                }}
                                className="text-[var(--rb-text-muted)]"
                              />
                            </button>

                            {isExpanded && (
                              <div className="ml-7 mt-1 mb-1.5 space-y-0.5 pl-2 border-l-2 border-[var(--rb-border-subtle)]">
                                {ds.tags.map((tagName) => (
                                  <div key={tagName} className="flex items-center gap-1.5 px-1.5 py-[3px] rounded hover:bg-[var(--rb-surface)] transition-colors">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                                    <span className="text-[9px] text-[var(--rb-text-muted)] truncate">{tagName}</span>
                                  </div>
                                ))}
                                {ds.formulas.map((formula, i) => (
                                  <div key={i} className="flex items-center gap-1.5 px-1.5 py-[3px] rounded hover:bg-[var(--rb-surface)] transition-colors">
                                    <span className="text-[9px] text-amber-500 flex-shrink-0 font-semibold">fx</span>
                                    <span className="text-[9px] text-[var(--rb-text-muted)] truncate font-mono">{formula}</span>
                                  </div>
                                ))}
                                {ds.tags.length === 0 && ds.formulas.length === 0 && (
                                  <span className="text-[9px] text-[var(--rb-text-muted)] px-1">No data sources</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          );
        })}
      </div>
    </div>
  );
}
