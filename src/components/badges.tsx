import { AlertTriangle, AtSign, Camera, Clock, Globe, Mail, MessageCircle, Phone, PauseCircle, CircleDot } from 'lucide-react'
import { relTime } from '../domain/format'
import { SEVERITY_LABEL, SHIPMENT_LABEL, STATUS_LABEL } from '../domain/labels'
import { caseHealth, followUpState } from '../domain/sla'
import type { Case, Channel, Severity, ShipmentStatus, Status } from '../domain/types'
import { cn } from '../lib/utils'
import { Badge, type Tone } from './ui'

export const STATUS_TONE: Record<Status, Tone> = {
  open: 'info',
  in_progress: 'accent',
  awaiting_customer: 'violet',
  resolved: 'ok',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const color = {
    open: 'text-info',
    in_progress: 'text-accent',
    awaiting_customer: 'text-violet',
    resolved: 'text-ok',
  }[status]
  return <CircleDot className={cn('size-3.5 shrink-0', color, className)} aria-label={STATUS_LABEL[status]} />
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity !== 'serious') return null
  return (
    <Badge tone="bad">
      <AlertTriangle className="size-3" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </Badge>
  )
}

/** SLA / follow-up chip: the one thing an agent needs to know about urgency. */
export function UrgencyBadge({ c }: { c: Pick<Case, 'status' | 'due_at' | 'follow_up_at'> }) {
  const h = caseHealth(c)
  const f = followUpState(c)
  if (h === 'overdue')
    return (
      <Badge tone="bad">
        <Clock className="size-3" aria-hidden />
        Overdue {relTime(c.due_at).replace(' ago', '')}
      </Badge>
    )
  if (h === 'paused')
    return (
      <Badge tone="violet">
        <PauseCircle className="size-3" aria-hidden />
        Waiting
      </Badge>
    )
  if (f === 'overdue' || f === 'today')
    return (
      <Badge tone="warn">
        <Clock className="size-3" aria-hidden />
        Follow up {f === 'today' ? 'today' : relTime(c.follow_up_at)}
      </Badge>
    )
  if (h === 'due_soon')
    return (
      <Badge tone="warn">
        <Clock className="size-3" aria-hidden />
        Due {relTime(c.due_at)}
      </Badge>
    )
  return null
}

export const SHIPMENT_TONE: Record<ShipmentStatus, Tone> = {
  booked: 'neutral',
  in_transit: 'info',
  out_for_delivery: 'accent',
  delivery_failed: 'bad',
  delivered: 'ok',
  return_in_transit: 'warn',
  returned: 'warn',
  cancelled: 'neutral',
  lost: 'bad',
  unknown: 'neutral',
}

export function ShipmentBadge({ status }: { status: ShipmentStatus | string }) {
  const s = (status in SHIPMENT_LABEL ? status : 'unknown') as ShipmentStatus
  return (
    <Badge tone={SHIPMENT_TONE[s]} dot>
      {SHIPMENT_LABEL[s]}
    </Badge>
  )
}

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  const Icon = { whatsapp: MessageCircle, call: Phone, instagram: Camera, facebook: AtSign, email: Mail, website: Globe, other: CircleDot }[channel]
  return <Icon className={cn('size-3.5 shrink-0 text-faint', className)} aria-hidden />
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <>
      {tags.map((t) => (
        <Badge key={t} tone={t === 'vip' ? 'accent' : t === 'repeat' ? 'warn' : 'neutral'}>
          {t === 'vip' ? 'VIP' : t === 'repeat' ? 'Repeat customer' : t}
        </Badge>
      ))}
    </>
  )
}
