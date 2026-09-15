import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Keyring Router',
  description: 'Local control interface for Keyring Router.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
