'use client';

import { ScreenHeader } from '../../ui/molecules/ScreenHeader';
import { CredentialForm } from '../../ui/organisms/CredentialForm';
import { CredentialsPanel } from '../../ui/organisms/CredentialsPanel';

export default function CredencialesPage() {
  return (
    <>
      <ScreenHeader
        title="Credenciales"
        lede="Cada credencial es una cuenta concreta: un proveedor no es una credencial, y dos cuentas del mismo proveedor viven separadas por su namespace."
      />

      <CredentialForm />
      <CredentialsPanel />
    </>
  );
}
