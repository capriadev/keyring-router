'use client';

import { ScreenHeader } from '../../ui/molecules/ScreenHeader';
import { ProvidersPanel } from '../../ui/organisms/ProvidersPanel';

export default function ProveedoresPage() {
  return (
    <>
      <ScreenHeader
        title="Proveedores"
        lede="Lo que el gateway puede conectar: el catalogo declarado de proveedores, con su protocolo, su tipo de autenticacion y cuantos modelos ofrece cada uno. Un proveedor no es una credencial: aqui se explora el catalogo, la cuenta se registra en Credenciales."
      />

      <ProvidersPanel />
    </>
  );
}