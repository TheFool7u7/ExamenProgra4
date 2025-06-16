// lib/indexedDB.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Task } from './types';

const DB_NAME = 'task-manager-pwa-db';
const TASKS_STORE_NAME = 'tasks' as const;
const DB_VERSION = 1;

type IndexableId = string;
// Para un índice, es mejor si siempre es un valor definido cuando está presente.
// Si sync_status realmente puede ser undefined en un objeto Task y lo indexamos,
// idb lo maneja, pero las consultas podrían ser más complejas.
// Dado .default('synced'), usualmente debería estar definido.
type IndexableSyncStatus = NonNullable<Task['sync_status']>; // sync_status no debería ser nulo si es indexable
type IndexableUpdatedAt = string;

// Define el esquema de la base de datos para tipado fuerte con idb.
interface TaskAppDB extends DBSchema {
  [TASKS_STORE_NAME]: {
    key: string;
    value: Task;
    indexes: { // Definición de los índices
      'id': IndexableId; // Índice para el ID del servidor
      'sync_status': IndexableSyncStatus; // Índice para el estado de sincronización
      'updated_at': IndexableUpdatedAt; // Índice para la fecha de última actualización
    };
  };
}

// Función para obtener la instancia de la base de datos.
async function getDB(): Promise<IDBPDatabase<TaskAppDB>> {
  return openDB<TaskAppDB>(DB_NAME, DB_VERSION, {
    // La función upgrade se ejecuta si la versión de la BD en el navegador es menor que DB_VERSION.
    upgrade(db, oldVersion, newVersion) { // Quité 'transaction' ya que no se usaba directamente y causaba error de tipo.
      console.log(`Actualizando BD de versión ${oldVersion} a ${newVersion}`);
      // Crear el almacén de objetos 'tasks' si no existe.
      if (!db.objectStoreNames.contains(TASKS_STORE_NAME)) {
        const store = db.createObjectStore(TASKS_STORE_NAME, {
          keyPath: 'local_id', // 'local_id' será la clave primaria del almacén.
        });
        // Crear índices para búsquedas eficientes.
        store.createIndex('id', 'id', { unique: true });
        store.createIndex('sync_status', 'sync_status');
        store.createIndex('updated_at', 'updated_at');
      }
      // Aquí se pueden agregar migraciones para futuras versiones aqui es donde se supone que se usa tansaction, pero lo quite:
      // if (oldVersion < 2) {
      //   const taskStore = transaction.objectStore(TASKS_STORE_NAME);
      //   if (!taskStore.indexNames.contains('nuevo_indice')) {
      //      taskStore.createIndex('nuevo_indice', 'propiedad_en_task');
      //   }
      // }
    },
  });
}

