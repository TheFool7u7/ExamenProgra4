// components/OfflineIndicator.tsx
'use client';

import { useState, useEffect } from 'react';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
        setIsOnline(navigator.onLine);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-red-500 text-white text-center p-2 z-50">
      Estás trabajando en modo offline. Los cambios se sincronizarán cuando vuelvas a tener conexión.
    </div>
  );
}