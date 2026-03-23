/**
 * DateRangePicker — Inline two-month date-time range selector.
 *
 * Renders as an expanding panel (no floating popup). Selection is two-phase:
 *   1. Click a day → sets start, enters "pick end" mode
 *   2. Click another day → sets end, completes selection
 * Hover preview shows the range while picking the end date.
 * Time inputs adjust the HH:mm part of each boundary independently.
 * "Apply" commits the range; the parent is not updated until then.
 *
 * Props:
 *   from      — YYYY-MM-DDTHH:mm string or ''
 *   to        — YYYY-MM-DDTHH:mm string or ''
 *   onApply   — ({ from: string, to: string }) => void
 */

import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* ── Constants ────────────────────────────────────────────────────── */

const WD      = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MON     = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_S   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── Pure helpers ─────────────────────────────────────────────────── */

/** Parse 'YYYY-MM-DDTHH:mm' → Date in local time. */
function parse(str) {
  if (!str) return null;
  const [dp, tp = '00:00'] = str.split('T');
  const [y, mo, d] = dp.split('-').map(Number);
  const [h, min]   = tp.split(':').map(Number);
  return new Date(y, mo - 1, d, h, min);
}

/** Format Date + 'HH:mm' → 'YYYY-MM-DDTHH:mm'. */
function fmt(date, time) {
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}T${time}`;
}

/** Strip time → midnight Date. */
function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a, b) {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth()    === b.getMonth()
    && a.getDate()     === b.getDate();
}

function timeStr(date) {
  if (!date) return '00:00';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Build a 42-cell (6 rows × 7 cols, Mon-first) grid for a given month.
 * Cells outside the month are flagged with `out: true`.
 */
function buildGrid(year, month) {
  const firstDow  = (new Date(year, month, 1).getDay() + 6) % 7;  // 0 = Mon
  const daysInMo  = new Date(year, month + 1, 0).getDate();
  const prevDays  = new Date(year, month, 0).getDate();
  const cells     = [];

  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ d: new Date(year, month - 1, prevDays - i), out: true });

  for (let i = 1; i <= daysInMo; i++)
    cells.push({ d: new Date(year, month, i), out: false });

  while (cells.length < 42)
    cells.push({ d: new Date(year, month + 1, cells.length - firstDow - daysInMo + 1), out: true });

  return cells;
}

/* ── MonthPanel ───────────────────────────────────────────────────── */

function MonthPanel({ year, month, start, end, phase, hover, today, onDayClick, onDayHover }) {
  // Effective preview end: while picking end, hover acts as a preview
  const previewEnd = phase === 'end' ? (hover || null) : end;
  const lo = start && previewEnd ? midnight(start <= previewEnd ? start     : previewEnd) : start ? midnight(start) : null;
  const hi = start && previewEnd ? midnight(start <= previewEnd ? previewEnd : start)     : null;

  return (
    <div className="flex flex-col">
      {/* Month title */}
      <div className="text-[11px] font-bold text-center text-[#2a3545] dark:text-[#e1e8f0] mb-1.5 tracking-wide">
        {MON[month]} {year}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7">
        {WD.map((w) => (
          <div key={w} className="text-[9px] font-semibold text-[#8898aa] text-center py-0.5 select-none">
            {w}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {buildGrid(year, month).map(({ d, out }, i) => {
          const isStart    = sameDay(d, lo);
          const isEnd      = sameDay(d, hi);
          const isSelected = isStart || isEnd;
          const inRange    = lo && hi && d.getTime() > lo.getTime() && d.getTime() < hi.getTime();
          const isToday    = sameDay(d, today);
          const isSingle   = isStart && isEnd;

          // Range bar: start/end get flat edges toward the range interior
          const roundL = isStart && !isSingle ? 'rounded-l-lg rounded-r-none' : isEnd && !isSingle ? 'rounded-l-none rounded-r-lg' : 'rounded-lg';

          return (
            <button
              key={i}
              type="button"
              disabled={out}
              onClick={() => !out && onDayClick(midnight(d))}
              onMouseEnter={() => !out && onDayHover(midnight(d))}
              onMouseLeave={() => onDayHover(null)}
              className={[
                'relative h-7 text-[11px] font-medium text-center transition-colors duration-100 focus-visible:outline-none',
                out ? 'opacity-20 pointer-events-none' : 'cursor-pointer',
                isSelected
                  ? `bg-brand text-white ${roundL} z-10`
                  : inRange
                    ? 'bg-brand/10 dark:bg-brand/15 text-brand dark:text-brand rounded-none'
                    : !out
                      ? 'text-[#2a3545] dark:text-[#c1ccd9] hover:bg-[#f1f5f9] dark:hover:bg-[#0d1e30] rounded-lg'
                      : '',
              ].join(' ')}
            >
              {d.getDate()}

              {/* Today dot */}
              {isToday && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── DateRangePicker ──────────────────────────────────────────────── */

export default function DateRangePicker({ from, to, onApply, onClose, shiftsConfig }) {
  const today    = new Date();
  const initFrom = parse(from);
  const initTo   = parse(to);

  // Draft selection (dates at midnight)
  const [start,     setStart]     = useState(() => initFrom ? midnight(initFrom) : null);
  const [end,       setEnd]       = useState(() => initTo   ? midnight(initTo)   : null);
  const [hover,     setHover]     = useState(null);
  const [phase,     setPhase]     = useState('start'); // 'start' | 'end'

  // Time strings for the from/to boundaries
  const [fromTime, setFromTime] = useState(() => timeStr(initFrom));
  const [toTime,   setToTime]   = useState(() => timeStr(initTo) || '23:59');

  // Calendar view (left panel month)
  const [viewYear,  setViewYear]  = useState(() => (initFrom || today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (initFrom || today).getMonth());

  const rightYear  = viewMonth === 11 ? viewYear + 1 : viewYear;
  const rightMonth = (viewMonth + 1) % 12;

  const prevMonth = useCallback(() => {
    setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; });
  }, []);

  /* ── Day interaction ── */
  const handleDayClick = useCallback((d) => {
    if (phase === 'start' || !start) {
      setStart(d);
      setEnd(null);
      setPhase('end');
    } else {
      if (d < start) { setEnd(start); setStart(d); }
      else            { setEnd(d); }
      setPhase('start');
      setHover(null);
    }
  }, [phase, start]);

  /* ── Quick presets ── */
  const applyPreset = useCallback((label) => {
    const e = midnight(today);
    let s;
    if (label === 'today') {
      s = midnight(today);
    } else if (label === 'yesterday') {
      s = new Date(e); s.setDate(s.getDate() - 1); e.setDate(e.getDate() - 1);
    } else if (label === '7d') {
      s = new Date(e); s.setDate(s.getDate() - 6);
    } else if (label === '30d') {
      s = new Date(e); s.setDate(s.getDate() - 29);
    } else if (label === 'month') {
      s = new Date(e.getFullYear(), e.getMonth(), 1);
    }
    setStart(s); setEnd(e); setPhase('start'); setHover(null);
    setViewYear(s.getFullYear()); setViewMonth(s.getMonth());
  }, [today]);

  /* ── Apply ── */
  const lo = start && end ? (start <= end ? start : end) : start;
  const hi = start && end ? (start <= end ? end   : start) : null;
  const canApply = !!(lo && hi);

  const handleApply = useCallback(() => {
    if (!canApply) return;
    onApply({ from: fmt(lo, fromTime), to: fmt(hi, toTime) });
    onClose?.();
  }, [canApply, lo, hi, fromTime, toTime, onApply, onClose]);

  /* ── Summary label ── */
  const fmtDisplay = (d) => d
    ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const hintText = phase === 'end' && start && !end ? 'Click to set end date' : null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 bg-white dark:bg-[#080d19] border-b border-[#e3e9f0] dark:border-[#1e293b] animate-slide-up">

      {/* ── Shift quick-select ── */}
      {shiftsConfig?.shifts?.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#8898aa]">Shift:</span>
          {shiftsConfig.shifts.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const now = new Date();
                const [sh, sm] = s.start.split(':').map(Number);
                const [eh, em] = s.end.split(':').map(Number);
                const fromD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0);
                const toD   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0);
                if (toD <= fromD) toD.setDate(toD.getDate() + 1);
                setStart(midnight(fromD)); setEnd(midnight(toD));
                setFromTime(`${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`);
                setToTime(`${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`);
                setPhase('start'); setHover(null);
                setViewYear(fromD.getFullYear()); setViewMonth(fromD.getMonth());
              }}
              className="px-2.5 py-1 text-[10px] font-semibold rounded-md border border-[#e3e9f0] dark:border-[#1e293b] text-[#5a6d80] dark:text-[#8898aa] hover:border-brand hover:text-brand dark:hover:text-brand transition-colors"
            >
              {s.name} ({s.start}–{s.end})
            </button>
          ))}
        </div>
      )}

      {/* ── Calendars ── */}
      <div className="flex items-start gap-2">
        {/* Prev */}
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 mt-0.5 rounded-lg text-[#6b7f94] hover:text-brand hover:bg-[#f1f5f9] dark:hover:bg-[#0d1e30] transition-colors flex-shrink-0"
          aria-label="Previous month"
        >
          <ChevronLeft size={13} />
        </button>

        {/* Two months */}
        <div className="flex gap-5 flex-1 justify-center">
          <MonthPanel
            year={viewYear} month={viewMonth}
            start={start} end={end} phase={phase} hover={hover} today={today}
            onDayClick={handleDayClick} onDayHover={setHover}
          />
          <div className="w-px self-stretch bg-[#e3e9f0] dark:bg-[#1e293b]" />
          <MonthPanel
            year={rightYear} month={rightMonth}
            start={start} end={end} phase={phase} hover={hover} today={today}
            onDayClick={handleDayClick} onDayHover={setHover}
          />
        </div>

        {/* Next */}
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 mt-0.5 rounded-lg text-[#6b7f94] hover:text-brand hover:bg-[#f1f5f9] dark:hover:bg-[#0d1e30] transition-colors flex-shrink-0"
          aria-label="Next month"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* ── Footer: times + hint + apply ── */}
      <div className="flex items-center gap-4 pt-2 border-t border-[#e3e9f0] dark:border-[#1e293b] flex-wrap">

        {/* From */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#6b7f94]">From</span>
          <span className="text-[11px] font-semibold text-[#2a3545] dark:text-[#c1ccd9] min-w-[76px]">
            {fmtDisplay(lo)}
          </span>
          <input
            type="time"
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
            disabled={!lo}
            className="text-[11px] rounded-md border border-[#e3e9f0] dark:border-[#2a3347] bg-white dark:bg-[#0d1e30] px-2 py-1 text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>

        <ChevronRight size={11} className="text-[#8898aa] flex-shrink-0" />

        {/* To */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#6b7f94]">To</span>
          <span className="text-[11px] font-semibold text-[#2a3545] dark:text-[#c1ccd9] min-w-[76px]">
            {fmtDisplay(hi)}
          </span>
          <input
            type="time"
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
            disabled={!hi}
            className="text-[11px] rounded-md border border-[#e3e9f0] dark:border-[#2a3347] bg-white dark:bg-[#0d1e30] px-2 py-1 text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex-1" />

        {/* Phase hint */}
        {hintText && (
          <span className="text-[10px] italic text-[#8898aa]">{hintText}</span>
        )}

        {/* Apply */}
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="px-4 py-1.5 text-[11px] font-bold rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
