'use client';

import { CopyButton } from './CopyButton';
import type { ExposedModel } from '../../types/api';
import styles from './ExposedModelRow.module.css';

export interface ExposedModelRowProps {
  readonly model: ExposedModel;
}

/**
 * One model a client can call. The copy action puts the namespaced identifier in the clipboard and
 * nothing else: this screen never holds a secret, so there is none it could copy.
 */
export function ExposedModelRow({ model }: ExposedModelRowProps) {
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
          <CopyButton
            label="Copiar identificador"
            value={model.namespacedId}
            fallbackHint="Selecciona el identificador y copialo a mano."
          />
        </div>
      </td>
    </tr>
  );
}

