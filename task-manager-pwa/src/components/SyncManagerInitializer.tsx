// src/components/SyncManagerInitializer.tsx
'use client';

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { syncManager } from '@/lib/syncManager'; 
import { offlineDB } from '@/lib/indexedDB';   
import type { Task } from '@/lib/types';     

// 1. Contexto para el estado online, el interruptor en otras palabras
interface OnlineStatusContextType {
  isOnline: boolean;
}
const OnlineStatusContext = createContext<OnlineStatusContextType | undefined>(undefined);

export function useOnlineStatus(): OnlineStatusContextType {
  const context = useContext(OnlineStatusContext);
  if (context === undefined) {
    throw new Error('useOnlineStatus must be used within an OnlineStatusProvider');
  }
  return context;
}

// 2. Evento global para notificar actualizaciones de tareas
const TASKS_UPDATED_EVENT = 'tasks-updated';
export function dispatchTasksUpdatedEvent() {
  window.dispatchEvent(new CustomEvent(TASKS_UPDATED_EVENT));
}

// 3. Hook personalizado para obtener y refrescar tareas desde IndexedDB
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTasksFromDB = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const localTasks = await offlineDB.getAllTasks();
      // Filtra tareas que están marcadas como eliminadas (hice un poco de trampa y en la BD
      // solo se ponen eliminadas en el campo correspondiente, no se eliminan) Y ya sincronizadas
      setTasks(localTasks.filter(t => !(t.is_deleted && t.sync_status === 'synced')));
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error(String(err));
      console.error("Error refreshing tasks from IndexedDB:", fetchError);
      setError(fetchError.message);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    refreshTasksFromDB(); // Carga inicial
    
    const handleDataChanged = () => {
      console.log('Event tasks-updated received, refreshing tasks from DB.');
      refreshTasksFromDB();
    };
    
    window.addEventListener(TASKS_UPDATED_EVENT, handleDataChanged);
    
    return () => window.removeEventListener(TASKS_UPDATED_EVENT, handleDataChanged);
  }, []); // El array vacío asegura que esto se ejecute solo una vez al montar y desmontar

  return { tasks, isLoading, errorLoadingTasks: error, refreshTasks: refreshTasksFromDB };
}

interface SyncManagerInitializerProps {
  initialServerTasks: Task[];
  children?: ReactNode; // Para envolver la app con el OnlineStatusProvider si se usa nota:SI se usa
}

export default function SyncManagerInitializer({ initialServerTasks, children }: SyncManagerInitializerProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Determinar el estado inicial de la conexión
    if (typeof navigator !== 'undefined') {
        setIsOnline(navigator.onLine);
    }

    const handleOnline = () => {
      console.log('SyncManager: App is ONLINE. Attempting synchronization.');
      setIsOnline(true);
      syncManager.synchronize().then(() => {
        console.log('SyncManager: Synchronization after going online complete.');
        dispatchTasksUpdatedEvent(); // Notificar que los datos pueden haber cambiado
      }).catch(error => {
        console.error('SyncManager: Error during synchronization after going online:', error);
      });
    };

    const handleOffline = () => {
      console.log('SyncManager: App is OFFLINE.');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Lógica de inicialización y primera sincronización
    const initializeAndFirstSync = async () => {
      let performedInitialPopulation = false;
      try {
        const localTasksCount = (await offlineDB.getAllTasks()).length; // Obtener solo el conteo para eficiencia

        if (navigator.onLine) {
          if (localTasksCount === 0 && initialServerTasks.length > 0) {
            console.log("SyncManager: Populating IndexedDB with initial server tasks...");
            // Asegurar que las tareas del servidor tengan local_id si no lo tienen
            // y que tengan un estado de sync 'synced'.
            const tasksToSave = initialServerTasks.map(task => ({
              ...task,
              local_id: task.id || `server_${task.title.replace(/\s+/g, '_')}_${Date.now()}`, // Crear local_id si falta
              sync_status: 'synced' as const
            }));
            await offlineDB.bulkSaveTasks(tasksToSave);
            performedInitialPopulation = true;
            console.log(`SyncManager: ${tasksToSave.length} initial tasks saved to IndexedDB.`);
          }
          
          // Realizar una sincronización completa, incluso si se poblaron tareas.
          // Esto asegura que se obtengan los cambios más recientes si la carga SSR fue cacheada.
          console.log("SyncManager: Performing initial synchronization with server...");
          await syncManager.synchronize(localTasksCount === 0); // forceFullSync si no había tareas locales
          console.log("SyncManager: Initial synchronization complete.");

        } else {
          console.log("SyncManager: App is initially offline. Will sync when connection is available.");
        }
      } catch (error) {
        console.error("SyncManager: Error during initial data population or sync:", error);
      } finally {
        // Despachar evento para actualizar la UI después de la inicialización/sincronización.
        // Solo si hubo población o si estamos online (indicando que el sync se intentó).
        if (performedInitialPopulation || navigator.onLine) {
          dispatchTasksUpdatedEvent();
        }
      }
    };

    initializeAndFirstSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // initialServerTasks es una dependencia, si cambia (ej. navegación a otra página SSR con diferentes datos),
  // la lógica de inicialización podría necesitar re-evaluarse, aunque para una SPA usualmente no cambia.
  // Sin embargo, para evitar ejecuciones innecesarias, se considera si realmente debe ser una dependencia
  // o si la inicialización es un "efecto de una sola vez al montar la app" aun no lo se la verdad.
  // Por ahora, la dejamos para el caso de que initialServerTasks pudiera cambiar significativamente, aun que lo dudo
  // Todo funciona bien luego del tercer intento.
  }, [initialServerTasks]);

  if (children) {
    return (
      <OnlineStatusContext.Provider value={{ isOnline }}>
        {children}
      </OnlineStatusContext.Provider>
    );
  }

  return null; 
}