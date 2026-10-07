import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { CACHE_MAX_AGE, persister, queryClient } from './lib/queryClient'
import { configError } from './lib/supabase'
import Login, { NoAccess } from './screens/Login'

const Inbox = lazy(() => import('./screens/Inbox'))
const NewCase = lazy(() => import('./screens/NewCase'))
const Customers = lazy(() => import('./screens/Customers'))
const CustomerPage = lazy(() => import('./screens/CustomerPage'))
const DeliveryWatch = lazy(() => import('./screens/DeliveryWatch'))
const Insights = lazy(() => import('./screens/Insights'))
const Settings = lazy(() => import('./screens/Settings'))
const Account = lazy(() => import('./screens/Account'))

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-5" />
    </div>
  )
}

function Gate() {
  const { session, loading, membership } = useAuth()
  if (configError) {
    return <div className="mx-auto max-w-lg p-8 text-sm text-bad">{configError}</div>
  }
  if (loading) return <Loading />
  if (!session) return <Login />
  if (membership.status === 'loading') return <Loading />
  if (membership.status !== 'member') return <NoAccess error={membership.status === 'error' ? membership.message : undefined} />
  return (
    <HashRouter>
      <AppShell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/inbox/mine" replace />} />
            <Route path="/inbox/:view" element={<Inbox />} />
            <Route path="/inbox/:view/:caseId" element={<Inbox />} />
            <Route path="/new" element={<NewCase />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:phoneKey" element={<CustomerPage />} />
            <Route path="/watch" element={<DeliveryWatch />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/settings" element={<Navigate to="/settings/types" replace />} />
            <Route path="/settings/:tab" element={<Settings />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Navigate to="/inbox/mine" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  )
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: __APP_VERSION__,
        // Never persist live-courier calls or search results; they are cheap to refetch.
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === 'success' && !['track', 'search', 'lookup'].includes(String(q.queryKey[0])),
        },
      }}
    >
      <AuthProvider>
        <Gate />
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'text-[13px]' }} />
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
