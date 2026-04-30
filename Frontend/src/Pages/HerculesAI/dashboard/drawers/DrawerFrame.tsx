/**
 * DrawerFrame — Plan 14 §5.0 (the common drawer chrome).
 *
 * Slide-in side panel from the right that overlays the bento without
 * unmounting it. Used by every Tier-2 drawer (Time, Savings, Bill, Lever,
 * Trust, Yield, Asset, Watch, Anomaly).
 *
 * Behavior:
 *   - Click the backdrop, click the close button, or press Escape → onClose.
 *   - Focus trap: focus moves to the close button on open; Tab cycles within;
 *     Shift+Tab cycles backward. Focus returns to the trigger element on close.
 *   - 240 ms ease-out fade-in for backdrop, slide-in for the panel itself
 *     (MASTER §5 motion tokens).
 *   - Width: 640 px on ≥1024-wide viewports; full-screen with edge gutter
 *     on narrower.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional eyebrow above the title (e.g. asset name) */
  eyebrow?: string;
  /** Drawer body */
  children: ReactNode;
  /** Optional footer slot (e.g. action buttons) */
  footer?: ReactNode;
  /** Right-side header slot (e.g. menu) */
  headerActions?: ReactNode;
  /** Width in px on wide viewports. Default 640. */
  width?: number;
}

const backdropStyle = (open: boolean): CSSProperties => ({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  opacity: open ? 1 : 0,
  pointerEvents: open ? 'auto' : 'none',
  transition: 'opacity 240ms ease-out',
  zIndex: 40,
});

const panelStyle = (open: boolean, width: number): CSSProperties => ({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width,
  maxWidth: 'calc(100vw - 32px)',
  background: 'var(--hai-glass-2)',
  borderLeft: '1px solid var(--hai-glass-border)',
  boxShadow: '-12px 0 40px rgba(0,0,0,0.35)',
  transform: open ? 'translateX(0)' : 'translateX(8px)',
  opacity: open ? 1 : 0,
  pointerEvents: open ? 'auto' : 'none',
  transition: 'opacity 240ms ease-out, transform 240ms ease-out',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 41,
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
});

const headerStyle: CSSProperties = {
  flexShrink: 0,
  padding: '20px 24px',
  borderBottom: '1px solid var(--hai-glass-border)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
};

const titleStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 22,
  fontWeight: 500,
  color: 'var(--hai-text-primary)',
  margin: '4px 0 0',
  lineHeight: 1.2,
};

const closeStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 300,
  color: 'var(--hai-text-secondary)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 8,
  margin: -8,
  borderRadius: 6,
  lineHeight: 1,
  flexShrink: 0,
  width: 36,
  height: 36,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '20px 24px',
};

const footerStyle: CSSProperties = {
  flexShrink: 0,
  padding: '16px 24px',
  borderTop: '1px solid var(--hai-glass-border)',
};

export default function DrawerFrame({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  headerActions,
  width = 640,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Track the element that triggered open so we can restore focus on close.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      // Focus the close button on open (next paint).
      window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    } else if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
      (triggerRef.current as HTMLElement).focus();
    }
  }, [open]);

  // Escape closes; trap Tab inside the panel.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <div
        style={backdropStyle(open)}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        aria-describedby="drawer-body"
        style={panelStyle(open, width)}
      >
        <header style={headerStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && <div style={eyebrowStyle}>{eyebrow}</div>}
            <h2 id="drawer-title" style={titleStyle}>{title}</h2>
          </div>
          {headerActions}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={closeStyle}
          >
            ×
          </button>
        </header>
        <div id="drawer-body" style={bodyStyle}>
          {children}
        </div>
        {footer && <div style={footerStyle}>{footer}</div>}
      </aside>
    </>
  );
}
