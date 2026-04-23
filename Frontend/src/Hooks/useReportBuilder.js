import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { loadAndMigrateConfig, EMPTY_LAYOUT_CONFIG, CURRENT_SCHEMA_VERSION } from '../Pages/ReportBuilder/state/templateSchema';
import { effectiveRangeForDataPanelTimeScope } from '../Pages/ReportBuilder/utils/dataPanelTimeScope';
import { buildGrainSilosTemplate } from '../Pages/ReportBuilder/seed/grainSilosTemplate';
import { reportBuilderApi } from '../API/reportBuilderApi';
import axios, { isExplicitRemoteApi } from '../API/axios';

/* ── localStorage helpers ──────────────────────────────────────── */

const LS_KEY = 'hercules_report_builder_templates';

function lsRead() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    if (!Array.isArray(raw)) { localStorage.removeItem(LS_KEY); return []; }
    // Auto-repair: filter out any non-object entries
    return raw.filter((t) => t && typeof t === 'object' && t.id);
  } catch {
    localStorage.removeItem(LS_KEY);
    return [];
  }
}

function lsWrite(templates) {
  localStorage.setItem(LS_KEY, JSON.stringify(templates));
}

const CLEAR_FLAG = 'hercules_report_builder_templates_cleared';
const GRAIN_SILOS_SEEDED_FLAG = 'hercules_report_builder_grain_silos_seeded';

let _nextId = Date.now();
function localId() { return _nextId++; }

/** Map backend row to frontend template shape (add status for UI). */
function mapApiTemplate(t) {
  return {
    ...t,
    status: t.status ?? (t.is_default ? 'published' : (t.is_active !== false ? 'draft' : 'draft')),
  };
}

/**
 * Collect all tag names used by a list of widgets (full contract: dataSource, series, columns, silo extras).
 * Used by Preview and Reporting for REST/WebSocket live data requests.
 */
export function collectWidgetTagNames(widgets) {
  const names = new Set();
  if (!Array.isArray(widgets)) return [];
  widgets.forEach((w) => {
    const c = w.config || {};
    if (c.tagName) names.add(c.tagName);
    if (c.dataSource?.tagName) names.add(c.dataSource.tagName);
    if (Array.isArray(c.dataSource?.groupTags)) {
      c.dataSource.groupTags.forEach((t) => { if (t) names.add(t); });
    }
    if (Array.isArray(c.tags)) {
      c.tags.forEach((t) => { if (t?.tagName) names.add(t.tagName); });
    }
    if (Array.isArray(c.series)) {
      c.series.forEach((s) => {
        const tag = s?.dataSource?.tagName ?? s?.tagName;
        if (tag) names.add(tag);
        if (Array.isArray(s?.dataSource?.groupTags)) {
          s.dataSource.groupTags.forEach((t) => { if (t) names.add(t); });
        }
      });
    }
    if (Array.isArray(c.columns)) {
      c.columns.forEach((col) => { if (col?.tagName) names.add(col.tagName); });
    }
    if (Array.isArray(c.tableColumns)) {
      c.tableColumns.forEach((col) => { if (col?.tagName) names.add(col.tagName); });
    }
    // Table static row cells: each cell can be tag/formula/group — collect tag names so live/preview request them
    if (Array.isArray(c.staticDataRows)) {
      c.staticDataRows.forEach((row) => {
        if (Array.isArray(row)) {
          row.forEach((cell) => {
            if (cell && typeof cell === 'object') {
              if (cell.sourceType === 'tag' && cell.tagName) names.add(cell.tagName);
              if (Array.isArray(cell.groupTags)) cell.groupTags.forEach((t) => { if (t) names.add(t); });
            }
          });
        }
      });
    }
    if (c.capacityTag) names.add(c.capacityTag);
    if (c.tonsTag) names.add(c.tonsTag);

    // Data Panel fields
    if (Array.isArray(c.fields)) {
      c.fields.forEach((f) => {
        if (f.sourceType === 'tag' && f.tagName) names.add(f.tagName);
      });
    }

    // Tab container: recursively collect from all tabs' sub-widgets
    if (w.type === 'tabcontainer' && Array.isArray(c.tabs)) {
      c.tabs.forEach((tab) => {
        if (Array.isArray(tab.widgets)) {
          collectWidgetTagNames(tab.widgets).forEach((t) => names.add(t));
        }
      });
    }

    // Drill-down detail widgets: expand {ROW_KEY} templates for every known row key
    const dd = c.drillDown;
    if (dd?.enabled && Array.isArray(dd.detailWidgets) && dd.detailWidgets.length > 0) {
      const keyCol = dd.keyColumn ?? 0;
      const rowKeys = new Set();
      // Collect row key values from the live row key column and static rows
      const liveCol = Array.isArray(c.tableColumns) ? c.tableColumns[keyCol] : null;
      if (liveCol?.sourceType === 'static' && liveCol.staticValue) rowKeys.add(liveCol.staticValue);
      if (liveCol?.tagName) rowKeys.add(liveCol.tagName);
      if (Array.isArray(c.staticDataRows)) {
        c.staticDataRows.forEach((row) => {
          if (!Array.isArray(row)) return;
          const cell = row[keyCol];
          if (cell && typeof cell === 'object') {
            if (cell.sourceType === 'static' && cell.staticValue) rowKeys.add(String(cell.staticValue));
            else if (cell.tagName) rowKeys.add(cell.tagName);
          } else if (cell != null) {
            rowKeys.add(String(cell));
          }
        });
      }
      // For each detail widget, collect tag names with {ROW_KEY} expanded
      dd.detailWidgets.forEach((dw) => {
        const dc = dw.config || {};
        const collectFromConfig = (cfg) => {
          const json = JSON.stringify(cfg);
          if (!json.includes('{ROW_KEY}')) {
            // No placeholder — collect tags directly
            if (cfg.dataSource?.tagName) names.add(cfg.dataSource.tagName);
            if (Array.isArray(cfg.series)) cfg.series.forEach((s) => {
              const tag = s?.dataSource?.tagName ?? s?.tagName;
              if (tag) names.add(tag);
            });
            return;
          }
          rowKeys.forEach((rk) => {
            const resolved = json.replace(/\{ROW_KEY\}/g, rk);
            try {
              const rc = JSON.parse(resolved);
              if (rc.dataSource?.tagName) names.add(rc.dataSource.tagName);
              if (Array.isArray(rc.series)) rc.series.forEach((s) => {
                const tag = s?.dataSource?.tagName ?? s?.tagName;
                if (tag) names.add(tag);
              });
            } catch { /* skip malformed */ }
          });
        };
        collectFromConfig(dc);
      });
    }
  });
  return [...names];
}

