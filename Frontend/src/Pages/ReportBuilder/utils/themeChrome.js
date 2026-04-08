/**
 * Normalize #rgb → #rrggbb for comparison.
 * @param {string} s
 * @returns {string}
 */
export function normalizeHexColor(s) {
  if (s == null || typeof s !== 'string') return '';
  let h = s.trim().toLowerCase();
  if (!h.startsWith('#')) return h;
  if (h.length === 4) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h;
}

const LIGHT_BORDER_HEX = new Set(
  ['#e5e7eb', '#e2e8f0', '#d1d5db', '#cbd5e1', '#f3f4f6', '#f1f5f9', '#ffffff', '#fff'].map((x) =>
    normalizeHexColor(x),
  ),
);

const LIGHT_HEADER_BG_HEX = new Set(
  ['#f9fafb', '#ffffff', '#fff', '#e2e8f0', '#e5e7eb', '#f3f4f6', '#f1f5f9'].map((x) => normalizeHexColor(x)),
);

const LIGHT_HEADER_TEXT_HEX = new Set(
  ['#111827', '#0f172a', '#000000', '#000', '#1e293b', '#374151'].map((x) => normalizeHexColor(x)),
);

/**
 * Panel / field border: empty → theme; in dark, remap saved light grays to var(--rb-border).
 * @param {string|undefined|null} raw
 * @param {boolean} isDark
 * @returns {string}
 */
export function resolveDataPanelBorderCss(raw, isDark) {
  if (raw == null || String(raw).trim() === '') return 'var(--rb-border)';
  const t = String(raw).trim();
  if (t.startsWith('var(')) return t;
  if (isDark) {
    const n = normalizeHexColor(t);
    if (n && LIGHT_BORDER_HEX.has(n)) return 'var(--rb-border)';
  }
  return t;
}

/**
 * @param {string|undefined|null} fieldBorder
 * @param {string} panelBorderResolved
 * @param {boolean} isDark
 * @returns {string}
 */
export function resolveDataPanelFieldBorderCss(fieldBorder, panelBorderResolved, isDark) {
  const fb = fieldBorder != null && String(fieldBorder).trim() !== '' ? String(fieldBorder).trim() : '';
  if (!fb) return panelBorderResolved;
  return resolveDataPanelBorderCss(fb, isDark);
}

/**
 * @param {string|undefined|null} raw
 * @param {boolean} isDark
 * @returns {string|undefined} undefined = use CSS class default
 */
export function resolveDataPanelHeaderBgForDark(raw, isDark) {
  if (raw == null || String(raw).trim() === '') return undefined;
  const t = String(raw).trim();
  if (t.startsWith('var(')) return t;
  if (isDark) {
    const n = normalizeHexColor(t);
    if (n && LIGHT_HEADER_BG_HEX.has(n)) return undefined;
  }
  return t;
}

/**
 * @param {string|undefined|null} raw
 * @param {boolean} isDark
 * @returns {string|undefined}
 */
export function resolveDataPanelHeaderColorForDark(raw, isDark) {
  if (raw == null || String(raw).trim() === '') return undefined;
  const t = String(raw).trim();
  if (t.startsWith('var(')) return t;
  if (isDark) {
    const n = normalizeHexColor(t);
    if (n && LIGHT_HEADER_TEXT_HEX.has(n)) return undefined;
  }
  return t;
}

/** Panel body background: in dark, drop saved white/light grays so --rb-card-bg shows through. */
export function resolveDataPanelPanelBgForDark(raw, isDark) {
  if (raw == null || String(raw).trim() === '') return undefined;
  const t = String(raw).trim();
  if (t.startsWith('var(')) return t;
  if (isDark) {
    const n = normalizeHexColor(t);
    if (n && LIGHT_HEADER_BG_HEX.has(n)) return undefined;
  }
  return t;
}
