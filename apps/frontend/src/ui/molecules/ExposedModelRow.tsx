'use client';

import { useState } from 'react';
import { ActionButton } from '../atoms/ActionButton';
import type { ExposedModel } from '../../types/api';
import styles from './ExposedModelRow.module.css';

export interface ExposedModelRowProps {
  readonly model: ExposedModel;
}

type CopyOutcome = 'idle' | 'copying' | 'copied' | 'failed';

/**
 * One model a client can call. The copy action puts the namespaced identifier in the clipboard and
 * nothing else: this screen never holds a secret, so there is none it could copy.
 */
export function ExposedModelRow({ model }: ExposedModelRowProps) {
  const [outcome, setOutcome] = useState<CopyOutcome>('idle');
  const copying = outcome === 'copying';

  async function copyIdentifier(): Promise<void> {
    setOutcome('copying');

    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
      setOutcome('failed');
      return;
    }

    try {
      await navigator.clipboard.writeText(model.namespacedId);
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
  }

  return (
    <tr className={styles.row}>
      <th className={styles.identity} scope="row">
        <code className={styles.id}>{model.namespacedId}</code>
        <span className={styles.name}>{model.displayName}</span>
      </th>

      <td className={styles.cell}>{model.providerId}</td>

      <td className={styles.cell}>
        <code className={styles.providerModel}>{model.providerModelId}</code>
      </td>

      <td className={styles.cell}>
        <div className={styles.actions}>
          <ActionButton
            label="Copiar identificador"
            pending={copying}
            onClick={() => void copyIdentifier()}
          />
          {outcome === 'copied' && (
            <span className={styles.copied} role="status">
              Copiado.
            </span>
          )}
          {outcome === 'failed' && (
            <span className={styles.failed} role="alert">
              No se pudo copiar. Selecciona el identificador y copialo a mano.
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
