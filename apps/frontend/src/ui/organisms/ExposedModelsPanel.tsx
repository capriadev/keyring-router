import { ModelRow } from '../molecules/ModelRow';
import type { ExposedModel } from '../../types/api';
import styles from './ExposedModelsPanel.module.css';

export interface ExposedModelsPanelProps {
  readonly models: readonly ExposedModel[];
}

/** Lista final que consume un cliente: solo los modelos que pasan la politica. */
export function ExposedModelsPanel({ models }: ExposedModelsPanelProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Modelos expuestos</h2>
        <p className={styles.hint}>{models.length} modelos alcanzables por la politica actual.</p>
      </header>

      {models.length === 0 ? (
        <p className={styles.empty}>
          Ningun modelo expuesto. El valor por defecto es denegar: permiti un modelo del catalogo.
        </p>
      ) : (
        <ul className={styles.list}>
          {models.map((model) => (
            <ModelRow
              key={model.namespacedId}
              title={model.displayName}
              subtitle={model.namespacedId}
              meta={`${model.providerId} / ${model.providerModelId}`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
