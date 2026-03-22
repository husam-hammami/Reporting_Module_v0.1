/**
 * useTimePeriod — State management for time period selection.
 *
 * Encapsulates the full time-period state (active tab, custom range, selected
 * shift) behind a useReducer so callers don't wire up five separate useState
 * calls. Returns a derived `dateRange` so callers never compute it themselves.
 *
 * Usage:
 *   const { state, dateRange, actions } = useTimePeriod('live', VIEWER_TABS);
 *
 * `dateRange` — { from: Date, to: Date } | null
 *   null only in 'live' mode (caller fetches live data instead).
 *
 * `actions`
 *   setTab(id)               — switch active tab
 *   setCustomFrom(localStr)  — YYYY-MM-DDTHH:mm string from <input datetime-local>
 *   setCustomTo(localStr)
 *   setShift(indexStr)       — string index of the selected shift
 *
 * Supported tab ids (built-in presets):
 *   'live', 'day'/'today', 'yesterday', 'week'/'this-week',
 *   'last-week', 'month'/'this-month', 'shift', 'custom'
 */

import { useReducer, useMemo } from 'react';

/* ── Day boundary ────────────────────────────────────────────────── */

/** Production shift day starts at 05:00, not midnight. */
const SHIFT_HOUR = 5;

function shiftedToday(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < SHIFT_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(SHIFT_HOUR, 0, 0, 0);
  return d;
}

/* ── Preset date-range calculation ───────────────────────────────── */

function computePresetRange(tabId, now = new Date()) {
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight

  switch (tabId) {
    /* Simple midnight-based presets (used in ReportViewer) */
    case 'day':
      return { from: sod, to: now };

    case 'week': {
      const d   = now.getDay();
      const off = d === 0 ? 6 : d - 1;          // Monday = day 0
      const mon = new Date(sod);
      mon.setDate(mon.getDate() - off);
      return { from: mon, to: now };
    }

    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };

    /* Shift-day (05:00) based presets (used in PaginatedReportViewer) */
    case 'today': {
      const from = shiftedToday(now);
      return { from, to: new Date(from.getTime() + 24 * 3600_000) };
    }

    case 'yesterday': {
      const from = shiftedToday(now);
      from.setDate(from.getDate() - 1);
      return { from, to: new Date(from.getTime() + 24 * 3600_000) };
    }

    case 'this-week': {
      const from = shiftedToday(now);
      from.setDate(from.getDate() - from.getDay()); // Sunday-based; adjust if needed
      return { from, to: now };
    }

    case 'last-week': {
      const from = shiftedToday(now);
      from.setDate(from.getDate() - from.getDay() - 7);
      return { from, to: new Date(from.getTime() + 7 * 24 * 3600_000) };
    }

    case 'this-month': {
      const from = shiftedToday(now);
      from.setDate(1);
      return { from, to: now };
    }

    default:
      return null; // 'live', 'shift', 'custom' — handled separately
  }
}

/* ── Reducer ─────────────────────────────────────────────────────── */

const INITIAL = {
  tab:         'live',   // active tab id
  customFrom:  '',       // YYYY-MM-DDTHH:mm (datetime-local format)
  customTo:    '',
  selectedShift: '',     // string index '' | '0' | '1' ...
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TAB':
      /* Reset custom fields when leaving custom; reset shift when leaving shift */
      return {
        ...state,
        tab: action.id,
        ...(action.id !== 'custom' ? { customFrom: '', customTo: '' }  : {}),
        ...(action.id !== 'shift'  ? { selectedShift: '' }             : {}),
      };
    case 'SET_CUSTOM_FROM':
      return { ...state, customFrom: action.value };
    case 'SET_CUSTOM_TO':
      return { ...state, customTo: action.value };
    case 'SET_SHIFT':
      return { ...state, selectedShift: action.index };
    default:
      return state;
  }
}

/* ── Hook ────────────────────────────────────────────────────────── */

export default function useTimePeriod(initialTab = 'live', shiftsConfig = null) {
  const [state, dispatch] = useReducer(reducer, { ...INITIAL, tab: initialTab });

  const actions = useMemo(() => ({
    setTab:        (id)    => dispatch({ type: 'SET_TAB',         id }),
    setCustomFrom: (value) => dispatch({ type: 'SET_CUSTOM_FROM', value }),
    setCustomTo:   (value) => dispatch({ type: 'SET_CUSTOM_TO',   value }),
    setShift:      (index) => dispatch({ type: 'SET_SHIFT',       index }),
  }), []);

  /**
   * dateRange — { from: Date, to: Date } | null
   *
   * null  → caller should use live data
   * range → caller should fetch historical data for [from, to]
   */
  const dateRange = useMemo(() => {
    const { tab, customFrom, customTo, selectedShift } = state;

    if (tab === 'live') return null;

    if (tab === 'custom') {
      if (!customFrom || !customTo) return null;
      const from = new Date(customFrom);
      const to   = new Date(customTo);
      if (isNaN(from) || isNaN(to) || from >= to) return null;
      return { from, to };
    }

    if (tab === 'shift') {
      if (!shiftsConfig?.shifts?.length) return null;
      const idx   = parseInt(selectedShift, 10);
      const shift = shiftsConfig.shifts[idx];
      if (!shift) return null;

      const now  = new Date();
      const [sh, sm] = shift.start.split(':').map(Number);
      const [eh, em] = shift.end.split(':').map(Number);
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0);
      const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0);
      // Overnight shift (e.g. 22:00 → 06:00)
      if (to <= from) to.setDate(to.getDate() + 1);
      return { from, to };
    }

    return computePresetRange(tab);
  }, [state, shiftsConfig]);

  return { state, dateRange, actions };
}
