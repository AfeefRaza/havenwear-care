import { MessageCircle, Phone, RefreshCw, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ShipmentBadge } from '../components/badges'
import { Badge, Button, EmptyState, Menu, MenuItem, Segmented, Skeleton, Stat } from '../components/ui'
import { useLogDelivery } from '../data/mutations'
import { useRefs, useSettings, useTemplates, useWatch } from '../data/queries'
import { fmtDate, fmtMoney, relTime } from '../domain/format'
import { courierLabel, SHIPMENT_LABEL, WATCH_OUTCOME_LABEL, WATCH_REASON_LABEL } from '../domain/labels'
import { formatPhone } from '../domain/phone'
import { firstName, renderTemplate, telLink, trackingUrl, whatsappLink } from '../domain/templates'
import type { WatchOutcome, WatchReason, WatchRow } from '../domain/types'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/supabase'
import { cn } from '../lib/utils'

const REASON_TONE: Record<WatchReason, 'bad' | 'warn' | 'info' | 'neutral'> = {
  failed_attempt: 'bad',
  stuck: 'warn',
  not_picked: 'info',
  returning: 'neutral',
}

const OUTCOMES: WatchOutcome[] = ['reached', 'will_receive', 'address_updated', 'no_answer', 'refused', 'cancel_requested']

/**
 * Proactive outreach: parcels where a quick call or WhatsApp can still save the delivery
 * (failed attempts, stuck in transit, not picked up, just started returning). Built
 * entirely from the courier tracking Hisab Kitab already syncs hourly.
 */
