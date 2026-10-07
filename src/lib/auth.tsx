import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Member, Role } from '../domain/types'
import { clearLocalCache } from './queryClient'
import { supabase } from './supabase'

type MemberState = { status: 'loading' } | { status: 'none' } | { status: 'member'; member: Member } | { status: 'error'; message: string }

interface AuthState {
  session: Session | null
  loading: boolean
  membership: MemberState
  member: Member | null
  can: (role: Role) => boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: (everywhere?: boolean) => Promise<void>
  reloadMember: () => void
}

const RANK: Record<Role, number> = { viewer: 1, agent: 2, admin: 3 }
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<MemberState>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let lastUser: string | null = null
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      lastUser = data.session?.user.id ?? null
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const uid = s?.user.id ?? null
      // A different user on this device must never see the previous user's cached data.
      if (uid !== lastUser) void clearLocalCache()
      lastUser = uid
      setSession(s)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    // RLS only returns rows to active members, so "no row" means "no access".
    void (async () => {
      const { data, error } = await supabase.from('crm_members').select('*').eq('user_id', uid).maybeSingle()
      if (cancelled) return
      if (error) setMembership({ status: 'error', message: error.message })
      else if (!data || !data.active) setMembership({ status: 'none' })
      else setMembership({ status: 'member', member: data as Member })
    })()
    return () => {
      cancelled = true
    }
  }, [uid, nonce])

  const member = membership.status === 'member' ? membership.member : null
  const reloadMember = useCallback(() => {
    setMembership({ status: 'loading' })
    setNonce((n) => n + 1)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      membership: uid ? membership : { status: 'none' },
      member,
      can: (role) => !!member && RANK[member.role] >= RANK[role],
      async signIn(email, password) {
        setMembership({ status: 'loading' })
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
      },
      async signOut(everywhere = false) {
        await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' })
        await clearLocalCache()
        setMembership({ status: 'loading' })
      },
      reloadMember,
    }),
    [session, loading, membership, member, uid, reloadMember],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
