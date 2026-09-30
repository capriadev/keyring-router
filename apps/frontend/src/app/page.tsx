'use client';

import { ScreenHeader } from '../ui/molecules/ScreenHeader';
import { CountsPanel } from '../ui/organisms/CountsPanel';
import { GatewayStatusPanel } from '../ui/organisms/GatewayStatusPanel';
import { ProviderErrorsPanel } from '../ui/organisms/ProviderErrorsPanel';
import styles from './page.module.css';

export default function EstadoPage() {
  return (
    <>
      <ScreenHeader
        title="Estado"
        lede="El gateway es un proceso local aparte. Esta pantalla dice si responde, cuanto lleva activo y que descubrieron sus credenciales."
      />

      <div className={styles.grid}>
        <GatewayStatusPanel />
        <CountsPanel />
      </div>

      <ProviderErrorsPanel />
    </>
  );
}