// Objeto que exporta los métodos para interactuar con la base de datos offline.
export const offlineDB = {
  // Obtiene todas las tareas no eliminadas (lógicamente) del servidor.
  async getAllTasks(): Promise<Task[]> {
    const db = await getDB();
    const tx = db.transaction(TASKS_STORE_NAME, 'readonly');
    const store = tx.objectStore(TASKS_STORE_NAME);
    const tasks = await store.getAll(); // Obtiene todos los objetos del almacén.
    await tx.done; // Finaliza la transacción.
    // Filtra las tareas que están marcadas como eliminadas Y ya sincronizadas (es decir, eliminadas en el servidor). Esta es la trampa
    return tasks.filter(task => !(task.is_deleted && task.sync_status === 'synced'));
  },


  async getTaskByLocalId(local_id: string): Promise<Task | undefined> {
    if (!local_id) return undefined;
    const db = await getDB();
    return db.get(TASKS_STORE_NAME, local_id);
  },

  // Obtiene una tarea específica por su ID de servidor.
  async getTaskByServerId(id: string): Promise<Task | undefined> {
    if (!id) return undefined;
    const db = await getDB();
    return db.getFromIndex(TASKS_STORE_NAME, 'id', id);
  },

  // Guarda (inserta o actualiza) una tarea. Devuelve el local_id utilizado.
  async saveTask(taskInput: Task): Promise<string> { // El tipo de retorno es string.si usaba id, undefined o unknow daba errores
    const db = await getDB();
    // Clonar la entrada para evitar mutar el objeto original directamente si se pasa por referencia. Senti que es mas seguro
    const taskToSave: Task = { ...taskInput };


    if (!taskToSave.local_id || taskToSave.local_id.trim() === '') {
      const baseForLocalId = (taskToSave.id && taskToSave.id.trim() !== '')
        ? taskToSave.id  // Usar ID de servidor si existe
        : `new_${Date.now()}`; // Sino, base de tiempo
      taskToSave.local_id = `local_${baseForLocalId}_${Math.random().toString(36).substring(2, 9)}`;
    }
    // En este punto, taskToSave.local_id está garantizado que es un string.

    // 2. Consolidar local_id si ya existe una tarea con el mismo server_id.
    // Este paso asegura que si una tarea (identificada por su 'id' de servidor) ya existe
    // en IndexedDB, usamos su 'local_id' existente para prevenir duplicados lógicos
    // o entradas con local_ids flotantes para la misma entidad del servidor.
    if (taskToSave.id) { // Solo si la tarea tiene un ID de servidor.
      const existingByServerId = await db.getFromIndex(TASKS_STORE_NAME, 'id', taskToSave.id);
      if (existingByServerId && existingByServerId.local_id && existingByServerId.local_id !== taskToSave.local_id) {
        console.warn(`saveTask: Consolidando local_id para ID de servidor ${taskToSave.id}. local_id antiguo: ${taskToSave.local_id}, usando existente: ${existingByServerId.local_id}`);
        taskToSave.local_id = existingByServerId.local_id; // Reutilizar el local_id existente.
      }
    }

    // 3. Asegurar timestamps y sync_status para nuevas tareas locales o actualizaciones.
    if (!taskToSave.id && taskToSave.sync_status !== 'pending_create') {
      // Si es una tarea nueva (sin ID de servidor) y no está ya marcada para creación.
      taskToSave.sync_status = 'pending_create';
      if (!taskToSave.created_at) {
        taskToSave.created_at = new Date().toISOString();
      }
    }
    // Todas las operaciones de guardado deberían actualizar 'updated_at'.
    taskToSave.updated_at = new Date().toISOString();

    // Asegurar que 'created_at' exista, usando 'updated_at' como defecto si es necesario.
    if (!taskToSave.created_at) {
      taskToSave.created_at = taskToSave.updated_at;
    }
    // Asegurar que 'sync_status' tenga un valor por defecto si no está establecido
    // (el default de Zod debería manejar esto para objetos nuevos desde el esquema)segun la logica, pero no se si lo hace
    // al menos no da error.
    if (!taskToSave.sync_status) {
      taskToSave.sync_status = 'synced';
    }

    await db.put(TASKS_STORE_NAME, taskToSave);

    return taskToSave.local_id!;
  },

  // Guarda múltiples tareas (usualmente del servidor).
  async bulkSaveTasks(tasks: Task[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(TASKS_STORE_NAME, 'readwrite'); // Transacción de lectura/escritura.
    const store = tx.objectStore(TASKS_STORE_NAME);

    for (const task of tasks) {
      const taskToSave = { ...task }; // Clonar para evitar mutaciones inesperadas.

      // Asegurar que local_id esté asignado.
      if (!taskToSave.local_id) {
        taskToSave.local_id = taskToSave.id || `local_new_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
      // taskToSave.local_id es ahora un string.

      // Buscar si ya existe una tarea con el mismo ID de servidor.
      const existingTaskByServerId = taskToSave.id
        ? await store.index('id').get(taskToSave.id)
        : undefined;

      // Si existe y tiene un local_id diferente, consolidar usando el local_id existente.
      if (existingTaskByServerId && existingTaskByServerId.local_id && existingTaskByServerId.local_id !== taskToSave.local_id) {
        console.log(`bulkSaveTasks: Consolidando local_id para ID de servidor ${taskToSave.id}. Usando local_id existente: ${existingTaskByServerId.local_id} en lugar de ${taskToSave.local_id}`);
        taskToSave.local_id = existingTaskByServerId.local_id;
      }

      // Asegurar timestamps.
      if (!taskToSave.updated_at) {
        taskToSave.updated_at = new Date().toISOString();
      }
      if (!taskToSave.created_at) {
        taskToSave.created_at = taskToSave.updated_at;
      }
      // Asegurar sync_status para tareas del servidor.
      if (taskToSave.id && !taskToSave.sync_status) {
        taskToSave.sync_status = 'synced';
      }
      if (!taskToSave.sync_status) { 
        taskToSave.sync_status = 'synced';
      }

      await store.put(taskToSave); // Guardar la tarea procesada.
    }
    await tx.done; // Finalizar la transacción.
  },

  // Elimina una tarea de IndexedDB por su local_id (eliminación física local).
  async deleteTask(local_id: string): Promise<void> {
    const db = await getDB();
    await db.delete(TASKS_STORE_NAME, local_id);
  },

  // Obtiene todas las tareas pendientes de sincronización (crear, actualizar, eliminar).
  async getPendingChanges(): Promise<Task[]> {
    const db = await getDB();
    const tx = db.transaction(TASKS_STORE_NAME, 'readonly');
    const syncStatusIndex = tx.store.index('sync_status');

    // Obtener tareas para cada estado pendiente usando el índice.
    const pendingCreates = await syncStatusIndex.getAll('pending_create');
    const pendingUpdates = await syncStatusIndex.getAll('pending_update');
    const pendingDeletes = await syncStatusIndex.getAll('pending_delete');

    await tx.done;
    return [...pendingCreates, ...pendingUpdates, ...pendingDeletes]; // Combinar y devolver.
  },

  // Actualiza una tarea local después de que ha sido sincronizada exitosamente con el servidor.
  async updateTaskAfterSync(originalLocalId: string, serverTaskData: Task): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(TASKS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(TASKS_STORE_NAME);

    // Obtener la tarea local que se intentó sincronizar.
    const taskThatWasSynced = await store.get(originalLocalId);

    // Preparar la tarea actualizada basada en la respuesta del servidor.
    // El local_id debería, en principio, ser originalLocalId, en principio pero siendo sincero no se si lo hace
    let taskMergedWithServerData: Task = {
      ...(taskThatWasSynced || {} as Partial<Task>), 
      ...serverTaskData,                              
      local_id: originalLocalId,                      
      sync_status: 'synced',                         
      updated_at: serverTaskData.updated_at || new Date().toISOString(), 
    };

    // Asegurar created_at (si el servidor no lo devolvió pero existía localmente).
    if (!taskMergedWithServerData.created_at && taskThatWasSynced?.created_at) {
      taskMergedWithServerData.created_at = taskThatWasSynced.created_at;
    } else if (!taskMergedWithServerData.created_at) {
      taskMergedWithServerData.created_at = taskMergedWithServerData.updated_at;
    }
    // Asegurar que local_id sea un string después de la fusión. serverTaskData.local_id podría ser undefined.
    taskMergedWithServerData.local_id = originalLocalId;


    // Lógica de conflicto/consolidación:
    // Si el ID del servidor de serverTaskData ya existe en IndexedDB
    // pero con un local_id DIFERENTE a originalLocalId, tenemos un conflicto de duplicación.
    // En ese caso, actualizaremos la entrada con el local_id "conflictivo" y eliminaremos
    // la entrada de originalLocalId (porque ahora está representada por la otra).
    let finalLocalIdToUse = originalLocalId;
    let oldLocalIdToDelete: string | null = null;

    if (serverTaskData.id) { // Solo si hay ID de servidor podemos buscar conflictos.
      const conflict = await store.index('id').get(serverTaskData.id);
      if (conflict && conflict.local_id && conflict.local_id !== originalLocalId) {
        // Conflicto: El ID del servidor ya existe con un local_id diferente.
        // en caso de que la entrada 'conflict.local_id' es la canónica.
        // Por lo tanto, actualizaremos esa y marcaremos 'originalLocalId' para eliminación. 
        // En principio, esto lo encontre en internet y lo adapte
        console.warn(`updateTaskAfterSync: ID de servidor ${serverTaskData.id} encontrado con local_id ${conflict.local_id}, pero la sincronización actual fue para ${originalLocalId}. Consolidando.`);
        finalLocalIdToUse = conflict.local_id; // El local_id final será el del conflicto.
        oldLocalIdToDelete = originalLocalId;   // Marcar el original para ser borrado.
        taskMergedWithServerData.local_id = finalLocalIdToUse; // Actualizar local_id en el objeto a guardar.
      }
    }
    // taskMergedWithServerData.local_id está ahora garantizado que es un string (ya sea originalLocalId o conflict.local_id).

    // Guardar la tarea fusionada y posiblemente consolidada.
    // 'put' actualizará si finalLocalIdToUse existe, o insertará si no
    // (aunque si vino de un conflicto, debería existir).
    await store.put(taskMergedWithServerData);

    // Si consolidamos y originalLocalId es diferente del finalLocalIdToUse, eliminar el antiguo.
    if (oldLocalIdToDelete && oldLocalIdToDelete !== finalLocalIdToUse) {
      console.log(`updateTaskAfterSync: Eliminando tarea local redundante con local_id: ${oldLocalIdToDelete}`);
      await store.delete(oldLocalIdToDelete);
    }

    await tx.done; // Finalizar la transacción.
  },

  // Actualiza el estado de sincronización de una tarea local y opcionalmente su ID de servidor y updated_at.
  async updateLocalTaskStatus(
    local_id_param: string,
    sync_status: NonNullable<Task['sync_status']>, // El nuevo estado de sincronización.
    serverData?: Partial<Pick<Task, 'id' | 'updated_at'>> // Datos opcionales del servidor post-operación.
  ) {
    const db = await getDB();
    const task = await db.get(TASKS_STORE_NAME, local_id_param); // Obtener la tarea por su local_id.
    if (task) { // Si la tarea existe.
      // Construir el objeto a guardar, asegurando que 'local_id' sea el string definido.
      const taskToSave: Task = {
        ...task, // Copiar la tarea existente.
        local_id: local_id_param, // Usar explícitamente el local_id del parámetro.
        sync_status: sync_status, // Establecer el nuevo estado de sincronización.
        updated_at: serverData?.updated_at || new Date().toISOString(), // Actualizar timestamp.
      };
      if (serverData?.id) { // Si el servidor devolvió un ID (ej. después de un 'pending_create').
        taskToSave.id = serverData.id;
      }
      // taskToSave.local_id está ahora definitivamente un string.
      await db.put(TASKS_STORE_NAME, taskToSave); // Guardar los cambios.
    }
  }
};
//Siento que esta fue la parte mas complicada y que ocupaba mas logica