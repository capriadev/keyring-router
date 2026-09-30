'use client';

import { useDashboard } from '../../hooks/useDashboard';
import { API_BASE_URL } from '../../services/api/client';
import { ActionButton } from '../atoms/ActionButton';
import { StatusPill } from '../atoms/StatusPill';
import { MetaList, type MetaListItem } from '../molecules/MetaList';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';

/** Uptime in the largest two units that describe it, so nobody reads 36000 seconds. */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ${seconds % 60} s`;
  }

  const hours = Math.floor(minutes / 60);

  return `${hours} h ${minutes % 60} min`;
}

/**
 * The health of the gateway and where this panel looks for it. The same section is used by Estado and
 * by Ajustes, because both answer the question "is the gateway there, and where".
 */
export function GatewayStatusPanel() {
  const { health, refreshHealth } = useDashboard();

  const retry = <ActionButton label="Reintentar" onClick={refreshHealth} />;

  const body =
    health.data === null ? (
      health.loading ? (
        <StateNote
          tone="neutral"
          title="Consultando el gateway"
          detail="Una sola lectura del estado; el resultado llega en cuanto el gateway conteste."
        />
      ) : (
        <StateNote
          tone="danger"
          title="El gateway no responde"
          detail={health.error ?? 'El gateway no contesto la lectura de estado.'}
          nextStep="Inicia el gateway y vuelve a intentarlo. Las listas siguen mostrando la ultima lectura que se pudo hacer."
          action={retry}
        />
      )
    ) : (
      <>
        <MetaList
          items={[
            { label: 'Estado', value: `Activo (${health.data.status})` },
            { label: 'Version', value: health.data.version, mono: true },
            { label: 'Activo hace', value: formatUptime(health.data.uptimeSeconds) },
            { label: 'URL base del panel', value: API_BASE_URL, mono: true },
          ]}
        />
        {health.error !== null && (
          <StateNote
            tone="warning"
            title="La ultima consulta de estado fallo"
            detail={health.error}
            nextStep="Lo que ves es la ultima respuesta valida; reintenta para confirmarla."
            action={retry}
          />
        )}
      </>
    );

  return (
    <ScreenSection
      title="Estado del gateway"
      description="El gateway corre como proceso aparte: si no responde, el panel no puede leer nada."
    >
      {body}
    </ScreenSection>
  );
}
