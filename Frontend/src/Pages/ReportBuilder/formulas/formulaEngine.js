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

export function extractTagRefs(formula) {
  const tags = [];
  let match;
  const re = new RegExp(TAG_REGEX.source, 'g');
  while ((match = re.exec(formula)) !== null) {
    if (!match[1].startsWith('col:')) {
      tags.push(match[1]);
    }
  }
  return [...new Set(tags)];
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

export function evaluateFormula(formula, tagValues = {}, columnValues = {}) {
  try {
    if (!formula || !formula.trim()) return null;

    // Replace tag refs with values
    let expr = formula.replace(TAG_REGEX, (_, name) => {
      if (name.startsWith('col:')) {
        const colName = name.slice(4);
        const val = columnValues[colName];
        return val != null ? String(Number(val)) : '0';
      }
      const val = tagValues[name];
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
