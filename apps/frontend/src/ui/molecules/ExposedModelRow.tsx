'use client';

import { CopyButton } from './CopyButton';
import { TruncatedText } from '../atoms/TruncatedText';
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
        <TruncatedText element="code" className={styles.id} value={model.namespacedId} />
        <TruncatedText className={styles.name} value={model.displayName} />
      </th>

      <td className={styles.cell}>{model.providerId}</td>

      <td className={styles.cell}>
        <TruncatedText element="code" className={styles.providerModel} value={model.providerModelId} />
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

