import { useMemo, useState, useRef, useEffect } from 'react';
import { Tooltip } from '@mui/material';
import { ChevronDown, Search, Tag, LayoutGrid, GripVertical, PanelLeftClose } from 'lucide-react';
import { WIDGET_CATALOG, createWidget } from '../widgets/widgetDefaults';

const IC = {
  primary: 'var(--rb-text-muted)',
  mid: 'var(--rb-text-muted)',
  light: 'var(--rb-border)',
  active: 'var(--rb-accent)',
  activeMid: 'var(--rb-accent-bright)',
};

function VizIcon({ type, isActive }) {
  const s = 'w-7 h-7';
  const p = isActive ? IC.active : IC.primary;
  const m = isActive ? IC.activeMid : IC.mid;
  const l = isActive ? IC.active : IC.light;
  switch (type) {
    case 'kpi': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 22l5.5-5.4 4 3.8 7.2-8.4 4.3 3" stroke={p} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><rect x="4" y="22" width="4.5" height="5" rx="1" fill={l} /><rect x="11" y="19" width="4.5" height="8" rx="1" fill={m} /><rect x="18" y="14.5" width="4.5" height="12.5" rx="1" fill={p} /></svg>;
    case 'table': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke={p} strokeWidth="2" /><path d="M4 12h24M4 19h24M12 5v22M20 5v22" stroke={m} strokeWidth="1.6" /></svg>;
    case 'chart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 25h22" stroke={l} strokeWidth="1.6" /><path d="M6 21l5.5-5.5 5 3.6 8-8" stroke={p} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'barchart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 26h22" stroke={l} strokeWidth="1.6" /><rect x="7" y="15" width="4" height="10" rx="1.2" fill={l} /><rect x="14" y="10" width="4" height="15" rx="1.2" fill={m} /><rect x="21" y="6" width="4" height="19" rx="1.2" fill={p} /></svg>;
    case 'gauge': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 22a10 10 0 0 1 20 0" stroke={l} strokeWidth="3" strokeLinecap="round" /><path d="M6 22a10 10 0 0 1 5.8-9" stroke={isActive ? '#fbbf24' : '#c4a27a'} strokeWidth="3" strokeLinecap="round" /><path d="M11.8 13a10 10 0 0 1 8.4 0" stroke={isActive ? '#34d399' : '#8aae8a'} strokeWidth="3" strokeLinecap="round" /><path d="M16 21l5-5" stroke={p} strokeWidth="2.2" strokeLinecap="round" /><circle cx="16" cy="21" r="1.6" fill={p} /></svg>;
    case 'stat': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={m} strokeWidth="2" /><text x="16" y="21" textAnchor="middle" fill={p} fontSize="12" fontWeight="bold" fontFamily="monospace">42</text></svg>;
    case 'image': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={m} strokeWidth="1.8" /><circle cx="12" cy="13" r="2.5" stroke={p} strokeWidth="1.5" /><path d="M4 22l6-5 4 3 5-6 9 8" stroke={p} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'status': return <svg viewBox="0 0 32 32" className={s} fill="none"><circle cx="16" cy="16" r="9" stroke={m} strokeWidth="2" /><circle cx="16" cy="16" r="5" fill={isActive ? '#10b981' : p} /><circle cx="16" cy="16" r="9" stroke={isActive ? '#10b981' : m} strokeWidth="2" opacity="0.3" /></svg>;
    case 'statusbar': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="3" y="11" width="26" height="10" rx="3" stroke={m} strokeWidth="1.6" /><circle cx="9" cy="16" r="2.5" fill={isActive ? '#10b981' : p} /><circle cx="16" cy="16" r="2.5" fill={isActive ? '#fbbf24' : l} /><circle cx="23" cy="16" r="2.5" fill={isActive ? '#10b981' : p} /></svg>;
    case 'sparkline': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M4 20l4-3 4 5 4-8 4 4 4-6 4 3" stroke={p} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 20l4-3 4 5 4-8 4 4 4-6 4 3v8H4z" fill={l} opacity="0.3" /></svg>;
    case 'progress': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="12" width="24" height="8" rx="4" stroke={m} strokeWidth="1.8" /><rect x="5" y="13" width="15" height="6" rx="3" fill={p} /></svg>;
    case 'hopper': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 6h20l-5 20H11z" stroke={m} strokeWidth="1.8" strokeLinejoin="round" /><path d="M8 12h16l-3.5 14h-9z" fill={l} opacity="0.4" /><rect x="13" y="26" width="6" height="2" rx="1" fill={m} /></svg>;
    case 'silo': return <svg viewBox="0 0 32 32" className={s} fill="none"><ellipse cx="16" cy="8" rx="8" ry="3" stroke={m} strokeWidth="1.8" /><path d="M8 8v16c0 1.2 3.6 2 8 2s8-.8 8-2V8" stroke={m} strokeWidth="1.8" fill="none" /><path d="M8 8v16c0 1.2 3.6 2 8 2s8-.8 8-2V8" fill={isActive ? 'rgba(56,189,248,0.15)' : 'rgba(107,127,148,0.15)'} stroke="none" /><defs><linearGradient id="silo-toolbox-fill" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stopColor={p} /><stop offset="70%" stopColor={p} stopOpacity="0.5" /></linearGradient></defs></svg>;
    case 'piechart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M16 4a12 12 0 0 1 0 24A12 12 0 0 1 16 4z" stroke={m} strokeWidth="2" /><path d="M16 4a12 12 0 0 1 10.4 6L16 16V4z" fill={p} /><path d="M26.4 10A12 12 0 0 1 16 28V16l10.4-6z" fill={l} /></svg>;
    case 'text': return <svg viewBox="0 0 32 32" className={s} fill="none"><text x="6" y="22" fill={p} fontSize="16" fontWeight="bold" fontFamily="serif">T</text><path d="M18 10h8M18 16h6M18 22h4" stroke={m} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case 'logo': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="7" width="24" height="18" rx="3" stroke={m} strokeWidth="1.8" /><path d="M10 16h12" stroke={p} strokeWidth="2" strokeLinecap="round" /><path d="M14 12h4v8h-4z" fill={l} rx="1" /><circle cx="16" cy="16" r="4" stroke={p} strokeWidth="1.5" fill="none" /></svg>;
    case 'tabcontainer': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="8" width="24" height="18" rx="3" stroke={m} strokeWidth="1.8" /><rect x="5" y="8" width="9" height="5" rx="1.5" fill={p} /><rect x="15" y="8" width="9" height="5" rx="1.5" fill={l} /><path d="M4 13h24" stroke={m} strokeWidth="1" /></svg>;
    case 'datapanel': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke={m} strokeWidth="1.8" /><rect x="4" y="5" width="24" height="6" rx="3" fill={p} opacity="0.3" /><rect x="7" y="14" width="8" height="3" rx="1" fill={l} /><rect x="17" y="14" width="8" height="3" rx="1" fill={m} /><rect x="7" y="19" width="8" height="3" rx="1" fill={l} /><rect x="17" y="19" width="8" height="3" rx="1" fill={m} /></svg>;
    default: return null;
  }
}

