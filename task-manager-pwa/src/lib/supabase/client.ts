// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'; 
//import { createClient } from '@supabase/supabase-js'; no se usa literalmente, pero creo que en edición si se podria usar


export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}