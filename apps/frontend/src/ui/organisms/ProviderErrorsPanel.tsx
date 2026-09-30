'use client';

import Link from 'next/link';
import { useDashboard } from '../../hooks/useDashboard';
import { ResourceState } from '../molecules/ResourceState';
import { ScreenSection } from '../molecules/ScreenSection';
import styles from './ProviderErrorsPanel.module.css';

/**
 * What each credential's provider answered the last time its catalog was refreshed. A provider that
 * fails is a fact about that credential, not a reason to hide the rest of the panel.
 */
export function ProviderErrorsPanel() {
  const { credentials, refreshCredentials } = useDashboard();
  const failing = credentials.data?.filter((credential) => credential.lastRefreshError !== null) ?? null;

  return (
    <ScreenSection
      title="Ultimos errores de proveedor"
      description="El motivo que devolvio el proveedor en el ultimo refresco de catalogo, credencial por credencial."
    >
      <ResourceState
        loading={credentials.loading}
        error={credentials.error}
        count={failing === null ? null : failing.length}
        loadingText="Leyendo credenciales"
        failureTitle="No se pudieron leer las credenciales"
        emptyTitle="Ninguna credencial reporto errores"
        emptyDetail="Cuando un refresco de catalogo falle, el motivo que devolvio el proveedor aparece en esta lista."
        emptyNextStep="Refresca el catalogo de una credencial para probar su proveedor."
        emptyAction={<Link href="/credenciales">Ir a Credenciales</Link>}
        onRetry={refreshCredentials}
      />

      {failing !== null && failing.length > 0 && (
        <ul className={styles.list}>
          {failing.map((credential) => (
            <li className={styles.item} key={credential.id}>
              <span className={styles.identity}>
                {credential.namespace} / {credential.providerId}
              </span>
              <span className={styles.problem}>{credential.lastRefreshError}</span>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
