/**
 * useTimePeriod — unit tests
 *
 * Tests cover:
 *   • Every tab ID → correct dateRange shape / values
 *   • Null-returning cases (live, shift with no config, custom with bad inputs)
 *   • Reducer resets (leaving custom clears custom fields, leaving shift clears selectedShift)
 *   • Shift overnight wrap-around
 *   • Custom range validation (empty, from >= to, valid)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useTimePeriod from '../Hooks/useTimePeriod';

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Format a Date as YYYY-MM-DDTHH:mm for datetime-local inputs */
function localStr(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Pin "now" to a known time so tests don't depend on real clock */
function pinNow(isoString) {
  const fixed = new Date(isoString);
  vi.setSystemTime(fixed);
  return fixed;
}

/* ── Test data ───────────────────────────────────────────────────── */

const SHIFTS_CONFIG = {
  shifts: [
    { name: 'Morning', start: '06:00', end: '14:00' },
    { name: 'Evening', start: '14:00', end: '22:00' },
    { name: 'Night',   start: '22:00', end: '06:00' }, // overnight
  ],
};

/* ══════════════════════════════════════════════════════════════════
   live tab
   ══════════════════════════════════════════════════════════════════ */

describe('live tab', () => {
  it('dateRange is null', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    expect(result.current.dateRange).toBeNull();
  });

  it('initial state has tab=live', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    expect(result.current.state.tab).toBe('live');
  });
});

/* ══════════════════════════════════════════════════════════════════
   day / today presets  (midnight-based)
   ══════════════════════════════════════════════════════════════════ */

describe('day tab (ReportViewer)', () => {
  beforeEach(() => { pinNow('2025-06-15T09:30:00'); });
  afterEach(() => vi.useRealTimers());

  it('from = midnight, to = now', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('day'));

    const { from, to } = result.current.dateRange;
    expect(from).toEqual(new Date('2025-06-15T00:00:00'));
    expect(to.getHours()).toBe(9);
    expect(to.getMinutes()).toBe(30);
  });
});

/* ══════════════════════════════════════════════════════════════════
   week tab (midnight Monday-based)
   ══════════════════════════════════════════════════════════════════ */

