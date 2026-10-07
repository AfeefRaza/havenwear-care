import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Segmented } from '../components/ui'
import { ROLE_LABEL } from '../domain/labels'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'

export default function Account() {
  const { member, session, signOut } = useAuth()
  const [theme, setTheme] = useState<ThemePref>(getThemePref())
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 10 || !/\d/.test(pw) || !/[A-Za-z]/.test(pw)) return toast.error('Use at least 10 characters with letters and numbers')
    if (pw !== pw2) return toast.error('Passwords do not match')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) toast.error(errorMessage(error))
    else {
      toast.success('Password changed')
      setPw('')
      setPw2('')
    }
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 lg:p-6">
        <h1 className="text-[19px] font-semibold tracking-tight">Account & preferences</h1>
        <Card title="You">
          <div className="space-y-3 p-4 text-[13px]">
            <p>
              <b>{session?.user.email}</b> · {member ? ROLE_LABEL[member.role] : ''}
            </p>
            <p className="text-xs text-muted">{member?.full_name} — your name and role are managed by an admin under Settings → Team.</p>
          </div>
        </Card>
        <Card title="Appearance">
          <div className="p-4">
            <Segmented
              value={theme}
              onChange={(v) => {
                setTheme(v)
                setThemePref(v)
              }}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </Card>
        <Card title="Change password">
          <form onSubmit={changePassword} className="space-y-3 p-4">
            <Field label="New password" hint="At least 10 characters, letters and numbers.">
              <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label="Repeat new password">
              <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" loading={busy}>
              Change password
            </Button>
          </form>
        </Card>
        <Card title="Sessions">
          <div className="flex flex-wrap gap-2 p-4">
            <Button onClick={() => void signOut()}>Sign out of this device</Button>
            <Button variant="ghost" onClick={() => void signOut(true)}>
              Sign out everywhere
            </Button>
          </div>
          <p className="px-4 pb-4 text-xs text-faint">Signing out also clears the data cached on this device.</p>
        </Card>
        <p className="text-center text-xs text-faint">Havenwear Care v{__APP_VERSION__}</p>
      </div>
    </div>
  )
}
