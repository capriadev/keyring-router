'use client';

import { useState, type FormEvent } from 'react';
import { ActionButton } from '../atoms/ActionButton';
import { TextField } from '../atoms/TextField';
import {
  NAMESPACE_PATTERN,
  type AuthKind,
  type CredentialInput,
  type ProviderDescriptor,
} from '../../types/api';
import styles from './CredentialForm.module.css';

/** `api_key` is refused by the gateway until the security spec lands, so the form never offers it. */
const AUTH_KIND: AuthKind = 'none';

export interface CredentialFormProps {
  readonly pending: boolean;
  /** The provider catalog the gateway reports, so this form never offers a hardcoded list. */
  readonly providers: readonly ProviderDescriptor[];
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

function toProviderId(value: string, providers: readonly ProviderDescriptor[]): string {
  return providers.find((provider) => provider.providerId === value)?.providerId ?? '';
}

/** Alta de credencial: namespace explicito, proveedor y base URL. */
export function CredentialForm({ pending, providers, onSubmit }: CredentialFormProps) {
  const [namespace, setNamespace] = useState('');
  const [providerId, setProviderId] = useState(providers[0]?.providerId ?? '');
  const [baseUrl, setBaseUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  /** Picking a provider pre-fills its documented endpoint, which is what most users want next. */
  function chooseProvider(id: string): void {
    const chosen = providers.find((provider) => provider.providerId === id);
    setProviderId(toProviderId(id, providers));

    if (chosen !== undefined) {
      setBaseUrl(chosen.baseUrl);
    }
  }

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
            onChange={(event) => chooseProvider(event.target.value)}
          >
            {providers.map((provider) => (
              <option key={provider.providerId} value={provider.providerId}>
                {provider.displayName}
              </option>
            ))}
          </select>
          {providers.length === 0 ? (
            <p className={styles.hint}>Sin proveedores: el gateway no responde o su catalogo esta vacio.</p>
          ) : null}
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
