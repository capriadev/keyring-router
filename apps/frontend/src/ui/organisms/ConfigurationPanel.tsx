'use client';

import { API_BASE_URL } from '../../services/api/client';
import { MetaList } from '../molecules/MetaList';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';

/**
 * What is known about how the gateway was started. The panel can read the health endpoint and its own
 * base URL, and nothing else: the gateway does not publish its boot configuration yet, so those rows
 * say exactly that instead of showing a guessed value.
 */
export function ConfigurationPanel() {
  return (
    <ScreenSection
      title="Configuracion del gateway"
      description="Datos de arranque del proceso del gateway: puerto, base de datos y su entorno."
    >
      <MetaList
        items={[
          { label: 'URL base del panel', value: API_BASE_URL, mono: true },
          { label: 'Puerto del gateway', value: 'No publicado por el gateway' },
          { label: 'Base de datos', value: 'No publicada por el gateway' },
        ]}
      />

      <StateNote
        tone="neutral"
        title="Datos de arranque pendientes de una ruta"
        detail="El gateway todavia no expone su configuracion de arranque, asi que el panel no puede mostrar el puerto ni la ruta de la base de datos. Lo que aparece como no publicado no es un valor desconocido: es un dato que ninguna ruta sirve todavia."
        nextStep="Mientras no exista esa ruta, revisa el entorno con el que se inicia el gateway."
        announce="none"
      />
    </ScreenSection>
  );
}