/**
 * Collect per-tag aggregation types from widget configurations.
 * Returns { tagName: aggregationType } based on each widget's dataSource.aggregation.
 * Used by ReportViewer to fetch historical data with the correct aggregation per tag.
 */
export function collectWidgetTagAggregations(widgets) {
  const tagAgg = {}; // tagName → aggregation type
  if (!Array.isArray(widgets)) return tagAgg;

  // Priority: if same tag appears in multiple widgets with different aggregations,
  // keep the one that's most "informative" (sum > avg > delta > min/max > count > last)
  const PRIORITY = { sum: 6, avg: 5, delta: 4, min: 3, max: 3, count: 2, first: 1, last: 1 };
  const setAgg = (tagName, agg) => {
    if (!tagName) return;
    const a = agg || 'last';
    if (!tagAgg[tagName] || (PRIORITY[a] || 0) > (PRIORITY[tagAgg[tagName]] || 0)) {
      tagAgg[tagName] = a;
    }
  };

  widgets.forEach((w) => {
    const c = w.config || {};
    const ds = c.dataSource;
    const widgetAgg = ds?.aggregation || 'last';

    // Direct tag on dataSource (KPI, Stat, Gauge, Silo)
    if (ds?.tagName) setAgg(ds.tagName, widgetAgg);
    // Legacy fallback
    if (c.tagName) setAgg(c.tagName, widgetAgg);

    // Group tags on dataSource
    if (Array.isArray(ds?.groupTags)) {
      ds.groupTags.forEach((t) => setAgg(t, widgetAgg));
    }

    // Formula: extract tag refs and assign widget's aggregation
    if (ds?.type === 'formula' && ds?.formula) {
      const tagRe = /\{([^}]+)\}/g;
      let m;
      while ((m = tagRe.exec(ds.formula)) !== null) {
        if (!m[1].startsWith('col:')) setAgg(m[1], widgetAgg);
      }
    }

    // Chart/barchart series
    if (Array.isArray(c.series)) {
      c.series.forEach((s) => {
        const tag = s?.dataSource?.tagName ?? s?.tagName;
        if (tag) setAgg(tag, 'last'); // Charts always use 'last' for live streaming
        if (Array.isArray(s?.dataSource?.groupTags)) {
          s.dataSource.groupTags.forEach((t) => setAgg(t, 'last'));
        }
      });
    }

    // Table columns — each column can have its own aggregation
    if (Array.isArray(c.tableColumns)) {
      c.tableColumns.forEach((col) => {
        const colAgg = col.aggregation || 'last';
        if (col.tagName) setAgg(col.tagName, colAgg);
        if (Array.isArray(col.groupTags)) {
          col.groupTags.forEach((t) => setAgg(t, colAgg));
        }
        // Formula columns: extract tag refs
        if (col.sourceType === 'formula' && col.formula) {
          const tagRe = /\{([^}]+)\}/g;
          let m;
          while ((m = tagRe.exec(col.formula)) !== null) {
            if (!m[1].startsWith('col:')) setAgg(m[1], colAgg);
          }
        }
      });
    }

    // Silo capacity/tons tags
    if (c.capacityTag) setAgg(c.capacityTag, 'last');
    if (c.tonsTag) setAgg(c.tonsTag, 'last');

    // Data Panel fields — only "inherit" uses the global report window + this aggregation map
    if (Array.isArray(c.fields)) {
      c.fields.forEach((f) => {
        if (f.sourceType === 'tag' && f.tagName) {
          const ts = f.timeScope || 'inherit';
          if (ts === 'inherit') setAgg(f.tagName, f.aggregation || 'last');
        }
      });
    }

    // Tab container: recursively collect aggregations from all tabs' sub-widgets
    if (w.type === 'tabcontainer' && Array.isArray(c.tabs)) {
      c.tabs.forEach((tab) => {
        if (Array.isArray(tab.widgets)) {
          const subAgg = collectWidgetTagAggregations(tab.widgets);
          Object.entries(subAgg).forEach(([tag, agg]) => setAgg(tag, agg));
        }
      });
    }

    // Drill-down detail widgets: expand {ROW_KEY} and assign aggregations
    const dd = c.drillDown;
    if (dd?.enabled && Array.isArray(dd.detailWidgets) && dd.detailWidgets.length > 0) {
      const keyCol = dd.keyColumn ?? 0;
      const rowKeys = new Set();
      const liveCol = Array.isArray(c.tableColumns) ? c.tableColumns[keyCol] : null;
      if (liveCol?.sourceType === 'static' && liveCol.staticValue) rowKeys.add(liveCol.staticValue);
      if (liveCol?.tagName) rowKeys.add(liveCol.tagName);
      if (Array.isArray(c.staticDataRows)) {
        c.staticDataRows.forEach((row) => {
          if (!Array.isArray(row)) return;
          const cell = row[keyCol];
          if (cell && typeof cell === 'object') {
            if (cell.sourceType === 'static' && cell.staticValue) rowKeys.add(String(cell.staticValue));
            else if (cell.tagName) rowKeys.add(cell.tagName);
          } else if (cell != null) rowKeys.add(String(cell));
        });
      }
      dd.detailWidgets.forEach((dw) => {
        const dc = dw.config || {};
        const json = JSON.stringify(dc);
        const expand = (rk) => {
          try {
            const rc = JSON.parse(json.replace(/\{ROW_KEY\}/g, rk));
            const dds = rc.dataSource;
            if (dds?.tagName) setAgg(dds.tagName, dds.aggregation || 'last');
            if (Array.isArray(rc.series)) rc.series.forEach((s) => {
              const tag = s?.dataSource?.tagName ?? s?.tagName;
              if (tag) setAgg(tag, 'last');
            });
          } catch { /* skip */ }
        };
        if (json.includes('{ROW_KEY}')) {
          rowKeys.forEach(expand);
        } else {
          expand(''); // no placeholder, collect as-is
        }
      });
    }
  });

  return tagAgg;
}

