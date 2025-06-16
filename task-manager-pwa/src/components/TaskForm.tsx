// src/components/TaskForm.tsx
'use client';

import { useRef, useState, useTransition, FormEvent } from 'react';
import { createTaskAction, updateTaskAction } from '@/app/actions/taskActions';
import { offlineDB } from '@/lib/indexedDB';
import { 
    CreateTaskFormDataSchema, 
    UpdateTaskFormDataSchema, 
    type Task, 
    type CreateTaskPayload,
    //type UpdateTaskPayload // Puede ser requerido a futuro
} from '@/lib/types';
import { dispatchTasksUpdatedEvent } from './SyncManagerInitializer';
//import { ZodError } from 'zod'; // ZodError se usa para el tipado del error de la server action pero esta generando error
// ,lo aplique de otra manera

interface TaskFormProps {
  teamMembers: string[];
  taskToEdit?: Task;
  onClose?: () => void;
}

// Tipo para el estado de errores, que puede manejar errores generales de formulario
// y errores específicos de campos como los devuelve Zod.
type FormErrors = {
  form?: string[]; // Errores generales del formulario
} & Record<string, string[] | undefined>; // Errores específicos de campos (ej. title: ["error1", "error2"])

export default function TaskForm({ teamMembers, taskToEdit, onClose }: TaskFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FormErrors | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors(null);
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    const rawData = Object.fromEntries(formData);

    const isEditing = !!taskToEdit;
    const schemaToUse = isEditing ? UpdateTaskFormDataSchema : CreateTaskFormDataSchema;
    
    // Si estamos editando, Zod espera el 'id'.
    // El input hidden 'id' ya debería estar en formData si taskToEdit existe.
    // Si no, lo añadimos a rawData para que Zod lo valide.
    if (isEditing && taskToEdit?.id && !rawData.id) {
const rawData = Object.fromEntries(formData) as Record<string, FormDataEntryValue>;
rawData['id'] = taskToEdit.id;
    } else if (isEditing && !taskToEdit?.id) {
        setErrors({ form: ["No se puede editar la tarea: falta el ID original."] });
        return;
    }

    const parseResult = schemaToUse.safeParse(rawData);

    if (!parseResult.success) {
      const flattenedErrors = parseResult.error.flatten();
      const newErrors: FormErrors = { ...flattenedErrors.fieldErrors };
      if (flattenedErrors.formErrors.length > 0) {
        newErrors.form = flattenedErrors.formErrors;
      }
      setErrors(newErrors);
      return;
    }

startTransition(async () => {
  const actionToCall = isEditing
    ? () => updateTaskAction(formData) 
    : () => createTaskAction(formData);

  if (navigator.onLine) {
    try {
      const result = await actionToCall();
      if (result.success) {
        formRef.current?.reset();
        dispatchTasksUpdatedEvent(); // Notifica a otros componentes para que actualicen su vista
        if (onClose) onClose();
      } else {
        console.error("Server Action Error:", result.error);

        // Definimos el tipo de error formateado por Zod
        type ZodFormattedError = {
          fieldErrors: Record<string, string[] | undefined>;
          formErrors: string[];
        };

        if (
          typeof result.error === 'object' &&
          result.error !== null &&
          'fieldErrors' in result.error &&
          'formErrors' in result.error
        ) {
          const zodServerErrors = result.error as ZodFormattedError;
          const newServerErrors: FormErrors = { ...zodServerErrors.fieldErrors };
          if (zodServerErrors.formErrors.length > 0) {
            newServerErrors.form = zodServerErrors.formErrors;
          }
          setErrors(newServerErrors);
        } else {
          setErrors({ form: [String(result.error) || 'Error del servidor desconocido.'] });
        }
      }
    } catch (error) {
      console.warn('Server Action call failed, attempting offline save:', error);
      if (!isEditing && parseResult.success) {
        await saveOffline(parseResult.data as CreateTaskPayload);
      } else {
        setErrors({ form: ["Error de red. La edición offline no está implementada para este formulario."] });
      }
    }
  } else {
    if (!isEditing && parseResult.success) {
      await saveOffline(parseResult.data as CreateTaskPayload);
    } else {
      setErrors({ form: ["Modo offline. La edición offline no está implementada para este formulario."] });
    }
  }
});

  };

  const saveOffline = async (taskData: CreateTaskPayload) => {
    const localTask: Task = {
      title: taskData.title,
      description: taskData.description,
      assigned_to: taskData.assigned_to,
      status: taskData.status,
      // Campos generados localmente
      local_id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sync_status: 'pending_create',
      is_deleted: false,
    };
    await offlineDB.saveTask(localTask);
    formRef.current?.reset();
    dispatchTasksUpdatedEvent();
    if (onClose) onClose();
    alert('Tarea guardada localmente. Se sincronizará cuando haya conexión.');
  };
  
  // La lógica para saveUpdateOffline es un poco más compleja:
  // - Se necesita el `originalTask.local_id`.
  // - Ademas de marcar `sync_status: 'pending_update'`.
  // - y el `offlineDB.saveTask` debería poder manejar la actualización de un registro existente por `local_id`
  // aun que claro esto en la teoria en la parte practica podria funcionar diferente.

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {/* Input hidden para el ID si estamos editando, para que FormData lo incluya y Zod lo valide */}
      {taskToEdit && taskToEdit.id && (
        <input type="hidden" name="id" defaultValue={taskToEdit.id} />
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Título</label>
        <input
          type="text"
          name="title"
          id="title"
          required
          defaultValue={taskToEdit?.title || ''}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 sm:text-sm"
          aria-describedby={errors?.title ? "title-error" : undefined}
        />
        {errors?.title && <p id="title-error" className="text-red-500 text-xs mt-1">{errors.title.join(', ')}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción (Opcional)</label>
        <textarea
          name="description"
          id="description"
          rows={3}
          defaultValue={taskToEdit?.description || ''}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 sm:text-sm"
          aria-describedby={errors?.description ? "description-error" : undefined}
        />
        {errors?.description && <p id="description-error" className="text-red-500 text-xs mt-1">{errors.description.join(', ')}</p>}
      </div>

      <div>
        <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asignar a (Opcional)</label>
        <select 
          name="assigned_to" 
          id="assigned_to" 
          defaultValue={taskToEdit?.assigned_to || ""}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 sm:text-sm"
          aria-describedby={errors?.assigned_to ? "assigned_to-error" : undefined}
        >
          <option value="">Nadie</option>
          {teamMembers.map(member => (
            <option key={member} value={member}>{member}</option>
          ))}
        </select>
        {errors?.assigned_to && <p id="assigned_to-error" className="text-red-500 text-xs mt-1">{errors.assigned_to.join(', ')}</p>}
      </div>
      
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estado</label>
        <select 
          name="status" 
          id="status" 
          required 
          defaultValue={taskToEdit?.status || 'pending'}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 sm:text-sm"
          aria-describedby={errors?.status ? "status-error" : undefined}
        >
          <option value="pending">Pendiente</option>
          <option value="in_progress">En Progreso</option>
          <option value="completed">Completada</option>
        </select>
        {errors?.status && <p id="status-error" className="text-red-500 text-xs mt-1">{errors.status.join(', ')}</p>}
      </div>
      
      {taskToEdit && (
        <div className="pt-2">
            <label htmlFor="is_deleted" className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                    type="checkbox"
                    name="is_deleted"
                    id="is_deleted"
                    defaultChecked={!!taskToEdit.is_deleted}
                    className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 mr-2 bg-white dark:bg-gray-700"
                    aria-describedby={errors?.is_deleted ? "is_deleted-error" : undefined}
                />
                Marcar como eliminada
            </label>
            {errors?.is_deleted && <p id="is_deleted-error" className="text-red-500 text-xs mt-1">{errors.is_deleted.join(', ')}</p>}
        </div>
      )}

      {errors?.form && (
        <div role="alert" className="mt-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Error en el formulario:</p>
            <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400">
                {errors.form.map((err, index) => <li key={index}>{err}</li>)}
            </ul>
        </div>
      )}
      
      <div className="flex justify-end space-x-3 pt-4">
        {onClose && (
            <button 
                type="button" 
                onClick={onClose} 
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
                Cancelar
            </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-opacity"
        >
          {isPending ? (taskToEdit ? 'Actualizando...' : 'Creando...') : (taskToEdit ? 'Guardar Cambios' : 'Crear Tarea')}
        </button>
      </div>
    </form>
  );
}