import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

export const CACHE_KEY = 'hw-care-query-cache'
export const CACHE_MAX_AGE = 3 * 24 * 60 * 60 * 1000 // persisted data auto-expires after 3 days

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE,
      retry: (count, err) => count < 2 && !(err instanceof Error && /permission|not allowed|Invalid/i.test(err.message)),
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'always', retry: false },
  },
})

/**
 * The cache lives in IndexedDB on this device only, so the app opens instantly with the
 * last data. It is wiped on sign-out and when a different user signs in.
 */
export const persister = createAsyncStoragePersister({
  key: CACHE_KEY,
  storage: {
    getItem: async (k) => (await get<string>(k)) ?? null,
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  throttleTime: 2000,
})

export async function clearLocalCache(): Promise<void> {
  queryClient.clear()
  try {
    await del(CACHE_KEY)
  } catch {
    /* IndexedDB unavailable (private mode) — nothing to clear */
  }
}
