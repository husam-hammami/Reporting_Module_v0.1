import React, { useState, useCallback, useMemo } from 'react';
import { Plus, X, Copy, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { WIDGET_CATALOG, uid } from './widgetDefaults';

const ADDABLE_TYPES = WIDGET_CATALOG.filter(
  (w) => ['kpi', 'chart', 'barchart', 'gauge', 'stat', 'piechart', 'sparkline', 'progress', 'table', 'text', 'image', 'status', 'hopper', 'silo'].includes(w.type)
);

export default function TabContainerWidget({ config, tagValues, isPreview, isSelected, onUpdate, widgetId, tags, savedFormulas = [], tagHistory, renderWidget }) {
  const safeConfig = config || {};
  const tabs = Array.isArray(safeConfig.tabs) ? safeConfig.tabs : [];
  const activeTabId = safeConfig.activeTabId || tabs[0]?.id || null;
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || null;
  const activeWidgets = activeTab?.widgets || [];

  const canEdit = Boolean(isSelected && onUpdate && widgetId);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showAddTab, setShowAddTab] = useState(false);

  const updateConfig = useCallback((patch) => {
    if (!onUpdate || !widgetId) return;
    onUpdate(widgetId, { config: { ...safeConfig, ...patch } });
  }, [onUpdate, widgetId, safeConfig]);

  const setActiveTab = useCallback((tabId) => {
    updateConfig({ activeTabId: tabId });
  }, [updateConfig]);

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
    const newWidget = {
      id: uid(),
      type: catalogEntry.type,
      x: 0,
      y: activeWidgets.length === 0 ? 0 : Math.max(...activeWidgets.map(w => (w.y || 0) + (w.h || 2))),
      w: catalogEntry.defaultW || 4,
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

  const gridCols = 2;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ padding: '4px 6px' }}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0 border-b border-[var(--rb-border)] pb-2">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={canEdit ? () => {
                const newName = prompt('Rename tab:', tab.label);
                if (newName?.trim()) renameTab(tab.id, newName.trim());
              } : undefined}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all ${
                tab.id === activeTabId
                  ? 'bg-[var(--rb-accent)] text-white shadow-sm'
                  : 'text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:bg-[var(--rb-surface)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddTab(v => !v)}
                className="p-1 rounded text-[var(--rb-text-muted)] hover:text-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] transition-colors"
                title="Add tab"
              >
                <Plus size={12} />
              </button>
              {showAddTab && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddTab(false)} />
                  <div className="absolute z-50 mt-1 right-0 w-48 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl overflow-hidden">
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
                            onClick={() => {
                              const label = prompt('Name for the copy:', `${tab.label} (copy)`);
                              if (label?.trim()) addTab(label.trim(), tab.id);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--rb-text-muted)] hover:text-[var(--rb-text)] hover:bg-[var(--rb-accent-subtle)] transition-colors flex items-center gap-2"
                          >
                            <Copy size={10} /> {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove tab "${activeTab?.label}"?`)) removeTab(activeTabId);
                }}
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
      <div className="flex-1 min-h-0 overflow-auto">
        {activeWidgets.length === 0 && !canEdit && (
          <div className="flex items-center justify-center h-full text-[var(--rb-text-muted)] text-[11px]">
            No widgets in this tab
          </div>
        )}

        {activeWidgets.length === 0 && canEdit && (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <p className="text-[11px] text-[var(--rb-text-muted)] mb-3">Add widgets to this tab</p>
          </div>
        )}

        {activeWidgets.length > 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
          >
            {activeWidgets.map(sw => (
              <div
                key={sw.id}
                className="border border-[var(--rb-border)] rounded-lg overflow-hidden bg-[var(--rb-panel)] relative group"
                style={{ minHeight: `${Math.max((sw.h || 2) * 60, 100)}px` }}
              >
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeSubWidget(sw.id)}
                    className="absolute top-1 right-1 z-10 p-0.5 rounded bg-[var(--rb-surface)]/80 text-[var(--rb-text-muted)] hover:text-[var(--rb-danger)] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove widget"
                  >
                    <X size={10} />
                  </button>
                )}
                {renderWidget ? renderWidget(sw) : (
                  <div className="flex items-center justify-center h-full text-[9px] text-[var(--rb-text-muted)]">
                    {sw.type} widget
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add widget button */}
        {canEdit && (
          <div className="mt-2 relative">
            <button
              type="button"
              onClick={() => setShowAddWidget(v => !v)}
              className="w-full py-2 text-[11px] font-medium text-[var(--rb-accent)] border border-dashed border-[var(--rb-border)] rounded-lg hover:border-[var(--rb-accent)] hover:bg-[var(--rb-accent-subtle)] transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus size={12} /> Add widget to tab
            </button>
            {showAddWidget && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAddWidget(false)} />
                <div className="absolute z-50 mt-1 left-0 right-0 max-h-60 overflow-y-auto rounded-lg border border-[var(--rb-border)] bg-[var(--rb-panel)] shadow-xl">
                  {ADDABLE_TYPES.map(cat => (
                    <button
                      key={cat.type}
                      type="button"
                      onClick={() => addSubWidget(cat)}
                      className="w-full text-left px-3 py-2 text-[11px] text-[var(--rb-text)] hover:bg-[var(--rb-accent-subtle)] transition-colors"
                    >
                      {cat.label}
                      <span className="ml-2 text-[9px] text-[var(--rb-text-muted)]">{cat.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
