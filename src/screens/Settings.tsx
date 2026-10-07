import { FileSpreadsheet, KeyRound, Plus, Upload } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Switch, Textarea } from '../components/ui'
import {
  useCreateMember,
  useImportCases,
  useSaveRow,
  useSaveSetting,
  useSetPassword,
  useUpdateMember,
} from '../data/mutations'
import { qk, useMembers, useSettings, useTemplates, useTypes } from '../data/queries'
import { planSheetImport, type ImportPlan } from '../domain/importSheet'
import { ROLE_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '../domain/labels'
import { renderTemplate, TEMPLATE_VARIABLES } from '../domain/templates'
import type { ComplaintType, Member, Role, Settings as SettingsData, Template } from '../domain/types'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/supabase'
import { cn } from '../lib/utils'

const TABS = [
  { id: 'types', label: 'Complaint types' },
  { id: 'templates', label: 'Reply templates' },
  { id: 'team', label: 'Team' },
  { id: 'automation', label: 'Automation' },
  { id: 'import', label: 'Import sheet' },
]

export default function Settings() {
  const { tab = 'types' } = useParams()
  const { can } = useAuth()
  if (!can('admin')) return <EmptyState title="Admins only">Ask an admin to change settings.</EmptyState>
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 lg:p-6">
        <h1 className="mb-4 text-[19px] font-semibold tracking-tight">Settings</h1>
        <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Settings sections">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={`/settings/${t.id}`}
              className={({ isActive }) =>
                cn('-mb-px border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap', isActive ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text')
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        {tab === 'types' ? <TypesTab /> : tab === 'templates' ? <TemplatesTab /> : tab === 'team' ? <TeamTab /> : tab === 'automation' ? <AutomationTab /> : <ImportTab />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- types
function TypesTab() {
  const types = useTypes().data ?? []
  const save = useSaveRow('crm_complaint_types', qk.types)
  const [edit, setEdit] = useState<Partial<ComplaintType> | null>(null)
  return (
    <Card
      title="Complaint types"
      action={
        <Button size="sm" onClick={() => setEdit({ label: '', category: 'product', default_severity: 'non_serious', sla_hours: 48, follow_up_days: 2, keywords: [], sort: 500, active: true })}>
          <Plus className="size-3.5" /> Add type
        </Button>
      }
    >
      <p className="border-b border-border px-4 py-2.5 text-xs text-muted">
        Keywords (English or Roman Urdu) power the automatic type suggestion. SLA sets the response deadline; follow-up sets the first reminder. Retire types instead of deleting them so history stays intact.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-4 py-2 text-left font-medium">Default</th>
              <th className="px-4 py-2 text-right font-medium">SLA</th>
              <th className="px-4 py-2 text-right font-medium">Follow-up</th>
              <th className="px-4 py-2 text-left font-medium">Keywords</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {types.map((t) => (
              <tr key={t.id} className={cn(!t.active && 'opacity-50')}>
                <td className="px-4 py-2 font-medium">
                  {t.label} {!t.active ? <Badge>Retired</Badge> : null}
                </td>
                <td className="px-4 py-2">{t.default_severity === 'serious' ? <Badge tone="bad">Serious</Badge> : <span className="text-muted">Non-serious</span>}</td>
                <td className="tabular px-4 py-2 text-right">{t.sla_hours}h</td>
                <td className="tabular px-4 py-2 text-right">{t.follow_up_days}d</td>
                <td className="max-w-72 truncate px-4 py-2 text-xs text-muted">{t.keywords.join(', ') || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="xs" variant="ghost" onClick={() => setEdit(t)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit?.id ? `Edit “${edit.label}”` : 'New complaint type'}
        footer={
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!edit?.label?.trim()}
            onClick={() => edit && save.mutate({ ...edit, label: edit.label?.trim() }, { onSuccess: () => setEdit(null) })}
          >
            Save
          </Button>
        }
      >
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label" className="sm:col-span-2">
              <Input value={edit.label ?? ''} onChange={(e) => setEdit({ ...edit, label: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Category">
              <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as ComplaintType['category'] })}>
                <option value="delivery">Delivery</option>
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Default severity">
              <Select value={edit.default_severity} onChange={(e) => setEdit({ ...edit, default_severity: e.target.value as ComplaintType['default_severity'] })}>
                <option value="non_serious">{SEVERITY_LABEL.non_serious}</option>
                <option value="serious">{SEVERITY_LABEL.serious}</option>
              </Select>
            </Field>
            <Field label="SLA (hours to resolve)">
              <Input type="number" min={1} max={720} value={edit.sla_hours ?? 48} onChange={(e) => setEdit({ ...edit, sla_hours: Number(e.target.value) })} />
            </Field>
            <Field label="First follow-up (days)">
              <Input type="number" min={0} max={60} value={edit.follow_up_days ?? 2} onChange={(e) => setEdit({ ...edit, follow_up_days: Number(e.target.value) })} />
            </Field>
            <Field label="Keywords (comma separated)" className="sm:col-span-2" hint="e.g. size, chota, bara, tight">
              <Textarea
                rows={3}
                value={(edit.keywords ?? []).join(', ')}
                onChange={(e) => setEdit({ ...edit, keywords: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) })}
              />
            </Field>
            <Field label="Order in lists">
              <Input type="number" value={edit.sort ?? 100} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} />
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-[13px]">
              <Switch checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" /> Active
            </label>
          </div>
        ) : null}
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------- templates
const SAMPLE = {
  name: 'Ayesha Khan',
  first_name: 'Ayesha',
  order: '#haven33919',
  ref: 'HC-00042',
  courier: 'PostEx',
  tracking: '21234567890123',
  tracking_url: 'https://postex.pk/tracking?cn=21234567890123',
  shipment_status: 'In transit',
  brand: 'Havenwear',
  agent: 'Sara',
  store_url: 'https://havenwearpakistan.com',
}

function TemplatesTab() {
  const templates = useTemplates().data ?? []
  const save = useSaveRow('crm_templates', qk.templates)
  const [edit, setEdit] = useState<Partial<Template> | null>(null)
  return (
    <Card
      title="WhatsApp reply templates"
      action={
        <Button size="sm" onClick={() => setEdit({ title: '', body: '', category: 'general', sets_status: null, sort: 500, active: true })}>
          <Plus className="size-3.5" /> Add template
        </Button>
      }
    >
      <ul className="divide-y divide-border">
        {templates.map((t) => (
          <li key={t.id} className={cn('flex items-start gap-3 px-4 py-3', !t.active && 'opacity-50')}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                {t.title}
                <Badge>{t.category}</Badge>
                {t.sets_status ? <Badge tone="accent">Sets “{STATUS_LABEL[t.sets_status]}”</Badge> : null}
              </div>
              <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-muted">{t.body}</p>
            </div>
            <Button size="xs" variant="ghost" onClick={() => setEdit(t)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
      <Modal
        wide
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit?.id ? 'Edit template' : 'New template'}
        footer={
          <Button variant="primary" loading={save.isPending} disabled={!edit?.title?.trim() || !edit?.body?.trim()} onClick={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}>
            Save
          </Button>
        }
      >
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Title" className="sm:col-span-3">
              <Input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Category">
              <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as Template['category'] })}>
                {['general', 'info', 'delivery', 'resolution', 'followup'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="After sending, set status to">
              <Select value={edit.sets_status ?? ''} onChange={(e) => setEdit({ ...edit, sets_status: (e.target.value || null) as Template['sets_status'] })}>
                <option value="">Don’t change</option>
                <option value="in_progress">In progress</option>
                <option value="awaiting_customer">Awaiting customer</option>
              </Select>
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-[13px]">
              <Switch checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" /> Active
            </label>
            <Field label="Message" className="sm:col-span-3" hint={<>Variables: {TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(' ')}</>}>
              <Textarea rows={6} value={edit.body ?? ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </Field>
            <div className="sm:col-span-3">
              <div className="mb-1 text-xs font-medium text-muted">Preview</div>
              <div className="rounded-xl bg-ok-bg/70 px-3 py-2 text-[13px] whitespace-pre-wrap">{renderTemplate(edit.body ?? '', SAMPLE) || '—'}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------- team
function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const a = new Uint32Array(14)
  crypto.getRandomValues(a)
  const p = Array.from(a, (n) => chars[n % chars.length]).join('')
  return /\d/.test(p) ? p : p.slice(0, 13) + '7'
}

function TeamTab() {
  const members = useMembers().data ?? []
  const { member: me } = useAuth()
  const update = useUpdateMember()
  const create = useCreateMember()
  const setPw = useSetPassword()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', role: 'agent' as Role, password: '' })
  const [pwFor, setPwFor] = useState<Member | null>(null)
  const [pw, setPwValue] = useState('')
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null)

  return (
    <Card
      title={`Team (${members.filter((m) => m.active).length} active)`}
      action={
        <Button
          size="sm"
          onClick={() => {
            setForm({ email: '', full_name: '', role: 'agent', password: genPassword() })
            setAdding(true)
          }}
        >
          <Plus className="size-3.5" /> Add member
        </Button>
      }
    >
      <p className="border-b border-border px-4 py-2.5 text-xs text-muted">
        There is no public sign-up — only people added here can sign in. <b>Agents</b> work cases, <b>viewers</b> see everything read-only (e.g. management), <b>admins</b> also manage settings and the team. Auto-assign gives new cases to the least busy agent who has it on.
      </p>
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const self = m.user_id === me?.user_id
          return (
            <li key={m.user_id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', !m.active && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {m.full_name ?? '—'} {self ? <Badge>You</Badge> : null} {!m.active ? <Badge tone="bad">No access</Badge> : null}
                </div>
                <div className="text-xs text-muted">{m.email}</div>
              </div>
              <Select
                value={m.role}
                disabled={self}
                onChange={(e) => update.mutate({ user_id: m.user_id, role: e.target.value as Role })}
                aria-label="Role"
                className="w-28 [&_select]:h-8 [&_select]:text-[13px]"
              >
                {(['agent', 'viewer', 'admin'] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 text-xs text-muted" title="Receive auto-assigned cases">
                <Switch checked={m.auto_assign} disabled={m.role === 'viewer'} onChange={(v) => update.mutate({ user_id: m.user_id, auto_assign: v })} label="Auto-assign" />
                Auto-assign
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <Switch checked={m.active} disabled={self} onChange={(v) => update.mutate({ user_id: m.user_id, active: v })} label="Access" />
                Access
              </label>
              {!self ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setPwValue(genPassword())
                    setPwFor(m)
                  }}
                >
                  <KeyRound className="size-3" /> Password
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <Modal
        open={adding}
        onOpenChange={setAdding}
        title="Add a team member"
        description="Creates their login. Share the password privately; they can change it under Account."
        footer={
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!form.email.includes('@')}
            onClick={() =>
              create.mutate(form, {
                onSuccess: (r) => {
                  setAdding(false)
                  setCreated({ email: form.email, password: r.existing ? null : form.password })
                },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            Create & grant access
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Full name">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="agent">Agent — works cases</option>
              <option value="viewer">Viewer — read-only</option>
              <option value="admin">Admin — everything</option>
            </Select>
          </Field>
          <Field label="Initial password" hint="At least 10 characters with letters and numbers. Ignored if this email already has a login (e.g. Hisab Kitab).">
            <div className="flex gap-2">
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="font-mono" />
              <Button variant="secondary" onClick={() => setForm({ ...form, password: genPassword() })}>
                New
              </Button>
            </div>
          </Field>
        </div>
      </Modal>

      <Modal open={!!created} onOpenChange={(v) => !v && setCreated(null)} title="Member added">
        {created ? (
          <div className="space-y-2 text-[13px]">
            <p>
              <b>{created.email}</b> can now sign in to Havenwear Care.
            </p>
            {created.password ? (
              <p>
                Password: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{created.password}</code> — this is the only time it is shown.
              </p>
            ) : (
              <p className="text-muted">They already had a login, so their existing password is unchanged.</p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!pwFor}
        onOpenChange={(v) => !v && setPwFor(null)}
        title={`Set password for ${pwFor?.full_name ?? pwFor?.email}`}
        description="Logins that also have Hisab Kitab access can only be reset by their owner."
        footer={
          <Button
            variant="primary"
            loading={setPw.isPending}
            onClick={() =>
              pwFor &&
              setPw.mutate(
                { user_id: pwFor.user_id, password: pw },
                {
                  onSuccess: () => {
                    toast.success('Password updated — share it privately')
                    setPwFor(null)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            Set password
          </Button>
        }
      >
        <div className="flex gap-2">
          <Input value={pw} onChange={(e) => setPwValue(e.target.value)} className="font-mono" />
          <Button variant="secondary" onClick={() => setPwValue(genPassword())}>
            New
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------- automation
function AutomationTab() {
  const s = useSettings().data
  return s ? <AutomationForm key={JSON.stringify(s)} s={s} /> : null
}

function AutomationForm({ s }: { s: SettingsData }) {
  const save = useSaveSetting()
  const [form, setForm] = useState(s)
  const set = (key: string, value: unknown) => save.mutate({ key, value }, { onSuccess: () => toast.success('Saved') })
  return (
    <div className="space-y-5">
      <Card title="Case automation">
        <div className="divide-y divide-border">
          <label className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
            <span>
              <b>Auto-assign new cases</b>
              <span className="block text-xs text-muted">To the active agent with the fewest open cases (members can opt out under Team).</span>
            </span>
            <Switch checked={form.auto_assign} onChange={(v) => set('auto_assign', v)} label="Auto-assign" />
          </label>
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
            <span>
              <b>Auto-close “Awaiting customer”</b>
              <span className="block text-xs text-muted">Resolve as “No customer response” after this many days without activity (nightly). 0 = off.</span>
            </span>
            <Input
              type="number"
              min={0}
              max={60}
              className="w-20"
              value={form.auto_close_awaiting_days}
              onChange={(e) => setForm({ ...form, auto_close_awaiting_days: Number(e.target.value) })}
              onBlur={() => set('auto_close_awaiting_days', Math.max(0, Math.min(60, form.auto_close_awaiting_days)))}
            />
          </div>
          <div className="px-4 py-3 text-xs text-muted">
            Always on: order → customer/items/courier autofill · type & severity suggestions · SLA deadlines & follow-ups per type · repeat-customer and VIP tags · VIP half SLA ·
            first-response tracking · first outbound message moves Open → In progress · a customer reply moves Awaiting → In progress · full activity history.
          </div>
        </div>
      </Card>

      <Card title="Delivery watch thresholds">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Flag “not picked up” after (days booked)">
            <Input type="number" min={1} max={30} value={form.watch.booked_days} onChange={(e) => setForm({ ...form, watch: { ...form.watch, booked_days: Number(e.target.value) } })} onBlur={() => set('watch', form.watch)} />
          </Field>
          <Field label="Flag “stuck” after (days in transit)">
            <Input type="number" min={1} max={30} value={form.watch.in_transit_days} onChange={(e) => setForm({ ...form, watch: { ...form.watch, in_transit_days: Number(e.target.value) } })} onBlur={() => set('watch', form.watch)} />
          </Field>
        </div>
      </Card>

      <Card title="Store & messages">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Brand name (in messages)">
            <Input value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} onBlur={() => set('brand_name', form.brand_name.trim())} />
          </Field>
          <Field label="Order number prefix" hint="Typing 33919 finds #haven33919">
            <Input value={form.order_prefix} onChange={(e) => setForm({ ...form, order_prefix: e.target.value })} onBlur={() => set('order_prefix', form.order_prefix.trim().toLowerCase())} />
          </Field>
          {['postex', 'xps', 'tranzo', 'blueex', 'mnp'].map((c) => (
            <Field key={c} label={`Tracking link — ${c === 'mnp' ? 'M&P' : c === 'postex' ? 'PostEx' : c.toUpperCase()}`} hint={c === 'postex' ? 'Use {tracking} where the number goes' : undefined}>
              <Input
                value={form.tracking_urls[c] ?? ''}
                placeholder="https://…{tracking}"
                onChange={(e) => setForm({ ...form, tracking_urls: { ...form.tracking_urls, [c]: e.target.value } })}
                onBlur={() => set('tracking_urls', form.tracking_urls)}
              />
            </Field>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- import
function ImportTab() {
  const types = useTypes().data ?? []
  const members = useMembers().data ?? []
  const imp = useImportCases()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [file, setFile] = useState<string>('')
  const [progress, setProgress] = useState(0)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: false })
      const sheet = wb.Sheets[wb.SheetNames.find((n) => /complaint/i.test(n)) ?? wb.SheetNames[0]!]!
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
      setFile(f.name)
      setPlan(planSheetImport(grid, types, members))
    } catch (e) {
      toast.error(`Could not read the file: ${errorMessage(e)}`)
    }
  }

  return (
    <Card title="Import the old complaint sheet">
      <div className="space-y-4 p-4 text-[13px]">
        <p className="text-muted">
          Upload the <b>Havenwear Complaint Tracker</b> (.xlsx / .xlsm, or a CSV downloaded from Google Sheets). Columns are matched by name; orders are linked to Shopify automatically, and
          owners are matched to team members by name. The file is read in your browser only.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-8 hover:bg-hover">
          <Upload className="size-4 text-faint" aria-hidden />
          <span className="font-medium">{file || 'Choose a spreadsheet'}</span>
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {plan ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-faint" aria-hidden />
              <b>{plan.rows.length}</b> complaints ready
              {plan.skipped ? <span className="text-muted">· {plan.skipped} rows skipped (no order number or type)</span> : null}
            </div>
            {plan.warnings.map((w) => (
              <p key={w} className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                {w}
              </p>
            ))}
            {plan.rows.length ? (
              <div className="scroll-thin max-h-60 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border">
                    {plan.rows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{r.order_name}</td>
                        <td className="px-3 py-1.5">{r.customer_name}</td>
                        <td className="px-3 py-1.5">{types.find((t) => t.id === r.type_id)?.label}</td>
                        <td className="px-3 py-1.5">{STATUS_LABEL[r.status]}</td>
                        <td className="max-w-60 truncate px-3 py-1.5 text-muted">{r.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <Button
              variant="primary"
              disabled={!plan.rows.length}
              loading={imp.isPending}
              onClick={() =>
                imp.mutate(
                  { rows: plan.rows, onProgress: setProgress },
                  {
                    onSuccess: (n) => {
                      toast.success(`Imported ${n} complaints`)
                      setPlan(null)
                      setFile('')
                    },
                    onError: (e) => toast.error(`${errorMessage(e)} (imported ${progress} before the error)`),
                  },
                )
              }
            >
              Import {plan.rows.length} complaints
            </Button>
            {imp.isPending ? <span className="ml-3 text-xs text-muted">{progress} done…</span> : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
