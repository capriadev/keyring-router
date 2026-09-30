'use client';

import Link from 'next/link';
import { formatCount } from '../../format/display';
import { useDashboard } from '../../hooks/useDashboard';
import { API_BASE_URL } from '../../services/api/client';
import { CopyButton } from '../molecules/CopyButton';
import { DataTable } from '../molecules/DataTable';
import { ExposedModelRow } from '../molecules/ExposedModelRow';
import { MetaList } from '../molecules/MetaList';
import { ResourceState } from '../molecules/ResourceState';
import { ScreenSection } from '../molecules/ScreenSection';

const COLUMNS = ['Identificador', 'Proveedor', 'Modelo del proveedor', 'Acciones'];

/** The endpoint a client points at. Written once: the listing shows it and the copy control takes it. */
const CLIENT_BASE_URL = `${API_BASE_URL}/v1`;

/**
 * The listing a client can call: the exposed identifiers, ready to copy into a configuration. It is
 * the same policy decision the catalog screen shows, seen from the routing side.
 *
 * The count and the client endpoint are above the list in every state, so the reading that fills the
 * table does not move them.
 */
export function ExposedModelsPanel() {
  const { models, refreshCatalog } = useDashboard();
  const rows = models.data ?? null;

  return (
    <ScreenSection
      title="Modelos expuestos"
      description="Solo los modelos que pasan la politica. El catalogo descubierto no basta: sin una regla que lo permita, el gateway deniega por defecto."
    >
      <MetaList
        items={[
          { label: 'Modelos expuestos', value: formatCount(rows === null ? null : rows.length) },
          {
            label: 'URL base para clientes',
            value: CLIENT_BASE_URL,
            mono: true,
            truncate: true,
            action: (
              <CopyButton
                label="Copiar URL base"
                value={CLIENT_BASE_URL}
                fallbackHint="Selecciona la URL y copiala a mano."
              />
            ),
          },
        ]}
      />

      <ResourceState
        loading={models.loading}
        error={models.error}
        count={rows === null ? null : rows.length}
        loadingText="Leyendo los modelos expuestos"
        failureTitle="No se pudieron leer los modelos expuestos"
        emptyTitle="Ningun modelo expuesto"
        emptyDetail="La lista esta vacia: hay modelos descubiertos que ninguna regla permite todavia."
        emptyNextStep="Usa Permitir en el modelo que quieras servir, en Catalogo y exposicion."
        emptyAction={<Link href="/catalogo">Ir a Catalogo y exposicion</Link>}
        onRetry={refreshCatalog}
      />

      {rows !== null && rows.length > 0 && (
        <DataTable
          caption="Modelos expuestos con el identificador que usa un cliente"
          columns={COLUMNS}
        >
          {rows.map((model) => (
            <ExposedModelRow key={model.namespacedId} model={model} />
          ))}
        </DataTable>
      )}
    </ScreenSection>
  );
}

