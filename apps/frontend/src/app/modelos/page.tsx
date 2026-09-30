'use client';

import { ScreenHeader } from '../../ui/molecules/ScreenHeader';
import { ExposedModelsPanel } from '../../ui/organisms/ExposedModelsPanel';

export default function ModelosPage() {
  return (
    <>
      <ScreenHeader
        title="Modelos expuestos"
        lede="Los identificadores con namespace que un cliente puede usar en su configuracion. Solo llegan aqui los modelos que una regla permite."
      />

      <ExposedModelsPanel />
    </>
  );
}
