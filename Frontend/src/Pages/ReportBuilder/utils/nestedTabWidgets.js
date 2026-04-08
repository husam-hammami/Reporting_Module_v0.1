/**
 * Helpers for sub-widgets nested inside tab containers (including nested tab containers).
 */

/**
 * @param {object} tabContainerWidget — widget with type 'tabcontainer'
 * @param {string} targetId
 * @param {string} [preferActiveTabId] — search this tab first to avoid
 *   returning a duplicate from a sibling tab when legacy data shares ids
 *   across machine tabs (C32 / M30 / M31).
 * @returns {object|null}
 */
export function findWidgetDeepInTabContainer(tabContainerWidget, targetId, preferActiveTabId) {
  if (!tabContainerWidget || tabContainerWidget.type !== 'tabcontainer' || !targetId) return null;
  const tabs = tabContainerWidget.config?.tabs || [];

  if (preferActiveTabId) {
    const activeTab = tabs.find((t) => String(t.id) === String(preferActiveTabId));
    if (activeTab) {
      for (const w of activeTab.widgets || []) {
        if (String(w.id) === String(targetId)) return w;
        if (w.type === 'tabcontainer') {
          const nested = w.config || {};
          const nestedActiveId = nested.activeTabId || nested.tabs?.[0]?.id;
          const hit = findWidgetDeepInTabContainer(w, targetId, nestedActiveId);
          if (hit) return hit;
        }
      }
    }
  }

  // Fallback: search all tabs (works correctly when ids are unique).
  for (const tab of tabs) {
    for (const w of tab.widgets || []) {
      if (String(w.id) === String(targetId)) return w;
      if (w.type === 'tabcontainer') {
        const hit = findWidgetDeepInTabContainer(w, targetId);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/**
 * @param {object} w — widget node (may be tabcontainer)
 * @param {string} targetId
 * @param {object} updates — partial widget patch (may include config)
 * @returns {object}
 */
export function updateNestedWidgetDeep(w, targetId, updates) {
  if (!w) return w;
  if (String(w.id) === String(targetId)) {
    const next = { ...w, ...updates };
    if (updates.config && typeof updates.config === 'object') {
      next.config = { ...(w.config || {}), ...updates.config };
    }
    return next;
  }
  if (w.type === 'tabcontainer' && Array.isArray(w.config?.tabs)) {
    const newTabs = w.config.tabs.map((tab) => ({
      ...tab,
      widgets: (tab.widgets || []).map((child) => updateNestedWidgetDeep(child, targetId, updates)),
    }));
    return { ...w, config: { ...w.config, tabs: newTabs } };
  }
  return w;
}

/**
 * Apply react-grid-layout positions to the active tab of a tab container (by widget id), anywhere in the tree.
 * @param {object} w
 * @param {string} targetTcId
 * @param {object[]} layout — RGL layout items { i, x, y, w, h }
 * @returns {object}
 */
export function patchTabContainerSubLayout(w, targetTcId, layout) {
  if (!w) return w;
  if (String(w.id) === String(targetTcId) && w.type === 'tabcontainer') {
    return applyLayoutToTabContainerWidget(w, layout);
  }
  if (w.type === 'tabcontainer' && Array.isArray(w.config?.tabs)) {
    const newTabs = w.config.tabs.map((tab) => ({
      ...tab,
      widgets: (tab.widgets || []).map((child) => patchTabContainerSubLayout(child, targetTcId, layout)),
    }));
    return { ...w, config: { ...w.config, tabs: newTabs } };
  }
  return w;
}

function applyLayoutToTabContainerWidget(tc, layout) {
  const cfg = tc.config || {};
  const tabsCfg = cfg.tabs || [];
  const tcActiveTabId = cfg.activeTabId || tabsCfg[0]?.id;
  const updatedTabs = tabsCfg.map((t) => {
    if (t.id !== tcActiveTabId) return t;
    return {
      ...t,
      widgets: (t.widgets || []).map((child) => {
        const item = layout.find((l) => String(l.i) === String(child.id));
        if (!item) return child;
        return { ...child, x: item.x, y: item.y, w: item.w, h: item.h };
      }),
    };
  });
  return { ...tc, config: { ...cfg, tabs: updatedTabs } };
}
