'use client';

import { createContext, useContext } from 'react';
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

export type ActionName = 'reload' | 'create' | 'validate' | 'refresh' | 'allow' | 'deny';

/** Single in-flight action: `targetId` is a credential or namespaced model id, null for a full reload. */
export interface PendingAction {
  readonly action: ActionName;
  readonly targetId: string | null;
}

/**
 * One resource as a panel sees it: the last reading, the failure of the last attempt, and whether an
 * attempt is in flight. There is no fourth state: what is not read yet is loading, empty or failed.
 */
export interface Loadable<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
}

/**
 * Everything the screens read and every call they can make. One provider owns the five resources, so
 * swapping screens reuses what is already loaded and no panel ever fetches while rendering.
 */
export interface DashboardStore {
  readonly health: Loadable<HealthResponse>;
  readonly providers: Loadable<ProvidersResponse>;
  readonly credentials: Loadable<CredentialsResponse>;
  /** Discovered models with the exposure decision the gateway made for each one. */
  readonly catalog: Loadable<CatalogResponse>;
  /** Only the models the policy lets through: the same catalog seen from the routing side. */
  readonly models: Loadable<ModelsResponse>;
  readonly pending: PendingAction | null;
  /** True while any of the five readings is in flight, so a global control can show it. */
  readonly loading: boolean;
  /** Last action that was applied. Mutations report here, never in a list error. */
  readonly notice: string | null;
  /** Last action that failed, already translated to Spanish by the service layer. */
  readonly actionError: string | null;
  readonly refreshAll: () => void;
  readonly refreshHealth: () => void;
  readonly refreshProviders: () => void;
  /** Credentials plus the catalog, because a credential is listed with how much it discovered. */
  readonly refreshCredentials: () => void;
  /** The catalog plus the exposed listing: the two readings of one policy decision. */
  readonly refreshCatalog: () => void;
  /** Resolves true only when the credential was stored; the form clears itself exclusively then. */
  readonly create: (input: CredentialInput) => Promise<boolean>;
  readonly validate: (credential: Credential) => Promise<boolean>;
  readonly refreshCredential: (credential: Credential) => Promise<boolean>;
  readonly allow: (model: CatalogModel) => Promise<boolean>;
  readonly deny: (model: CatalogModel) => Promise<boolean>;
}

export const DashboardContext = createContext<DashboardStore | null>(null);

/** Reads the store. Throwing here beats a screen silently rendering an empty gateway. */
export function useDashboard(): DashboardStore {
  const store = useContext(DashboardContext);

  if (store === null) {
    throw new Error('useDashboard se uso fuera del proveedor de datos del panel.');
  }

  return store;
}

/** Action in flight for one credential row, so the row can label the button that is running. */
export function credentialAction(pending: PendingAction | null, credentialId: string): 'validate' | 'refresh' | null {
  if (pending === null || pending.targetId !== credentialId) {
    return null;
  }

  return pending.action === 'validate' || pending.action === 'refresh' ? pending.action : null;
}

/** Action in flight for one model row, so the row can label the button that is running. */
export function modelAction(pending: PendingAction | null, namespacedId: string): 'allow' | 'deny' | null {
  if (pending === null || pending.targetId !== namespacedId) {
    return null;
  }

  return pending.action === 'allow' || pending.action === 'deny' ? pending.action : null;
}