/**
 * Data Panel tag inputs with timeScope !== 'inherit' need their own historian window.
 * @param {Array} widgets
 * @param {Date} anchorDate  Report range end (historical) or "now" (live)
 * @returns {Array<{ fieldId: string, tagName: string, aggregation: string, from: Date, to: Date }>}
 */
export function collectDataPanelScopedHistorianRequests(widgets, anchorDate) {
  const out = [];
  function walk(ws) {
    if (!Array.isArray(ws)) return;
    ws.forEach((w) => {
      const c = w.config || {};
      if (w.type === 'datapanel' && Array.isArray(c.fields)) {
        c.fields.forEach((f) => {
          if (f.sourceType !== 'tag' || !f.tagName || !f.id) return;
          const ts = f.timeScope || 'inherit';
          if (ts === 'inherit') return;
          const { from, to } = effectiveRangeForDataPanelTimeScope(ts, anchorDate);
          if (from && to) {
            out.push({
              fieldId: f.id,
              tagName: f.tagName,
              aggregation: f.aggregation || 'last',
              from,
              to,
            });
          }
        });
      }
      if (w.type === 'tabcontainer' && Array.isArray(c.tabs)) {
        c.tabs.forEach((tab) => walk(tab.widgets));
      }
    });
  }
  walk(widgets);
  return out;
}

/* ── useReportTemplates (Manager page) — API-first, fallback to localStorage ── */