export default function DeliveryWatch() {
  const { data, isLoading, error, refetch, isFetching } = useWatch()
  const [tab, setTab] = useState<'todo' | 'done'>('todo')
  const [reason, setReason] = useState<WatchReason | 'all'>('all')
  const log = useLogDelivery()
  const templates = useTemplates().data ?? []
  const settings = useSettings().data
  const { memberName } = useRefs()
  const { can, member } = useAuth()
  const navigate = useNavigate()

  const rows = useMemo(() => data ?? [], [data])
  const pending = (r: WatchRow) => !r.contact || r.contact.stale
  const list = useMemo(
    () => rows.filter((r) => (tab === 'todo' ? pending(r) : !pending(r))).filter((r) => reason === 'all' || r.reason === reason),
    [rows, tab, reason],
  )
  const todo = rows.filter(pending)
  const codAtRisk = todo.filter((r) => r.order.is_cod && r.reason !== 'returning').reduce((a, r) => a + Number(r.order.total || 0), 0)
  const count = (r: WatchReason) => todo.filter((x) => x.reason === r).length

  const message = (r: WatchRow) => {
    const tpl =
      templates.find((t) => t.active && (r.reason === 'failed_attempt' ? /attempt failed/i : /tracking/i).test(t.title)) ?? templates.find((t) => t.active && t.category === 'delivery')
    if (!tpl) return ''
    return renderTemplate(tpl.body, {
      first_name: firstName(r.order.customer_name),
      name: r.order.customer_name,
      order: r.order.name,
      courier: courierLabel(r.courier),
      tracking: r.tracking_number,
      tracking_url: trackingUrl(r.courier, r.tracking_number, settings?.tracking_urls ?? {}),
      shipment_status: SHIPMENT_LABEL[r.status],
      brand: settings?.brand_name,
      agent: firstName(member?.full_name),
    })
  }

  const record = (r: WatchRow, outcome: WatchOutcome) =>
    log.mutate({ shipment_id: r.shipment_id, outcome }, { onSuccess: () => toast.success(`${r.order.name}: ${WATCH_OUTCOME_LABEL[outcome]}`) })

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-semibold tracking-tight">Delivery watch</h1>
            <p className="text-[13px] text-muted">Reach customers before a COD parcel is returned. Updates automatically from courier tracking.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="To contact" value={todo.length} tone={todo.length ? 'warn' : 'ok'} />
          <Stat label="COD at risk" value={fmtMoney(codAtRisk)} sub="failed + stuck + not picked" />
          <Stat label="Failed attempts" value={count('failed_attempt')} tone={count('failed_attempt') ? 'bad' : undefined} />
          <Stat label="Stuck in transit" value={count('stuck')} sub={`> ${settings?.watch.in_transit_days ?? 5} days`} />
          <Stat label="Not picked up" value={count('not_picked')} sub={`> ${settings?.watch.booked_days ?? 3} days`} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'todo', label: `To contact (${todo.length})` },
              { value: 'done', label: `Contacted (${rows.length - todo.length})` },
            ]}
          />
          <Segmented
            value={reason}
            onChange={setReason}
            options={[{ value: 'all', label: 'All' }, ...(Object.keys(WATCH_REASON_LABEL) as WatchReason[]).map((r) => ({ value: r, label: WATCH_REASON_LABEL[r] }))]}
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-40" />
        ) : error ? (
          <EmptyState title="Could not load">{errorMessage(error)}</EmptyState>
        ) : list.length === 0 ? (
          <EmptyState icon={<Truck className="size-5" />} title={tab === 'todo' ? 'Nobody to contact right now' : 'Nothing contacted yet'}>
            {tab === 'todo' ? 'Parcels appear here when a delivery fails, gets stuck or is not picked up.' : null}
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {list.map((r) => {
                const wa = whatsappLink(r.order.phone, message(r))
                const tel = telLink(r.order.phone)
                return (
                  <li key={r.shipment_id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={REASON_TONE[r.reason]}>{WATCH_REASON_LABEL[r.reason]}</Badge>
                        <span className="text-[13px] font-semibold">{r.order.customer_name ?? 'Unknown'}</span>
                        <span className="tabular text-xs text-muted">{formatPhone(r.order.phone)}</span>
                        <span className="text-xs text-muted">{r.order.city}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="font-medium text-text">{r.order.name}</span>
                        <span>
                          {r.order.is_cod ? 'COD' : 'Prepaid'} {fmtMoney(r.order.total)}
                        </span>
                        <span>
                          {courierLabel(r.courier)} {r.tracking_number}
                        </span>
                        <ShipmentBadge status={r.status} />
                        <span title={r.status_raw ?? ''} className="max-w-64 truncate">
                          “{r.status_raw ?? SHIPMENT_LABEL[r.status]}” · {relTime(r.status_at)}
                        </span>
                        <span>ordered {fmtDate(r.order.created_at)}</span>
                      </div>
                      {r.contact ? (
                        <p className={cn('mt-1 text-xs', r.contact.stale ? 'text-warn' : 'text-faint')}>
                          {WATCH_OUTCOME_LABEL[r.contact.outcome]} by {memberName(r.contact.by)} {relTime(r.contact.at)}
                          {r.contact.attempts > 1 ? ` · ${r.contact.attempts} attempts` : ''}
                          {r.contact.stale ? ' — courier status changed since, contact again' : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ok-bg px-2.5 text-[13px] font-medium text-ok hover:opacity-80">
                          <MessageCircle className="size-3.5" /> WhatsApp
                        </a>
                      ) : null}
                      {tel ? (
                        <a href={tel} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-medium hover:bg-hover" aria-label="Call">
                          <Phone className="size-3.5" />
                        </a>
                      ) : null}
                      {can('agent') ? (
                        <>
                          <Menu trigger={<Button size="sm">Log outcome</Button>} align="end">
                            {OUTCOMES.map((o) => (
                              <MenuItem key={o} onSelect={() => record(r, o)}>
                                {WATCH_OUTCOME_LABEL[o]}
                              </MenuItem>
                            ))}
                            <MenuItem onSelect={() => record(r, 'dismissed')}>Dismiss (no action needed)</MenuItem>
                          </Menu>
                          {r.open_case ? (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/inbox/all/${r.open_case}`)}>
                              Open case
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/new?order=${encodeURIComponent(r.order.name)}`)}>
                              Create case
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