function SmallVizIcon({ type }) {
  const s = 'w-4 h-4';
  const p = IC.primary;
  const m = IC.mid;
  const l = IC.light;
  switch (type) {
    case 'kpi': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M5 22l5.5-5.4 4 3.8 7.2-8.4 4.3 3" stroke={p} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'table': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke={p} strokeWidth="2.5" /><path d="M4 12h24M12 5v22" stroke={m} strokeWidth="2" /></svg>;
    case 'chart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 21l5.5-5.5 5 3.6 8-8" stroke={p} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'barchart': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="7" y="15" width="5" height="11" rx="1" fill={l} /><rect x="14" y="10" width="5" height="16" rx="1" fill={m} /><rect x="21" y="6" width="5" height="20" rx="1" fill={p} /></svg>;
    case 'gauge': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 22a10 10 0 0 1 20 0" stroke={l} strokeWidth="3.5" strokeLinecap="round" /><path d="M16 21l5-5" stroke={p} strokeWidth="2.5" strokeLinecap="round" /></svg>;
    case 'stat': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={m} strokeWidth="2.5" /><text x="16" y="21" textAnchor="middle" fill={p} fontSize="14" fontWeight="bold">42</text></svg>;
    case 'image': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={m} strokeWidth="2" /><path d="M4 22l6-5 4 3 5-6 9 8" stroke={p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'status': return <svg viewBox="0 0 32 32" className={s} fill="none"><circle cx="16" cy="16" r="8" stroke={m} strokeWidth="2.5" /><circle cx="16" cy="16" r="4.5" fill={p} /></svg>;
    case 'sparkline': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M4 20l4-3 4 5 4-8 4 4 4-6 4 3" stroke={p} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'progress': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="12" width="24" height="8" rx="4" stroke={m} strokeWidth="2.5" /><rect x="5" y="13" width="15" height="6" rx="3" fill={p} /></svg>;
    case 'hopper': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M6 6h20l-5 20H11z" stroke={m} strokeWidth="2" strokeLinejoin="round" /></svg>;
    case 'silo': return <svg viewBox="0 0 32 32" className={s} fill="none"><ellipse cx="16" cy="8" rx="8" ry="3" stroke={m} strokeWidth="2" /><path d="M8 8v16c0 1.2 3.6 2 8 2s8-.8 8-2V8" stroke={m} strokeWidth="2" fill="none" /></svg>;
    case 'piechart': return <svg viewBox="0 0 32 32" className={s} fill="none"><path d="M16 4a12 12 0 0 1 0 24A12 12 0 0 1 16 4z" stroke={m} strokeWidth="2" /><path d="M16 4a12 12 0 0 1 10.4 6L16 16V4z" fill={p} /><path d="M26.4 10A12 12 0 0 1 16 28V16l10.4-6z" fill={l} /></svg>;
    case 'text': return <svg viewBox="0 0 32 32" className={s} fill="none"><text x="8" y="22" fill={p} fontSize="18" fontWeight="bold" fontFamily="serif">T</text></svg>;
    case 'logo': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="7" width="24" height="18" rx="3" stroke={m} strokeWidth="2" /><circle cx="16" cy="16" r="4" stroke={p} strokeWidth="2" fill="none" /></svg>;
    case 'tabcontainer': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="8" width="24" height="18" rx="3" stroke={m} strokeWidth="2.5" /><rect x="5" y="8" width="10" height="5" rx="1.5" fill={p} /><rect x="16" y="8" width="10" height="5" rx="1.5" fill={l} /></svg>;
    case 'datapanel': return <svg viewBox="0 0 32 32" className={s} fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke={m} strokeWidth="2" /><rect x="7" y="14" width="8" height="3" rx="1" fill={l} /><rect x="17" y="14" width="8" height="3" rx="1" fill={p} /></svg>;
    default: return null;
  }
}

const COMPONENTS = [
  { section: 'Data', type: 'kpi', label: 'KPI Card' },
  { section: 'Data', type: 'gauge', label: 'Gauge' },
  { section: 'Data', type: 'stat', label: 'Stat Panel' },
  { section: 'Data', type: 'statusbar', label: 'Status Bar' },
  { section: 'Data', type: 'progress', label: 'Progress Bar' },
  { section: 'Data', type: 'silo', label: 'Silo Visual' },
  { section: 'Data', type: 'hopper', label: 'Hopper' },
  { section: 'Charts', type: 'chart', label: 'Line Chart' },
  { section: 'Charts', type: 'barchart', label: 'Bar Chart' },
  { section: 'Charts', type: 'piechart', label: 'Pie Chart' },
  { section: 'Charts', type: 'sparkline', label: 'Sparkline' },
  { section: 'Tables', type: 'table', label: 'Data Table' },
  { section: 'Tables', type: 'datapanel', label: 'Data Panel' },
  { section: 'Layout', type: 'text', label: 'Text Block' },
  { section: 'Layout', type: 'image', label: 'Image' },
  { section: 'Layout', type: 'logo', label: 'Client Logo' },
  { section: 'Layout', type: 'tabcontainer', label: 'Tab Container' },
];

const TYPE_LABELS = { kpi: 'KPI', table: 'Table', chart: 'Chart', barchart: 'Bar', gauge: 'Gauge', silo: 'Silo', stat: 'Stat', piechart: 'Pie', text: 'Text', image: 'Image', logo: 'Logo', status: 'Status', statusbar: 'Status', sparkline: 'Spark', progress: 'Progress', hopper: 'Hopper', tabcontainer: 'Tabs', datapanel: 'Panel' };

const SECTIONS = ['Data', 'Charts', 'Tables', 'Layout', 'Tag Groups', 'Widgets'];

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

  if (Array.isArray(c.fields)) {
    c.fields.forEach((f) => {
      if (f?.tagName) tags.push(f.tagName);
      if (f?.formula) formulas.push(f.formula);
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

export default function WidgetToolbox({ onAddWidget, tags = [], groups = [], widgets = [], selectedId, onSelectWidget, onHidePanel }) {
  const [activeType, setActiveType] = useState(null);
  const [search, setSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [openSections, setOpenSections] = useState({ Data: true, Charts: true, Tables: true, Layout: true, 'Tag Groups': false, Widgets: false });
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
    <div className="flex flex-col h-full" style={{ background: 'var(--rb-panel)' }}>
      <div
        className="px-4 py-3"
        style={{
          background: 'var(--rb-surface)',
          borderBottom: '1px solid var(--rb-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <div
            className="w-1 h-4 rounded-full"
            style={{ background: 'var(--rb-accent)' }}
          />
          <p
            className="flex-1"
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--rb-accent)',
            }}
          >
            Widgets
          </p>
          {onHidePanel && (
            <Tooltip title="Hide widgets panel" placement="right" arrow disableInteractive>
              <button
                onClick={onHidePanel}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--rb-text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rb-accent)'; e.currentTarget.style.background = 'var(--rb-accent-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rb-text-muted)'; e.currentTarget.style.background = ''; }}
              >
                <PanelLeftClose size={14} />
              </button>
            </Tooltip>
          )}
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--rb-text-muted)' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search widgets..."
            className="rb-input-base w-full py-1.5 text-[11px]"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {SECTIONS.map((sectionName) => {
          const isTagGroups = sectionName === 'Tag Groups';
          const isWidgets = sectionName === 'Widgets';
          const isViz = false;
          const isOpen = openSections[sectionName];

          const items = (isTagGroups || isWidgets) ? [] : filteredComponents.filter((c) => c.section === sectionName);

          if (!isTagGroups && !isWidgets && search.trim() && items.length === 0) return null;

          return (
            <div key={sectionName} style={{ borderBottom: '1px solid var(--rb-border)' }}>
              <button
                onClick={() => toggleSection(sectionName)}
                className="rb-toolbox-accordion-header"
              >
                <span className="flex items-center gap-1.5">
                  {isTagGroups && <Tag size={11} style={{ color: 'var(--rb-accent)' }} />}
                  {isWidgets && <LayoutGrid size={11} style={{ color: 'var(--rb-accent)' }} />}
                  {sectionName}
                  {isTagGroups && (
                    <span style={{ color: 'var(--rb-text-muted)', fontWeight: 400 }}>
                      ({Array.isArray(groups) ? groups.length : 0})
                    </span>
                  )}
                  {isWidgets && (
                    <span style={{ color: 'var(--rb-text-muted)', fontWeight: 400 }}>
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
                        const isItemActive = activeType === type;
                        return (
                          <Tooltip key={type} title={label} placement="top" arrow disableInteractive>
                            <button
                              type="button"
                              onClick={() => handleAdd(type)}
                              draggable
                              onDragStart={(e) => onDragStart(e, type)}
                              className="rb-toolbox-item flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg cursor-grab active:cursor-grabbing"
                              style={{
                                background: isItemActive ? 'var(--rb-accent-subtle)' : 'transparent',
                              }}
                            >
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{
                                  background: isItemActive ? 'var(--rb-accent-subtle)' : 'var(--rb-surface)',
                                  border: isItemActive
                                    ? '1px solid var(--rb-accent)'
                                    : '1px solid transparent',
                                  transition: 'all 150ms ease',
                                }}
                              >
                                <VizIcon type={type} isActive={isItemActive} />
                              </div>
                              <span
                                className="text-center leading-tight w-full truncate"
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 600,
                                  letterSpacing: '0.04em',
                                  textTransform: 'uppercase',
                                  color: isItemActive ? 'var(--rb-accent)' : 'var(--rb-text-muted)',
                                  transition: 'color 150ms ease',
                                }}
                              >
                                {label.split(' ')[0]}
                              </span>
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
                      const isItemActive = activeType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => handleAdd(type)}
                          draggable
                          onDragStart={(e) => onDragStart(e, type)}
                          className="rb-toolbox-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg group text-left cursor-grab active:cursor-grabbing"
                          style={{
                            border: isItemActive
                              ? '1px solid var(--rb-accent)'
                              : '1px solid transparent',
                            background: isItemActive ? 'var(--rb-accent-subtle)' : 'transparent',
                            transition: 'all 150ms ease',
                          }}
                        >
                          <GripVertical size={12} className="flex-shrink-0 opacity-30 group-hover:opacity-60" style={{ color: 'var(--rb-text-muted)' }} />
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isItemActive ? 'var(--rb-accent-subtle)' : 'var(--rb-surface)',
                              border: isItemActive
                                ? '1px solid var(--rb-accent)'
                                : '1px solid var(--rb-border)',
                              transition: 'all 150ms ease',
                            }}
                          >
                            <VizIcon type={type} isActive={isItemActive} />
                          </div>
                          <p
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: isItemActive ? 'var(--rb-accent)' : 'var(--rb-text)',
                              transition: 'color 150ms ease',
                            }}
                          >
                            {label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isTagGroups && (
                  <div className="px-3 pb-3">
                    <div className="relative mb-2">
                      <Search
                        size={12}
                        className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--rb-text-muted)' }}
                      />
                      <input
                        type="text"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Search tags..."
                        className="rb-input-base w-full ps-7 py-1 text-[10px]"
                      />
                    </div>

                    {groupedSections.length === 0 ? (
                      <p style={{ fontSize: '10px', color: 'var(--rb-text-muted)', padding: '8px 4px' }}>
                        {tagSearch.trim() ? 'No tags match search' : 'No tag groups defined. Go to Engineering → Tag Groups to create groups.'}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {groupedSections.map(({ groupName, tags: groupTags }) => {
                          const isGroupOpen = openTagGroups[groupName] !== false;
                          return (
                            <div key={groupName}>
                              <button
                                onClick={() => toggleTagGroup(groupName)}
                                className="w-full flex items-center gap-1.5 px-1 py-1 text-left rounded"
                                style={{ transition: 'background 120ms ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-surface)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <ChevronDown
                                  size={10}
                                  style={{
                                    transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                                    transform: isGroupOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    flexShrink: 0,
                                    color: 'var(--rb-text-muted)',
                                  }}
                                />
                                <span
                                  className="truncate flex-1"
                                  style={{ fontSize: '10px', fontWeight: 600, color: 'var(--rb-text)' }}
                                >
                                  {groupName}
                                </span>
                                <span
                                  className="flex-shrink-0"
                                  style={{
                                    fontSize: '9px',
                                    color: 'var(--rb-text-muted)',
                                    background: 'var(--rb-surface)',
                                    padding: '2px 6px',
                                    borderRadius: '9999px',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {groupTags.length}
                                </span>
                              </button>
                              {isGroupOpen && (
                                <div className="ml-3 space-y-px">
                                  {groupTags.map((tag) => (
                                    <div
                                      key={tag.tag_name}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('application/report-tag-name', tag.tag_name);
                                        e.dataTransfer.setData('application/report-tag-unit', tag.unit || '');
                                        e.dataTransfer.effectAllowed = 'copy';
                                      }}
                                      className="flex items-center gap-1.5 px-1.5 py-[3px] rounded cursor-grab active:cursor-grabbing"
                                      style={{ transition: 'background 120ms ease' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-accent-bg, var(--rb-surface))'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ background: 'var(--rb-accent)', opacity: 0.5 }}
                                      />
                                      <span
                                        className="truncate flex-1"
                                        style={{ fontSize: '10px', color: 'var(--rb-text-muted)' }}
                                      >
                                        {tag.tag_name}
                                      </span>
                                      {tag.unit && (
                                        <span
                                          className="flex-shrink-0"
                                          style={{
                                            fontSize: '8px',
                                            color: 'var(--rb-text-muted)',
                                            background: 'var(--rb-surface)',
                                            padding: '1px 4px',
                                            borderRadius: '4px',
                                            fontFamily: 'monospace',
                                          }}
                                        >
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
                      <p style={{ fontSize: '10px', color: 'var(--rb-text-muted)', padding: '8px 4px' }}>
                        No widgets with data sources on canvas
                      </p>
                    ) : (
                      widgetsWithData.map((w) => {
                        const ds = widgetDataSources[w.id] || { tags: [], formulas: [] };
                        const isExpanded = openWidgetIds[w.id] || false;
                        const title = w.config?.title || w.config?.dataSource?.tagName || w.type;
                        const typeLabel = TYPE_LABELS[w.type] || w.type;
                        const isSelected = selectedId === w.id;
                        return (
                          <div key={w.id} className="rounded-md overflow-hidden">
                            <button
                              onClick={() => { onSelectWidget?.(w.id); toggleWidgetOpen(w.id); }}
                              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left"
                              style={{
                                background: isSelected ? 'var(--rb-accent-subtle)' : 'transparent',
                                color: isSelected ? 'var(--rb-accent)' : 'var(--rb-text)',
                                boxShadow: isSelected ? '0 0 8px var(--rb-accent-glow)' : 'none',
                                transition: 'all 150ms ease',
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'var(--rb-surface)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                style={{
                                  background: 'var(--rb-surface)',
                                  border: isSelected
                                    ? '1px solid var(--rb-accent)'
                                    : '1px solid var(--rb-border)',
                                }}
                              >
                                <SmallVizIcon type={w.type} />
                              </div>
                              <span
                                className="truncate flex-1"
                                style={{ fontSize: '10px', fontWeight: 500 }}
                              >
                                {title}
                              </span>
                              <span
                                className="flex-shrink-0"
                                style={{
                                  fontSize: '8px',
                                  fontWeight: 600,
                                  color: 'var(--rb-text-muted)',
                                  padding: '2px 6px',
                                  borderRadius: '9999px',
                                  background: 'var(--rb-surface)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.06em',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {typeLabel}
                              </span>
                              <ChevronDown
                                size={10}
                                style={{
                                  transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                  flexShrink: 0,
                                  color: 'var(--rb-text-muted)',
                                }}
                              />
                            </button>

                            {isExpanded && (
                              <div
                                className="ml-7 mt-1 mb-1.5 space-y-0.5 pl-2"
                                style={{ borderLeft: '2px solid color-mix(in srgb, var(--rb-accent) 30%, transparent)' }}
                              >
                                {ds.tags.map((tagName) => (
                                  <div
                                    key={tagName}
                                    className="flex items-center gap-1.5 px-1.5 py-[3px] rounded"
                                    style={{ transition: 'background 120ms ease' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-surface)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: 'var(--rb-success)' }}
                                    />
                                    <span
                                      className="truncate"
                                      style={{ fontSize: '9px', color: 'var(--rb-text-muted)', fontFamily: 'monospace' }}
                                    >
                                      {tagName}
                                    </span>
                                  </div>
                                ))}
                                {ds.formulas.map((formula, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1.5 px-1.5 py-[3px] rounded"
                                    style={{ transition: 'background 120ms ease' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rb-surface)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    <span
                                      className="flex-shrink-0"
                                      style={{ fontSize: '9px', color: 'var(--rb-warning)', fontWeight: 600 }}
                                    >
                                      fx
                                    </span>
                                    <span
                                      className="truncate"
                                      style={{ fontSize: '9px', color: 'var(--rb-text-muted)', fontFamily: 'monospace' }}
                                    >
                                      {formula}
                                    </span>
                                  </div>
                                ))}
                                {ds.tags.length === 0 && ds.formulas.length === 0 && (
                                  <span style={{ fontSize: '9px', color: 'var(--rb-text-muted)', padding: '0 4px' }}>
                                    No data sources
                                  </span>
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
