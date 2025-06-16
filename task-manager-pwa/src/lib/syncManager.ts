// lib/syncManager.ts
import { offlineDB } from './indexedDB'; 
import type { Task } from './types'; 

import { syncPendingTaskWithServer, fetchServerUpdates } from '@/app/actions/syncActions';

const LAST_SYNC_KEY = 'taskManager_lastSyncTimestamp'; 

export const syncManager = {
  isSyncing: false,

  async synchronize(forceFullSync = false): Promise<{ success: boolean; newTasks?: Task[]; updatedTasks?: Task[]; deletedIds?: string[]; error?:  unknown }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('Offline, skipping sync.');
      return { success: false, error: 'Offline' };
    }
    if (this.isSyncing) {
      console.log('Sync already in progress.');
      return { success: false, error: 'Sync in progress' };
    }
    this.isSyncing = true;
    console.log('Starting synchronization...');
    let pushedChangesCount = 0;
    let pulledChangesCount = 0;

    try {
      // 1. Envia los cambios locales al servidor
      const pendingTasks = await offlineDB.getPendingChanges();
      if (pendingTasks.length > 0) {
        console.log(`Pushing ${pendingTasks.length} pending changes...`);
      }
      for (const task of pendingTasks) {
        try {
          const { success, syncedTask, error } = await syncPendingTaskWithServer(task);
          if (success && syncedTask && task.local_id) {
            // Actualizar la tarea local con los datos del servidor (incluyendo el ID del servidor y timestamps)
            // Y marcarla como 'synced'.
            await offlineDB.updateTaskAfterSync(task.local_id, syncedTask);
            pushedChangesCount++;
          } else {
            console.warn(`Failed to sync task ${task.local_id || task.id}: ${error || 'Unknown error during push'}`);
            if (task.local_id) {
                //await offlineDB.updateLocalTaskStatus(task.local_id, 'sync_failed'); Esto talvez luego lo ponga, 
                // es para hacer reintentos automaticos. Por eso tuve que poner el boton de forzado
            }
          }
        } catch (e) {
          console.error(`Error processing pending task ${task.local_id || task.id} during push:`, e);
        }
      }
      if (pushedChangesCount > 0) console.log(`Successfully pushed ${pushedChangesCount} changes.`);
      
      // 2. Sube los cambios remotos al servidor
      const lastSync = forceFullSync ? null : await this.getLastSyncTimestamp();
      console.log(`Fetching server updates since: ${lastSync || 'beginning of time'}`);
      const { tasks: serverUpdates, error: fetchError } = await fetchServerUpdates(lastSync);

      if (fetchError) {
        console.error('Error fetching server updates:', fetchError);
      }

      if (serverUpdates && serverUpdates.length > 0) {
        await offlineDB.bulkSaveTasks(serverUpdates); // bulkSaveTasks debe asignar local_id si no existe
        pulledChangesCount = serverUpdates.length;
        console.log(`Pulled ${pulledChangesCount} updates from server.`);
      } else if (!fetchError) {
        console.log('No new updates from server.');
      }

      await this.setLastSyncTimestamp(new Date().toISOString());
      this.isSyncing = false;
      console.log('Synchronization attempt finished.');
      return { success: true, updatedTasks: serverUpdates }; 
    } catch (error) {
      console.error('Synchronization process failed critically:', error);
      this.isSyncing = false;
      return { success: false, error };
    }
  },

  // Helper para obtener o setear el pinche timestamp
  async getLastSyncTimestamp(): Promise<string | null> {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAST_SYNC_KEY);
    }
    return null;
  },

  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_SYNC_KEY, timestamp);
    }
  },
};