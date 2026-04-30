/**
 * Footer — Plan 14 §3.8.
 *
 * Single thin strip: calibration progress · last updated · "See full time
 * analysis" link that opens TimeDrawer.
 *
 * Locked answer for Q2: show both calibration AND updated-time together
 * during learning window, separated by middle dots.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import TimeDrawer from './drawers/TimeDrawer';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'var(--hai-text-tertiary)',
  paddingTop: 4,
};

const linkStyle: CSSProperties = {
  color: 'var(--hai-text-secondary)',
  textDecoration: 'none',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  fontSize: 12,
  fontFamily: 'inherit',
  padding: 0,
};

function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (min < 1) return 'Updated just now';
    if (min === 1) return 'Updated 1 min ago';
    if (min < 60) return `Updated ${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr === 1) return 'Updated 1 h ago';
    return `Updated ${hr} h ago`;
  } catch {
    return '';
  }
}

export default function Footer({ payload }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const calibrating = !!payload?.savings?.calibrating;
  const daysOfHistory = payload?.savings?.days_of_history ?? 0;
  const daysLeft = Math.max(0, 30 - daysOfHistory);
  const updatedAt = relativeTime((payload as any)?.generated_at);

  return (
    <>
      <div style={footerStyle}>
        <span>
          {calibrating && daysLeft > 0 && (
            <>
              <span style={{ color: 'var(--hai-text-secondary)' }}>
                Hercules learning · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              </span>
              {updatedAt && (
                <>
                  <span style={{ margin: '0 8px' }}>·</span>
                  {updatedAt}
                </>
              )}
            </>
          )}
          {!calibrating && updatedAt}
        </span>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={linkStyle}
          aria-label="Open the full time-period analysis"
        >
          See full time analysis →
        </button>
      </div>
      <TimeDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
