import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import { Plus, X, Copy, Trash2, Layers, Activity, Gauge, Hash, CircleDot, BarChart3, TrendingUp, PieChart, Table2, Type, Image, Stamp, LayoutGrid, Cylinder, Container } from 'lucide-react';
import { WIDGET_CATALOG, uid } from './widgetDefaults';

const ADDABLE_TYPES = WIDGET_CATALOG.filter(
  (w) => ['kpi', 'chart', 'barchart', 'gauge', 'stat', 'piechart', 'sparkline', 'progress', 'table', 'text', 'image', 'status', 'hopper', 'silo', 'datapanel'].includes(w.type)
);

const WIDGET_ICON_MAP = {
  kpi: Activity, chart: TrendingUp, barchart: BarChart3, gauge: Gauge,
  stat: Hash, piechart: PieChart, sparkline: Activity, progress: BarChart3,
  table: Table2, text: Type, image: Image, logo: Stamp,
  status: CircleDot, hopper: Container, silo: Cylinder, datapanel: LayoutGrid,
  tabcontainer: Layers,
};

const WIDGET_LABEL_MAP = {
  kpi: 'KPI Card', chart: 'Line Chart', barchart: 'Bar Chart', gauge: 'Gauge',
  stat: 'Stat Panel', piechart: 'Pie Chart', sparkline: 'Sparkline', progress: 'Progress Bar',
  table: 'Data Table', text: 'Text Block', image: 'Image', logo: 'Client Logo',
  status: 'Status Indicator', hopper: 'Hopper', silo: 'Silo', datapanel: 'Data Panel',
  tabcontainer: 'Tab Container',
};

const TC_GRID_COLS = 12;
const TC_ROW_H = 36;
const TC_MARGIN = [4, 4];
const TC_PADDING = [4, 4];

function usePortalDropdown(show, anchorRef, placement = 'below') {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (!show || !anchorRef.current) return;
    const update = () => {
      const r = anchorRef.current.getBoundingClientRect();
      if (placement === 'below') {
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
      } else {
        setPos({ top: r.bottom + 4, left: r.right - 192, width: 192 });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show, anchorRef, placement]);
  return pos;
}

