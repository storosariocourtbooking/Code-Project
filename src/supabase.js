import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim()

export const isSupabaseConfigured = Boolean(url && key && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url))
export const supabase = isSupabaseConfigured ? createClient(url, key) : null
