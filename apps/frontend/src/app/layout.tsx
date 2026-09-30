import type { Metadata } from 'next';
import { GatewayProvider } from '../hooks/GatewayProvider';
import { AppFrame } from '../ui/organisms/AppFrame';
import './globals.css';

export const metadata: Metadata = {
  title: 'Keyring Router',
  description: 'Interfaz local de administracion de Keyring Router.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <GatewayProvider>
          <AppFrame>{children}</AppFrame>
        </GatewayProvider>
      </body>
    </html>
  );
}
