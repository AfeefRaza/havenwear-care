import { Lock, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, Field, Input } from '../components/ui'
import { useAuth } from '../lib/auth'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9 rounded-xl" />
          <div className="leading-tight">
            <div className="text-[16px] font-semibold tracking-tight">Havenwear Care</div>
            <div className="text-xs text-muted">Customer support desk</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-faint">
          <Lock className="size-3" aria-hidden /> Private internal app · access by invitation only
        </p>
      </div>
    </div>
  )
}

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame>
      <h1 className="text-[17px] font-semibold">Sign in</h1>
      <p className="mt-1 mb-5 text-[13px] text-muted">Use the email and password your admin created for you.</p>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Email">
          <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-xs text-faint">Forgot your password? Ask a Havenwear Care admin to reset it.</p>
    </Frame>
  )
}

export function NoAccess({ error }: { error?: string }) {
  const { session, signOut, reloadMember } = useAuth()
  return (
    <Frame>
      <ShieldAlert className="mb-3 size-6 text-warn" aria-hidden />
      <h1 className="text-[17px] font-semibold">No access yet</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        <span className="font-medium text-text">{session?.user.email}</span> is signed in but is not a member of Havenwear Care. Ask an admin to add
        you under Settings → Team.
      </p>
      {error ? <p className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-xs text-bad">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={reloadMember}>
          Check again
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Frame>
  )
}
