'use client';

import Link from 'next/link';
import { useDashboard } from '../../hooks/useDashboard';
import { API_BASE_URL } from '../../services/api/client';
import { DataTable } from '../molecules/DataTable';
import { ExposedModelRow } from '../molecules/ExposedModelRow';
import { MetaList } from '../molecules/MetaList';
import { ResourceState } from '../molecules/ResourceState';
import { ScreenSection } from '../molecules/ScreenSection';
import styles from './ExposedModelsPanel.module.css';

const COLUMNS = ['Identificador', 'Proveedor', 'Modelo del proveedor', 'Acciones'];

/**
 * The listing a client can call: the exposed identifiers, ready to copy into a configuration. It is
 * the same policy decision the catalog screen shows, seen from the routing side.
 */
export function ExposedModelsPanel() {
  const { models, refreshCatalog } = useDashboard();
  const rows = models.data ?? null;

  return (
    <ScreenSection
      title="Modelos expuestos"
      description="Solo los modelos que pasan la politica. El catalogo descubierto no basta: sin una regla que lo permita, el gateway deniega por defecto."
    >
      <ResourceState
        loading={models.loading}
        error={models.error}
        count={rows === null ? null : rows.length}
        loadingText="Leyendo los modelos expuestos"
        failureTitle="No se pudieron leer los modelos expuestos"
        emptyTitle="Ningun modelo expuesto"
        emptyDetail="La lista esta vacia: hay modelos descubiertos que ninguna regla permite todavia."
        emptyNextStep="Abre Catalogo y exposicion y usa Permitir en el modelo que quieras servir."
        onRetry={refreshCatalog}
      />

      {rows !== null && rows.length > 0 && (
        <>
          <MetaList
            items={[
              { label: 'Modelos expuestos', value: String(rows.length) },
              { label: 'URL base para clientes', value: `${API_BASE_URL}/v1`, mono: true },
            ]}
          />
          <DataTable
            caption="Modelos expuestos con el identificador que usa un cliente"
            columns={COLUMNS}
          >
            {rows.map((model) => (
              <ExposedModelRow key={model.namespacedId} model={model} />
            ))}
          </DataTable>
        </>
      )}

      {rows !== null && rows.length === 0 && (
        <p className={styles.action}>
          <Link href="/catalogo">Ir a Catalogo y exposicion</Link>
        </p>
      )}
    </ScreenSection>
  );
}

