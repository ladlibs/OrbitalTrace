import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let instance: SupabaseClient | null = null

// Singleton: every caller gets the same client (one auth listener / one session store)
export function createClient(): SupabaseClient {
  if (!instance) {
    instance = createSupabaseClient(
      import.meta.env.VITE_SUPABASE_URL || '',
      import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    )
  }
  return instance
}
