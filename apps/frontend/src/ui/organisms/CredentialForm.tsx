'use client';

import { useState, type FormEvent } from 'react';
import { useDashboard } from '../../hooks/useDashboard';
import {
  NAMESPACE_PATTERN,
  SECRET_MAX_LENGTH,
  SECRET_MIN_LENGTH,
  type AuthKind,
  type CredentialInput,
  type ProviderDescriptor,
} from '../../types/api';
import { ActionButton } from '../atoms/ActionButton';
import { SelectField, type SelectOption } from '../atoms/SelectField';
import { TextField } from '../atoms/TextField';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';
import styles from './CredentialForm.module.css';

/** How each auth kind is explained. Which kinds exist comes from each provider, never from this file. */
const AUTH_KIND_LABELS: Record<AuthKind, string> = {
  none: 'Sin autenticacion: el proveedor no pide clave.',
  api_key: 'Con clave: el gateway la guarda cifrada.',
};

function providerOptions(providers: readonly ProviderDescriptor[]): readonly SelectOption[] {
  return providers.map((provider) => ({
    value: provider.providerId,
    label: `${provider.displayName} (${provider.providerId})`,
  }));
}

function authKindOptions(kinds: readonly AuthKind[]): readonly SelectOption[] {
  return kinds.map((kind) => ({ value: kind, label: AUTH_KIND_LABELS[kind] }));
}

/** Validation mirrors the gateway contract so an invalid form never leaves the browser. */
function validate(
  namespace: string,
  baseUrl: string,
  secret: string,
  needsSecret: boolean,
): string | null {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    return 'El namespace debe ser un slug en minusculas: de 2 a 32 caracteres, letras, numeros y guiones.';
  }

  if (baseUrl === '') {
    return 'La base URL es obligatoria.';
  }

  if (needsSecret && (secret.length < SECRET_MIN_LENGTH || secret.length > SECRET_MAX_LENGTH)) {
    return `El secreto debe tener entre ${SECRET_MIN_LENGTH} y ${SECRET_MAX_LENGTH} caracteres.`;
  }

  return null;
}


/**
 * Alta de credencial. El proveedor, sus tipos de autenticacion y su URL declarada salen del catalogo
 * que reporta el gateway: este formulario no lleva ninguna lista propia.
 */
export function CredentialForm() {
  const { providers, create, pending, refreshProviders } = useDashboard();
  const [namespace, setNamespace] = useState('');
  const [providerId, setProviderId] = useState('');
  const [authKind, setAuthKind] = useState<AuthKind | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const available = providers.data ?? [];
  const selected =
    available.find((provider) => provider.providerId === providerId) ?? available[0] ?? null;
  const kinds = selected?.authKinds ?? [];
  const effectiveKind = authKind !== null && kinds.includes(authKind) ? authKind : (kinds[0] ?? null);
  const needsSecret = effectiveKind === 'api_key';
  const busy = pending !== null;

  /** Picking a provider pre-fills its declared endpoint and re-reads what it accepts. */
  function chooseProvider(id: string): void {
    const chosen = available.find((provider) => provider.providerId === id);

    setProviderId(chosen?.providerId ?? '');
    setAuthKind(null);

    if (chosen !== undefined) {
      setBaseUrl(chosen.baseUrl);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (selected === null || effectiveKind === null) {
      setProblem('Elige un proveedor antes de guardar.');
      return;
    }

    const namespaceValue = namespace.trim().toLowerCase();
    const baseUrlValue = baseUrl.trim();
    const found = validate(namespaceValue, baseUrlValue, secret, needsSecret);

    setProblem(found);

    if (found !== null) {
      return;
    }

    const input: CredentialInput = {
      namespace: namespaceValue,
      providerId: selected.providerId,
      baseUrl: baseUrlValue,
      authKind: effectiveKind,
      secret: needsSecret ? secret : undefined,
    };

    if (await create(input)) {
      setNamespace('');
      setBaseUrl('');
      setSecret('');
    }
  }

  if (available.length === 0) {
    return (
      <ScreenSection
        title="Nueva credencial"
        description="Una credencial es una cuenta concreta de un proveedor, con su namespace propio: dos cuentas del mismo proveedor no se mezclan."
      >
        <StateNote
          tone={providers.error === null ? 'neutral' : 'danger'}
          title={providers.loading ? 'Leyendo el catalogo de proveedores' : 'Sin proveedores que ofrecer'}
          detail={
            providers.error ??
            'El gateway no reporta ningun proveedor declarado, asi que no hay nada que elegir.'
          }
          nextStep="Sin un proveedor declarado no se puede registrar una credencial: reintenta la lectura y revisa el catalogo de proveedores del gateway."
          action={<ActionButton label="Reintentar" onClick={refreshProviders} />}
        />
      </ScreenSection>
    );
  }

  return (
    <ScreenSection
      title="Nueva credencial"
      description="Una credencial es una cuenta concreta de un proveedor, con su namespace propio: dos cuentas del mismo proveedor no se mezclan."
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.grid}>
          <TextField
            id="credential-namespace"
            label="Namespace"
            value={namespace}
            onChange={setNamespace}
            hint="Identifica una cuenta concreta. De 2 a 32 caracteres: letras minusculas, numeros y guiones."
            disabled={busy}
            required
          />

          {selected !== null && (
            <SelectField
              id="credential-provider"
              label="Proveedor"
              value={selected.providerId}
              options={providerOptions(available)}
              onChange={chooseProvider}
              hint="El catalogo de proveedores lo reporta el gateway."
              disabled={busy}
            />
          )}

          {kinds.length > 1 && (
            <SelectField
              id="credential-auth-kind"
              label="Autenticacion"
              value={effectiveKind ?? ''}
              options={authKindOptions(kinds)}
              onChange={(value) => setAuthKind(value as AuthKind)}
              hint="Solo se ofrecen los tipos que este proveedor declara."
              disabled={busy}
            />
          )}

          {kinds.length === 1 && effectiveKind !== null && (
            <p className={styles.fact}>Autenticacion: {AUTH_KIND_LABELS[effectiveKind]}</p>
          )}

          <TextField
            id="credential-base-url"
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            hint={
              selected === null
                ? 'Direccion base del proveedor, sin barra final.'
                : `Direccion base del proveedor, sin barra final. ${selected.displayName} declara ${selected.baseUrl}`
            }
            disabled={busy}
            required
          />

          {needsSecret && (
            <TextField
              id="credential-secret"
              label="Secreto"
              type="password"
              autoComplete="new-password"
              maxLength={SECRET_MAX_LENGTH}
              value={secret}
              onChange={setSecret}
              hint="Se guarda cifrado y no se vuelve a mostrar: despues solo se ve su ultimo tramo."
              disabled={busy}
              required
            />
          )}
        </div>

        {needsSecret && (
          <StateNote
            tone="warning"
            title="Antes de guardar el primer secreto"
            detail="El gateway cifra los secretos con su pepper. Si el pepper no esta configurado o se pierde, un secreto guardado no se puede descifrar."
            nextStep="Configura el pepper del gateway antes de guardar el primer secreto y conservalo en un lugar seguro."
            announce="none"
          />
        )}

        {problem !== null && <StateNote tone="danger" title="Revisa el formulario" detail={problem} />}

        <div className={styles.actions}>
          <ActionButton type="submit" label="Agregar credencial" variant="primary" pending={busy} />
        </div>
      </form>
    </ScreenSection>
  );
}
