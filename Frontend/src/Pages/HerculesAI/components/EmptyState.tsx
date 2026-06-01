/**
 * EmptyState — universal "no data" fallback.
 *
 * Plan spec 5.12. Muted 24 px icon, one-line explanation, optional action
 * button. Never a bare "No data" string on an empty div.
 */

import { Unplug } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
}

export function EmptyState(props: EmptyStateProps) {
  const { icon: Icon = Unplug, message, actionLabel, onAction, className, children } = props;

  return (
    <div
      role="status"
      className={[
        'flex flex-col items-center justify-center text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gap: 'var(--hai-space-3)',
        padding: 'var(--hai-space-6)',
        color: 'var(--hai-text-tertiary)',
      }}
    >
      <Icon size={24} strokeWidth={1.75} aria-hidden={true} />
      <p className="hai-text-body text-hai-tertiary">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="hai-text-body-sm text-hai-info rounded-hai-sm"
          style={{
            padding: 'var(--hai-space-2) var(--hai-space-3)',
            backgroundColor: 'transparent',
            border: '1px solid var(--hai-surface-border)',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}
