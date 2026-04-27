/**
 * Formula engine: parse, validate, and evaluate expressions with tag references.
 *
 * Syntax:  {TagName} + {TagName2} * 100
 * Functions: SUM, AVG, MIN, MAX, COUNT, ABS, ROUND, IF, DIFF, RATE, CLAMP
 * Operators: + - * / % ( )
 */

/* ── Constants ─────────────────────────────────────────────────── */

const FUNCTIONS = {
  SUM: { args: '...', desc: 'Sum of values' },
  AVG: { args: '...', desc: 'Average of values' },
  MIN: { args: '...', desc: 'Minimum value' },
  MAX: { args: '...', desc: 'Maximum value' },
  COUNT: { args: '...', desc: 'Count of values' },
  ABS: { args: 1, desc: 'Absolute value' },
  ROUND: { args: 2, desc: 'Round to decimals' },
  IF: { args: 3, desc: 'Conditional: IF(cond, then, else)' },
  DIFF: { args: 1, desc: 'Difference from previous' },
  RATE: { args: 1, desc: 'Rate of change per second' },
  CLAMP: { args: 3, desc: 'Clamp value: CLAMP(val, min, max)' },
};

export const AVAILABLE_FUNCTIONS = Object.entries(FUNCTIONS).map(([name, meta]) => ({
  name,
  args: meta.args,
  description: meta.desc,
}));

/* ── Parser: extract tag references ────────────────────────────── */

const TAG_REGEX = /\{([^}]+)\}/g;
const COL_REGEX = /\{col:([^}]+)\}/g;

/** Historian / paginated merge aggregations allowed as {agg::tagName} in formulas */
const FORMULA_AGG_PREFIX = /^(first|last|delta|avg|min|max|sum|count|silo_first|silo_last|silo_delta)::(.+)$/i;

/**
 * Parse each {…} token (excluding {col:…}) into base tag name and optional explicit aggregation.
 * @param {string} formula
 * @returns {{ raw: string, base: string, explicitAgg: string|null }[]}
 */
export function parseFormulaTagReferences(formula) {
  if (!formula || typeof formula !== 'string') return [];
  const out = [];
  const re = new RegExp(TAG_REGEX.source, 'g');
  let match;
  while ((match = re.exec(formula)) !== null) {
    const raw = match[1];
    if (raw.startsWith('col:')) continue;
    const m = raw.match(FORMULA_AGG_PREFIX);
    if (m) {
      out.push({ raw, base: m[2], explicitAgg: m[1].toLowerCase() });
    } else {
      out.push({ raw, base: raw, explicitAgg: null });
    }
  }
  return out;
}

export function extractTagRefs(formula) {
  const refs = parseFormulaTagReferences(formula);
  const bases = refs.map((r) => r.base);
  return [...new Set(bases)];
}

export function extractColumnRefs(formula) {
  const cols = [];
  let match;
  const re = new RegExp(COL_REGEX.source, 'g');
  while ((match = re.exec(formula)) !== null) {
    cols.push(match[1]);
  }
  return [...new Set(cols)];
}

/* ── Validator ─────────────────────────────────────────────────── */

export function validateFormula(formula, availableTagNames = [], availableColNames = []) {
  const errors = [];

  if (!formula || !formula.trim()) {
    return { valid: false, errors: [{ type: 'syntax', message: 'Formula is empty' }] };
  }

  // Check tag references
  const tagRefs = extractTagRefs(formula);
  for (const ref of tagRefs) {
    if (availableTagNames.length > 0 && !availableTagNames.includes(ref)) {
      errors.push({ type: 'reference', message: `Unknown tag: ${ref}` });
    }
  }

  // Check column references
  const colRefs = extractColumnRefs(formula);
  for (const ref of colRefs) {
    if (availableColNames.length > 0 && !availableColNames.includes(ref)) {
      errors.push({ type: 'reference', message: `Unknown column: ${ref}` });
    }
  }

  // Check balanced parentheses
  let depth = 0;
  for (const ch of formula) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) {
      errors.push({ type: 'syntax', message: 'Unmatched closing parenthesis' });
      break;
    }
  }
  if (depth > 0) {
    errors.push({ type: 'syntax', message: 'Unmatched opening parenthesis' });
  }

  // Check function names
  const funcPattern = /([A-Z_]+)\s*\(/g;
  let fmatch;
  while ((fmatch = funcPattern.exec(formula)) !== null) {
    if (!FUNCTIONS[fmatch[1]]) {
      errors.push({ type: 'syntax', message: `Unknown function: ${fmatch[1]}` });
    }
  }

  // Check divide by zero patterns
  if (/\/\s*0(?!\d)/.test(formula)) {
    errors.push({ type: 'warning', message: 'Possible division by zero' });
  }

  return { valid: errors.filter((e) => e.type !== 'warning').length === 0, errors };
}

/* ── Mock Evaluator ────────────────────────────────────────────── */

/**
 * Count how many times each bare tag (no agg:: prefix) appears in {…} refs.
 * @param {string} formula
 * @returns {Record<string, number>}
 */
