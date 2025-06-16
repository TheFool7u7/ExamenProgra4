// components/TaskList.tsx
'use client';

import { useState } from 'react';
import TaskItem from './TaskItem';
import { useTasks, dispatchTasksUpdatedEvent } from './SyncManagerInitializer';
import type { Task } from '@/lib/types';
import { syncManager } from '@/lib/syncManager';

interface TaskListProps {
  teamMembers: string[];
}

export default function TaskList({ teamMembers }: TaskListProps) {
  const { tasks, isLoading, refreshTasks } = useTasks();
  const [filterStatus, setFilterStatus] = useState<Task['status'] | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');

  const handleForceSync = async () => {
    if (navigator.onLine) {
      await syncManager.synchronize(true); // true para forceFullSync (por si no sincroniza automaticamente)
      dispatchTasksUpdatedEvent(); // Y bueno volver a cargar la vista sync
    } else {
      alert("Cannot sync: Applicación está offline.");
    }
  };

  const filteredTasks = tasks
    .filter(task => filterStatus === 'all' || task.status === filterStatus)
    .filter(task => filterAssignee === 'all' || task.assigned_to === filterAssignee)
    .filter(task => !task.is_deleted); // es solo para que no se vea el soft-deleted 

  if (isLoading) return <p className="text-center text-gray-500">Cargando tareas...</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 items-center">
        <div>
          <label htmlFor="filterStatus" className="mr-2 text-sm font-medium text-gray-700">Estado:</label>
          <select
            id="filterStatus"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as Task['status'] | 'all')}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completada</option>
          </select>
        </div>
        <div>
          <label htmlFor="filterAssignee" className="mr-2 text-sm font-medium text-gray-700">Asignado a:</label>
          <select
            id="filterAssignee"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">Todos</option>
            {teamMembers.map(member => (
              <option key={member} value={member}>{member}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleForceSync}
          className="ml-auto px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          disabled={!navigator.onLine || syncManager.isSyncing}
        >
          {syncManager.isSyncing ? 'Sincronizando...' : 'Forzar Sincronización'}
        </button>
        <button onClick={refreshTasks}>Refrescar tareas</button>
      </div>

      {filteredTasks.length === 0 ? (
        <p className="text-center text-gray-500">No hay tareas que mostrar.</p>
      ) : (
        <ul className="space-y-4">
          {filteredTasks.map((task) => (
            <TaskItem key={task.local_id || task.id} task={task} teamMembers={teamMembers} />
          ))}
        </ul>
      )}
    </div>
  );
}