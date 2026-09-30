import { ActionButton } from '../atoms/ActionButton';
import { StatusPill, type StatusTone } from '../atoms/StatusPill';
import type { Credential } from '../../types/api';
import styles from './CredentialRow.module.css';

export type CredentialAction = 'validate' | 'refresh';

export interface CredentialRowProps {
  readonly credential: Credential;
  /** Models the catalog reported for this credential, or null when that reading failed. */
  readonly catalog: { readonly discovered: number; readonly exposed: number } | null;
  /** Action in flight for this credential, or null. Locks its buttons while set. */
  readonly action: CredentialAction | null;
  readonly onValidate: (credential: Credential) => void;
  readonly onRefresh: (credential: Credential) => void;
}

const timestampFormat = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });

function formatTimestamp(value: number | null): string {
  return value === null ? 'nunca' : timestampFormat.format(value);
}

/** What is known about the stored secret. The secret itself is never part of the shape or the screen. */
function describeSecret(credential: Credential): string {
  if (credential.authKind === 'none') {
    return 'No usa secreto';
  }

  return credential.secretHint === null ? 'Sin secreto guardado' : `Termina en ${credential.secretHint}`;
}

/** One registered credential: its identity, its namespace, what it discovered and its actions. */
export function CredentialRow({ credential, catalog, action, onValidate, onRefresh }: CredentialRowProps) {
  const validated = credential.lastValidatedAt !== null;
  const validationTone: StatusTone = validated ? 'ok' : 'warning';

  return (
    <tr className={styles.row}>
      <th className={styles.identity} scope="row">
        <span className={styles.namespace}>{credential.namespace}</span>
        <code className={styles.baseUrl}>{credential.baseUrl}</code>
      </th>

      <td className={styles.cell}>{credential.providerId}</td>

      <td className={styles.cell}>{describeSecret(credential)}</td>

      <td className={styles.cell}>
        {catalog === null ? (
          <span className={styles.muted}>Sin datos: no se pudo leer el catalogo.</span>
        ) : (
          <span>
            {catalog.discovered} descubiertos / {catalog.exposed} expuestos
          </span>
        )}
        <span className={styles.muted}>Ultimo refresh: {formatTimestamp(credential.lastRefreshAt)}</span>
        {credential.lastRefreshError !== null && (
          <span className={styles.problem}>{credential.lastRefreshError}</span>
        )}
      </td>

      <td className={styles.cell}>
        <StatusPill label={validated ? 'Validada' : 'Sin validar'} tone={validationTone} />
      </td>

      <td className={styles.cell}>
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
          {/* Rotation still needs a function in the frontend service layer; the panel does not fake it. */}
          <ActionButton label="Rotar secreto" disabled />
        </div>
      </td>
    </tr>
  );
}