function countBareTagOccurrencesInFormula(formula) {
  const counts = Object.create(null);
  for (const { base, explicitAgg } of parseFormulaTagReferences(formula)) {
    if (explicitAgg) continue;
    counts[base] = (counts[base] || 0) + 1;
  }
  return counts;
}

/**
 * Resolve a tag placeholder against merged historian/live maps.
 * - {agg::Tag} uses namespaced keys (first::Tag, delta::Tag, …); plain {Tag} is last snapshot.
 * - If the same bare {Tag} appears exactly twice (typical totalizer: End−Start), the first
 *   occurrence maps to last-in-range and the second to first-in-range so Weight matches
 *   Start/End columns under per-aggregation fetch (fixes "Yesterday shows 0" for {T}-{T}).
 */
function resolveFormulaTagValue(name, tagValues, bareOccurrence, bareDupCounts) {
  if (name.startsWith('col:')) {
    return null;
  }
  const m = name.match(FORMULA_AGG_PREFIX);
  if (m) {
    const agg = m[1].toLowerCase();
    const base = m[2];
    const key = agg === 'last' ? base : `${agg}::${base}`;
    const v = tagValues[key] ?? (agg === 'last' ? tagValues[base] : undefined);
    return v;
  }
  const useDup = bareDupCounts[name] === 2;
  if (useDup) {
    const k = bareOccurrence[name];
    bareOccurrence[name] = k + 1;
    if (k === 0) {
      const lastVal = tagValues[name];
      if (lastVal != null) return lastVal;
      return tagValues[`last::${name}`];
    }
    const firstVal = tagValues[`first::${name}`];
    if (firstVal != null) return firstVal;
    return tagValues[name];
  }
  return tagValues[name];
}

export function evaluateFormula(formula, tagValues = {}, columnValues = {}) {
  try {
    if (!formula || !formula.trim()) return null;

    const bareDupCounts = countBareTagOccurrencesInFormula(formula);
    const bareOccurrence = Object.create(null);
    for (const k of Object.keys(bareDupCounts)) bareOccurrence[k] = 0;

    // Replace tag refs with values
    let expr = formula.replace(TAG_REGEX, (_, name) => {
      if (name.startsWith('col:')) {
        const colName = name.slice(4);
        const val = columnValues[colName];
        return val != null ? String(Number(val)) : '0';
      }
      const val = resolveFormulaTagValue(name, tagValues, bareOccurrence, bareDupCounts);
      return val != null ? String(Number(val)) : '0';
    });

    // Replace functions with JS equivalents
    expr = expr.replace(/\bSUM\s*\(([^)]*)\)/gi, (_, args) => {
      const nums = args.split(',').map((a) => parseFloat(a.trim()) || 0);
      return nums.reduce((s, n) => s + n, 0);
    });
    expr = expr.replace(/\bAVG\s*\(([^)]*)\)/gi, (_, args) => {
      const nums = args.split(',').map((a) => parseFloat(a.trim()) || 0);
      return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
    });
    expr = expr.replace(/\bMIN\s*\(([^)]*)\)/gi, (_, args) => {
      const nums = args.split(',').map((a) => parseFloat(a.trim()) || 0);
      return Math.min(...nums);
    });
    expr = expr.replace(/\bMAX\s*\(([^)]*)\)/gi, (_, args) => {
      const nums = args.split(',').map((a) => parseFloat(a.trim()) || 0);
      return Math.max(...nums);
    });
    expr = expr.replace(/\bCOUNT\s*\(([^)]*)\)/gi, (_, args) => {
      return args.split(',').length;
    });
    expr = expr.replace(/\bABS\s*\(([^)]*)\)/gi, (_, a) => Math.abs(parseFloat(a) || 0));
    expr = expr.replace(/\bROUND\s*\(([^,]*),([^)]*)\)/gi, (_, val, dec) => {
      return Number(parseFloat(val) || 0).toFixed(parseInt(dec) || 0);
    });
    expr = expr.replace(/\bIF\s*\(([^,]*),([^,]*),([^)]*)\)/gi, (_, cond, then, els) => {
      return parseFloat(cond) ? parseFloat(then) || 0 : parseFloat(els) || 0;
    });
    expr = expr.replace(/\bCLAMP\s*\(([^,]*),([^,]*),([^)]*)\)/gi, (_, val, min, max) => {
      return Math.max(parseFloat(min) || 0, Math.min(parseFloat(max) || 100, parseFloat(val) || 0));
    });
    expr = expr.replace(/\bDIFF\s*\(([^)]*)\)/gi, (_, a) => parseFloat(a) || 0);
    expr = expr.replace(/\bRATE\s*\(([^)]*)\)/gi, (_, a) => parseFloat(a) || 0);

    // Sanitize: only allow numbers, operators, parens, whitespace, dots
    const sanitized = expr.replace(/[^0-9+\-*/%().eE\s]/g, '');
    if (!sanitized.trim()) return null;

    // Safe eval
    const fn = new Function(`"use strict"; return (${sanitized})`);
    const result = fn();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
