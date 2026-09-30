'use client';

import { ScreenHeader } from '../../ui/molecules/ScreenHeader';
import { ConfigurationPanel } from '../../ui/organisms/ConfigurationPanel';
import { GatewayStatusPanel } from '../../ui/organisms/GatewayStatusPanel';
import { PreferencesPanel } from '../../ui/organisms/PreferencesPanel';
import { SecretsWarningPanel } from '../../ui/organisms/SecretsWarningPanel';

export default function AjustesPage() {
  return (
    <>
      <ScreenHeader
        title="Ajustes"
        lede="El estado del gateway, la direccion del panel y la advertencia que hay que leer antes de guardar el primer secreto."
      />

      <GatewayStatusPanel />
      <ConfigurationPanel />
      <SecretsWarningPanel />
      <PreferencesPanel />
    </>
  );
}
