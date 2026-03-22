/**
 * TabSelector — UI switching tests
 *
 * Tests cover:
 *   • Renders all tabs with correct labels
 *   • Active tab has aria-selected=true; others false
 *   • Clicking an inactive tab calls onChange with correct id
 *   • Clicking the active tab calls onChange (idempotent, caller decides)
 *   • Keyboard: ArrowRight / ArrowLeft / Home / End cycle through tabs
 *   • dot='live' renders the status dot span
 *   • VIEWER_TABS and PAGINATED_TABS contain expected ids
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TabSelector from '../Components/ui/TabSelector';
import { VIEWER_TABS, PAGINATED_TABS } from '../Pages/Reports/TimePeriodTabs';

/* ── Shared fixture ──────────────────────────────────────────────── */

const TABS = [
  { id: 'live',   label: 'Live',       dot: 'live' },
  { id: 'today',  label: 'Today' },
  { id: 'week',   label: 'This Week' },
  { id: 'custom', label: 'Custom' },
];

function setup(activeId = 'live', onChange = vi.fn()) {
  const result = render(
    <TabSelector tabs={TABS} activeId={activeId} onChange={onChange} />,
  );
  return { ...result, onChange };
}

/* ══════════════════════════════════════════════════════════════════
   Rendering
   ══════════════════════════════════════════════════════════════════ */

describe('rendering', () => {
  it('renders all tab labels', () => {
    setup();
    expect(screen.getByRole('tab', { name: /live/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /this week/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /custom/i })).toBeInTheDocument();
  });

  it('tablist has role=tablist', () => {
    setup();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('active tab has aria-selected=true', () => {
    setup('today');
    expect(screen.getByRole('tab', { name: /today/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('inactive tabs have aria-selected=false', () => {
    setup('today');
    ['live', 'this week', 'custom'].forEach((name) => {
      expect(screen.getByRole('tab', { name: new RegExp(name, 'i') }))
        .toHaveAttribute('aria-selected', 'false');
    });
  });

  it('active tab has tabIndex=0; inactive have tabIndex=-1', () => {
    setup('week');
    expect(screen.getByRole('tab', { name: /this week/i })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /today/i })).toHaveAttribute('tabindex', '-1');
  });
});

/* ══════════════════════════════════════════════════════════════════
   Click interactions
   ══════════════════════════════════════════════════════════════════ */

describe('click', () => {
  it('clicking an inactive tab calls onChange with its id', async () => {
    const { onChange } = setup('live');
    await userEvent.click(screen.getByRole('tab', { name: /today/i }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('clicking the active tab still calls onChange', async () => {
    const { onChange } = setup('live');
    await userEvent.click(screen.getByRole('tab', { name: /live/i }));
    expect(onChange).toHaveBeenCalledWith('live');
  });

  it('clicking each tab calls onChange with the correct id', async () => {
    const onChange = vi.fn();
    render(<TabSelector tabs={TABS} activeId="live" onChange={onChange} />);

    for (const tab of TABS) {
      await userEvent.click(screen.getByRole('tab', { name: new RegExp(tab.label, 'i') }));
      expect(onChange).toHaveBeenLastCalledWith(tab.id);
    }
    expect(onChange).toHaveBeenCalledTimes(TABS.length);
  });
});

/* ══════════════════════════════════════════════════════════════════
   Keyboard navigation
   ══════════════════════════════════════════════════════════════════ */

describe('keyboard navigation', () => {
  it('ArrowRight moves focus to the next tab and calls onChange', async () => {
    const onChange = vi.fn();
    render(<TabSelector tabs={TABS} activeId="live" onChange={onChange} />);

    const liveTab = screen.getByRole('tab', { name: /live/i });
    liveTab.focus();
    fireEvent.keyDown(liveTab, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('ArrowLeft wraps around from first to last tab', async () => {
    const onChange = vi.fn();
    render(<TabSelector tabs={TABS} activeId="live" onChange={onChange} />);

    const liveTab = screen.getByRole('tab', { name: /live/i });
    liveTab.focus();
    fireEvent.keyDown(liveTab, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('custom'); // last tab
  });

  it('ArrowRight wraps around from last to first tab', async () => {
    const onChange = vi.fn();
    render(<TabSelector tabs={TABS} activeId="custom" onChange={onChange} />);

    const customTab = screen.getByRole('tab', { name: /custom/i });
    customTab.focus();
    fireEvent.keyDown(customTab, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('live'); // first tab
  });

  it('Home key jumps to first tab', async () => {
    const onChange = vi.fn();
    render(<TabSelector tabs={TABS} activeId="week" onChange={onChange} />);

    const weekTab = screen.getByRole('tab', { name: /this week/i });
    weekTab.focus();
    fireEvent.keyDown(weekTab, { key: 'Home' });

    expect(onChange).toHaveBeenCalledWith('live');
  });

  it('End key jumps to last tab', async () => {
    const onChange = vi.fn();
    render(<TabSelector tabs={TABS} activeId="live" onChange={onChange} />);

    const liveTab = screen.getByRole('tab', { name: /live/i });
    liveTab.focus();
    fireEvent.keyDown(liveTab, { key: 'End' });

    expect(onChange).toHaveBeenCalledWith('custom');
  });
});

/* ══════════════════════════════════════════════════════════════════
   Live dot
   ══════════════════════════════════════════════════════════════════ */

describe('live dot', () => {
  it('renders a dot span when tab has dot=live', () => {
    setup('live');
    // The live tab button should contain an aria-hidden dot span
    const liveBtn = screen.getByRole('tab', { name: /live/i });
    const dot = liveBtn.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it('non-dot tabs do not render a dot span', () => {
    setup('today');
    const todayBtn = screen.getByRole('tab', { name: /today/i });
    const dot = todayBtn.querySelector('[aria-hidden="true"]');
    expect(dot).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════
   Tab set exports
   ══════════════════════════════════════════════════════════════════ */

describe('VIEWER_TABS', () => {
  it('contains live, day, week, month, shift, custom', () => {
    const ids = VIEWER_TABS.map((t) => t.id);
    expect(ids).toContain('live');
    expect(ids).toContain('day');
    expect(ids).toContain('week');
    expect(ids).toContain('month');
    expect(ids).toContain('shift');
    expect(ids).toContain('custom');
  });

  it('live tab has dot=live', () => {
    const live = VIEWER_TABS.find((t) => t.id === 'live');
    expect(live?.dot).toBe('live');
  });
});

describe('PAGINATED_TABS', () => {
  it('contains live, today, yesterday, this-week, last-week, this-month, custom', () => {
    const ids = PAGINATED_TABS.map((t) => t.id);
    ['live', 'today', 'yesterday', 'this-week', 'last-week', 'this-month', 'custom']
      .forEach((id) => expect(ids).toContain(id));
  });

  it('does not contain day, week, month, or shift', () => {
    const ids = PAGINATED_TABS.map((t) => t.id);
    ['day', 'week', 'month', 'shift'].forEach((id) => expect(ids).not.toContain(id));
  });
});
