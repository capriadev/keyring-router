'use client';

import { useId, useState } from 'react';
import {
  NO_PROVIDER_FILTERS,
  distinctAuthTypes,
  distinctFormats,
  filterProviders,
  type ProviderFilters,
} from '../../services/providers/filter';
import type { ProviderDescriptor } from '../../types/api';
import { SelectField, type SelectOption } from '../atoms/SelectField';
import { StatusPill } from '../atoms/StatusPill';
import { TextField } from '../atoms/TextField';
import { TruncatedText } from '../atoms/TruncatedText';
import { StateNote } from './StateNote';
import styles from './ProviderBrowser.module.css';

export interface ProviderBrowserProps {
  /** The catalog the gateway reported. An empty list is its own honest state, not a blank view. */
  readonly providers: readonly ProviderDescriptor[];
  /** The provider the user picked. The caller decides what picking means: pre-fill or open a form. */
  readonly onSelect: (provider: ProviderDescriptor) => void;
  readonly selectedId?: string;
  readonly busy?: boolean;
  readonly searchLabel?: string;
  /** `compact` caps the list height, for embedding the browser inside a form. */
  readonly compact?: boolean;
}

const ALL_OPTION: SelectOption = { value: '', label: 'Todos' };

function filterOptions(values: readonly string[]): readonly SelectOption[] {
  return [ALL_OPTION, ...values.map((value) => ({ value, label: value }))];
}

/**
 * The declared provider catalog, narrowed by a search and by two filters and shown as selectable rows.
 * It owns the search and filter state, reads the distinct filter values from the catalog itself so no
 * value is hardcoded, and hands the chosen provider to its caller. Reused by the Proveedores screen and
 * by the credential form.
 */
export function ProviderBrowser({
  providers,
  onSelect,
  selectedId,
  busy = false,
  searchLabel = 'Buscar proveedor',
  compact = false,
}: ProviderBrowserProps) {
  const [filters, setFilters] = useState<ProviderFilters>(NO_PROVIDER_FILTERS);
  const searchId = useId();
  const formatId = useId();
  const authId = useId();

  if (providers.length === 0) {
    return (
      <StateNote
        tone="neutral"
        title="El gateway no reporto proveedores"
        detail="La lista de proveedores viene del gateway y llegó vacia."
        nextStep="Confirma que el gateway responde y usa Actualizar datos para volver a leerla."
        announce="none"
      />
    );
  }

  const shown = filterProviders(providers, filters);

  return (
    <div className={styles.browser}>
      <div className={styles.controls}>
        <TextField
          id={searchId}
          label={searchLabel}
          type="search"
          value={filters.query}
          onChange={(query) => setFilters((current) => ({ ...current, query }))}
          placeholder="nombre, id o alias"
          disabled={busy}
        />
        <SelectField
          id={formatId}
          label="Formato"
          value={filters.format ?? ''}
          options={filterOptions(distinctFormats(providers))}
          onChange={(value) => setFilters((current) => ({ ...current, format: value === '' ? null : value }))}
          disabled={busy}
        />
        <SelectField
          id={authId}
          label="Autenticacion"
          value={filters.authType ?? ''}
          options={filterOptions(distinctAuthTypes(providers))}
          onChange={(value) => setFilters((current) => ({ ...current, authType: value === '' ? null : value }))}
          disabled={busy}
        />
      </div>

      <p className={styles.count}>
        {shown.length} de {providers.length} proveedores
      </p>

      {shown.length === 0 ? (
        <StateNote
          tone="neutral"
          title="Ningun proveedor coincide"
          detail="La busqueda o los filtros no dejan ningun proveedor a la vista."
          nextStep="Borra la busqueda o vuelve los filtros a Todos para ver el catalogo completo."
          announce="none"
        />
      ) : (
        <ul className={compact ? `${styles.list} ${styles.listCompact}` : styles.list}>
          {shown.map((provider) => {
            const selected = provider.providerId === selectedId;

            return (
              <li key={provider.providerId}>
                <button
                  type="button"
                  className={selected ? `${styles.row} ${styles.rowSelected}` : styles.row}
                  onClick={() => onSelect(provider)}
                  disabled={busy}
                  aria-current={selected ? 'true' : undefined}
                >
                  <span className={styles.name}>{provider.displayName}</span>
                  <span className={styles.ids}>
                    {provider.providerId}
                    {provider.alias === provider.providerId ? '' : ` (${provider.alias})`}
                  </span>
                  <span className={styles.pills}>
                    <StatusPill label={provider.format} />
                    <StatusPill label={provider.authType} />
                    <span className={styles.models}>{provider.modelCount} modelos</span>
                  </span>
                  <TruncatedText element="code" className={styles.url} value={provider.baseUrl} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}