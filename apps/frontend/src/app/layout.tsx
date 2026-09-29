import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
