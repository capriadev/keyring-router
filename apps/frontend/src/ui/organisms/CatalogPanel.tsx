import { ActionButton } from '../atoms/ActionButton';
import { StatusPill } from '../atoms/StatusPill';
import { ModelRow } from '../molecules/ModelRow';
import type { CatalogModel } from '../../types/api';
import styles from './CatalogPanel.module.css';

export interface CatalogPanelProps {
  readonly models: readonly CatalogModel[];
  readonly isRowPending: (namespacedId: string) => boolean;
  readonly onAllow: (model: CatalogModel) => void;
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null) {
    return null;
  }

  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Discovered scope of a model: provider, family and size when the provider reports them. */
function describeModel(model: CatalogModel): string {
  return [model.providerId, model.family, formatSize(model.sizeBytes)]
    .filter((part) => part !== null && part !== '')
    .join(' / ');
}

/** Catalogo descubierto con la decision de exposicion y la accion de permitir por modelo. */
export function CatalogPanel({ models, isRowPending, onAllow }: CatalogPanelProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Catalogo descubierto</h2>
        <p className={styles.hint}>
          {models.length} modelos. Descubrir no es exponer: un modelo solo pasa a la lista de expuestos cuando
          una regla de permiso lo alcanza.
        </p>
      </header>

      {models.length === 0 ? (
        <p className={styles.empty}>Sin modelos descubiertos. Refresca el catalogo de una credencial.</p>
      ) : (
        <ul className={styles.list}>
          {models.map((model) => (
            <ModelRow
              key={model.namespacedId}
              title={model.displayName}
              subtitle={model.namespacedId}
              meta={describeModel(model)}
              status={
                <StatusPill
                  label={model.exposed ? 'Expuesto' : 'No expuesto'}
                  tone={model.exposed ? 'ok' : 'neutral'}
                />
              }
              action={
                <ActionButton
                  label="Permitir"
                  pending={isRowPending(model.namespacedId)}
                  disabled={model.exposed || isRowPending(model.namespacedId)}
                  onClick={() => onAllow(model)}
                />
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