export function useReportTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const SEED_DEMO_REPORTS = true;

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportBuilderApi.list();
      const body = res?.data;
      const list = (body?.status === 'success' && Array.isArray(body?.data) ? body.data
        : Array.isArray(body?.data?.data) ? body.data.data
        : Array.isArray(body) ? body
        : null);
      if (Array.isArray(list)) {
        setTemplates(list.map(mapApiTemplate));
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn('[Report Builder] API list failed:', e?.message || e);
      setError(e?.message || 'Backend unreachable');
    }
    if (isExplicitRemoteApi()) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    // Fallback: localStorage + optional seed
    if (!localStorage.getItem(CLEAR_FLAG)) {
      lsWrite([]);
      localStorage.setItem(CLEAR_FLAG, '1');
    }
    if (SEED_DEMO_REPORTS && !localStorage.getItem(GRAIN_SILOS_SEEDED_FLAG)) {
      try {
        const existing = lsRead();
        const hasGrainSilos = existing.some((t) => t.name === 'Grain_Silos');
        if (!hasGrainSilos) {
          const seed = buildGrainSilosTemplate(localId());
          lsWrite([seed, ...existing]);
          localStorage.setItem(GRAIN_SILOS_SEEDED_FLAG, '1');
        }
      } catch (e) {
        console.warn('[Report Builder] Seed template failed:', e);
      }
    }
    setTemplates(lsRead());
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = useCallback(async (data) => {
    const layoutConfig = data.layout_config || { ...EMPTY_LAYOUT_CONFIG };
    try {
      const payload = {
        name: data.name || 'Untitled Report',
        description: data.description || '',
        layout_config: layoutConfig,
      };
      const res = await reportBuilderApi.create(payload);
      const created = res?.data?.data;
      if (created) {
        setTemplates((prev) => [mapApiTemplate(created), ...prev]);
        return mapApiTemplate(created);
      }
    } catch (e) {
      console.warn('[Report Builder] API create failed, using local:', e?.message || e);
    }
    const created = {
      id: localId(),
      name: data.name || 'Untitled Report',
      description: data.description || '',
      status: 'draft',
      layout_config: layoutConfig,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTemplates((prev) => { const next = [created, ...prev]; lsWrite(next); return next; });
    return created;
  }, []);

  const deleteTemplate = useCallback(async (id) => {
    try {
      await reportBuilderApi.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      return;
    } catch (e) {
      console.warn('[Report Builder] API delete failed, using local:', e?.message || e);
    }
    setTemplates((prev) => { const next = prev.filter((t) => t.id !== id); lsWrite(next); return next; });
  }, []);

  const duplicateTemplate = useCallback(async (id) => {
    try {
      const res = await reportBuilderApi.duplicate(id);
      const dup = res?.data?.data;
      if (dup) {
        setTemplates((prev) => [mapApiTemplate(dup), ...prev]);
        return mapApiTemplate(dup);
      }
    } catch (e) {
      console.warn('[Report Builder] API duplicate failed, using local:', e?.message || e);
    }
    const all = lsRead();
    const original = all.find((t) => t.id === id);
    if (!original) return null;
    const dup = {
      ...JSON.parse(JSON.stringify(original)),
      id: localId(),
      name: `${original.name} (Copy)`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTemplates((prev) => { const next = [dup, ...prev]; lsWrite(next); return next; });
    return dup;
  }, []);

  const clearAllTemplates = useCallback(() => {
    lsWrite([]);
    setTemplates([]);
  }, []);

  const updateTemplateStatus = useCallback(async (id, status) => {
    // Optimistic update
    setTemplates((prev) => prev.map((t) => String(t.id) === String(id) ? { ...t, status } : t));
    try {
      await reportBuilderApi.update(id, { status });
    } catch (e) {
      console.warn('[Report Builder] API status update failed:', e?.message || e);
    }
  }, []);

  return { templates, loading, error, fetchTemplates, createTemplate, deleteTemplate, duplicateTemplate, clearAllTemplates, updateTemplateStatus };
}

/* ── useReportCanvas (Canvas page) ─────────────────────────────── */

const MAX_HISTORY = 50;

export function useReportCanvas(templateId) {
  const [template, setTemplate] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [computedSignals, setComputedSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSave, setAutoSave] = useState(() => {
    try { return localStorage.getItem('rb_autosave') !== 'false'; } catch { return true; }
  });
  const [migrated, setMigrated] = useState(false);
  const [historyState, setHistoryState] = useState({ pastCount: 0, futureCount: 0 });
  const autosaveTimer = useRef(null);
  const templateRef = useRef(null);
  const widgetsRef = useRef([]);
  const parametersRef = useRef([]);
  const computedSignalsRef = useRef([]);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const layoutDebounceRef = useRef({ timer: null, pendingPrev: null });
  const lastUndoRedoAt = useRef(0);

  /* ── Dashboard Tabs state ── */
  const [dashboardTabs, setDashboardTabs] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const tabsRef = useRef(null);

  // Keep all refs synchronously up-to-date so performSave never uses stale closures
  templateRef.current = template;
  tabsRef.current = dashboardTabs;
  widgetsRef.current = widgets;
  parametersRef.current = parameters;
  computedSignalsRef.current = computedSignals;

  const tabsEnabled = !!dashboardTabs?.enabled;

  const toggleAutoSave = useCallback(() => {
    setAutoSave((prev) => {
      const next = !prev;
      try { localStorage.setItem('rb_autosave', String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      const db = layoutDebounceRef.current;
      if (db.timer) clearTimeout(db.timer);
      db.timer = null;
      db.pendingPrev = null;
    };
  }, [templateId]);

  // Load template — API-first, then localStorage
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await reportBuilderApi.get(templateId);
        const body = res?.data;
        const data = body?.data ?? (body && body.layout_config != null ? body : null);
        if (cancelled) return;
        if (data) {
          const found = mapApiTemplate(data);
          const { config, migrated: wasMigrated, repaired } = loadAndMigrateConfig(found.layout_config || {});
          setTemplate(found);
          const dt = config.dashboardTabs || null;
          setDashboardTabs(dt);
          if (dt?.enabled && Array.isArray(dt.tabs) && dt.tabs.length > 0) {
            const firstTab = dt.tabs.find(t => t.id === dt.activeTabId) || dt.tabs[0];
            setActiveTabId(firstTab.id);
            setWidgets(firstTab.widgets || []);
          } else {
            setActiveTabId(null);
            setWidgets(config.widgets || []);
          }
          setParameters(config.parameters || []);
          setComputedSignals(config.computedSignals || []);
          setMigrated(wasMigrated || repaired);
          pastRef.current = [];
          futureRef.current = [];
          setHistoryState({ pastCount: 0, futureCount: 0 });
          setLoading(false);
          return;
        }
      } catch (e) {
        if (!cancelled) console.warn('[Report Builder] API get failed:', e?.message || e);
      }
      if (!cancelled && isExplicitRemoteApi()) {
        setTemplate(null);
        setWidgets([]);
        setParameters([]);
        setComputedSignals([]);
        pastRef.current = [];
        futureRef.current = [];
        setHistoryState({ pastCount: 0, futureCount: 0 });
        setLoading(false);
        return;
      }
      const all = lsRead();
      const found = all.find((t) => String(t.id) === String(templateId));
      if (!cancelled && found) {
        const { config, migrated: wasMigrated, repaired } = loadAndMigrateConfig(found.layout_config);
        setTemplate(found);
        const dt = config.dashboardTabs || null;
        setDashboardTabs(dt);
        if (dt?.enabled && Array.isArray(dt.tabs) && dt.tabs.length > 0) {
          const firstTab = dt.tabs.find(t => t.id === dt.activeTabId) || dt.tabs[0];
          setActiveTabId(firstTab.id);
          setWidgets(firstTab.widgets || []);
        } else {
          setActiveTabId(null);
          setWidgets(config.widgets || []);
        }
        setParameters(config.parameters || []);
        setComputedSignals(config.computedSignals || []);
        setMigrated(wasMigrated || repaired);
        pastRef.current = [];
        futureRef.current = [];
        setHistoryState({ pastCount: 0, futureCount: 0 });
        if (wasMigrated || repaired) {
          const updated = { ...found, layout_config: config, updated_at: new Date().toISOString() };
          const idx = all.findIndex((t) => String(t.id) === String(templateId));
          if (idx >= 0) { all[idx] = updated; lsWrite(all); }
        }
      } else if (!cancelled) {
        setTemplate({
          id: templateId, name: 'Untitled Report', description: '', status: 'draft',
          layout_config: { ...EMPTY_LAYOUT_CONFIG },
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        setWidgets([]);
        setParameters([]);
        setComputedSignals([]);
        pastRef.current = [];
        futureRef.current = [];
        setHistoryState({ pastCount: 0, futureCount: 0 });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  // Debounced autosave (2s after last change) — only when autoSave is enabled
  useEffect(() => {
    if (!autoSave || !dirty || !templateId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      performSave();
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [autoSave, dirty, widgets, parameters, computedSignals, templateId]);

  const performSave = useCallback(async () => {
    if (!templateId) return;
    // Always read the absolute latest state from synchronous refs
    const w = widgetsRef.current;
    const p = parametersRef.current;
    const cs = computedSignalsRef.current;
    const currentTemplate = templateRef.current;
    const existingLC = currentTemplate?.layout_config || {};

    // When tabs are enabled, persist current widgets into the active tab
    const currentTabs = tabsRef.current;
    const currentActiveTabId = currentTabs?.activeTabId;
    let savedTabs = currentTabs;
    if (currentTabs?.enabled && currentActiveTabId && Array.isArray(currentTabs.tabs)) {
      savedTabs = {
        ...currentTabs,
        activeTabId: currentActiveTabId,
        tabs: currentTabs.tabs.map((tab) =>
          tab.id === currentActiveTabId ? { ...tab, widgets: JSON.parse(JSON.stringify(w)) } : tab
        ),
      };
    }

    const layout_config = {
      ...existingLC,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      widgets: savedTabs?.enabled ? [] : JSON.parse(JSON.stringify(w)),
      parameters: p,
      computedSignals: cs,
      grid: existingLC.grid || { cols: 12, rowHeight: 40 },
      dashboardTabs: savedTabs || null,
    };

    const payload = { layout_config };
    const updated = { ...currentTemplate, layout_config, updated_at: new Date().toISOString() };
    try {
      await reportBuilderApi.update(templateId, payload);
      setTemplate(updated);
      setDirty(false);
      return;
    } catch (e) {
      console.warn('[Report Builder] API update failed, using localStorage:', e?.message || e);
    }
    const all = lsRead();
    const idx = all.findIndex((t) => String(t.id) === String(templateId));
    if (idx >= 0) { all[idx] = updated; } else { all.unshift(updated); }
    lsWrite(all);
    setTemplate(updated);
    setDirty(false);
  }, [templateId]);

  // Manual save
  const saveLayout = useCallback(async () => {
    setSaving(true);
    try {
      await performSave();
    } finally {
      setSaving(false);
    }
  }, [performSave]);

  // Update template name/description/status/layout_config — persists to API
  const updateMeta = useCallback(async (updates) => {
    if (!templateId) return;
    // Use ref to always get the latest template (avoids stale closure)
    const currentTemplate = templateRef.current;
    // Optimistic local update
    const updated = { ...currentTemplate, ...updates, updated_at: new Date().toISOString() };
    setTemplate(updated);
    const all = lsRead();
    const idx = all.findIndex((t) => String(t.id) === String(templateId));
    if (idx >= 0) { all[idx] = updated; lsWrite(all); }
    // Persist to API
    try {
      await reportBuilderApi.update(templateId, updates);
    } catch (e) {
      console.warn('[Report Builder] API meta update failed:', e?.message || e);
    }
  }, [templateId]);

  const pushToHistory = useCallback((prevWidgets) => {
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), JSON.parse(JSON.stringify(prevWidgets))];
    futureRef.current = [];
    setHistoryState({ pastCount: pastRef.current.length, futureCount: 0 });
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    lastUndoRedoAt.current = Date.now();
    const previous = pastRef.current.pop();
    setWidgets((current) => {
      if (current !== previous) {
        futureRef.current = [JSON.parse(JSON.stringify(current)), ...futureRef.current.slice(0, MAX_HISTORY - 1)];
      }
      return previous;
    });
    setHistoryState({ pastCount: pastRef.current.length, futureCount: futureRef.current.length + 1 });
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    lastUndoRedoAt.current = Date.now();
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    setWidgets((current) => {
      if (current.length !== next.length || JSON.stringify(current.map((x) => x.id)) !== JSON.stringify(next.map((x) => x.id))) {
        pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), JSON.parse(JSON.stringify(current))];
      }
      return next;
    });
    setHistoryState({ pastCount: pastRef.current.length + 1, futureCount: futureRef.current.length });
    setDirty(true);
  }, []);

  const canUndo = historyState.pastCount > 0;
  const canRedo = historyState.futureCount > 0;

  // Widget operations
  const addWidget = useCallback((widget) => {
    setWidgets((prev) => {
      pushToHistory(prev);
      return [...prev, widget];
    });
    setDirty(true);
  }, [pushToHistory]);

  /* Add widget at (x,y), shifting overlapping widgets down in a single atomic update */
  const addWidgetAt = useCallback((widget, x, y) => {
    const w = Number(widget.w) || 2;
    const h = Number(widget.h) || 2;
    const placed = { ...widget, x, y };
    setWidgets((prev) => {
      pushToHistory(prev);
      const overlaps = prev.filter((item) => {
        const iw = Number(item.w) || 2;
        const ih = Number(item.h) || 2;
        const ixOverlap = item.x + iw > x && item.x < x + w;
        const iyOverlap = item.y + ih > y && item.y < y + h;
        return ixOverlap && iyOverlap;
      });
      if (overlaps.length === 0) {
        return [...prev, placed];
      }
      const sorted = [...overlaps].sort((a, b) => (a.y || 0) - (b.y || 0));
      let insertBottom = y + h;
      const shifts = new Map();
      for (const item of sorted) {
        const ih = Number(item.h) || 2;
        const newY = Math.max(item.y || 0, insertBottom);
        shifts.set(item.id, newY);
        insertBottom = newY + ih;
      }
      const displaced = prev.map((item) => {
        const newY = shifts.get(item.id);
        if (newY != null) return { ...item, y: newY };
        return item;
      });
      return [...displaced, placed];
    });
    setDirty(true);
  }, [pushToHistory]);

  /** Table widget: grid height to fit header + 1 live row + static rows + summary rows + button row (builder). */
  const getTableWidgetDesiredHeight = useCallback((config) => {
    const c = config || {};
    const staticCount = Array.isArray(c.staticDataRows) ? c.staticDataRows.length : 0;
    const summaryCount = Array.isArray(c.summaryRows) ? c.summaryRows.length : 0;
    const contentRows = 1 + 1 + staticCount + summaryCount + 1; // header + live + static + summary + "New row" row
    const reservedGridRows = 2; // title + padding (≈56px at 40px/row)
    return Math.max(2, reservedGridRows + contentRows);
  }, []);

  const updateWidget = useCallback((widgetId, updates) => {
    setWidgets((prev) => {
      pushToHistory(prev);
      return prev.map((w) => {
        if (w.id !== widgetId) return w;
        const next = { ...w, ...updates };
        if (updates.config && typeof updates.config === 'object') {
          next.config = { ...(w.config || {}), ...updates.config };
        }
        if (w.type === 'table' && next.config) {
          const desiredH = getTableWidgetDesiredHeight(next.config);
          next.h = desiredH;
        }
        return next;
      });
    });
    setDirty(true);
  }, [pushToHistory, getTableWidgetDesiredHeight]);

  const removeWidget = useCallback((widgetId) => {
    setWidgets((prev) => {
      pushToHistory(prev);
      return prev.filter((w) => w.id !== widgetId);
    });
    setDirty(true);
  }, [pushToHistory]);

  /* Update only position/size from RGL; debounce history push to avoid flooding during drag. */
  const updateLayout = useCallback((newLayoutItems) => {
    setWidgets((prev) => {
      const next = prev.map((w) => {
        const item = newLayoutItems.find((l) => String(l.i) === String(w.id));
        if (item) return { ...w, x: item.x, y: item.y, w: item.w, h: item.h };
        return w;
      });
      const db = layoutDebounceRef.current;
      if (!db.pendingPrev) db.pendingPrev = JSON.parse(JSON.stringify(prev));
      if (db.timer) clearTimeout(db.timer);
      db.timer = setTimeout(() => {
        if (db.pendingPrev) {
          const justDidUndoRedo = Date.now() - lastUndoRedoAt.current < 500;
          if (justDidUndoRedo) {
            db.pendingPrev = null;
          } else {
            pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), db.pendingPrev];
            futureRef.current = [];
            setHistoryState({ pastCount: pastRef.current.length, futureCount: 0 });
            db.pendingPrev = null;
          }
        }
        db.timer = null;
      }, 400);
      return next;
    });
    setDirty(true);
  }, []);

  // Parameter operations
  const addParameter = useCallback((param) => {
    setParameters((prev) => [...prev, param]);
    setDirty(true);
  }, []);

  const updateParameter = useCallback((idx, updates) => {
    setParameters((prev) => prev.map((p, i) => i === idx ? { ...p, ...updates } : p));
    setDirty(true);
  }, []);

  const removeParameter = useCallback((idx) => {
    setParameters((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  // Computed signal operations
  const addComputedSignal = useCallback((signal) => {
    setComputedSignals((prev) => [...prev, signal]);
    setDirty(true);
  }, []);

  /* ── Dashboard Tab operations ── */

  const _tabUid = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const enableDashboardTabs = useCallback(() => {
    const tabId = _tabUid();
    const dt = {
      enabled: true,
      activeTabId: tabId,
      tabs: [{ id: tabId, label: 'Tab 1', widgets: [...widgets] }],
    };
    setDashboardTabs(dt);
    setActiveTabId(tabId);
    setDirty(true);
  }, [widgets]);

  const disableDashboardTabs = useCallback(() => {
    const dt = tabsRef.current;
    const activeW = dt?.tabs?.find(t => t.id === activeTabId)?.widgets || widgets;
    setDashboardTabs(null);
    setActiveTabId(null);
    setWidgets(activeW);
    setDirty(true);
  }, [activeTabId, widgets]);

  const addDashboardTab = useCallback((label) => {
    const dt = tabsRef.current;
    if (!dt?.enabled) return;
    pushToHistory(widgets);
    const newId = _tabUid();
    const savedCurrentWidgets = JSON.parse(JSON.stringify(widgets));
    const updatedTabs = {
      ...dt,
      activeTabId: newId,
      tabs: [
        ...dt.tabs.map(t => t.id === activeTabId ? { ...t, widgets: savedCurrentWidgets } : t),
        { id: newId, label: label || `Tab ${dt.tabs.length + 1}`, widgets: [] },
      ],
    };
    tabsRef.current = updatedTabs;
    setDashboardTabs(updatedTabs);
    setActiveTabId(newId);
    setWidgets([]);
    pastRef.current = [];
    futureRef.current = [];
    setHistoryState({ pastCount: 0, futureCount: 0 });
    setDirty(true);
    return newId;
  }, [widgets, activeTabId, pushToHistory]);

  const removeDashboardTab = useCallback((tabId) => {
    const dt = tabsRef.current;
    if (!dt?.enabled || dt.tabs.length <= 1) return;
    const savedCurrentWidgets = JSON.parse(JSON.stringify(widgets));
    const remaining = dt.tabs
      .map(t => t.id === activeTabId ? { ...t, widgets: savedCurrentWidgets } : t)
      .filter(t => t.id !== tabId);
    if (remaining.length === 0) return;
    const switchTo = tabId === activeTabId ? remaining[0] : remaining.find(t => t.id === activeTabId) || remaining[0];
    const updatedTabs = {
      ...dt,
      tabs: remaining,
      activeTabId: switchTo.id,
    };
    tabsRef.current = updatedTabs;
    setDashboardTabs(updatedTabs);
    if (tabId === activeTabId) {
      setActiveTabId(switchTo.id);
      setWidgets(switchTo.widgets || []);
      pastRef.current = [];
      futureRef.current = [];
      setHistoryState({ pastCount: 0, futureCount: 0 });
    }
    setDirty(true);
  }, [activeTabId, widgets]);

  const renameDashboardTab = useCallback((tabId, newLabel) => {
    const dt = tabsRef.current;
    if (!dt?.enabled) return;
    setDashboardTabs({
      ...dt,
      tabs: dt.tabs.map(t => t.id === tabId ? { ...t, label: newLabel } : t),
    });
    setDirty(true);
  }, []);

  const duplicateDashboardTab = useCallback((sourceTabId, newLabel) => {
    const dt = tabsRef.current;
    if (!dt?.enabled) return;
    pushToHistory(widgets);
    const savedCurrentWidgets = JSON.parse(JSON.stringify(widgets));
    const sourceTab = sourceTabId === activeTabId
      ? { ...dt.tabs.find(t => t.id === sourceTabId), widgets: savedCurrentWidgets }
      : dt.tabs.find(t => t.id === sourceTabId);
    if (!sourceTab) return;
    const newId = _tabUid();
    const clonedWidgets = JSON.parse(JSON.stringify(sourceTab.widgets || []));
    clonedWidgets.forEach(w => { w.id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; });
    const updatedTabs = {
      ...dt,
      activeTabId: newId,
      tabs: [
        ...dt.tabs.map(t => t.id === activeTabId ? { ...t, widgets: savedCurrentWidgets } : t),
        { id: newId, label: newLabel || `${sourceTab.label} (copy)`, widgets: clonedWidgets },
      ],
    };
    tabsRef.current = updatedTabs;
    setDashboardTabs(updatedTabs);
    setActiveTabId(newId);
    setWidgets(clonedWidgets);
    pastRef.current = [];
    futureRef.current = [];
    setHistoryState({ pastCount: 0, futureCount: 0 });
    setDirty(true);
    return newId;
  }, [widgets, activeTabId, pushToHistory]);

  const switchDashboardTab = useCallback((newTabId, opts = {}) => {
    const skipDirty = opts.skipDirty === true;
    const dt = tabsRef.current;
    if (!dt?.enabled || newTabId === activeTabId) return;
    // Deep-copy current widgets into the active tab before switching
    const savedCurrentWidgets = JSON.parse(JSON.stringify(widgets));
    const updatedTabs = {
      ...dt,
      activeTabId: newTabId,
      tabs: dt.tabs.map(t =>
        t.id === activeTabId ? { ...t, widgets: savedCurrentWidgets } : t
      ),
    };
    // Read target tab from the UPDATED structure (not old dt)
    const targetTab = updatedTabs.tabs.find(t => t.id === newTabId);
    tabsRef.current = updatedTabs;
    setDashboardTabs(updatedTabs);
    setActiveTabId(newTabId);
    setWidgets(targetTab?.widgets || []);
    pastRef.current = [];
    futureRef.current = [];
    setHistoryState({ pastCount: 0, futureCount: 0 });
    if (!skipDirty) setDirty(true);
  }, [activeTabId, widgets]);

  // Collect all widgets across all tabs (for tag subscription)
  const allTabsWidgets = useMemo(() => {
    const dt = dashboardTabs;
    if (!dt?.enabled || !Array.isArray(dt.tabs)) return widgets;
    const all = [];
    dt.tabs.forEach(tab => {
      if (tab.id === activeTabId) {
        all.push(...widgets);
      } else {
        all.push(...(tab.widgets || []));
      }
    });
    return all;
  }, [dashboardTabs, activeTabId, widgets]);

  return {
    template, widgets, parameters, computedSignals,
    loading, saving, dirty, migrated,
    autoSave, toggleAutoSave,
    setWidgets, addWidget, addWidgetAt, updateWidget, removeWidget, updateLayout,
    addParameter, updateParameter, removeParameter,
    addComputedSignal,
    saveLayout, updateMeta, setDirty,
    undo, redo, canUndo, canRedo,
    dashboardTabs, activeTabId, allTabsWidgets,
    enableDashboardTabs, disableDashboardTabs,
    addDashboardTab, removeDashboardTab, renameDashboardTab, switchDashboardTab, duplicateDashboardTab,
  };
}

/* ── useAvailableTags (API; dev-only auto-seed when DB has zero active tags) ── */

const TAGS_TIMEOUT_MS = 18000; // production / live backend can be slow

export function useAvailableTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    retryCountRef.current = 0;
    const doFetch = async () => {
      try {
        const res = await axios.get('/api/tags?is_active=true', { timeout: TAGS_TIMEOUT_MS });
        const data = res?.data;
        if (data?.status === 'success' && Array.isArray(data.tags)) {
          let list = data.tags;
          if (list.length === 0 && import.meta.env.DEV) {
            try {
              await axios.post('/api/tags/seed', {}, { timeout: 10000 });
              const retry = await axios.get('/api/tags?is_active=true', { timeout: TAGS_TIMEOUT_MS });
              const retryData = retry?.data;
              if (retryData?.status === 'success' && Array.isArray(retryData.tags)) {
                list = retryData.tags;
              }
            } catch { /* keep empty */ }
          }
          setTags(list);
          return true;
        }
      } catch {
        if (retryCountRef.current === 0) {
          retryCountRef.current = 1;
          return await doFetch();
        }
      }
      return false;
    };
    await doFetch();
    setLoading(false);
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  return { tags, loading, fetchTags };
}

/* ── useAvailableGroups (Engineering tag groups) ──────────────── */

const FALLBACK_GROUPS = [
  { id: 1, group_name: 'Process Sensors', description: 'Core process measurement sensors', tags: [
    { tag_name: 'Temperature_1' }, { tag_name: 'Pressure_1' }, { tag_name: 'Flow_Rate_1' }, { tag_name: 'Level_Tank_1' },
  ]},
  { id: 2, group_name: 'Production KPIs', description: 'Key production indicators', tags: [
    { tag_name: 'Mill_Throughput' }, { tag_name: 'Flour_Extraction' }, { tag_name: 'Bran_Extraction' }, { tag_name: 'MillingLossFormula' },
  ]},
  { id: 3, group_name: 'Utilities', description: 'Power, water, and utilities', tags: [
    { tag_name: 'Power_Consumption' }, { tag_name: 'Water_Used' },
  ]},
  { id: 4, group_name: 'Mechanical', description: 'Motor and vibration monitoring', tags: [
    { tag_name: 'Motor_Speed_1' }, { tag_name: 'Vibration_1' }, { tag_name: 'Weight_Scale_1' },
  ]},
  // Grain Terminal / Silos
  { id: 10, group_name: 'Grain Intake & Outload', description: 'Intake and outloading totals', tags: [
    { tag_name: 'Intake_Today' }, { tag_name: 'Intake_Week' }, { tag_name: 'Intake_Month' },
    { tag_name: 'Outload_Ship' }, { tag_name: 'Outload_Truck' }, { tag_name: 'Outload_Rail' }, { tag_name: 'Balance_Tons' },
  ]},
  { id: 11, group_name: 'Silo Levels', description: 'All silo fill levels', tags: [
    { tag_name: 'Silo1_Level' }, { tag_name: 'Silo2_Level' }, { tag_name: 'Silo3_Level' }, { tag_name: 'Silo4_Level' },
    { tag_name: 'Silo5_Level' }, { tag_name: 'Silo6_Level' }, { tag_name: 'Silo7_Level' }, { tag_name: 'Silo8_Level' },
  ]},
  { id: 12, group_name: 'Silo Capacity & Tons', description: 'Silo capacity and current tons', tags: [
    { tag_name: 'Silo1_Capacity' }, { tag_name: 'Silo1_Tons' }, { tag_name: 'Silo2_Capacity' }, { tag_name: 'Silo2_Tons' },
    { tag_name: 'Silo3_Capacity' }, { tag_name: 'Silo3_Tons' }, { tag_name: 'Silo4_Capacity' }, { tag_name: 'Silo4_Tons' },
    { tag_name: 'Silo5_Capacity' }, { tag_name: 'Silo5_Tons' }, { tag_name: 'Silo6_Capacity' }, { tag_name: 'Silo6_Tons' },
    { tag_name: 'Silo7_Capacity' }, { tag_name: 'Silo7_Tons' }, { tag_name: 'Silo8_Capacity' }, { tag_name: 'Silo8_Tons' },
  ]},
  { id: 13, group_name: 'Grain Quality', description: 'Temperature and quality tags', tags: [
    { tag_name: 'Silo1_Temp' }, { tag_name: 'Silo2_Temp' }, { tag_name: 'Silo3_Temp' }, { tag_name: 'Silo4_Temp' },
    { tag_name: 'Silo5_Temp' }, { tag_name: 'Silo6_Temp' }, { tag_name: 'Silo7_Temp' }, { tag_name: 'Silo8_Temp' },
    { tag_name: 'Moisture_Avg' }, { tag_name: 'Aeration_Status' }, { tag_name: 'Quality_Deviation' },
  ]},
  { id: 14, group_name: 'Equipment Performance', description: 'Conveyors and utilization', tags: [
    { tag_name: 'Conveyor1_Status' }, { tag_name: 'Conveyor1_Throughput' }, { tag_name: 'Elevator1_Running' },
    { tag_name: 'Equipment_Downtime_Pct' }, { tag_name: 'Equipment_Utilization_Pct' },
  ]},
  { id: 15, group_name: 'Energy & Utilities', description: 'Power and energy KPIs', tags: [
    { tag_name: 'Power_Intake_Area' }, { tag_name: 'Power_Storage_Area' }, { tag_name: 'Energy_Per_Ton' }, { tag_name: 'Peak_Power_kW' },
  ]},
  { id: 16, group_name: 'Alarms & Events', description: 'Alarm counts and response', tags: [
    { tag_name: 'Alarm_Active_Count' }, { tag_name: 'Alarm_Critical_Count' }, { tag_name: 'Alarm_Response_Time_Avg' },
  ]},
  { id: 17, group_name: 'Operations KPI', description: 'Management KPIs', tags: [
    { tag_name: 'Tons_Per_Day' }, { tag_name: 'Terminal_Availability_Pct' }, { tag_name: 'Downtime_Pct' }, { tag_name: 'Losses_Pct' }, { tag_name: 'OEE_Style' },
  ]},
  { id: 18, group_name: 'Maintenance-Ready', description: 'Running hours and early warnings', tags: [
    { tag_name: 'Running_Hours_Main' }, { tag_name: 'StartStop_Cycles' }, { tag_name: 'Abnormal_Load_Count' }, { tag_name: 'Early_Warning_Count' },
  ]},
];

export function useAvailableGroups() {
  const [groups, setGroups] = useState(FALLBACK_GROUPS);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/tag-groups?is_active=true', { timeout: 3000 });
        const data = res?.data;
        if (data?.status === 'success' && data.tag_groups?.length > 0) setGroups(data.tag_groups);
      } catch { /* keep fallback */ }
    })();
  }, []);

  return { groups };
}

