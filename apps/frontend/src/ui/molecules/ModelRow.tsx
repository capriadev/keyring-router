import { formatSize } from '../../format/display';
import { ActionButton } from '../atoms/ActionButton';
import { StatusPill } from '../atoms/StatusPill';
import { TruncatedText } from '../atoms/TruncatedText';
import type { CatalogModel } from '../../types/api';
import styles from './ModelRow.module.css';

export type ModelDecision = 'allow' | 'deny';

export interface ModelRowProps {
  readonly model: CatalogModel;
  /** Action in flight for this model, or null. Locks its buttons while set. */
  readonly action: ModelDecision | null;
  readonly onAllow: (model: CatalogModel) => void;
  readonly onDeny: (model: CatalogModel) => void;
}

/** Discovered scope of a model: provider, family and size when the provider reports them. */
function describeModel(model: CatalogModel): string {
  return [model.family, formatSize(model.sizeBytes)].filter((part) => part !== null).join(' / ');
}

/**
 * One discovered model with the rule that reaches it. The exposure decision is read from the gateway,
 * never computed here: this panel does not evaluate policy.
 */
export function ModelRow({ model, action, onAllow, onDeny }: ModelRowProps) {
  const meta = describeModel(model);

  return (
    <tr className={styles.row}>
      <th className={styles.identity} scope="row">
        <TruncatedText element="code" className={styles.id} value={model.namespacedId} />
        <TruncatedText className={styles.name} value={model.displayName} />
      </th>

      <td className={styles.cell}>{model.namespace}</td>

      <td className={styles.cell}>
        <span>{model.providerId}</span>
        {meta !== '' && <span className={styles.muted}>{meta}</span>}
      </td>

      <td className={styles.cell}>
        <StatusPill
          label={model.exposed ? 'Permitida' : 'Denegada'}
          tone={model.exposed ? 'ok' : 'neutral'}
        />
        <span className={styles.muted}>
          {model.exposed
            ? 'Una regla de permiso alcanza este modelo.'
            : 'Ninguna regla lo permite: el gateway deniega por defecto.'}
        </span>
      </td>

      <td className={styles.cell}>
        <div className={styles.actions}>
          <ActionButton
            label="Permitir"
            variant="primary"
            pending={action === 'allow'}
            disabled={model.exposed || action !== null}
            onClick={() => onAllow(model)}
          />
          <ActionButton
            label="Denegar"
            pending={action === 'deny'}
            disabled={!model.exposed || action !== null}
            onClick={() => onDeny(model)}
          />
        </div>
      </td>
    </tr>
  );
}

