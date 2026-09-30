'use client';

import { useState } from 'react';
import { ActionButton } from '../atoms/ActionButton';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  readonly label: string;
  /** What goes to the clipboard. Every value this control receives is public, and a secret is not one of them. */
  readonly value: string;
  /** Named in the failure message, because then the reader has to select and copy it by hand. */
  readonly fallbackHint: string;
}

type CopyOutcome = 'idle' | 'copying' | 'copied' | 'failed';

/**
 * The one copy control of the panel: it writes a public value to the clipboard and announces the
 * outcome, so the same action reads and sounds the same wherever it appears. The clipboard is only
 * ever written with `value`: this control is never given a secret.
 */
export function CopyButton({ label, value, fallbackHint }: CopyButtonProps) {
  const [outcome, setOutcome] = useState<CopyOutcome>('idle');

  async function copy(): Promise<void> {
    setOutcome('copying');

    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
      setOutcome('failed');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
  }

  return (
    <span className={styles.copy}>
      <ActionButton label={label} pending={outcome === 'copying'} onClick={() => void copy()} />

      {outcome === 'copied' && (
        <span className={styles.copied} role="status">
          Copiado.
        </span>
      )}

      {outcome === 'failed' && (
        <span className={styles.failed} role="alert">
          No se pudo copiar. {fallbackHint}
        </span>
      )}
    </span>
  );
}
