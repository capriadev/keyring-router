'use client';

import { SelectField, type SelectOption } from '../atoms/SelectField';
import { ScreenSection } from '../molecules/ScreenSection';
import { StateNote } from '../molecules/StateNote';

/** The only language the panel speaks today. The switch is a placeholder until its own spec lands. */
const LANGUAGES: readonly SelectOption[] = [{ value: 'es', label: 'Espanol' }];

/** Appearance and language of the panel itself, which is not the same thing as the gateway's config. */
export function PreferencesPanel() {
  return (
    <ScreenSection
      title="Preferencias del panel"
      description="Idioma y tema de esta interfaz. No cambian nada del gateway."
    >
      <SelectField
        id="panel-language"
        label="Idioma"
        value="es"
        options={LANGUAGES}
        onChange={() => undefined}
        hint="Placeholder: el panel solo habla espanol por ahora y el cambio de idioma necesita guardar la preferencia en el gateway."
        disabled
      />

      <StateNote
        tone="neutral"
        title="Tema"
        detail="El tema se define en theme/tokens.css, la unica fuente de tokens de diseno: colores, tipografia, espaciados y radios. No hay editor de tema ni presets en el panel."
        nextStep="Para cambiar la apariencia, edita los tokens en ese archivo; los presets son una tarea aparte."
        announce="none"
      />
    </ScreenSection>
  );
}
