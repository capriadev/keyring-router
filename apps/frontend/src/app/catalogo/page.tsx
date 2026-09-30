'use client';

import { ScreenHeader } from '../../ui/molecules/ScreenHeader';
import { CatalogPanel } from '../../ui/organisms/CatalogPanel';

export default function CatalogoPage() {
  return (
    <>
      <ScreenHeader
        title="Catalogo y exposicion"
        lede="Lo que el gateway descubrio y lo que la politica deja pasar no son la misma lista: esta pantalla muestra las dos, con la regla efectiva de cada modelo."
      />

      <CatalogPanel />
    </>
  );
}
