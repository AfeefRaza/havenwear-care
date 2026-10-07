import { Copy, MessageCircle, Phone, PhoneIncoming, Send, StickyNote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAddEvent, useUpdateCase } from '../../data/mutations'
import { useSettings, useTemplates } from '../../data/queries'
import { courierLabel, SHIPMENT_LABEL } from '../../domain/labels'
import { firstName, renderTemplate, telLink, trackingUrl, whatsappLink, type TemplateVars } from '../../domain/templates'
import type { Case, ShipmentStatus, Template } from '../../domain/types'
import { useAuth } from '../../lib/auth'
import { cn, modKey } from '../../lib/utils'
import { Button, Select, Textarea } from '../ui'

type Mode = 'note' | 'whatsapp' | 'call' | 'reply'

export function useTemplateVars(c: Case, shipmentStatus?: ShipmentStatus | null): TemplateVars {
  const settings = useSettings().data
  const { member } = useAuth()
  return {
    name: c.customer_name,
    first_name: firstName(c.customer_name),
    order: c.order_name ?? '',
    ref: c.ref,
    tracking: c.tracking_number,
    tracking_url: trackingUrl(c.courier, c.tracking_number, settings?.tracking_urls ?? {}),
    courier: c.courier ? courierLabel(c.courier) : '',
    shipment_status: shipmentStatus ? SHIPMENT_LABEL[shipmentStatus] : '',
    brand: settings?.brand_name ?? 'Havenwear',
    agent: firstName(member?.full_name ?? ''),
    store_url: settings?.store_url,
  }
}

export function openWhatsApp(phone: string | null, text: string): boolean {
  const link = whatsappLink(phone, text)
  if (!link) {
    toast.error('No valid phone number on this case')
    return false
  }
  window.open(link, '_blank', 'noopener,noreferrer')
  return true
}

export function Composer({ c, shipmentStatus, readOnly }: { c: Case; shipmentStatus?: ShipmentStatus | null; readOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>('whatsapp')
  const [text, setText] = useState('')
  const [tplId, setTplId] = useState<number | null>(null)
  const templates = (useTemplates().data ?? []).filter((t) => t.active)
  const vars = useTemplateVars(c, shipmentStatus)
  const addEvent = useAddEvent()
  const update = useUpdateCase()
  const tpl: Template | undefined = useMemo(() => templates.find((t) => t.id === tplId), [templates, tplId])

  if (readOnly) return null

  const pickTemplate = (id: number | null) => {
    setTplId(id)
    const t = templates.find((x) => x.id === id)
    if (t) setText(renderTemplate(t.body, vars))
  }

  const reset = () => {
    setText('')
    setTplId(null)
  }

  const submit = async (callOutcome?: string) => {
    const body = text.trim()
    try {
      if (mode === 'note') {
        if (!body) return
        await addEvent.mutateAsync({ case_id: c.id, kind: 'note', body })
      } else if (mode === 'whatsapp') {
        if (!body) return
        if (!openWhatsApp(c.phone, body)) return
        await addEvent.mutateAsync({
          case_id: c.id,
          kind: 'contact',
          body,
          meta: { channel: 'whatsapp', direction: 'out', template: tpl?.title ?? null },
        })
        // Template automation: e.g. "Ask for photos" → Awaiting customer
        if (tpl?.sets_status && tpl.sets_status !== c.status && c.status !== 'resolved') {
          update.mutate({ id: c.id, patch: { status: tpl.sets_status } })
        }
      } else if (mode === 'call') {
        await addEvent.mutateAsync({
          case_id: c.id,
          kind: 'contact',
          body: body || null,
          meta: { channel: 'call', direction: 'out', outcome: callOutcome ?? 'reached' },
        })
      } else {
        await addEvent.mutateAsync({ case_id: c.id, kind: 'contact', body: body || null, meta: { channel: c.channel, direction: 'in' } })
      }
      reset()
    } catch {
      /* toast shown by the mutation */
    }
  }

  const tabs: { id: Mode; label: string; icon: typeof StickyNote }[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'call', label: 'Log call', icon: Phone },
    { id: 'reply', label: 'Customer replied', icon: PhoneIncoming },
    { id: 'note', label: 'Internal note', icon: StickyNote },
  ]

  const tel = telLink(c.phone)

  return (
    <div className={cn('rounded-xl border bg-surface', mode === 'note' ? 'border-warn/40' : 'border-border')}>
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-1.5 pt-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            className={cn(
              '-mb-px flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium whitespace-nowrap',
              mode === t.id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
            )}
          >
            <t.icon className="size-3.5" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 p-2.5">
        {mode === 'whatsapp' ? (
          <Select value={tplId ?? ''} onChange={(e) => pickTemplate(e.target.value ? Number(e.target.value) : null)} aria-label="Template">
            <option value="">Write a message, or pick a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.sets_status ? ' ↺' : ''}
              </option>
            ))}
          </Select>
        ) : null}

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={mode === 'whatsapp' ? 4 : 2}
          placeholder={
            mode === 'note'
              ? 'Internal note — only the team sees this'
              : mode === 'call'
                ? 'What was discussed? (optional)'
                : mode === 'reply'
                  ? 'What did the customer say? (optional) — moves “Awaiting customer” back to In progress'
                  : 'Message to the customer'
          }
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          className="border-0 bg-transparent px-1 focus:ring-0"
        />

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'whatsapp' ? (
            <>
              <Button variant="accent" size="sm" onClick={() => void submit()} disabled={!text.trim()} loading={addEvent.isPending}>
                <Send className="size-3.5" /> Open in WhatsApp & log
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!text.trim()}
                onClick={() => {
                  void navigator.clipboard.writeText(text)
                  toast.success('Copied')
                }}
              >
                <Copy className="size-3.5" /> Copy
              </Button>
              {tpl?.sets_status ? <span className="text-xs text-faint">Also sets status automatically</span> : null}
            </>
          ) : mode === 'call' ? (
            <>
              {tel ? (
                <a href={tel} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-medium hover:bg-hover">
                  <Phone className="size-3.5" /> Call {c.phone}
                </a>
              ) : null}
              <span className="text-xs text-faint">Outcome:</span>
              <Button size="sm" variant="secondary" onClick={() => void submit('reached')} loading={addEvent.isPending}>
                Reached
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void submit('no_answer')}>
                No answer
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void submit('busy')}>
                Busy / off
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => void submit()} disabled={mode === 'note' && !text.trim()} loading={addEvent.isPending}>
              {mode === 'note' ? 'Add note' : 'Log reply'}
            </Button>
          )}
          <span className="ml-auto hidden text-[11px] text-faint sm:inline">{modKey}+Enter</span>
        </div>
      </div>
    </div>
  )
}
