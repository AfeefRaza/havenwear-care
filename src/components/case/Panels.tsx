import { Copy, ExternalLink, ImagePlus, MapPin, MessageCircle, Package, Phone, RefreshCw, ShieldAlert, Star, Trash2, Truck } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useDeleteAttachment, useUploadAttachments } from '../../data/mutations'
import { useAttachments, useCustomer, useLiveTracking, useProductImages, useSettings } from '../../data/queries'
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, relTime } from '../../domain/format'
import { courierLabel, FLAG_LABEL } from '../../domain/labels'
import { formatPhone } from '../../domain/phone'
import { telLink, trackingUrl, whatsappLink } from '../../domain/templates'
import type { CaseItem, Order, OrderLine, Shipment, TrackEvent } from '../../domain/types'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/utils'
import { ShipmentBadge } from '../badges'
import { Badge, Button, Card, Modal, Skeleton, Spinner } from '../ui'

export function ProductThumb({ url, title, size = 40 }: { url?: string; title: string; size?: number }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="shrink-0 rounded-lg border border-border object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-faint" style={{ width: size, height: size }} title={title}>
      <Package className="size-4" aria-hidden />
    </span>
  )
}

export function LineItems({
  lines,
  highlight,
  selectable,
  selected,
  onToggle,
}: {
  lines: (OrderLine | CaseItem)[]
  highlight?: Set<number>
  selectable?: boolean
  selected?: Set<number>
  onToggle?: (id: number) => void
}) {
  const images = useProductImages(lines.map((l) => l.product_id)).data ?? {}
  return (
    <ul className="divide-y divide-border">
      {lines.map((l, i) => {
        const id = 'id' in l ? l.id : (l.line_id ?? i)
        const on = selected?.has(id)
        return (
          <li key={`${id}-${i}`}>
            <label className={cn('flex items-center gap-3 py-2', selectable && 'cursor-pointer', highlight?.has(id) && 'font-medium')}>
              {selectable ? <input type="checkbox" className="size-4 accent-[var(--c-accent)]" checked={!!on} onChange={() => onToggle?.(id)} /> : null}
              <ProductThumb url={l.product_id ? images[String(l.product_id)] : undefined} title={l.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{l.title}</span>
                <span className="block truncate text-xs text-muted">
                  {[('variant' in l && l.variant) || null, l.sku ? `SKU ${l.sku}` : null].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
              <span className="tabular text-xs text-muted">
                ×{'qty' in l ? (l.qty ?? 1) : 1}
                {'price' in l ? <span className="ml-2 text-text">{fmtMoney(l.price)}</span> : null}
              </span>
              {highlight?.has(id) ? <Badge tone="accent">Affected</Badge> : null}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- customer
export function CustomerCard({ name, phone, city, phoneKey }: { name: string | null; phone: string | null; city: string | null; phoneKey: string | null }) {
  const { data: cust, isLoading } = useCustomer(phoneKey)
  const s = cust?.stats
  const final = (s?.delivered ?? 0) + (s?.returned ?? 0)
  const returnRate = final ? (100 * (s?.returned ?? 0)) / final : null
  const flag = cust?.profile?.flag ?? 'none'
  const wa = whatsappLink(phone)
  const tel = telLink(phone)
  const otherCases = (cust?.cases ?? []).length

  return (
    <Card
      title="Customer"
      action={
        phoneKey ? (
          <Link to={`/customers/${phoneKey}`} className="text-xs font-medium text-accent hover:underline">
            Full profile
          </Link>
        ) : null
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[15px] font-semibold">
              <span className="truncate">{name || cust?.identity?.name || 'Unknown customer'}</span>
              {flag === 'vip' ? <Star className="size-3.5 fill-accent text-accent" aria-label="VIP" /> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              {phone ? <span className="tabular">{formatPhone(phone)}</span> : <span className="text-faint">No phone</span>}
              {city ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden /> {city}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-1">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex size-8 items-center justify-center rounded-lg bg-ok-bg text-ok hover:opacity-80" aria-label="Open WhatsApp chat">
                <MessageCircle className="size-4" />
              </a>
            ) : null}
            {tel ? (
              <a href={tel} className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-hover" aria-label="Call customer">
                <Phone className="size-4" />
              </a>
            ) : null}
          </div>
        </div>

        {flag === 'blocked' || flag === 'watch' ? (
          <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-xs', flag === 'blocked' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn')}>
            <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              <b>{FLAG_LABEL[flag]}</b>
              {cust?.profile?.note ? ` — ${cust.profile.note}` : null}
            </span>
          </div>
        ) : cust?.profile?.note ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{cust.profile.note}</p>
        ) : null}

        {isLoading && phoneKey ? (
          <Skeleton className="h-14" />
        ) : s && s.orders > 0 ? (
          <dl className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Orders', s.orders],
              ['Delivered', s.delivered],
              ['Returned', s.returned],
              ['Return %', fmtPct(returnRate)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-2 px-1 py-1.5">
                <dt className="text-[10px] font-medium text-faint uppercase">{k}</dt>
                <dd className={cn('tabular text-[14px] font-semibold', k === 'Return %' && returnRate != null && returnRate >= 40 && 'text-bad')}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : phoneKey ? (
          <p className="text-xs text-faint">No Shopify orders found for this number.</p>
        ) : null}
        {s && s.orders > 0 ? (
          <p className="text-xs text-muted">
            Lifetime delivered value <b className="text-text">{fmtMoney(s.spent)}</b> · customer since {fmtDate(s.first_order)}
            {otherCases > 1 ? (
              <>
                {' '}
                · <span className="font-medium text-warn">{otherCases} complaints</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- order
export function OrderCard({ order, loading, affected }: { order: Order | null | undefined; loading?: boolean; affected?: CaseItem[] }) {
  if (loading)
    return (
      <Card title="Order">
        <div className="space-y-2 p-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-10" />
        </div>
      </Card>
    )
  if (!order) return null
  const highlight = new Set((affected ?? []).map((a) => a.line_id).filter((x): x is number => !!x))
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Order {order.name}
          {order.live ? <Badge tone="info">Live from Shopify</Badge> : null}
        </span>
      }
      action={<span className="text-xs text-faint">{fmtDate(order.created_at)}</span>}
    >
      <div className="space-y-2 px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={order.is_cod ? 'warn' : 'ok'}>{order.is_cod ? 'COD' : 'Prepaid'}</Badge>
          <Badge>{fmtMoney(order.total)}</Badge>
          {order.cancelled_at ? <Badge tone="bad">Cancelled</Badge> : null}
          {order.financial_status ? <Badge>{order.financial_status.replace(/_/g, ' ').toLowerCase()}</Badge> : null}
          {order.tags.slice(0, 4).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        {order.note ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Order note: {order.note}</p> : null}
        <LineItems lines={order.lines} highlight={highlight} />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- shipment
function EventList({ events }: { events: TrackEvent[] }) {
  if (!events.length) return <p className="text-xs text-faint">No courier events yet.</p>
  return (
    <ol className="space-y-2">
      {events.slice(0, 8).map((e, i) => (
        <li key={i} className="flex gap-2.5 text-xs">
          <span className={cn('mt-1 size-2 shrink-0 rounded-full', i === 0 ? 'bg-accent' : 'bg-border-strong')} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className={cn('block', i === 0 ? 'font-medium text-text' : 'text-muted')}>{e.raw ?? e.status}</span>
            <span className="text-faint">{fmtDateTime(e.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function ShipmentCard({ shipment, events, fallback }: { shipment?: Shipment | null; events?: TrackEvent[]; fallback?: { courier: string | null; tracking: string | null } }) {
  const tn = shipment?.tracking_number ?? fallback?.tracking ?? null
  const courier = shipment?.courier ?? fallback?.courier ?? null
  const live = useLiveTracking(tn, courier)
  const { data: settings } = useSettings()
  if (!tn) {
    return (
      <Card title="Delivery">
        <p className="px-4 py-3 text-[13px] text-muted">Not shipped yet — no tracking number on the order.</p>
      </Card>
    )
  }
  const url = trackingUrl(courier, tn, settings?.tracking_urls ?? {})
  const liveData = live.data
  const status = liveData?.ok ? liveData.status : shipment?.status
  const evs = liveData?.ok && liveData.events?.length ? liveData.events : (events ?? []).filter((e) => !shipment || e.shipment_id === shipment.id)

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Truck className="size-3.5 text-faint" aria-hidden /> {courierLabel(courier)}
        </span>
      }
      action={
        <Button variant="ghost" size="xs" onClick={() => void live.refetch()} disabled={live.isFetching} title="Ask the courier now">
          {live.isFetching ? <Spinner className="size-3" /> : <RefreshCw className="size-3" />} Live check
        </Button>
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {status ? <ShipmentBadge status={status} /> : null}
          <button
            type="button"
            className="tabular inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium hover:bg-hover"
            onClick={() => {
              void navigator.clipboard.writeText(tn)
              toast.success('Tracking number copied')
            }}
          >
            {tn} <Copy className="size-3 text-faint" aria-hidden />
          </button>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              Track <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
        {liveData && !liveData.ok ? <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">{liveData.error}</p> : null}
        {live.error ? <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">{(live.error as Error).message}</p> : null}
        <EventList events={evs} />
        <p className="text-[11px] text-faint">
          {liveData?.ok
            ? `Live from courier · ${relTime(liveData.checked_at)}`
            : shipment?.last_checked_at
              ? `Auto-synced ${relTime(shipment.last_checked_at)} (hourly)`
              : 'Synced hourly from the courier'}
        </p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- attachments
export function AttachmentsCard({ caseId }: { caseId: number }) {
  const { data, isLoading } = useAttachments(caseId)
  const upload = useUploadAttachments()
  const del = useDeleteAttachment()
  const { can, member } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    upload.mutate({ caseId, files: Array.from(files) }, { onSuccess: () => toast.success('Photos added') })
  }

  return (
    <Card
      title="Photos"
      action={
        can('agent') ? (
          <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button variant="ghost" size="xs" onClick={() => input.current?.click()} loading={upload.isPending}>
              <ImagePlus className="size-3" /> Add
            </Button>
          </>
        ) : null
      }
    >
      <div
        className="p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (can('agent')) onFiles(e.dataTransfer.files)
        }}
        onPaste={(e) => can('agent') && onFiles(e.clipboardData.files)}
      >
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : data?.length ? (
          <div className="grid grid-cols-4 gap-2">
            {data.map((a) => (
              <div key={a.id} className="group relative">
                <button type="button" onClick={() => setPreview(a.url)} className="block aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface-2">
                  {a.url ? <img src={a.url} alt="Sent by the customer" className="size-full object-cover" loading="lazy" /> : null}
                </button>
                {can('admin') || a.created_by === member?.user_id ? (
                  <button
                    type="button"
                    aria-label="Delete photo"
                    onClick={() => del.mutate({ id: a.id, path: a.path, caseId })}
                    className="absolute top-1 right-1 hidden rounded-md bg-black/60 p-1 text-white group-hover:block"
                  >
                    <Trash2 className="size-3" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-faint">{can('agent') ? 'Drop, paste or add photos the customer sent (auto-compressed).' : 'No photos.'}</p>
        )}
      </div>
      <Modal open={!!preview} onOpenChange={(v) => !v && setPreview(null)} title="Photo" wide>
        {preview ? <img src={preview} alt="Sent by the customer" className="mx-auto max-h-[70vh] rounded-lg" /> : null}
      </Modal>
    </Card>
  )
}
