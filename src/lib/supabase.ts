import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configError: string | null =
  !url || !anonKey
    ? 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local (local) or add them as GitHub Actions secrets (deploy).'
    : null

/** Own storage key so this app's session never collides with Hisab Kitab's on the same origin. */
export const AUTH_STORAGE_KEY = 'hw-care-auth'

/**
 * Only the public publishable/anon key is ever used in the browser. Every table is
 * protected by Row Level Security; Shopify and courier credentials stay server-side.
 */
export const supabase: SupabaseClient = createClient(url ?? 'http://invalid.localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: AUTH_STORAGE_KEY,
  },
})

/** Turns a PostgREST / Auth / Edge error into a readable message. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong'
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const e = err as { message: string; code?: string }
    if (e.code === '23505') return 'That already exists (duplicate).'
    if (e.code === '23503') return 'It is still in use elsewhere, so it cannot be removed.'
    if (e.code === '42501' || /row-level security/i.test(e.message)) return 'You do not have permission to do that.'
    if (/Failed to fetch|NetworkError/i.test(e.message)) return 'Network problem — check your connection and try again.'
    return e.message
  }
  return 'Something went wrong'
}

export function assertOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline — changes cannot be saved right now.')
  }
}

/** Calls an RPC and unwraps { data, error }. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(errorMessage(error))
  return data as T
}

/** Calls one of this app's Edge Functions with the user's session. */
export async function edge<T>(fn: 'crm-live' | 'crm-admin', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    // FunctionsHttpError carries the JSON body with our { error } message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null)
      if (payload?.error) throw new Error(String(payload.error))
    }
    throw new Error(errorMessage(error))
  }
  return data as T
}