export default function TabContainerWidget({ config, tagValues, isPreview, isSelected, onUpdate, widgetId, tags, savedFormulas = [], tagHistory, renderWidget, onSubWidgetSelect, selectedSubWidgetId: externalSubId, onSubLayoutChange }) {
  const safeConfig = config || {};
  const tabs = Array.isArray(safeConfig.tabs) ? safeConfig.tabs : [];
  const activeTabId = safeConfig.activeTabId || tabs[0]?.id || null;
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || null;
  const activeWidgets = activeTab?.widgets || [];

  const canEdit = Boolean(isSelected && onUpdate && widgetId);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showAddTab, setShowAddTab] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [localSubId, setLocalSubId] = useState(null);

  const selectedSubWidgetId = externalSubId !== undefined ? externalSubId : localSubId;

  const selectSubWidget = useCallback((sw) => {
    if (!canEdit) return;
    setLocalSubId(sw?.id || null);
    onSubWidgetSelect?.(sw || null);
  }, [canEdit, onSubWidgetSelect]);

  const addWidgetBtnRef = useRef(null);
  const addTabBtnRef = useRef(null);
  const addWidgetPos = usePortalDropdown(showAddWidget, addWidgetBtnRef, 'below');
  const addTabPos = usePortalDropdown(showAddTab, addTabBtnRef, 'right-align');

  const { containerRef: gridContainerRef, width: gridMeasuredWidth } = useContainerWidth();
  const gridWidth = gridMeasuredWidth > 0 ? gridMeasuredWidth : 400;

  const configRef = useRef(safeConfig);
  configRef.current = safeConfig;

  const updateConfig = useCallback((patch) => {
    if (!onUpdate || !widgetId) return;
    onUpdate(widgetId, { config: { ...configRef.current, ...patch } });
  }, [onUpdate, widgetId]);

  const setActiveTab = useCallback((tabId) => {
    updateConfig({ activeTabId: tabId });
    selectSubWidget(null);
  }, [updateConfig, selectSubWidget]);

  const addTab = useCallback((label, sourceTabId) => {
    const newId = `tc-${uid()}`;
    let newWidgets = [];
    if (sourceTabId) {
      const src = tabs.find(t => t.id === sourceTabId);
      if (src) {
        newWidgets = JSON.parse(JSON.stringify(src.widgets || []));
        newWidgets.forEach(w => { w.id = uid(); });
      }
    }
    updateConfig({
      tabs: [...tabs, { id: newId, label: label || `Tab ${tabs.length + 1}`, widgets: newWidgets }],
      activeTabId: newId,
    });
    setShowAddTab(false);
  }, [tabs, updateConfig]);

  const removeTab = useCallback((tabId) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter(t => t.id !== tabId);
    const nextActive = tabId === activeTabId ? remaining[0]?.id : activeTabId;
    updateConfig({ tabs: remaining, activeTabId: nextActive });
  }, [tabs, activeTabId, updateConfig]);

  const renameTab = useCallback((tabId, newLabel) => {
    updateConfig({ tabs: tabs.map(t => t.id === tabId ? { ...t, label: newLabel } : t) });
  }, [tabs, updateConfig]);

  const addSubWidget = useCallback((catalogEntry) => {
    if (!activeTab) return;
    const maxY = activeWidgets.length === 0 ? 0 : Math.max(...activeWidgets.map(w => (w.y || 0) + (w.h || 2)));
    const newWidget = {
      id: uid(),
      type: catalogEntry.type,
      x: 0,
      y: maxY,
      w: TC_GRID_COLS,
      h: catalogEntry.defaultH || 2,
      config: JSON.parse(JSON.stringify(catalogEntry.defaultConfig)),
    };
    const updatedTabs = tabs.map(t =>
      t.id === activeTabId ? { ...t, widgets: [...(t.widgets || []), newWidget] } : t
    );
    updateConfig({ tabs: updatedTabs });
    setShowAddWidget(false);
  }, [activeTab, activeTabId, activeWidgets, tabs, updateConfig]);

  const removeSubWidget = useCallback((subWidgetId) => {
    const updatedTabs = tabs.map(t =>
      t.id === activeTabId ? { ...t, widgets: (t.widgets || []).filter(w => w.id !== subWidgetId) } : t
    );
    updateConfig({ tabs: updatedTabs });
  }, [activeTabId, tabs, updateConfig]);

  const updateSubWidget = useCallback((subWidgetId, updates) => {
    const updatedTabs = tabs.map(t => {
      if (t.id !== activeTabId) return t;
      return {
        ...t,
        widgets: (t.widgets || []).map(w => {
          if (w.id !== subWidgetId) return w;
          const next = { ...w, ...updates };
          if (updates.config && typeof updates.config === 'object') {
            next.config = { ...(w.config || {}), ...updates.config };
          }
          return next;
        }),
      };
    });
    updateConfig({ tabs: updatedTabs });
  }, [activeTabId, tabs, updateConfig]);

  const propsLayout = useMemo(() =>
    activeWidgets.map(sw => ({
      i: String(sw.id),
      x: Number.isFinite(sw.x) ? Math.max(0, sw.x) : 0,
      y: Number.isFinite(sw.y) ? Math.max(0, sw.y) : 0,
      w: sw.w >= 1 ? Math.min(sw.w, TC_GRID_COLS) : 3,
      h: sw.h >= 1 ? sw.h : 2,
      minW: 1, minH: 1,
    })),
    [activeWidgets],
  );

  const handleSubInteractionEnd = useCallback((layout) => {
    if (onSubLayoutChange && widgetId) {
      onSubLayoutChange(widgetId, layout);
    }
    // Eagerly update configRef so any subsequent updateConfig call before the
    // parent re-renders won't overwrite the new positions with stale data.
    const curTabs = configRef.current?.tabs;
    const curActive = configRef.current?.activeTabId || (Array.isArray(curTabs) && curTabs[0]?.id);
    if (Array.isArray(curTabs) && curActive) {
      const patched = curTabs.map(t => {
        if (t.id !== curActive) return t;
        return {
          ...t,
          widgets: (t.widgets || []).map(w => {
            const item = layout.find(l => String(l.i) === String(w.id));
            if (!item) return w;
            return { ...w, x: item.x, y: item.y, w: item.w, h: item.h };
          }),
        };
      });
      configRef.current = { ...configRef.current, tabs: patched };
    }
  }, [onSubLayoutChange, widgetId]);

  const addWidgetButton = canEdit ? (
    <button
      ref={addWidgetBtnRef}
      type="button"
      onClick={() => setShowAddWidget(v => !v)}
      className="w-full py-2.5 text-[11px] font-medium text-[var(--rb-accent)] border-2 border-dashed border-[var(--rb-border)] rounded-lg hover:border-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] transition-all flex items-center justify-center gap-2"
    >
      <Plus size={14} /> Add Widget
    </button>
  ) : null;

  return (
    <div className="flex flex-col h-full" style={{ padding: '4px 6px' }}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0 border-b border-[var(--rb-border)] pb-2">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          {tabs.map(tab => (
            renamingId === tab.id ? (
              <input
                key={tab.id}
                autoFocus
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onBlur={() => { if (renameInput.trim()) renameTab(tab.id, renameInput.trim()); setRenamingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (renameInput.trim()) renameTab(tab.id, renameInput.trim()); setRenamingId(null); }
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-[var(--rb-surface)] border border-[var(--rb-accent)] text-[var(--rb-text)] outline-none w-24"
              />
            ) : (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                onDoubleClick={canEdit ? () => { setRenameInput(tab.label); setRenamingId(tab.id); } : undefined}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all ${
                  tab.id === activeTabId
                    ? 'bg-[var(--rb-accent)] text-white shadow-sm'
                    : 'text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:bg-[var(--rb-surface)]'
                }`}
              >
                {tab.label}
              </button>
            )
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              ref={addTabBtnRef}
              type="button"
              onClick={() => setShowAddTab(v => !v)}
              className="p-1 rounded text-[var(--rb-text-muted)] hover:text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] transition-colors"
              title="Add tab"
            >
              <Plus size={12} />
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => removeTab(activeTabId)}
                className="p-1 rounded text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] hover:bg-[var(--rb-danger-subtle)] transition-colors"
                title="Remove active tab"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sub-widgets content area */}
      <div ref={gridContainerRef} className="flex-1 min-h-0 overflow-auto" onClick={() => selectSubWidget(null)}>
        {activeWidgets.length === 0 && !canEdit && (
          <div className="flex items-center justify-center h-full text-[var(--rb-text-muted)] text-[11px]">
            No widgets in this tab
          </div>
        )}

        {activeWidgets.length === 0 && canEdit && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-6">
            <p className="text-[11px] text-[var(--rb-text-muted)]">Add widgets to this tab</p>
            <div className="w-56">{addWidgetButton}</div>
          </div>
        )}

        {activeWidgets.length > 0 && gridWidth > 0 && (
          <GridLayout
            className="layout"
            width={gridWidth}
            layout={propsLayout}
            cols={TC_GRID_COLS}
            rowHeight={TC_ROW_H}
            margin={TC_MARGIN}
            containerPadding={TC_PADDING}
            compactType="vertical"
            isDraggable={canEdit}
            isResizable={canEdit}
            resizeHandles={['se', 'e', 's']}
            onDragStop={handleSubInteractionEnd}
            onResizeStop={handleSubInteractionEnd}
            draggableCancel=".no-drag"
          >
            {activeWidgets.map(sw => {
              const isSubSel = selectedSubWidgetId === sw.id;
              return (
                <div
                  key={String(sw.id)}
                  onClick={(e) => { e.stopPropagation(); selectSubWidget(sw); }}
                  className={`rounded-lg group overflow-visible ${
                    isSubSel
                      ? 'rb-widget-card rb-widget-selected'
                      : 'rb-widget-card hover:border-[var(--rb-accent)]'
                  }`}
                  style={isSubSel ? { borderColor: 'var(--rb-accent)', boxShadow: '0 0 0 2px var(--rb-accent)' } : undefined}
                >
                  {/* Delete button */}
                  {canEdit && (
                    <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeSubWidget(sw.id); if (isSubSel) selectSubWidget(null); }}
                        className="no-drag p-1 rounded bg-[var(--rb-surface)]/80 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] transition-colors"
                        title="Remove widget"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                  {/* Widget body — no extra title, rendered same as outside */}
                  <div className="no-drag h-full overflow-hidden">
                    {renderWidget ? renderWidget(sw, { isSubSelected: isSubSel, onUpdateSubWidget: updateSubWidget }) : (
                      <div className="flex items-center justify-center h-full text-[9px] text-[var(--rb-text-muted)]">
                        {sw.type} widget
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </GridLayout>
        )}

        {activeWidgets.length > 0 && canEdit && (
          <div className="mt-2 px-1">{addWidgetButton}</div>
        )}
      </div>

      {/* Portal: Add-widget dropdown */}
      {showAddWidget && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowAddWidget(false)} />
          <div
            className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-2xl"
            style={{ top: addWidgetPos.top, left: addWidgetPos.left, width: Math.max(addWidgetPos.width, 280), minWidth: 280 }}
          >
            <div className="px-3 py-2 border-b border-[var(--rb-border)]">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--rb-text-muted)]">Choose Widget Type</p>
            </div>
            <div className="py-1">
              {ADDABLE_TYPES.map(cat => {
                const CatIcon = WIDGET_ICON_MAP[cat.type] || Layers;
                return (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() => addSubWidget(cat)}
                    className="w-full text-left px-3 py-2 text-[11px] text-[var(--rb-text)] hover:bg-[var(--rb-accent-subtle)] transition-colors flex items-center gap-2.5"
                  >
                    <span className="w-6 h-6 rounded-md bg-[var(--rb-surface)] border border-[var(--rb-border)] flex items-center justify-center flex-shrink-0">
                      <CatIcon size={12} className="text-[var(--rb-text-muted)]" />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{cat.label}</span>
                      <span className="text-[9px] text-[var(--rb-text-muted)] truncate">{cat.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Portal: Add-tab dropdown */}
      {showAddTab && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowAddTab(false)} />
          <div
            className="fixed z-[9999] w-48 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl overflow-hidden"
            style={{ top: addTabPos.top, left: addTabPos.left }}
          >
            <button
              type="button"
              onClick={() => addTab()}
              className="w-full text-left px-3 py-2 text-[11px] text-[var(--rb-text)] hover:bg-[var(--rb-accent-subtle)] transition-colors flex items-center gap-2"
            >
              <Plus size={11} className="text-[var(--rb-accent)]" /> Empty tab
            </button>
            {tabs.length > 0 && (
              <div className="border-t border-[var(--rb-border)]">
                <div className="px-3 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--rb-text-muted)]">Copy from...</div>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => addTab(`${tab.label} (copy)`, tab.id)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:bg-[var(--rb-accent-subtle)] transition-colors flex items-center gap-2"
                  >
                    <Copy size={10} /> {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
