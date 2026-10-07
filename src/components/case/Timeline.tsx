import { ArrowRight, Bell, CheckCircle2, Image, MessageCircle, PenLine, Phone, PhoneIncoming, RotateCcw, Sparkles, StickyNote, UserCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useRefs } from '../../data/queries'
import { fmtDateTime, fmtMoney, relTime } from '../../domain/format'
import { RESOLUTION_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '../../domain/labels'
import type { CaseEvent, Resolution, Severity, Status } from '../../domain/types'
import { cn } from '../../lib/utils'
import { Avatar, Skeleton } from '../ui'

const CALL_OUTCOME: Record<string, string> = { reached: 'Reached', no_answer: 'No answer', busy: 'Busy / switched off' }

function Row({ icon, children, at, accent, body }: { icon: ReactNode; children: ReactNode; at: string; accent?: string; body?: ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden />
      <span className={cn('relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-faint', accent)}>{icon}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-muted">
          {children}
          <time className="text-xs text-faint" dateTime={at} title={fmtDateTime(at)}>
            · {relTime(at)}
          </time>
        </div>
        {body}
      </div>
    </li>
  )
}

function Bubble({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'wa' | 'in' }) {
  return (
    <div
      className={cn(
        'mt-1.5 rounded-xl border px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-text',
        tone === 'plain' && 'border-border bg-surface',
        tone === 'wa' && 'border-transparent bg-ok-bg/70',
        tone === 'in' && 'border-transparent bg-info-bg/70',
      )}
    >
      {children}
    </div>
  )
}

export function Timeline({ events, loading }: { events: CaseEvent[] | undefined; loading: boolean }) {
  const { memberName, typeLabel } = useRefs()
  if (loading && !events) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    )
  }
  const who = (e: CaseEvent) => <span className="font-medium text-text">{e.actor ? memberName(e.actor) : 'System'}</span>

  return (
    <ol aria-label="Case history">
      {(events ?? []).map((e) => {
        const m = e.meta as Record<string, string | number | null | undefined>
        switch (e.kind) {
          case 'created':
            return (
              <Row key={e.id} at={e.created_at} icon={<Sparkles className="size-3" />}>
                {who(e)} logged this case{m.assignee ? <> · auto-assigned to {memberName(String(m.assignee))}</> : null}
              </Row>
            )
          case 'note':
            return (
              <Row key={e.id} at={e.created_at} icon={<StickyNote className="size-3" />} body={<Bubble>{e.body}</Bubble>}>
                <Avatar name={memberName(e.actor)} size={16} /> {who(e)} added a note
              </Row>
            )
          case 'contact': {
            const inbound = m.direction === 'in'
            const isCall = m.channel === 'call'
            return (
              <Row
                key={e.id}
                at={e.created_at}
                accent={inbound ? 'text-info' : 'text-ok'}
                icon={inbound ? <PhoneIncoming className="size-3" /> : isCall ? <Phone className="size-3" /> : <MessageCircle className="size-3" />}
                body={e.body ? <Bubble tone={inbound ? 'in' : isCall ? 'plain' : 'wa'}>{e.body}</Bubble> : null}
              >
                {inbound ? (
                  <>
                    Customer replied <span className="text-faint">(logged by {memberName(e.actor)})</span>
                  </>
                ) : isCall ? (
                  <>
                    {who(e)} called the customer{m.outcome ? <> — {CALL_OUTCOME[String(m.outcome)] ?? m.outcome}</> : null}
                  </>
                ) : (
                  <>
                    {who(e)} sent a WhatsApp{m.template ? <> · “{m.template}”</> : null}
                  </>
                )}
              </Row>
            )
          }
          case 'status':
            return (
              <Row key={e.id} at={e.created_at} icon={<ArrowRight className="size-3" />}>
                {who(e)} changed status to <span className="font-medium text-text">{STATUS_LABEL[m.to as Status] ?? m.to}</span>
              </Row>
            )
          case 'assigned':
            return (
              <Row key={e.id} at={e.created_at} icon={<UserCheck className="size-3" />}>
                {who(e)} {m.to ? <>assigned it to <span className="font-medium text-text">{memberName(String(m.to))}</span></> : 'unassigned it'}
              </Row>
            )
          case 'follow_up':
            return (
              <Row key={e.id} at={e.created_at} icon={<Bell className="size-3" />}>
                {who(e)} set a follow-up for {fmtDateTime(String(m.at))}
              </Row>
            )
          case 'edit':
            return (
              <Row key={e.id} at={e.created_at} icon={<PenLine className="size-3" />}>
                {who(e)} changed{' '}
                {m.type_from !== m.type_to ? <>type to <span className="font-medium text-text">{typeLabel(Number(m.type_to))}</span></> : null}
                {m.type_from !== m.type_to && m.severity_from !== m.severity_to ? ' and ' : null}
                {m.severity_from !== m.severity_to ? <>severity to <span className="font-medium text-text">{SEVERITY_LABEL[m.severity_to as Severity]}</span></> : null}
              </Row>
            )
          case 'resolved':
            return (
              <Row key={e.id} at={e.created_at} accent="text-ok" icon={<CheckCircle2 className="size-3" />} body={e.body ? <Bubble>{e.body}</Bubble> : null}>
                {who(e)} resolved it
                {m.resolution ? <> — <span className="font-medium text-text">{RESOLUTION_LABEL[m.resolution as Resolution]}</span></> : null}
                {Number(m.cost) > 0 ? <> · {fmtMoney(Number(m.cost))}</> : null}
              </Row>
            )
          case 'reopened':
            return (
              <Row key={e.id} at={e.created_at} accent="text-warn" icon={<RotateCcw className="size-3" />}>
                {who(e)} reopened the case
              </Row>
            )
          case 'attachment':
            return (
              <Row key={e.id} at={e.created_at} icon={<Image className="size-3" />}>
                {who(e)} {e.body ?? 'added photos'}
              </Row>
            )
          default:
            return (
              <Row key={e.id} at={e.created_at} icon={<Sparkles className="size-3" />}>
                {e.body}
              </Row>
            )
        }
      })}
    </ol>
  )
}