/* ── useAvailableFormulas (saved formulas from Engineering) ───── */

const SEED_FORMULAS = [
  { id: 'f1', name: 'Milling Loss', formula: '100 - {Flour_Extraction} - {Bran_Extraction}', unit: '%', description: 'Total milling loss percentage' },
  { id: 'f2', name: 'Specific Energy', formula: '{Power_Consumption} / {Mill_Throughput}', unit: 'kWh/t', description: 'Energy per ton of product' },
  { id: 'f3', name: 'Water Ratio', formula: '{Water_Used} / {Mill_Throughput}', unit: 'L/t', description: 'Water consumption per ton' },
  { id: 'f4', name: 'Extraction Total', formula: '{Flour_Extraction} + {Bran_Extraction}', unit: '%', description: 'Combined flour + bran extraction' },
  // Grain Terminal
  { id: 'f10', name: 'Total Outload', formula: '{Outload_Ship} + {Outload_Truck} + {Outload_Rail}', unit: 't', description: 'Total outloaded grain' },
  { id: 'f11', name: 'Silo Free Capacity %', formula: '100 - {Silo1_Level}', unit: '%', description: 'Silo 1 free capacity (use SiloN_Level for others)' },
  { id: 'f12', name: 'Silo Utilization Avg', formula: 'AVG({Silo1_Level}, {Silo2_Level}, {Silo3_Level}, {Silo4_Level}, {Silo5_Level}, {Silo6_Level}, {Silo7_Level}, {Silo8_Level})', unit: '%', description: 'Average silo fill' },
  { id: 'f13', name: 'Energy per Ton (Grain)', formula: '{Power_Intake_Area} / MAX(1, {Intake_Today})', unit: 'kWh/t', description: 'Intake area energy per ton' },
];

export function useAvailableFormulas() {
  const [formulas, setFormulas] = useState(() => {
    try {
      const saved = localStorage.getItem('system_saved_formulas');
      if (saved) { const arr = JSON.parse(saved); if (arr.length > 0) return arr; }
    } catch { /* ignore */ }
    localStorage.setItem('system_saved_formulas', JSON.stringify(SEED_FORMULAS));
    return SEED_FORMULAS;
  });

  const reload = useCallback(() => {
    try {
      const saved = localStorage.getItem('system_saved_formulas');
      if (saved) setFormulas(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener('formulasUpdated', handler);
    return () => window.removeEventListener('formulasUpdated', handler);
  }, [reload]);

  return { formulas, reload };
}
