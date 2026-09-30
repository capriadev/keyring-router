'use client';

import { MetaList } from '../molecules/MetaList';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';

/**
 * The warning that has to be read before the first secret is saved. Losing the pepper makes stored
 * secrets unrecoverable, and that is worth one paragraph in the settings screen.
 */
export function SecretsWarningPanel() {
  return (
    <ScreenSection
      title="Advertencia sobre los secretos"
      description="Los secretos de las credenciales se cifran antes de guardarse y nunca se vuelven a mostrar."
    >
      <MetaList
        items={[
          { label: 'Que se guarda', value: 'El texto cifrado y el ultimo tramo, para reconocerlo' },
          { label: 'Que no se guarda', value: 'El secreto en claro, ni en la base de datos ni en un log' },
        ]}
      />

      <StateNote
        tone="warning"
        title="Configura el pepper antes del primer secreto"
        detail="El gateway deriva la clave que cifra los secretos de su pepper. Si el pepper no esta configurado no se puede cifrar un secreto nuevo, y si se pierde, los secretos ya guardados no se pueden descifrar: esa credencial deja de autenticar."
        nextStep="Configura el pepper del gateway y conservalo en un lugar seguro antes de guardar el primer secreto."
        announce="none"
      />
    </ScreenSection>
  );
}
