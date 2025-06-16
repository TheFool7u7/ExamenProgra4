// src/app/actions/syncActions.ts
'use server';

import { onlineDB } from '@/lib/supabase/actions';
import type { Task, CreateTaskPayload } from '@/lib/types'; 

// Define un tipo para el payload de actualización si es diferente de Partial<Task>
type OnlineDBUpdatePayload = Partial<Omit<Task, 'id' | 'local_id' | 'sync_status' | 'created_at'>>;


export async function syncPendingTaskWithServer(
  task: Task
): Promise<{ success: boolean, syncedTask?: Task, error?: string }> {
  try {
    let syncedTask: Task;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { local_id, sync_status, id, created_at, updated_at, ...taskRelevantData } = task;

    if (task.sync_status === 'pending_create' && !task.id) {
      const payloadForCreate: CreateTaskPayload = {
        title: taskRelevantData.title ?? null,
        description: taskRelevantData.description ?? null,
        assigned_to: taskRelevantData.assigned_to ?? null,
        status: taskRelevantData.status,
      };

      syncedTask = await onlineDB.createTask(payloadForCreate);
    } else if (task.sync_status === 'pending_update' && task.id) {
      
      // Para update, solo envia los campos que realmente pueden cambiar.

      const payloadForUpdate: OnlineDBUpdatePayload = {
        title: taskRelevantData.title ?? null,
        description: taskRelevantData.description ?? null,
        assigned_to: taskRelevantData.assigned_to ?? null,
        status: taskRelevantData.status,
        is_deleted: taskRelevantData.is_deleted,
      };

      syncedTask = await onlineDB.updateTask(task.id, payloadForUpdate);
    } else if (task.sync_status === 'pending_delete' && task.id) {
      syncedTask = await onlineDB.softDeleteTask(task.id);
    } else {
      return { success: false, error: `Invalid sync_status or missing ID for task ${task.local_id || task.id}` };
    }
    return { success: true, syncedTask };
  } catch (e) {
    console.error(`syncPendingTaskWithServer error for ${task.local_id || task.id}:`, e);
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, error: error.message };
  }
}

export async function fetchServerUpdates(
  lastSyncTimestamp: string | null
): Promise<{ tasks?: Task[], error?: string }> {
  try {
    const tasks = await onlineDB.getTasksModifiedSince(lastSyncTimestamp);
    return { tasks };
  } catch (e) {
    console.error('fetchServerUpdates error:', e);
    const error = e instanceof Error ? e : new Error(String(e)); // Tipar el error
    return { error: error.message };
  }
}