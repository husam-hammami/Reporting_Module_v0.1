/**
 * TimePeriodTabs — Shared time period selector for ReportViewer and PaginatedReportViewer.
 *
 * Props:
 *   tabs          — array of { id, label } objects defining available tabs
 *   activeTab     — currently selected tab id
 *   onTabChange   — (id) => void
 *
 *   customFrom    — datetime-local string (YYYY-MM-DDTHH:mm)
 *   customTo      — datetime-local string (YYYY-MM-DDTHH:mm)
 *   onCustomFrom  — (val) => void
 *   onCustomTo    — (val) => void
 *
 *   shiftsConfig  — { shifts: [{ name, start, end }] } | null  (optional, only for shift tab)
 *   selectedShift — index string | '' (optional)
 *   onShiftChange — (index) => void (optional)
 *
 * Usage:
 *   import TimePeriodTabs, { VIEWER_TABS, PAGINATED_TABS } from './TimePeriodTabs';
 */

import React, { useState, useEffect } from 'react';
import { FaClock } from 'react-icons/fa';
import TabSelector from '../../Components/ui/TabSelector';
import DateRangePicker from '../../Components/ui/DateRangePicker';

/* ── Animated sub-bar ─────────────────────────────────────────────── */

/**
 * SubBar — slides open/closed via CSS grid-template-rows: 0fr ↔ 1fr.
 * Content fades in with a slight delay after the height begins expanding,
 * and fades out before the height collapses, creating a staggered effect.
 * Both animations are suppressed when prefers-reduced-motion is set.
 */
function SubBar({ open, children }) {
  const noMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = 'cubic-bezier(0.4,0,0.2,1)';

  return (
    <div
      style={{
        display:          'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition:       noMotion ? 'none' : `grid-template-rows 220ms ${ease}`,
      }}
    >
      {/* overflow:hidden on inner wrapper is what makes 0fr actually clip */}
      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            opacity:    open ? 1 : 0,
            transform:  open ? 'translateY(0)' : 'translateY(-5px)',
            transition: noMotion
              ? 'none'
              /* open: delay behind height; close: lead before height collapses */
              : `opacity 160ms ${ease} ${open ? '50ms' : '0ms'}, transform 160ms ${ease} ${open ? '50ms' : '0ms'}`,
          }}
          className="flex items-center gap-3 px-4 py-2 bg-white/90 dark:bg-[#0a1525] border-b border-[#e3e9f0] dark:border-[#1e293b]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Default tab sets ─────────────────────────────────────────────── */

export const VIEWER_TABS = [
  { id: 'live',   label: 'Live',       dot: 'live' },
  { id: 'day',    label: 'Today' },
  { id: 'week',   label: 'This Week' },
  { id: 'month',  label: 'This Month' },
  { id: 'shift',  label: 'Shift' },
  { id: 'custom', label: 'Custom' },
];

export const PAGINATED_TABS = [
  { id: 'live',       label: 'Live',       dot: 'live' },
  { id: 'today',      label: 'Today' },
  { id: 'yesterday',  label: 'Yesterday' },
  { id: 'this-week',  label: 'This Week' },
  { id: 'last-week',  label: 'Last Week' },
  { id: 'this-month', label: 'This Month' },
  { id: 'shift',      label: 'Shift' },
  { id: 'custom',     label: 'Custom' },
];

/* ── Sub-bar shared styles ────────────────────────────────────────── */

const LABEL = 'text-[11px] font-medium text-[#6b7f94] dark:text-[#8898aa]';
const INPUT = 'text-[11px] rounded-md border border-[#e3e9f0] dark:border-[#2a3347] bg-white dark:bg-[#0d1e30] px-2 py-1 text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors';

/* ── Component ────────────────────────────────────────────────────── */

export default function TimePeriodTabs({
  tabs,
  activeTab,
  onTabChange,
  customFrom = '',
  customTo = '',
  onCustomFrom,
  onCustomTo,
  shiftsConfig = null,
  selectedShift = '',
  onShiftChange,
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const showShift  = activeTab === 'shift';

  // Auto-open custom panel when switching to custom tab
  useEffect(() => {
    if (activeTab === 'custom') setCustomOpen(true);
    else setCustomOpen(false);
  }, [activeTab]);

  return (
    <div className="flex flex-col print:hidden">
      {/* ── Tab row ── */}
      <div className="flex items-center px-4 py-2 bg-white/90 dark:bg-[#0a1525] border-b border-[#e3e9f0] dark:border-[#1e293b]">
        <TabSelector
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => {
            onTabChange(id);
            if (id === 'custom') setCustomOpen(true);
          }}
        />
      </div>

      {/* ── Custom date range picker — hides after Apply ── */}
      {activeTab === 'custom' && customOpen && (
        <DateRangePicker
          from={customFrom}
          to={customTo}
          shiftsConfig={shiftsConfig}
          onApply={({ from, to }) => {
            onCustomFrom?.(from);
            onCustomTo?.(to);
          }}
          onClose={() => setCustomOpen(false)}
        />
      )}

      {/* ── Shift selector sub-bar ── */}
      <SubBar open={showShift}>
        {shiftsConfig?.shifts?.length > 0 ? (
          <>
            <label className={LABEL}>Shift</label>
            <select
              value={selectedShift}
              onChange={(e) => onShiftChange?.(e.target.value)}
              className={INPUT}
            >
              <option value="">Select shift…</option>
              {shiftsConfig.shifts.map((s, i) => (
                <option key={i} value={i}>{s.name} ({s.start}–{s.end})</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <FaClock size={9} className="text-[#d97706]" />
            <span className="text-[11px] font-medium text-[#d97706]">
              No shifts configured — go to Engineering &gt; Shifts
            </span>
          </>
        )}
      </SubBar>
    </div>
  );
}