describe('week tab (ReportViewer)', () => {
  afterEach(() => vi.useRealTimers());

  it('from = Monday of current week at midnight', () => {
    // 2025-06-15 is a Sunday — Monday of that week was 2025-06-09
    pinNow('2025-06-15T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('week'));

    const { from } = result.current.dateRange;
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(5);   // June (0-indexed)
    expect(from.getDate()).toBe(9);    // Monday 9 Jun
    expect(from.getHours()).toBe(0);
  });

  it('from = same day (Monday) when today is Monday', () => {
    // 2025-06-16 is a Monday
    pinNow('2025-06-16T08:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('week'));

    expect(result.current.dateRange.from.getDate()).toBe(16);
  });
});

/* ══════════════════════════════════════════════════════════════════
   month tab
   ══════════════════════════════════════════════════════════════════ */

describe('month tab', () => {
  afterEach(() => vi.useRealTimers());

  it('from = 1st of current month at midnight', () => {
    pinNow('2025-06-15T12:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('month'));

    const { from } = result.current.dateRange;
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(5); // June
    expect(from.getHours()).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════
   today / yesterday (05:00 production-day boundary)
   ══════════════════════════════════════════════════════════════════ */

describe('today tab (PaginatedViewer, after 05:00)', () => {
  afterEach(() => vi.useRealTimers());

  it('from = 05:00 today, to = 05:00 tomorrow', () => {
    pinNow('2025-06-15T09:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('today'));

    const { from, to } = result.current.dateRange;
    expect(from.getDate()).toBe(15);
    expect(from.getHours()).toBe(5);
    expect(from.getMinutes()).toBe(0);
    // to = from + 24h
    expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
    expect(to.getDate()).toBe(16);
    expect(to.getHours()).toBe(5);
  });

  it('before 05:00 — shifts boundary to yesterday', () => {
    // 03:00 on June 15 → production day is still "June 14"
    pinNow('2025-06-15T03:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('today'));

    const { from } = result.current.dateRange;
    expect(from.getDate()).toBe(14);  // shifted back to June 14
    expect(from.getHours()).toBe(5);
  });
});

describe('yesterday tab (PaginatedViewer)', () => {
  afterEach(() => vi.useRealTimers());

  it('from = 05:00 yesterday, to = 05:00 today', () => {
    pinNow('2025-06-15T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('yesterday'));

    const { from, to } = result.current.dateRange;
    expect(from.getDate()).toBe(14);
    expect(from.getHours()).toBe(5);
    expect(to.getDate()).toBe(15);
    expect(to.getHours()).toBe(5);
  });
});

/* ══════════════════════════════════════════════════════════════════
   this-week / last-week (PaginatedViewer — Sunday-based)
   ══════════════════════════════════════════════════════════════════ */

describe('this-week tab', () => {
  afterEach(() => vi.useRealTimers());

  it('from = Sunday of current week at 05:00', () => {
    // 2025-06-15 is Sunday → this-week from = Sunday itself
    pinNow('2025-06-15T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('this-week'));

    const { from } = result.current.dateRange;
    expect(from.getDay()).toBe(0);   // Sunday
    expect(from.getHours()).toBe(5);
  });

  it('from = previous Sunday when today is Wednesday', () => {
    // 2025-06-18 is Wednesday → Sunday was 2025-06-15
    pinNow('2025-06-18T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('this-week'));

    const { from } = result.current.dateRange;
    expect(from.getDate()).toBe(15);
    expect(from.getDay()).toBe(0);
  });
});

describe('last-week tab', () => {
  afterEach(() => vi.useRealTimers());

  it('spans exactly 7 days', () => {
    pinNow('2025-06-18T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('last-week'));

    const { from, to } = result.current.dateRange;
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it('from.getDay() === 0 (Sunday)', () => {
    pinNow('2025-06-18T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('last-week'));
    expect(result.current.dateRange.from.getDay()).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════
   this-month tab
   ══════════════════════════════════════════════════════════════════ */

describe('this-month tab', () => {
  afterEach(() => vi.useRealTimers());

  it('from = 1st of month at 05:00', () => {
    pinNow('2025-06-15T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('this-month'));

    const { from } = result.current.dateRange;
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(5);
    expect(from.getHours()).toBe(5);
  });
});

/* ══════════════════════════════════════════════════════════════════
   custom tab
   ══════════════════════════════════════════════════════════════════ */

describe('custom tab', () => {
  it('returns null when both inputs empty', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => result.current.actions.setTab('custom'));
    expect(result.current.dateRange).toBeNull();
  });

  it('returns null when only from is set', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => {
      result.current.actions.setTab('custom');
      result.current.actions.setCustomFrom('2025-06-10T08:00');
    });
    expect(result.current.dateRange).toBeNull();
  });

  it('returns null when from >= to', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => {
      result.current.actions.setTab('custom');
      result.current.actions.setCustomFrom('2025-06-15T10:00');
      result.current.actions.setCustomTo('2025-06-15T10:00');  // equal
    });
    expect(result.current.dateRange).toBeNull();
  });

  it('returns null when from > to', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => {
      result.current.actions.setTab('custom');
      result.current.actions.setCustomFrom('2025-06-15T12:00');
      result.current.actions.setCustomTo('2025-06-15T08:00');  // to < from
    });
    expect(result.current.dateRange).toBeNull();
  });

  it('returns correct Date objects for valid range', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => {
      result.current.actions.setTab('custom');
      result.current.actions.setCustomFrom('2025-06-10T06:00');
      result.current.actions.setCustomTo('2025-06-10T14:00');
    });

    const { from, to } = result.current.dateRange;
    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect(to.getTime() - from.getTime()).toBe(8 * 3600 * 1000); // 8 hours
  });
});

/* ══════════════════════════════════════════════════════════════════
   shift tab
   ══════════════════════════════════════════════════════════════════ */

describe('shift tab — no config', () => {
  it('returns null when shiftsConfig is null', () => {
    const { result } = renderHook(() => useTimePeriod('live', null));
    act(() => result.current.actions.setTab('shift'));
    expect(result.current.dateRange).toBeNull();
  });

  it('returns null when shifts array is empty', () => {
    const { result } = renderHook(() => useTimePeriod('live', { shifts: [] }));
    act(() => result.current.actions.setTab('shift'));
    expect(result.current.dateRange).toBeNull();
  });

  it('returns null when no shift selected (empty string)', () => {
    const { result } = renderHook(() => useTimePeriod('live', SHIFTS_CONFIG));
    act(() => result.current.actions.setTab('shift'));
    // selectedShift defaults to '' → parseInt('') = NaN → shift not found
    expect(result.current.dateRange).toBeNull();
  });
});

describe('shift tab — normal shift (Morning 06:00–14:00)', () => {
  afterEach(() => vi.useRealTimers());

  it('returns correct from/to times', () => {
    pinNow('2025-06-15T10:00:00');
    const { result } = renderHook(() => useTimePeriod('live', SHIFTS_CONFIG));
    act(() => {
      result.current.actions.setTab('shift');
      result.current.actions.setShift('0'); // Morning
    });

    const { from, to } = result.current.dateRange;
    expect(from.getHours()).toBe(6);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(14);
    expect(to.getMinutes()).toBe(0);
    // Same calendar day
    expect(from.getDate()).toBe(to.getDate());
  });
});

describe('shift tab — overnight shift (Night 22:00–06:00)', () => {
  afterEach(() => vi.useRealTimers());

  it('to wraps to next calendar day', () => {
    pinNow('2025-06-15T23:00:00');
    const { result } = renderHook(() => useTimePeriod('live', SHIFTS_CONFIG));
    act(() => {
      result.current.actions.setTab('shift');
      result.current.actions.setShift('2'); // Night
    });

    const { from, to } = result.current.dateRange;
    expect(from.getHours()).toBe(22);
    expect(to.getHours()).toBe(6);
    expect(to.getDate()).toBe(from.getDate() + 1); // next day
    expect(to > from).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════
   Reducer state resets
   ══════════════════════════════════════════════════════════════════ */

describe('state resets on tab change', () => {
  it('switching away from custom clears customFrom and customTo', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => {
      result.current.actions.setTab('custom');
      result.current.actions.setCustomFrom('2025-06-10T06:00');
      result.current.actions.setCustomTo('2025-06-10T14:00');
    });
    expect(result.current.state.customFrom).toBe('2025-06-10T06:00');

    act(() => result.current.actions.setTab('day'));
    expect(result.current.state.customFrom).toBe('');
    expect(result.current.state.customTo).toBe('');
  });

  it('switching away from shift clears selectedShift', () => {
    const { result } = renderHook(() => useTimePeriod('live', SHIFTS_CONFIG));
    act(() => {
      result.current.actions.setTab('shift');
      result.current.actions.setShift('1');
    });
    expect(result.current.state.selectedShift).toBe('1');

    act(() => result.current.actions.setTab('day'));
    expect(result.current.state.selectedShift).toBe('');
  });

  it('switching back to custom does NOT clear customFrom/To', () => {
    const { result } = renderHook(() => useTimePeriod('live'));
    act(() => {
      result.current.actions.setTab('custom');
      result.current.actions.setCustomFrom('2025-06-10T06:00');
      result.current.actions.setCustomTo('2025-06-10T14:00');
    });
    // Switching to 'custom' again (or staying there) doesn't clear
    act(() => result.current.actions.setTab('custom'));
    expect(result.current.state.customFrom).toBe('2025-06-10T06:00');
  });
});

/* ══════════════════════════════════════════════════════════════════
   dateRange returns Date objects (not strings)
   ══════════════════════════════════════════════════════════════════ */

describe('dateRange always returns Date objects', () => {
  afterEach(() => vi.useRealTimers());

  const presets = ['day', 'week', 'month', 'today', 'yesterday', 'this-week', 'last-week', 'this-month'];

  presets.forEach((tab) => {
    it(`${tab} → from and to are Date instances`, () => {
      pinNow('2025-06-18T10:00:00');
      const { result } = renderHook(() => useTimePeriod('live'));
      act(() => result.current.actions.setTab(tab));

      const { from, to } = result.current.dateRange;
      expect(from).toBeInstanceOf(Date);
      expect(to).toBeInstanceOf(Date);
    });

    it(`${tab} → from < to`, () => {
      pinNow('2025-06-18T10:00:00');
      const { result } = renderHook(() => useTimePeriod('live'));
      act(() => result.current.actions.setTab(tab));

      const { from, to } = result.current.dateRange;
      expect(from.getTime()).toBeLessThan(to.getTime());
    });
  });
});
