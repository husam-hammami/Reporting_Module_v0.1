import { evaluateFormula } from '../formulas/formulaEngine';
import { getCachedMappings } from '../../../utils/mappingsCache';

function resolveLookup(mapping, inputValue) {
  if (inputValue == null) return mapping?.fallback || '—';
  const key = String(Math.round(Number(inputValue)));
  const mapped = mapping?.lookup?.[key];
  if (mapped !== undefined && mapped != null) return mapped;
  return inputValue;
}

/** Same semantics as TableWidget.resolveColumnValue (for Properties + preview key). */
export function resolveColumnValueForDrill(col, tagValues) {
  if (!col) return null;
  const src = col.sourceType || 'tag';
  if (src === 'tag') {
    const raw = tagValues?.[col.tagName];
    if (raw == null) return null;
    const num = Number(raw);
    return Number.isNaN(num) ? raw : num;
  }
  if (src === 'formula') {
    const result = evaluateFormula(col.formula || '', tagValues);
    if (result == null) return null;
    const num = Number(result);
    return Number.isNaN(num) ? result : num;
  }
  if (src === 'group') {
    const vals = (col.groupTags || []).map((t) => Number(tagValues?.[t]) || 0);
    if (vals.length === 0) return null;
    const agg = col.aggregation || 'avg';
    if (agg === 'sum') return vals.reduce((a, b) => a + b, 0);
    if (agg === 'min') return Math.min(...vals);
    if (agg === 'max') return Math.max(...vals);
    if (agg === 'count') return vals.length;
    if (agg === 'delta') return vals.length < 2 ? 0 : vals[vals.length - 1] - vals[0];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  if (src === 'mapping' && col.mappingName) {
    const mappings = getCachedMappings();
    const mapping = mappings.find((m) => (m.name || m.id) === col.mappingName);
    if (!mapping) return null;
    const inputValue = tagValues?.[mapping.input_tag];
    return resolveLookup(mapping, inputValue);
  }
  if (src === 'static') return col.staticValue ?? '';
  return null;
}

function defaultStaticCell() {
  return {
    sourceType: 'static',
    staticValue: '',
    aggregation: 'last',
    format: 'number',
    decimals: 1,
    groupTags: [],
    mappingName: '',
    formula: '',
    colSpan: 1,
  };
}

function normalizeStaticRow(row, nCols) {
  const arr = Array.isArray(row) ? [...row] : [];
  while (arr.length < nCols) arr.push('');
  return arr.slice(0, nCols).map((cell) => {
    if (cell != null && typeof cell === 'object' && cell.sourceType != null) {
      return { ...defaultStaticCell(), ...cell };
    }
    return { ...defaultStaticCell(), sourceType: 'static', staticValue: String(cell ?? '') };
  });
}

/** Resolve key column cell to a string row id (for static rows). */
export function resolveStaticCellRowKey(cell, tagValues) {
  if (cell == null) return null;
  if (typeof cell !== 'object') {
    const s = String(cell).trim();
    return s || null;
  }
  const st = cell.sourceType || 'static';
  if (st === 'static') {
    const s = cell.staticValue != null ? String(cell.staticValue).trim() : '';
    return s || null;
  }
  if (st === 'tag' && cell.tagName) {
    const raw = tagValues?.[cell.tagName];
    if (raw == null) return null;
    return String(raw).trim() || null;
  }
  if (st === 'formula' && cell.formula) {
    const result = evaluateFormula(cell.formula || '', tagValues);
    if (result == null) return null;
    return String(result).trim() || null;
  }
  return null;
}

/**
 * Ordered unique row keys for drill preview / tag picker (live row first, then static rows).
 */
export function collectOrderedDrillRowKeys(config, tagValues) {
  const cols = Array.isArray(config.tableColumns) ? config.tableColumns : [];
  const dd = config.drillDown || {};
  const kc = Number(dd.keyColumn) || 0;
  const n = cols.length;
  if (n === 0) return [];

  const out = [];
  const push = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s && !out.includes(s)) out.push(s);
  };

  const liveCol = cols[kc];
  if (liveCol) {
    const v = resolveColumnValueForDrill(liveCol, tagValues);
    push(v);
  }

  const rawStatic = Array.isArray(config.staticDataRows) ? config.staticDataRows : [];
  rawStatic.forEach((row) => {
    const norm = normalizeStaticRow(row, n);
    const cell = norm[kc];
    push(resolveStaticCellRowKey(cell, tagValues));
  });

  return out;
}

export function previewDrillRowKey(config, tagValues) {
  const keys = collectOrderedDrillRowKeys(config, tagValues);
  return keys[0] ?? null;
}

/**
 * If tagName starts with a known row key + separator, rewrite to {ROW_KEY} + rest.
 * Longer keys are tried first (e.g. m30 before m3).
 */
export function tagToRowKeyPlaceholder(tagName, rowKeys, sep = '_') {
  if (!tagName || !rowKeys?.length) return tagName || '';
  const sorted = [...new Set(rowKeys.filter(Boolean).map((k) => String(k).trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  for (const key of sorted) {
    if (tagName === key) return '{ROW_KEY}';
    const prefix = `${key}${sep}`;
    if (tagName.startsWith(prefix)) {
      return `{ROW_KEY}${sep}${tagName.slice(prefix.length)}`;
    }
  }
  return tagName;
}
