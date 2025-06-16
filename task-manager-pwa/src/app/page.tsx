// src/app/page.tsx
import { onlineDB } from '@/lib/supabase/actions';
import TaskList from '@/components/TaskList';
import TaskForm from '@/components/TaskForm';
import SyncManagerInitializer from '@/components/SyncManagerInitializer';
import OfflineIndicator from '@/components/OfflineIndicator';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let initialServerTasks: Task[] = []; 
  let errorFetchingTasks: string | null = null;

  try {
    initialServerTasks = await onlineDB.getAllTasks();
  } catch (error) {
    console.error("HomePage: Error fetching initial tasks from Supabase:", error);
    errorFetchingTasks = "No se pudieron cargar las tareas iniciales desde el servidor. Intentando cargar desde local...";
  }

  const teamMembers: string[] = ["Anthony", "Stiff", "Fabricio", "Juan", "Invitado"];

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 selection:bg-indigo-500 selection:text-white">
      <SyncManagerInitializer initialServerTasks={initialServerTasks} />
      <OfflineIndicator />
      <header className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-800 dark:text-gray-100">
          Gestor de Tareas PWA
        </h1>
        {errorFetchingTasks && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorFetchingTasks}</p>
        )}
      </header>
      
      <main className="space-y-8">
        <section
          aria-labelledby="create-task-heading"
          className="p-4 sm:p-6 bg-white dark:bg-gray-800 shadow-xl rounded-lg ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <h2 id="create-task-heading" className="text-xl sm:text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4 sm:mb-6">
            Nueva Tarea
          </h2>
          <TaskForm teamMembers={teamMembers} />
        </section>

        <section
          aria-labelledby="task-list-heading"
          className="p-4 sm:p-6 bg-white dark:bg-gray-800 shadow-xl rounded-lg ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <h2 id="task-list-heading" className="text-xl sm:text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4 sm:mb-6">
            Lista de Tareas
          </h2>
          <TaskList teamMembers={teamMembers} />
        </section>
      </main>

      <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>© {new Date().getFullYear()} Anthony Villalobos. Todos los derechos reservados MDF</p>
        <p>Aplicación PWA de Gestión de Tareas.</p>
      </footer>
    </div>
  );
}