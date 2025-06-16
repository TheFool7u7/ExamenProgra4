// lib/supabase/actions.ts
import { createClient } from '@supabase/supabase-js';
import type { Task } from '@/lib/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! 
);

export const onlineDB = {
  async getAllTasks(): Promise<Task[]> {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase getAllTasks error:', error);
      throw error;
    }
    return (data || []).map(task => ({ ...task, sync_status: 'synced' })) as Task[];
  },

  async getTaskById(id: string): Promise<Task | null> {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Supabase getTaskById error:', error);
      throw error;
    }
    return data ? { ...data, sync_status: 'synced' } as Task : null;
  },

  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'sync_status' | 'local_id'>): Promise<Task> {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({ ...taskData, status: taskData.status || 'pending' })
      .select()
      .single();
    if (error) {
      console.error('Supabase createTask error:', error);
      throw error;
    }
    return { ...data, sync_status: 'synced' } as Task;
  },

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'created_at'>>): Promise<Task> {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() }) 
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Supabase updateTask error:', error);
      throw error;
    }
    return { ...data, sync_status: 'synced' } as Task;
  },

  async softDeleteTask(id: string): Promise<Task> {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Supabase softDeleteTask error:', error);
      throw error;
    }
    return { ...data, sync_status: 'synced' } as Task;
  },

  async getTasksModifiedSince(timestamp: string | null): Promise<Task[]> {
    let query = supabaseAdmin
      .from('tasks')
      .select('*');
    
    if (timestamp) {
      query = query.gt('updated_at', timestamp);
    }

    const { data, error } = await query.order('updated_at', { ascending: true });

    if (error) {
      console.error('Supabase getTasksModifiedSince error:', error);
      throw error;
    }
    return (data || []).map(task => ({ ...task, sync_status: 'synced' })) as Task[];
  }
};