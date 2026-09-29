import { ActionButton } from '../atoms/ActionButton';
import { StatusPill, type StatusTone } from '../atoms/StatusPill';
import type { AuthKind, Credential } from '../../types/api';
import styles from './CredentialRow.module.css';

export type CredentialAction = 'validate' | 'refresh';

export interface CredentialRowProps {
  readonly credential: Credential;
  /** Action in flight for this credential, or null. Locks both buttons while set. */
  readonly action: CredentialAction | null;
  readonly onValidate: (credential: Credential) => void;
  readonly onRefresh: (credential: Credential) => void;
}

const AUTH_KIND_LABELS: Record<AuthKind, string> = {
  none: 'Sin autenticacion',
  api_key: 'Con clave (no soportada)',
};

const timestampFormat = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });

function formatTimestamp(value: number | null): string {
  return value === null ? 'nunca' : timestampFormat.format(value);
}

/** One registered credential with its validation state and the two provider actions. */
export function CredentialRow({ credential, action, onValidate, onRefresh }: CredentialRowProps) {
  const validated = credential.lastValidatedAt !== null;
  const validationTone: StatusTone = validated ? 'ok' : 'warning';

  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <span className={styles.namespace}>{credential.namespace}</span>
        <StatusPill label={validated ? 'Validada' : 'Sin validar'} tone={validationTone} />
        {credential.lastRefreshError !== null && <StatusPill label="Catalogo con error" tone="danger" />}
      </div>

      <p className={styles.baseUrl}>{credential.baseUrl}</p>

      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Proveedor</dt>
          <dd className={styles.metaValue}>{credential.providerId}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Autenticacion</dt>
          <dd className={styles.metaValue}>{AUTH_KIND_LABELS[credential.authKind]}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Ultima validacion</dt>
          <dd className={styles.metaValue}>{formatTimestamp(credential.lastValidatedAt)}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Ultimo catalogo</dt>
          <dd className={styles.metaValue}>{formatTimestamp(credential.lastRefreshAt)}</dd>
        </div>
      </dl>

      {credential.lastRefreshError !== null && (
        <p className={styles.providerError}>Detalle del proveedor: {credential.lastRefreshError}</p>
      )}

      <div className={styles.actions}>
        <ActionButton
          label="Validar"
          pending={action === 'validate'}
          disabled={action !== null}
          onClick={() => onValidate(credential)}
        />
        <ActionButton
          label="Refrescar catalogo"
          pending={action === 'refresh'}
          disabled={action !== null}
          onClick={() => onRefresh(credential)}
        />
      </div>
    </li>
  );
}
