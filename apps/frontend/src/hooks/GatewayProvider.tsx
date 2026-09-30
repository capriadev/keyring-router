'use client';

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
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
  CatalogResponse,
  Credential,
  CredentialInput,
  CredentialsResponse,
  HealthResponse,
  ModelsResponse,
  ProvidersResponse,
} from '../types/api';
import {
  DashboardContext,
  type DashboardStore,
  type Loadable,
  type PendingAction,
} from './useDashboard';

/**
 * Where a failed attempt leaves a resource. Health is a claim about right now, so it is cleared: the
 * badge must not say the gateway answers when it did not. A list is a snapshot, so it survives a
 * failed refresh and the panel shows the failure above the last reading it still has.
 */
type FailureMode = 'clear' | 'keep';

/** Every resource starts in flight: the provider reads all of them as soon as it mounts. */
function loading<T>(): Loadable<T> {
  return { data: null, error: null, loading: true };
}

function ready<T>(data: T): Loadable<T> {
  return { data, error: null, loading: false };
}

function failed<T>(current: Loadable<T>, error: string, mode: FailureMode): Loadable<T> {
  return { data: mode === 'keep' ? current.data : null, error, loading: false };
}

/** One reading of one resource: the only place a list or the health endpoint is called from. */
async function readResource<T>(
  request: () => Promise<T>,
  set: Dispatch<SetStateAction<Loadable<T>>>,
  mode: FailureMode = 'keep',
): Promise<void> {
  set((current) => ({ ...current, loading: true, error: null }));

  try {
    set(ready(await request()));
  } catch (failure) {
    set((current) => failed(current, describeApiError(failure), mode));
  }
}

export interface GatewayProviderProps {
  readonly children: ReactNode;
}

/**
 * Owns every request the panel makes. The five resources are read once in parallel when the panel
 * opens, kept in state, and only read again when a screen asks for it or a mutation invalidates them:
 * no panel fetches while rendering, and moving between screens costs nothing.
 */
export function GatewayProvider({ children }: GatewayProviderProps) {
  const [health, setHealth] = useState<Loadable<HealthResponse>>(loading);
  const [providers, setProviders] = useState<Loadable<ProvidersResponse>>(loading);
  const [credentials, setCredentials] = useState<Loadable<CredentialsResponse>>(loading);
  const [catalog, setCatalog] = useState<Loadable<CatalogResponse>>(loading);
  const [models, setModels] = useState<Loadable<ModelsResponse>>(loading);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshHealth = useCallback((): void => {
    void readResource(fetchHealth, setHealth, 'clear');
  }, []);

  const refreshProviders = useCallback((): void => {
    void readResource(listProviders, setProviders);
  }, []);

  /** A credential is listed with how much it discovered, so its refresh reads the catalog too. */
  const refreshCredentials = useCallback((): void => {
    void readResource(listCredentials, setCredentials);
    void readResource(listCatalog, setCatalog);
  }, []);

  /** The catalog and the exposed listing are the same policy decision, so they are read together. */
  const refreshCatalog = useCallback((): void => {
    void readResource(listCatalog, setCatalog);
    void readResource(listModels, setModels);
  }, []);

  const refreshAll = useCallback((): void => {
    setNotice(null);
    setActionError(null);
    void readResource(fetchHealth, setHealth, 'clear');
    void readResource(listProviders, setProviders);
    void readResource(listCredentials, setCredentials);
    void readResource(listCatalog, setCatalog);
    void readResource(listModels, setModels);
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  /** Runs one action through a single in-flight slot, reporting its outcome in Spanish. */
  const runAction = useCallback(
    async (action: PendingAction, work: () => Promise<string>): Promise<boolean> => {
      setPending(action);
      setNotice(null);
      setActionError(null);

      try {
        setNotice(await work());
        return true;
      } catch (failure) {
        setActionError(describeApiError(failure));
        return false;
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const create = useCallback(
    (input: CredentialInput): Promise<boolean> =>
      runAction({ action: 'create', targetId: input.namespace }, async () => {
        const credential = await createCredential(input);
        await readResource(listCredentials, setCredentials);
        return `Credencial ${credential.namespace} registrada. Refresca su catalogo para descubrir sus modelos.`;
      }),
    [runAction],
  );

  const validate = useCallback(
    (credential: Credential): Promise<boolean> =>
      runAction({ action: 'validate', targetId: credential.id }, async () => {
        const result = await validateCredential(credential.id);
        await readResource(listCredentials, setCredentials);
        return result.ok
          ? `Credencial ${credential.namespace} validada: ${result.detail}.`
          : `Credencial ${credential.namespace} no valido: ${result.detail}. Revisa la base URL y el secreto.`;
      }),
    [runAction],
  );

  const refreshCredentialById = useCallback(
    (credential: Credential): Promise<boolean> =>
      runAction({ action: 'refresh', targetId: credential.id }, async () => {
        const result = await refreshCredential(credential.id);
        await Promise.all([
          readResource(listCredentials, setCredentials),
          readResource(listCatalog, setCatalog),
          readResource(listModels, setModels),
        ]);
        return `Catalogo de ${credential.namespace}: ${result.discovered} descubiertos, ${result.exposed} expuestos.`;
      }),
    [runAction],
  );

  /**
   * Exposing one model is an allow rule scoped to its credential over its exact namespaced id; hiding
   * it again is a deny rule over the same pattern. The gateway evaluates both, never this panel.
   */
  const decide = useCallback(
    (effect: 'allow' | 'deny', message: string) =>
      (model: CatalogModel): Promise<boolean> =>
        runAction({ action: effect, targetId: model.namespacedId }, async () => {
          await createPolicyRule({
            credentialId: model.credentialId,
            pattern: model.namespacedId,
            effect,
          });
          await Promise.all([
            readResource(listCatalog, setCatalog),
            readResource(listModels, setModels),
          ]);
          return `${message} ${model.namespacedId}.`;
        }),
    [runAction],
  );

  const allow = useCallback(decide('allow', 'Regla de permiso creada para'), [decide]);
  const deny = useCallback(decide('deny', 'Regla de denegacion creada para'), [decide]);

  const store: DashboardStore = {
    health,
    providers,
    credentials,
    catalog,
    models,
    pending,
    loading:
      health.loading || providers.loading || credentials.loading || catalog.loading || models.loading,
    notice,
    actionError,
    refreshAll,
    refreshHealth,
    refreshProviders,
    refreshCredentials,
    refreshCatalog,
    create,
    validate,
    refreshCredential: refreshCredentialById,
    allow,
    deny,
  };

  return <DashboardContext.Provider value={store}>{children}</DashboardContext.Provider>;
}

