import { ArrowLeft, MapPin, MessageCircle, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ShipmentBadge, StatusBadge } from '../components/badges'
import { LineItems } from '../components/case/Panels'
import { Badge, Button, Card, EmptyState, Field, Segmented, Skeleton, Stat, Textarea } from '../components/ui'
import { useSaveProfile } from '../data/mutations'
import { useCustomer, useRefs } from '../data/queries'
import { fmtDate, fmtMoney, fmtPct } from '../domain/format'
import { FLAG_LABEL, RESOLUTION_LABEL } from '../domain/labels'
import { formatPhone } from '../domain/phone'
import { telLink, whatsappLink } from '../domain/templates'
import type { CustomerFlag, CustomerProfile } from '../domain/types'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/supabase'
import { cn } from '../lib/utils'

export default function CustomerPage() {
  const { phoneKey = '' } = useParams()
  const navigate = useNavigate()
  const { data: c, isLoading, error } = useCustomer(phoneKey)
  const { typeLabel } = useRefs()
  const { can } = useAuth()
  const [openOrder, setOpenOrder] = useState<number | null>(null)

  if (isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-24" /></div>
  if (error || !c) return <EmptyState title="Customer not found">{error ? errorMessage(error) : null}</EmptyState>

  const s = c.stats
  const final = s.delivered + s.returned
  const returnRate = final ? (100 * s.returned) / final : null
  const phone = c.identity?.phone ?? c.phone_key
  const wa = whatsappLink(phone)
  const tel = telLink(phone)
  const flag = c.profile?.flag ?? 'none'
  const cost = c.cases.reduce((a, x) => a + Number(x.resolution_cost || 0), 0)

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-tight">{c.identity?.name ?? 'Unknown customer'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="tabular">{formatPhone(phone)}</span>
              {c.identity?.city ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {c.identity.city}
                </span>
              ) : null}
              {s.first_order ? <span>Customer since {fmtDate(s.first_order)}</span> : null}
              {flag !== 'none' ? <Badge tone={flag === 'vip' ? 'accent' : flag === 'blocked' ? 'bad' : 'warn'}>{FLAG_LABEL[flag]}</Badge> : null}
            </div>
          </div>
          <div className="flex gap-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-ok-bg px-3 text-[13px] font-medium text-ok hover:opacity-80">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            ) : null}
            {tel ? (
              <a href={tel} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-hover">
                <Phone className="size-4" /> Call
              </a>
            ) : null}
            {can('agent') ? (
              <Button variant="primary" onClick={() => navigate(`/new?q=${encodeURIComponent(phone ?? '')}`)}>
                <Plus className="size-4" /> New case
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Orders" value={s.orders} sub={s.cancelled ? `${s.cancelled} cancelled` : undefined} />
          <Stat label="Delivered" value={s.delivered} sub={fmtMoney(s.spent)} />
          <Stat label="Returned" value={s.returned} sub={`Return rate ${fmtPct(returnRate)}`} tone={returnRate != null && returnRate >= 40 ? 'bad' : undefined} />
          <Stat label="Complaints" value={c.cases.length} sub={c.cases.filter((x) => x.status !== 'resolved').length + ' open'} tone={c.cases.length > 2 ? 'warn' : undefined} />
          <Stat label="Cost of complaints" value={fmtMoney(cost)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <Card title={`Complaints (${c.cases.length})`}>
              {c.cases.length ? (
                <ul className="divide-y divide-border">
                  {c.cases.map((x) => (
                    <li key={x.id}>
                      <Link to={`/inbox/all/${x.id}`} className="block px-4 py-2.5 hover:bg-hover">
                        <div className="flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="font-semibold">{x.ref}</span>
                          <span className="text-muted">{typeLabel(x.type_id)}</span>
                          {x.severity === 'serious' ? <Badge tone="bad">Serious</Badge> : null}
                          <StatusBadge status={x.status} />
                          <span className="ml-auto text-xs text-faint">{fmtDate(x.received_at)}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{x.summary}</p>
                        {x.resolution ? (
                          <p className="text-xs text-faint">
                            {RESOLUTION_LABEL[x.resolution]}
                            {x.resolution_cost > 0 ? ` · ${fmtMoney(x.resolution_cost)}` : ''}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-[13px] text-muted">No complaints from this customer.</p>
              )}
            </Card>

            <Card title={`Orders (${s.orders})`}>
              {c.orders.length ? (
                <ul className="divide-y divide-border">
                  {c.orders.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => setOpenOrder(openOrder === o.id ? null : o.id)} className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left hover:bg-hover">
                        <span className="text-[13px] font-semibold">{o.name}</span>
                        <span className="text-xs text-muted">{fmtDate(o.created_at)}</span>
                        <Badge tone={o.is_cod ? 'warn' : 'ok'}>{o.is_cod ? 'COD' : 'Prepaid'}</Badge>
                        {o.cancelled_at ? <Badge tone="bad">Cancelled</Badge> : o.shipments[0] ? <ShipmentBadge status={o.shipments[0].status} /> : <Badge>Not shipped</Badge>}
                        {o.cases.length ? <Badge tone="violet">{o.cases.length} case</Badge> : null}
                        <span className="tabular ml-auto text-[13px]">{fmtMoney(o.total)}</span>
                      </button>
                      {openOrder === o.id ? (
                        <div className="bg-surface-2/50 px-4 pb-2">
                          <LineItems lines={o.lines} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-[13px] text-muted">No Shopify orders for this number.</p>
              )}
            </Card>
          </div>

          <aside className="space-y-4">
            <ProfileEditor key={c.profile?.updated_at ?? "new"} phoneKey={c.phone_key} profile={c.profile} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function ProfileEditor({ phoneKey, profile }: { phoneKey: string; profile: CustomerProfile | null }) {
  const { can } = useAuth()
  const save = useSaveProfile()
  const [flag, setFlag] = useState<CustomerFlag>(profile?.flag ?? 'none')
  const [note, setNote] = useState(profile?.note ?? '')
  const dirty = flag !== (profile?.flag ?? 'none') || note !== (profile?.note ?? '')
  const c = { phone_key: phoneKey, profile }
  return (
    <Card title="Team notes & flag">
      <div className="space-y-3 p-4">
        <Segmented
          value={flag}
          onChange={(v) => can('agent') && setFlag(v)}
          options={(['none', 'vip', 'watch', 'blocked'] as CustomerFlag[]).map((f) => ({ value: f, label: f === 'none' ? 'None' : f === 'blocked' ? 'Blocked' : FLAG_LABEL[f] }))}
          className="w-full [&>button]:flex-1"
        />
        <p className={cn('text-xs', flag === 'blocked' ? 'text-bad' : 'text-faint')}>
          {flag === 'vip'
            ? 'VIP: cases are tagged and get half the normal SLA.'
            : flag === 'watch'
              ? 'Watch: warns the team on every case (e.g. frequent returns).'
              : flag === 'blocked'
                ? 'Blocked: do not accept COD orders — warning shown everywhere.'
                : 'No flag.'}
        </p>
        <Field label="Note for the team">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={!can('agent')} placeholder="e.g. Prefers calls after 6 PM. Refused 2 parcels in Sept." />
        </Field>
        {can('agent') ? (
          <Button variant="primary" size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ phone_key: c.phone_key, flag, note: note.trim() || null, tags: c.profile?.tags ?? [] })}>
            Save
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
