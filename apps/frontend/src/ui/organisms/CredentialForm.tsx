'use client';

import { useState, type FormEvent } from 'react';
import { ActionButton } from '../atoms/ActionButton';
import { TextField } from '../atoms/TextField';
import {
  NAMESPACE_PATTERN,
  PROVIDER_IDS,
  type AuthKind,
  type CredentialInput,
  type ProviderId,
} from '../../types/api';
import styles from './CredentialForm.module.css';

/** `api_key` is refused by the gateway until the security spec lands, so the form never offers it. */
const AUTH_KIND: AuthKind = 'none';

export interface CredentialFormProps {
  readonly pending: boolean;
  /** Resolves true only when the credential was stored; the form clears itself exclusively then. */
  readonly onSubmit: (input: CredentialInput) => Promise<boolean>;
}

/** Validation mirrors the gateway contract so an invalid slug never leaves the browser. */
function validate(namespace: string, baseUrl: string): string | null {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    return 'El namespace debe ser un slug en minusculas: de 2 a 32 caracteres, letras, numeros y guiones.';
  }

  if (baseUrl === '') {
    return 'La base URL es obligatoria.';
  }

  return null;
}

function toProviderId(value: string): ProviderId {
  return PROVIDER_IDS.find((id) => id === value) ?? PROVIDER_IDS[0];
}

/** Alta de credencial: namespace explicito, proveedor y base URL. */
export function CredentialForm({ pending, onSubmit }: CredentialFormProps) {
  const [namespace, setNamespace] = useState('');
  const [providerId, setProviderId] = useState<ProviderId>(PROVIDER_IDS[0]);
  const [baseUrl, setBaseUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const namespaceValue = namespace.trim().toLowerCase();
    const baseUrlValue = baseUrl.trim();
    const found = validate(namespaceValue, baseUrlValue);

    setProblem(found);

    if (found !== null) {
      return;
    }

    const stored = await onSubmit({
      namespace: namespaceValue,
      providerId,
      baseUrl: baseUrlValue,
      authKind: AUTH_KIND,
    });

    if (stored) {
      setNamespace('');
      setBaseUrl('');
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.grid}>
        <TextField
          id="credential-namespace"
          label="Namespace"
          value={namespace}
          onChange={setNamespace}
          hint="Identifica una cuenta concreta. Dos cuentas del mismo proveedor nunca se mezclan."
          disabled={pending}
          required
        />

        <div className={styles.field}>
          <label className={styles.label} htmlFor="credential-provider">
            Proveedor
          </label>
          <select
            id="credential-provider"
            className={styles.select}
            value={providerId}
            disabled={pending}
            onChange={(event) => setProviderId(toProviderId(event.target.value))}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>

        <TextField
          id="credential-base-url"
          label="Base URL"
          value={baseUrl}
          onChange={setBaseUrl}
          hint="Direccion base del proveedor, sin barra final. Ejemplo: http://127.0.0.1:11434"
          disabled={pending}
          required
        />
      </div>

      {problem !== null && <p className={styles.problem}>{problem}</p>}

      <div className={styles.actions}>
        <ActionButton type="submit" label="Agregar credencial" variant="primary" pending={pending} />
      </div>
    </form>
  );
}
