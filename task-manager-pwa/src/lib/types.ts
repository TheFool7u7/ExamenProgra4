// lib/types.ts
import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  local_id: z.string().optional(),
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres').max(100),
  description: z.string().max(500).optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  is_deleted: z.boolean().default(false).optional(),
  created_at: z.string().datetime({ message: "Fecha de creación inválida" }).optional(),
  updated_at: z.string().datetime({ message: "Fecha de actualización inválida" }).optional(),
  sync_status: z.enum(['synced', 'pending_create', 'pending_update', 'pending_delete'])
    .optional()
    .default('synced'),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskFormDataSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres').max(100),
  description: z.string().max(500).optional().transform(val => (val === '' || val === undefined) ? null : val),
  assigned_to: z.string().optional().transform(val => (val === '' || val === undefined) ? null : val),
  status: z.enum(['pending', 'in_progress', 'completed']),
});
export type CreateTaskPayload = z.infer<typeof CreateTaskFormDataSchema>;

export const UpdateTaskFormDataSchema = z.object({
  id: z.string().uuid({ message: "ID de tarea inválido para actualización" }),
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional().transform(val => (val === '' || val === undefined) ? null : val),
  assigned_to: z.string().optional().transform(val => (val === '' || val === undefined) ? null : val),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  is_deleted: z.preprocess(
    (val) => {
      if (typeof val === 'string') return val === 'true' || val === 'on';
      if (typeof val === 'boolean') return val;
      return undefined; // Si no viene, Zod lo manejará como undefined (y .optional() lo permite)
    },
    z.boolean().optional() // Permitir que sea opcional, si no viene, no se actualiza
  ),
});
export type UpdateTaskPayload = z.infer<typeof UpdateTaskFormDataSchema>;