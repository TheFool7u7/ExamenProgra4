// components/TaskItem.tsx
'use client';

import { useState, useTransition } from 'react';
import type { Task } from '@/lib/types';
import { updateTaskAction, deleteTaskAction } from '@/app/actions/taskActions';
import { offlineDB } from '@/lib/indexedDB';
import { dispatchTasksUpdatedEvent } from './SyncManagerInitializer';
import TaskForm from './TaskForm';

interface TaskItemProps {
  task: Task;
  teamMembers: string[];
}

export default function TaskItem({ task, teamMembers }: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-400';
      case 'in_progress': return 'bg-blue-400';
      case 'completed': return 'bg-green-400';
      default: return 'bg-gray-400';
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Seguro que quieres eliminar la tarea "${task.title}"?`)) return;

    startTransition(async () => {
      if (navigator.onLine && task.id) {
        try {
          const result = await deleteTaskAction(task.id);
          if (!result.success) throw new Error(result.error as string || 'Error deleting on server');

        } catch (error) {
          console.warn('Server delete failed, marking for offline delete:', error);
          await markForOfflineDelete();
        }
      } else {
        await markForOfflineDelete();
      }
      dispatchTasksUpdatedEvent();
    });
  };

  const markForOfflineDelete = async () => {
    if (task.id) {
      const updatedTask = { ...task, is_deleted: true, sync_status: 'pending_delete' as const, updated_at: new Date().toISOString() };
      await offlineDB.saveTask(updatedTask);
    } else if (task.local_id) {
      await offlineDB.deleteTask(task.local_id);
    }
  };

  const handleStatusChange = async (newStatus: Task['status']) => {
    startTransition(async () => {
      const updatedFields = { status: newStatus, updated_at: new Date().toISOString() };
      if (navigator.onLine && task.id) {
        const formData = new FormData();
        formData.append('id', task.id);
        formData.append('status', newStatus);
        // formData.append('updated_at', updatedFields.updated_at); esta dando error, lo solucione de una manera toda XD

        try {
          const result = await updateTaskAction(formData);
          if (!result.success) throw new Error(String(result.error) || 'Error updating on server');
        } catch (error) {
          console.warn('Server update failed, saving status change offline:', error);
          await saveUpdateOffline(updatedFields);
        }
      } else {
        await saveUpdateOffline(updatedFields);
      }
      dispatchTasksUpdatedEvent();
    });
  };

  const saveUpdateOffline = async (updates: Partial<Task>) => {
    const updatedTask = {
      ...task,
      ...updates,
      sync_status: task.id ? 'pending_update' as const : 'pending_create' as const,
    };
    await offlineDB.saveTask(updatedTask);
  };


  if (isEditing) {
    return (
      <li className="p-4 bg-gray-50 shadow rounded-lg">
        <TaskForm
          taskToEdit={task}
          teamMembers={teamMembers}
          onClose={() => setIsEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={`p-4 bg-white shadow rounded-lg ${task.sync_status !== 'synced' ? 'border-l-4 border-orange-400' : ''}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-semibold text-indigo-700">{task.title}</h3>
          {task.description && <p className="text-sm text-gray-600 mt-1">{task.description}</p>}
          <div className="mt-2 text-xs text-gray-500">
            <span>Asignado a: {task.assigned_to || 'N/A'}</span>
            <span className="mx-2">|</span>
            <span>Creado: {new Date(task.created_at || Date.now()).toLocaleDateString()}</span>
            {task.sync_status !== 'synced' && <span className="ml-2 text-orange-600 font-bold">({task.sync_status})</span>}
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as Task['status'])}
            disabled={isPending}
            className={`px-2 py-1 text-xs text-white rounded ${getStatusColor(task.status)}`}
          >
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completada</option>
          </select>
          <div className="flex space-x-2 mt-2">
            <button
              onClick={() => setIsEditing(true)}
              disabled={isPending}
              className="px-3 py-1 text-xs font-medium text-indigo-600 bg-indigo-100 rounded hover:bg-indigo-200"
            >
              Editar
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="px-3 py-1 text-xs font-medium text-red-600 bg-red-100 rounded hover:bg-red-200"
            >
              {isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}