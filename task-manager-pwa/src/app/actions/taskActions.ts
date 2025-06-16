// app/actions/taskActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { onlineDB } from '@/lib/supabase/actions';
import type { ZodError } from 'zod';

interface ActionResult<T = null> {
  success: boolean;
  data?: T;
  error?: ReturnType<ZodError['flatten']> | string;
}

import {
  type Task,
  CreateTaskFormDataSchema,
  UpdateTaskFormDataSchema,
} from '@/lib/types';


export async function createTaskAction(formData: FormData): Promise<ActionResult<Task>> {
  try {
    const rawData = Object.fromEntries(formData);
    const parseResult = CreateTaskFormDataSchema.safeParse(rawData);

    if (!parseResult.success) {
      // Devolver el objeto de error aplanado completo de Zod
      return { success: false, error: parseResult.error.flatten() };
    }

    // parseResult.data ya tiene los tipos correctos después de la transformación de Zod
    const taskDataToCreate = parseResult.data;

    const newTask = await onlineDB.createTask(taskDataToCreate);
    revalidatePath('/');
    return { success: true, data: newTask };

  } catch (e) {
    // Tipar el error capturado
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('createTaskAction error:', error.message, e); // Loguear el error original también por si acaso

    const errorMessage = error.message.includes('duplicate key value') // Comprobar si es un error de Supabase conocido
      ? 'Ya existe una tarea con datos similares (ej. título duplicado si hay restricción unique).'
      : error.message || 'Error desconocido al crear la tarea.';
    return { success: false, error: errorMessage }; // Devolver como string si es un error no-Zod
  }
}

export async function updateTaskAction(formData: FormData): Promise<ActionResult<Task>> {
  try {
    const rawData = Object.fromEntries(formData);
    // UpdateTaskFormDataSchema espera 'id' si está en rawData (lo cual debería ser por el input hidden)
    const parseResult = UpdateTaskFormDataSchema.safeParse(rawData);

    if (!parseResult.success) {
      // Devolver el objeto de error aplanado completo de Zod
      return { success: false, error: parseResult.error.flatten() };
    }

    // 'id' está garantizado aquí por el esquema si el parseo fue exitoso.
    const { id, ...updatesFromZod } = parseResult.data;

    // Preparamos el objeto final para la BD.
    // Filtrar campos 'undefined' porque Zod los incluye si son opcionales y no están en FormData.
    // La base de datos (o la función onlineDB.updateTask) usualmente ignora campos undefined.
    const finalUpdates: Partial<Omit<Task, 'id' | 'created_at' | 'local_id' | 'sync_status'>> = {};
    let hasUpdates = false;

    for (const key in updatesFromZod) {
      if (Object.prototype.hasOwnProperty.call(updatesFromZod, key)) {
        // Tipar 'value' explícitamente o asegurarse de que el tipo de 'updatesFromZod[key]' sea correcto.
        const value = (updatesFromZod as Record<string, unknown>)[key];
        if (value !== undefined) {
          (finalUpdates as Record<string, unknown>)[key] = value;
          hasUpdates = true;
        }
      }
    }

    if (!hasUpdates) {
      // Si no hay campos válidos para actualizar (ej. todos eran undefined o solo se envió el id)
      const currentTask = await onlineDB.getTaskById(id); // id está definido aquí por aquello
      return {
        success: true,
        data: currentTask || undefined,
        error: "No se proporcionaron campos válidos para actualizar."
      };
    }

    const updatedTask = await onlineDB.updateTask(id, finalUpdates);
    revalidatePath('/');
    if (updatedTask && updatedTask.id) {
      revalidatePath(`/task/${updatedTask.id}`);
    }
    return { success: true, data: updatedTask };

  } catch (e) {
    // Tipar el error capturado
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('updateTaskAction error:', error.message, e);

    const errorMessage = error.message || 'Error desconocido al actualizar la tarea.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  if (!taskId) {
    return { success: false, error: 'Task ID es requerido para la eliminación.' };
  }
  try {
    await onlineDB.softDeleteTask(taskId); //softDeleteTask actualiza is_deleted y updated_at
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    // Tipar el error capturado
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('deleteTaskAction error:', error.message, e);
    return { success: false, error: error.message || 'Error desconocido al eliminar la tarea.' };
  }
}