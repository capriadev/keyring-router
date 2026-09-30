'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ActionButton } from '../atoms/ActionButton';
import styles from './DestructiveConfirm.module.css';

export interface DestructiveConfirmProps {
  /** What is about to happen, named as the control that opened it. */
  readonly title: string;
  /** The consequence, including what cannot be undone once it is applied. */
  readonly detail: string;
  readonly confirmLabel: string;
  /** In flight: both controls lock so a second confirmation cannot overlap the first. */
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** The fields of this confirmation, rendered between the consequence and its controls. */
  readonly children?: ReactNode;
}

/**
 * The pattern for the destructive actions of this panel: it opens in place, states the consequence,
 * puts the initial focus on Cancelar so a stray Enter cannot destroy anything, cancels with Escape
 * while it is open, and runs the action from its own confirmation control and from nowhere else. It is
 * not a modal: it stays inside the row it belongs to, so no focus can be trapped behind an overlay.
 */
export function DestructiveConfirm({
  title,
  detail,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: DestructiveConfirmProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const latestCancel = useRef(onCancel);

  useEffect(() => {
    latestCancel.current = onCancel;
  });

  useEffect(() => {
    // The initial focus goes to Cancelar: the destructive control is never the one Enter reaches first.
    cancel.current?.focus();

    // Escape cancels while the confirmation is open, wherever the focus has moved inside the panel.
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        latestCancel.current();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={styles.confirm} role="group" aria-label={title} aria-busy={busy}>
      <p className={styles.title}>{title}</p>
      <p className={styles.detail}>{detail}</p>

      {children}

      <div className={styles.actions}>
        <ActionButton label="Cancelar" ref={cancel} disabled={busy} onClick={onCancel} />
        <ActionButton
          label={confirmLabel}
          variant="danger"
          pending={busy}
          onClick={onConfirm}
        />
      </div>
    </div>
  );
}
