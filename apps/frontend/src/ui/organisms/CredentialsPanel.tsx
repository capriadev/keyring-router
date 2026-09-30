'use client';

import { useMemo } from 'react';
import { credentialAction, useDashboard } from '../../hooks/useDashboard';
import { CredentialRow } from '../molecules/CredentialRow';
import { DataTable } from '../molecules/DataTable';
import { ResourceState } from '../molecules/ResourceState';
import { ScreenSection } from '../molecules/ScreenSection';

interface CatalogCounts {
  readonly discovered: number;
  readonly exposed: number;
}

const COLUMNS = ['Namespace', 'Proveedor', 'Secreto', 'Catalogo', 'Estado', 'Acciones'];

/**
 * The credentials this gateway holds. Each row is one account, not one provider: the same provider
 * can appear in several rows with its own namespace, its own secret and its own discovered catalog.
 */
export function CredentialsPanel() {
  const { credentials, catalog, pending, refreshCredentials, validate, refreshCredential, rotateSecret } =
    useDashboard();

  /** Counted once from the single catalog reading: one row per credential and no call per row. */
  const counts = useMemo(() => {
    const byCredential = new Map<string, CatalogCounts>();

    for (const model of catalog.data ?? []) {
      const current = byCredential.get(model.credentialId) ?? { discovered: 0, exposed: 0 };

      byCredential.set(model.credentialId, {
        discovered: current.discovered + 1,
        exposed: current.exposed + (model.exposed ? 1 : 0),
      });
    }

    return byCredential;
  }, [catalog.data]);

  const catalogFailed = catalog.data === null;

  return (
    <ScreenSection
      title="Credenciales registradas"
      description="Una credencial es una cuenta concreta de un proveedor, con su namespace propio. El conteo de catalogo es lo que esa credencial descubrio, no lo que el gateway expone."
    >
      <ResourceState
        loading={credentials.loading}
        error={credentials.error}
        count={credentials.data === null ? null : credentials.data.length}
        loadingText="Leyendo credenciales"
        failureTitle="No se pudieron leer las credenciales"
        emptyTitle="Sin credenciales"
        emptyDetail="Sin una credencial no hay nada que validar ni catalogo que descubrir, y el gateway no tiene nada que exponer."
        emptyNextStep="Registra la primera arriba: el namespace identifica la cuenta y la base URL apunta a su endpoint."
        onRetry={refreshCredentials}
      />

      {credentials.data !== null && credentials.data.length > 0 && (
        <DataTable
          caption="Credenciales registradas con su conteo de catalogo y sus acciones"
          columns={COLUMNS}
        >
          {credentials.data.map((credential) => (
            <CredentialRow
              key={credential.id}
              credential={credential}
              catalog={catalogFailed ? null : (counts.get(credential.id) ?? { discovered: 0, exposed: 0 })}
              action={credentialAction(pending, credential.id)}
              onValidate={validate}
              onRefresh={refreshCredential}
              onRotate={rotateSecret}
            />
          ))}
        </DataTable>
      )}
    </ScreenSection>
  );
}
