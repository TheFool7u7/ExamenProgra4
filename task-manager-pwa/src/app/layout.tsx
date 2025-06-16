// app/layout.tsx
import './globals.css'; 
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TaskPWA - Gestor de Tareas',
  description: 'Gestiona tus tareas online y offline.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-100 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}