'use client';

import { useMemo, useState } from 'react';
import { modelAction, useDashboard } from '../../hooks/useDashboard';
import { ActionButton } from '../atoms/ActionButton';
import { TextField } from '../atoms/TextField';
import { DataTable } from '../molecules/DataTable';
import { MetaList } from '../molecules/MetaList';
import { ModelRow } from '../molecules/ModelRow';
import { ResourceState } from '../molecules/ResourceState';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';
import styles from './CatalogPanel.module.css';

const COLUMNS = ['Modelo', 'Credencial', 'Proveedor', 'Regla efectiva', 'Acciones'];

/**
 * The two lists of the product in one screen: what each credential discovered and what the policy
 * lets through. Both counts are always on screen together, and the effective rule of each row is read
 * from the gateway, which is the only thing that evaluates policy.
 */
export function CatalogPanel() {
  const { catalog, models, pending, refreshCatalog, allow, deny } = useDashboard();
  const [search, setSearch] = useState('');

  const rows = catalog.data ?? null;
  const needle = search.trim().toLowerCase();

  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (model) =>
          needle === '' ||
          model.namespacedId.toLowerCase().includes(needle) ||
          model.displayName.toLowerCase().includes(needle) ||
          model.providerId.toLowerCase().includes(needle),
      ),
    [rows, needle],
  );

  const counts = [
    { label: 'Descubiertos', value: rows === null ? 'sin datos' : String(rows.length) },
    { label: 'Expuestos', value: models.data === null ? 'sin datos' : String(models.data.length) },
  ];

  return (
    <ScreenSection
      title="Catalogo y exposicion"
      description="Descubrir no es exponer: el conteo de descubiertos es lo que los proveedores reportaron y el de expuestos es lo que la politica deja pasar. Cada fila muestra la regla efectiva que el gateway aplico."
    >
      <MetaList items={counts} />

      {rows !== null && rows.length > 0 && (
        <div className={styles.search}>
          <TextField
            id="catalog-search"
            label="Buscar modelo"
            type="search"
            value={search}
            onChange={setSearch}
            placeholder="identificador, nombre o proveedor"
            hint="Filtra las filas de esta tabla. Los dos conteos de arriba son totales, no del filtro."
          />
        </div>
      )}

      <ResourceState
        loading={catalog.loading}
        error={catalog.error}
        count={rows === null ? null : rows.length}
        loadingText="Leyendo el catalogo descubierto"
        failureTitle="No se pudo leer el catalogo"
        emptyTitle="Sin modelos descubiertos"
        emptyDetail="Ninguna credencial tiene modelos descubiertos todavia: el catalogo se llena al refrescar una credencial contra su proveedor."
        emptyNextStep="Registra una credencial y usa Refrescar catalogo en Credenciales."
        onRetry={refreshCatalog}
      />

      {rows !== null && rows.length > 0 && visible.length === 0 && (
        <StateNote
          tone="neutral"
          title="Ningun modelo coincide con la busqueda"
          detail={`Ninguna fila del catalogo contiene "${search.trim()}".`}
          nextStep="Prueba con otro texto o limpia el campo de busqueda."
          action={<ActionButton label="Limpiar busqueda" onClick={() => setSearch('')} />}
        />
      )}

      {visible.length > 0 && (
        <DataTable
          caption="Catalogo descubierto con la decision de exposicion de cada modelo"
          columns={COLUMNS}
        >
          {visible.map((model) => (
            <ModelRow
              key={model.namespacedId}
              model={model}
              action={modelAction(pending, model.namespacedId)}
              onAllow={allow}
              onDeny={deny}
            />
          ))}
        </DataTable>
      )}

      {rows !== null && rows.length > 0 && (
        <StateNote
          tone="neutral"
          title="Quien decide que se expone"
          detail="Las reglas viven en el gateway y este panel no las evalua: la columna Regla efectiva es la decision que el gateway devolvio para cada modelo. Tampoco lista las reglas declaradas, solo su resultado."
          announce="none"
        />
      )}
    </ScreenSection>
  );
}

