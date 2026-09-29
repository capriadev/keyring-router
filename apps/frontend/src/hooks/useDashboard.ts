'use client';

import { useCallback, useEffect, useState } from 'react';
import { listCatalog } from '../services/api/catalog';
import { describeApiError } from '../services/api/client';
import {
  createCredential,
  listCredentials,
  refreshCredential,
  validateCredential,
} from '../services/api/credentials';
import { fetchHealth } from '../services/api/health';
import { listModels } from '../services/api/models';
import { createPolicyRule } from '../services/api/policies';
import { listProviders } from '../services/api/providers';
import type {
  CatalogModel,
  Credential,
  CredentialInput,
  ExposedModel,
  HealthResponse,
  ProviderDescriptor,
} from '../types/api';

export type ActionName = 'reload' | 'create' | 'validate' | 'refresh' | 'allow';

/** Single in-flight action: `targetId` is a credential id or a namespaced model id, null for reload. */
export interface PendingAction {
  readonly action: ActionName;
  readonly targetId: string | null;
}

export type CredentialAction = 'validate' | 'refresh';

export interface DashboardState {
  readonly health: HealthResponse | null;
  readonly credentials: readonly Credential[];
  /** The provider catalog, so no form offers a hardcoded provider list. */
  readonly providers: readonly ProviderDescriptor[];
  readonly catalog: readonly CatalogModel[];
  readonly models: readonly ExposedModel[];
  /** True while the initial or a manual full load runs. */
  readonly loading: boolean;
  readonly pending: PendingAction | null;
  /** Spanish message of the last failure, already translated by `services/api`. */
  readonly error: string | null;
  readonly notice: string | null;
  readonly reload: () => void;
  /** Resolves true when the mutation was applied; the form clears itself exclusively then. */
  readonly create: (input: CredentialInput) => Promise<boolean>;
  readonly validate: (credential: Credential) => Promise<boolean>;
  readonly refresh: (credential: Credential) => Promise<boolean>;
  readonly allow: (model: CatalogModel) => Promise<boolean>;
}

/** Action in flight for one credential row, so the row can label the button that is running. */
export function credentialAction(pending: PendingAction | null, credentialId: string): CredentialAction | null {
  if (pending === null || pending.targetId !== credentialId) {
    return null;
  }

  return pending.action === 'validate' || pending.action === 'refresh' ? pending.action : null;
}

export function isModelPending(pending: PendingAction | null, namespacedId: string): boolean {
  return pending?.action === 'allow' && pending.targetId === namespacedId;
}

/**
 * Applies a request result, or reports its failure. Health is cleared on failure because the badge
 * must not claim a gateway that did not answer; lists keep their previous content.
 */
async function loadInto<T>(
  request: Promise<T>,
  apply: (value: T) => void,
  clear?: () => void,
): Promise<string | null> {
  try {
    apply(await request);
    return null;
  } catch (failure) {
    clear?.();
    return describeApiError(failure);
  }
}

/**
 * Dashboard state: one place owns every request, every pending action and the single error slot.
 * Each mutation reloads the lists it invalidates, so no component caches server state.
 */
export function useDashboard(): DashboardState {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [credentials, setCredentials] = useState<readonly Credential[]>([]);
  const [providers, setProviders] = useState<readonly ProviderDescriptor[]>([]);
  const [catalog, setCatalog] = useState<readonly CatalogModel[]>([]);
  const [models, setModels] = useState<readonly ExposedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    setPending({ action: 'reload', targetId: null });
    setError(null);
    setNotice(null);

    const failures = await Promise.all([
      loadInto(fetchHealth(), setHealth, () => setHealth(null)),
      loadInto(listCredentials(), setCredentials),
      loadInto(listProviders(), setProviders),
      loadInto(listCatalog(), setCatalog),
      loadInto(listModels(), setModels),
    ]);

    setError(failures.find((failure) => failure !== null) ?? null);
    setPending(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** Runs one action through a single in-flight slot, reporting its outcome in Spanish. */
  const runAction = useCallback(
    async (action: PendingAction, work: () => Promise<string>): Promise<boolean> => {
      setPending(action);
      setError(null);
      setNotice(null);

      try {
        setNotice(await work());
        return true;
      } catch (failure) {
        setError(describeApiError(failure));
        return false;
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const reload = useCallback((): void => {
    void loadAll();
  }, [loadAll]);

  const create = useCallback(
    (input: CredentialInput): Promise<boolean> =>
      runAction({ action: 'create', targetId: input.namespace }, async () => {
        const credential = await createCredential(input);
        setCredentials(await listCredentials());
        return `Credencial ${credential.namespace} registrada en ${credential.baseUrl}.`;
      }),
    [runAction],
  );

  const validate = useCallback(
    (credential: Credential): Promise<boolean> =>
      runAction({ action: 'validate', targetId: credential.id }, async () => {
        const result = await validateCredential(credential.id);
        setCredentials(await listCredentials());
        return result.ok
          ? `Credencial ${credential.namespace} validada contra el proveedor.`
          : `Credencial ${credential.namespace} sin respuesta valida del proveedor.`;
      }),
    [runAction],
  );

  const refresh = useCallback(
    (credential: Credential): Promise<boolean> =>
      runAction({ action: 'refresh', targetId: credential.id }, async () => {
        const result = await refreshCredential(credential.id);
        setCredentials(await listCredentials());
        setCatalog(await listCatalog());
        setModels(await listModels());
        return `Catalogo de ${credential.namespace}: ${result.discovered} descubiertos, ${result.exposed} expuestos.`;
      }),
    [runAction],
  );

  /** Exposing one model is an allow rule scoped to its credential with the exact namespaced id. */
  const allow = useCallback(
    (model: CatalogModel): Promise<boolean> =>
      runAction({ action: 'allow', targetId: model.namespacedId }, async () => {
        await createPolicyRule({
          credentialId: model.credentialId,
          pattern: model.namespacedId,
          effect: 'allow',
        });
        setCatalog(await listCatalog());
        setModels(await listModels());
        return `Regla de permiso creada para ${model.namespacedId}.`;
      }),
    [runAction],
  );

  return {
    health,
    credentials,
    providers,
    catalog,
    models,
    loading,
    pending,
    error,
    notice,
    reload,
    create,
    validate,
    refresh,
    allow,
  };
}
