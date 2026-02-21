/**
 * Template schema v2 with migration support.
 * Guarantees canvas never crashes from malformed data.
 */

export const CURRENT_SCHEMA_VERSION = 2;

export const EMPTY_LAYOUT_CONFIG = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  widgets: [],
  parameters: [],
  computedSignals: [],
  grid: { cols: 12, rowHeight: 40 },
};

/* ── Validate and repair a single widget ───────────────────────── */

function repairWidget(w) {
  if (!w || typeof w !== 'object') return null;
  return {
    id: String(w.id || `repaired-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`),
    type: w.type || 'text',
    x: typeof w.x === 'number' ? w.x : 0,
    y: typeof w.y === 'number' ? w.y : 0,
    w: typeof w.w === 'number' && w.w >= 1 ? w.w : 3,
    h: typeof w.h === 'number' && w.h >= 1 ? w.h : 2,
    config: w.config && typeof w.config === 'object' ? w.config : {},
  };
}

/* ── Migrate from v1 (or versionless) to v2 ───────────────────── */

function migrateV1toV2(config) {
  const widgets = Array.isArray(config?.widgets) ? config.widgets : [];
  return {
    ...EMPTY_LAYOUT_CONFIG,
    widgets: widgets.map((w) => {
      const repaired = repairWidget(w);
      if (!repaired) return null;
      // Migrate old single-tag config to dataSource model
      if (repaired.config.tagName !== undefined && !repaired.config.dataSource) {
        repaired.config.dataSource = {
          type: 'tag',
          tagName: repaired.config.tagName || '',
          formula: '',
          groupTags: [],
          aggregation: 'last',
        };
      }
      // Migrate old tags array to series model for charts
      if (Array.isArray(repaired.config.tags) && !repaired.config.series) {
        repaired.config.series = repaired.config.tags.map((t) => ({
          dataSource: { type: 'tag', tagName: t.tagName || t, formula: '', groupTags: [], aggregation: 'avg' },
          label: t.displayName || t.tagName || t,
          color: '',
        }));
      }
      // Ensure thresholds is array
      if (repaired.config.thresholds && !Array.isArray(repaired.config.thresholds)) {
        repaired.config.thresholds = [];
      }
      // Table: ensure tableColumns is valid; clean up legacy tableRows
      if (repaired.type === 'table' && repaired.config && typeof repaired.config === 'object') {
        delete repaired.config.tableRows; // legacy — column-only model now
        if (Array.isArray(repaired.config.tableColumns)) {
          repaired.config.tableColumns = repaired.config.tableColumns.map((c) => ({
            ...c,
            aggregation: c.aggregation ?? (c.sourceType === 'group' ? 'avg' : 'last'),
            format: c.format ?? 'number',
          }));
        }
      }
      return repaired;
    }).filter(Boolean),
    parameters: Array.isArray(config?.parameters) ? config.parameters : [],
    computedSignals: Array.isArray(config?.computedSignals) ? config.computedSignals : [],
    grid: config?.grid || { cols: 12, rowHeight: 40 },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/* ── Public: safely load and migrate a layout config ───────────── */

export function loadAndMigrateConfig(rawConfig) {
  try {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return { config: { ...EMPTY_LAYOUT_CONFIG }, migrated: false, repaired: false };
    }

    const version = rawConfig.schemaVersion || 1;
    let config = rawConfig;
    let migrated = false;

    if (version < CURRENT_SCHEMA_VERSION) {
      config = migrateV1toV2(config);
      migrated = true;
    }

    // Validate all widgets
    const validWidgets = [];
    let repaired = false;
    for (const w of config.widgets || []) {
      const fixed = repairWidget(w);
      if (fixed) {
        if (fixed.id !== w?.id || fixed.type !== w?.type) repaired = true;
        validWidgets.push(fixed);
      } else {
        repaired = true;
      }
    }

    return {
      config: { ...config, widgets: validWidgets, schemaVersion: CURRENT_SCHEMA_VERSION },
      migrated,
      repaired,
    };
  } catch (err) {
    console.error('[templateSchema] Failed to migrate config:', err);
    return { config: { ...EMPTY_LAYOUT_CONFIG }, migrated: false, repaired: true };
  }
}
