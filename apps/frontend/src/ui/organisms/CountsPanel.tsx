'use client';

import { formatCount } from '../../format/display';
import { useDashboard } from '../../hooks/useDashboard';
import { ActionButton } from '../atoms/ActionButton';
import { MetaList, type MetaListItem } from '../molecules/MetaList';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';

/**
 * The four counts of the panel. Discovered and exposed are counted from two different readings on
 * purpose: the catalog is what the providers report, the exposed listing is what the policy allows.
 *
 * The four rows are on screen from the first render, before the gateway answers: the labels hold their
 * place, so the numbers arriving do not move them, and 'sin datos' is never read as a zero.
 */
export function CountsPanel() {
  const { providers, credentials, catalog, models, refreshAll } = useDashboard();

  const discovered = catalog.data === null ? null : catalog.data.length;
  const exposed = models.data === null ? null : models.data.length;

  const missing = [
    providers.data === null ? 'proveedores declarados' : null,
    credentials.data === null ? 'credenciales registradas' : null,
    discovered === null ? 'modelos descubiertos' : null,
    exposed === null ? 'modelos expuestos' : null,
  ].filter((item): item is string => item !== null);

  const stillReading =
    providers.loading || credentials.loading || catalog.loading || models.loading;

  const items: readonly MetaListItem[] = [
    { label: 'Proveedores declarados', value: formatCount(providers.data?.length ?? null) },
    { label: 'Credenciales registradas', value: formatCount(credentials.data?.length ?? null) },
    { label: 'Modelos descubiertos', value: formatCount(discovered) },
    { label: 'Modelos expuestos', value: formatCount(exposed) },
  ];

  const reading = missing.length === 4 && stillReading;

  return (
    <ScreenSection
      title="Resumen"
      description="Dos cuentas que no significan lo mismo: lo que el gateway descubre y lo que la politica deja pasar."
    >
      <MetaList items={items} />

      {reading ? (
        <StateNote
          tone="neutral"
          title="Leyendo el gateway"
          detail="Los conteos aparecen cuando terminen las cuatro lecturas."
        />
      ) : (
        missing.length > 0 && (
          <StateNote
            tone="warning"
            title="Conteos incompletos"
            detail={`Sin datos por ahora: ${missing.join(', ')}.`}
            nextStep="Reintenta la lectura; lo que falte sigue marcado como sin datos."
            action={<ActionButton label="Reintentar" onClick={refreshAll} />}
          />
        )
      )}
    </ScreenSection>
  );
}
