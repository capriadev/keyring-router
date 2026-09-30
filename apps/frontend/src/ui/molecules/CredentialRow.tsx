'use client';

import { useEffect, useRef, useState } from 'react';
import { describeSecretProblem } from '../../config/secrets';
import { formatCount, formatTimestamp } from '../../format/display';
import { SECRET_MAX_LENGTH, type Credential } from '../../types/api';
import { ActionButton } from '../atoms/ActionButton';
import { StatusPill, type StatusTone } from '../atoms/StatusPill';
import { TextField } from '../atoms/TextField';
import { TruncatedText } from '../atoms/TruncatedText';
import { DestructiveConfirm } from './DestructiveConfirm';
import { StateNote } from './StateNote';
import styles from './CredentialRow.module.css';

export type CredentialAction = 'validate' | 'refresh' | 'rotate';

export interface CredentialRowProps {
  readonly credential: Credential;
  /** Models the catalog reported for this credential, or null when that reading failed. */
  readonly catalog: { readonly discovered: number; readonly exposed: number } | null;
  /** Action in flight for this credential, or null. Locks its buttons while set. */
  readonly action: CredentialAction | null;
  readonly onValidate: (credential: Credential) => void;
  readonly onRefresh: (credential: Credential) => void;
  /** Sends the new secret once, after the confirmation. Resolves false when the gateway refused it. */
  readonly onRotate: (credential: Credential, secret: string) => Promise<boolean>;
}

/** What is known about the stored secret. The secret itself is never part of the shape or the screen. */
function describeSecret(credential: Credential): string {
  if (credential.authKind === 'none') {
    return 'No usa secreto';
  }

  return credential.secretHint === null ? 'Sin secreto guardado' : `Termina en ${credential.secretHint}`;
}

/** What the confirmation says is lost. It names the hint the panel already shows, never the secret. */
function describeRotationLoss(credential: Credential): string {
  const kept = credential.secretHint === null ? 'anterior' : `que termina en ${credential.secretHint}`;

  return `El secreto ${kept} se reemplaza y se pierde: el gateway guarda solo el nuevo y no hay forma de recuperar el anterior.`;
}

/** One registered credential: its identity, its namespace, what it discovered and its actions. */
export function CredentialRow({
  credential,
  catalog,
  action,
  onValidate,
  onRefresh,
  onRotate,
}: CredentialRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const rotateTrigger = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  const validated = credential.lastValidatedAt !== null;
  const validationTone: StatusTone = validated ? 'ok' : 'warning';
  const rotating = action === 'rotate';

  /**
   * Closing always drops the typed secret, so it never outlives the confirmation that asked for it,
   * and the focus goes back to the control that opened it instead of being lost to the page body.
   */
  useEffect(() => {
    if (wasConfirming.current && !confirming) {
      rotateTrigger.current?.focus();
    }

    wasConfirming.current = confirming;
  }, [confirming]);

  function closeConfirmation(): void {
    setConfirming(false);
    setSecret('');
    setProblem(null);
  }

  async function confirmRotation(): Promise<void> {
    const found = describeSecretProblem(secret);

    setProblem(found);

    if (found !== null) {
      return;
    }

    // The secret goes straight to the action and is dropped right after: it is never rendered, never
    // kept by the data provider, and not held by this row while the gateway answers.
    await onRotate(credential, secret);

    closeConfirmation();
  }

  return (
    <tr className={styles.row}>
      <th className={styles.identity} scope="row">
        <span className={styles.namespace}>{credential.namespace}</span>
        <TruncatedText element="code" className={styles.baseUrl} value={credential.baseUrl} />
      </th>

      <td className={styles.cell}>{credential.providerId}</td>

      <td className={styles.cell}>{describeSecret(credential)}</td>

      <td className={styles.cell}>
        {catalog === null ? (
          <span className={styles.muted}>
            Sin datos: no se pudo leer el catalogo. Reintenta con Actualizar datos.
          </span>
        ) : (
          <span className={styles.counts}>
            {formatCount(catalog.discovered)} descubiertos / {formatCount(catalog.exposed)} expuestos
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
          {/* A credential that stores no secret has nothing to rotate: the gateway refuses that rotation. */}
          {credential.authKind !== 'none' && (
            <ActionButton
              label="Rotar secreto"
              ref={rotateTrigger}
              pending={rotating}
              disabled={action !== null}
              onClick={() => setConfirming(true)}
            />
          )}
        </div>

        {confirming && (
          <DestructiveConfirm
            title={`Rotar el secreto de ${credential.namespace}`}
            detail={describeRotationLoss(credential)}
            confirmLabel="Confirmar rotacion"
            busy={rotating}
            onConfirm={() => void confirmRotation()}
            onCancel={closeConfirmation}
          >
            <TextField
              id={`rotate-secret-${credential.id}`}
              label="Secreto nuevo"
              type="password"
              autoComplete="new-password"
              maxLength={SECRET_MAX_LENGTH}
              value={secret}
              onChange={setSecret}
              hint="Se envia una sola vez y no se vuelve a mostrar: despues solo se ve su ultimo tramo."
              disabled={rotating}
              required
            />

            {problem !== null && (
              <StateNote
                tone="danger"
                title="Revisa el secreto nuevo"
                detail={problem}
                nextStep="Corrige el secreto y confirma otra vez."
              />
            )}
          </DestructiveConfirm>
        )}
      </td>
    </tr>
  );
}

