/**
 * ErrorState — universal failure fallback.
 *
 * Plan spec 5.12. Warn-coloured `triangle-alert` glyph, one-line explanation,
 * inline Retry ghost button. Friendlier than a stack trace.
 */

import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  children?: ReactNode;
}

export function ErrorState(props: ErrorStateProps) {
  const {
    message = 'Data fetch failed. This is usually a network hiccup. Try again?',
    onRetry,
    retryLabel = 'Retry',
    className,
    children,
  } = props;

  return (
    <div
      role="alert"
      className={[
        'flex flex-col items-center justify-center text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gap: 'var(--hai-space-3)',
        padding: 'var(--hai-space-6)',
        color: 'var(--hai-text-secondary)',
      }}
    >
      <TriangleAlert
        size={24}
        strokeWidth={1.75}
        aria-hidden="true"
        style={{ color: 'var(--hai-status-warn-600)' }}
      />
      <p className="hai-text-body text-hai-secondary">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="hai-text-body-sm text-hai-info rounded-hai-sm"
          style={{
            padding: 'var(--hai-space-2) var(--hai-space-3)',
            backgroundColor: 'transparent',
            border: '1px solid var(--hai-surface-border)',
            cursor: 'pointer',
          }}
        >
          {retryLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}
