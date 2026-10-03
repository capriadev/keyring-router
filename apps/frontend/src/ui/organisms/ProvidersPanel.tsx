'use client';

import { useRouter } from 'next/navigation';
import { useDashboard } from '../../hooks/useDashboard';
import { ProviderBrowser } from '../molecules/ProviderBrowser';
import { ResourceState } from '../molecules/ResourceState';
import { ScreenSection } from '../molecules/ScreenSection';

/**
 * The declared provider catalog, explorable. Picking a provider carries it to the credential form, which
 * is where an account is registered: this screen shows what the gateway can connect to, it does not
 * connect by itself.
 */
export function ProvidersPanel() {
  const store = useDashboard();
  const router = useRouter();
  const providers = store.providers.data;

  function addCredential(providerId: string): void {
    store.selectProvider(providerId);
    router.push('/credenciales');
  }

  return (
    <ScreenSection
      title="Catalogo de proveedores"
      description="Lo que declara el gateway: el protocolo de cada proveedor, su tipo de autenticacion y cuantos modelos ofrece. Elegi uno para registrar una credencial sobre el."
    >
      <ResourceState
        loading={store.providers.loading}
        error={store.providers.error}
        count={providers === null ? null : providers.length}
        loadingText="Leyendo el catalogo de proveedores"
        failureTitle="No se pudo leer el catalogo de proveedores"
        emptyTitle="El gateway no declara proveedores"
        emptyDetail="Sin proveedores declarados no hay nada que conectar."
        retryLabel="Reintentar"
        onRetry={store.refreshProviders}
      />

      {providers !== null && providers.length > 0 && (
        <ProviderBrowser
          providers={providers}
          onSelect={(provider) => addCredential(provider.providerId)}
        />
      )}
    </ScreenSection>
  );
}