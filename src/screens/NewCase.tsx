import { AlertTriangle, ArrowRight, Check, MessageCircleReply, PackageSearch, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ShipmentBadge } from '../components/badges'
import { CustomerCard, LineItems } from '../components/case/Panels'
import { openWhatsApp } from '../components/case/Composer'
import { Badge, Button, Card, EmptyState, Field, Input, Segmented, Select, Spinner, Textarea } from '../components/ui'
import { useAddEvent, useCreateCase, type NewCase as NewCaseInput } from '../data/mutations'
import { useCustomer, useLookup, useRefs, useSettings, useTemplates } from '../data/queries'
import { suggestSeverity, suggestTypes } from '../domain/classify'
import { fmtDate, fmtDateTime, fmtMoney } from '../domain/format'
import { CHANNEL_LABEL, CHANNELS, courierLabel, STATUS_LABEL } from '../domain/labels'
import { formatPhone, phoneKey } from '../domain/phone'
import { firstName, renderTemplate, trackingUrl } from '../domain/templates'
import type { Channel, Order, Severity } from '../domain/types'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/supabase'
import { cn, modKey, useDebounced, useHotkeys } from '../lib/utils'

export default function NewCase() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { can, member } = useAuth()
  const { types, members, type: typeById } = useRefs()
  const settings = useSettings().data
  const templates = useTemplates().data ?? []
  const create = useCreateCase()
  const addEvent = useAddEvent()

  const [q, setQ] = useState(params.get('order') ?? params.get('q') ?? '')
  const term = useDebounced(q, 300)
  const lookup = useLookup(term)
  const [order, setOrder] = useState<Order | null>(null)
  const [manual, setManual] = useState(false)
  const [lines, setLines] = useState<Set<number>>(new Set())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [text, setText] = useState('')
  // Type and severity follow the suggestions until the agent picks one explicitly.
  const [manualType, setManualType] = useState<number | null>(null)
  const [manualSeverity, setManualSeverity] = useState<Severity | null>(null)
  const [assignee, setAssignee] = useState<string>('auto')

  // Auto-pick the order when the lookup returns exactly one (typical: order number pasted)
  const results = lookup.data ?? []
  useEffect(() => {
    if (!order && !manual && results.length === 1 && term.length >= 3) selectOrder(results[0]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, term])

  function selectOrder(o: Order) {
    setOrder(o)
    setManual(false)
    setName(o.customer_name ?? '')
    setPhone(o.phone ?? '')
    setCity(o.city ?? '')
    setLines(new Set(o.lines.length === 1 ? [o.lines[0]!.id] : []))
  }

  const key = phoneKey(order?.phone ?? phone)
  const customer = useCustomer(key).data
  const recentCases = (customer?.cases ?? []).filter((c) => Date.now() - Date.parse(c.received_at) < 90 * 86_400_000)
  const vip = customer?.profile?.flag === 'vip'
  const openForOrder = order?.cases.find((c) => c.status !== 'resolved')

  // Type + severity suggestions from the customer's own words
  const suggestions = useMemo(() => suggestTypes(text, types), [text, types])
  const typeTouched = manualType != null
  const typeId = manualType ?? suggestions[0]?.typeId ?? null
  const chosenType = typeById(typeId)
  const sev = useMemo(() => suggestSeverity(text, chosenType, { repeatCustomer: recentCases.length > 0, vip }), [text, chosenType, recentCases.length, vip])
  const severity = manualSeverity ?? sev.severity

  const shipment = order?.shipments[0]
  const canSubmit = text.trim().length > 0 && (order || manual) && can('agent')

  const submit = async (acknowledge: boolean) => {
    if (!canSubmit) return
    const items = order ? order.lines.filter((l) => lines.has(l.id)).map((l) => ({ line_id: l.id, title: l.title, variant: l.variant, sku: l.sku, qty: l.qty, product_id: l.product_id })) : []
    const input: NewCaseInput = {
      channel,
      // Shopify's order id is Hisab Kitab's orders.id, so even a live (not yet synced)
      // order links automatically once the 30-minute sync picks it up.
      order_id: order?.id ?? null,
      order_name: order?.name ?? null,
      customer_name: name.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      items,
      courier: shipment?.courier ?? null,
      tracking_number: shipment?.tracking_number ?? null,
      type_id: typeId,
      severity,
      description: text.trim(),
      assignee: assignee === 'auto' ? null : assignee === 'me' ? (member?.user_id ?? null) : assignee,
      tags: [],
    }
    try {
      const c = await create.mutateAsync(input)
      toast.success(`${c.ref} created${c.assignee ? '' : ' (unassigned)'}`)
      if (acknowledge) {
        const tpl = templates.find((t) => t.active && /acknowledg/i.test(t.title)) ?? templates.find((t) => t.active)
        if (tpl) {
          const msg = renderTemplate(tpl.body, {
            first_name: firstName(c.customer_name),
            name: c.customer_name,
            order: c.order_name,
            ref: c.ref,
            courier: courierLabel(c.courier),
            tracking: c.tracking_number,
            tracking_url: trackingUrl(c.courier, c.tracking_number, settings?.tracking_urls ?? {}),
            brand: settings?.brand_name,
            agent: firstName(member?.full_name),
          })
          if (openWhatsApp(c.phone, msg)) {
            addEvent.mutate({ case_id: c.id, kind: 'contact', body: msg, meta: { channel: 'whatsapp', direction: 'out', template: tpl.title } })
          }
        }
      }
      navigate(`/inbox/all_open/${c.id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  useHotkeys({ 'mod+enter': (e) => void submit(e.shiftKey) })

  if (!can('agent')) return <EmptyState title="View-only access">Ask an admin for agent access to log cases.</EmptyState>

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 lg:p-6">
        <div className="mb-5 flex items-center gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">New case</h1>
          <span className="text-[13px] text-muted">Find the order — customer, items and courier fill themselves in.</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            {/* Step 1: order */}
            <Card title={<span className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-fg">1</span> Order or customer</span>}>
              <div className="space-y-3 p-4">
                {order ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold">{order.name}</span>
                      <span className="text-[13px] text-muted">
                        {order.customer_name} · {formatPhone(order.phone)} · {order.city}
                      </span>
                      <Badge tone={order.is_cod ? 'warn' : 'ok'}>{order.is_cod ? 'COD' : 'Prepaid'}</Badge>
                      <Badge>{fmtMoney(order.total)}</Badge>
                      {shipment ? <ShipmentBadge status={shipment.status} /> : <Badge>Not shipped</Badge>}
                      {order.live ? <Badge tone="info">Live from Shopify</Badge> : null}
                      <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setOrder(null)}>
                        <X className="size-3" /> Change
                      </Button>
                    </div>
                    {openForOrder ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">
                        <AlertTriangle className="size-4" aria-hidden />
                        This order already has an open case ({openForOrder.ref}, {STATUS_LABEL[openForOrder.status]}).
                        <Button size="xs" variant="secondary" className="ml-auto" onClick={() => navigate(`/inbox/all/${openForOrder.id}`)}>
                          Open it instead <ArrowRight className="size-3" />
                        </Button>
                      </div>
                    ) : null}
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted">Which items is the complaint about?</div>
                      <LineItems
                        lines={order.lines}
                        selectable
                        selected={lines}
                        onToggle={(id) =>
                          setLines((s) => {
                            const n = new Set(s)
                            if (n.has(id)) n.delete(id)
                            else n.add(id)
                            return n
                          })
                        }
                      />
                    </div>
                    {shipment ? (
                      <p className="text-xs text-muted">
                        {courierLabel(shipment.courier)} {shipment.tracking_number}
                        {shipment.status_at ? <> · last update {fmtDateTime(shipment.status_at)}</> : null}
                      </p>
                    ) : null}
                  </div>
                ) : manual ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Customer name">
                      <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <Field label="Phone / WhatsApp">
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03XX XXXXXXX" />
                    </Field>
                    <Field label="City">
                      <Input value={city} onChange={(e) => setCity(e.target.value)} />
                    </Field>
                    <button type="button" className="text-left text-xs font-medium text-accent hover:underline sm:col-span-3" onClick={() => setManual(false)}>
                      ← Search for the order instead
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
                      <Input
                        autoFocus
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Order number, phone, tracking number or name"
                        className="h-11 pl-9 text-[15px]"
                      />
                      {lookup.isFetching ? <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" /> : null}
                    </div>
                    {term.length >= 3 && !lookup.isFetching && results.length === 0 ? (
                      <p className="flex items-center gap-2 text-[13px] text-muted">
                        <PackageSearch className="size-4" aria-hidden /> No order found for “{term}”.
                      </p>
                    ) : null}
                    {results.length > 1 ? (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {results.map((o) => (
                          <li key={o.id}>
                            <button type="button" onClick={() => selectOrder(o)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover">
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-medium">
                                  {o.name} · {o.customer_name}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {fmtDate(o.created_at)} · {o.lines.map((l) => l.title).join(', ')}
                                </span>
                              </span>
                              {o.shipments[0] ? <ShipmentBadge status={o.shipments[0].status} /> : null}
                              <span className="tabular text-xs">{fmtMoney(o.total)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setManual(true)}>
                      No order? Enter the customer manually →
                    </button>
                  </>
                )}
              </div>
            </Card>

            {/* Step 2: complaint */}
            <Card title={<span className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-fg">2</span> Complaint</span>}>
              <div className="space-y-4 p-4">
                <Segmented
                  value={channel}
                  onChange={setChannel}
                  options={CHANNELS.filter((ch) => ch !== 'other' && ch !== 'website').map((ch) => ({ value: ch, label: CHANNEL_LABEL[ch] }))}
                />
                <Field label="What did the customer say?" hint="Paste their message as-is (English or Roman Urdu) — the type and severity are suggested from it.">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="e.g. Shirt ka size chota aya hai, exchange karna hai" />
                </Field>

                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted">
                    Complaint type
                    {suggestions.length && !typeTouched ? (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <Sparkles className="size-3" aria-hidden /> suggested
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {types
                      .filter((t) => t.active)
                      .map((t) => {
                        const s = suggestions.find((x) => x.typeId === t.id)
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setManualType(t.id)
                            }}
                            title={s ? `Matched: ${s.matched.join(', ')}` : undefined}
                            className={cn(
                              'h-7 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors',
                              typeId === t.id ? 'border-accent bg-accent-bg text-accent' : s ? 'border-accent/40 border-dashed text-text hover:bg-hover' : 'border-border text-muted hover:bg-hover hover:text-text',
                            )}
                          >
                            {typeId === t.id ? <Check className="mr-1 inline size-3" aria-hidden /> : null}
                            {t.label}
                          </button>
                        )
                      })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Severity"
                    hint={sev.reasons.length ? `Auto: ${sev.reasons.join(' · ')}` : 'Auto: non-serious (no escalation signals)'}
                  >
                    <Segmented
                      value={severity}
                      onChange={(v) => {
                        setManualSeverity(v)
                      }}
                      options={[
                        { value: 'non_serious', label: 'Non-serious' },
                        { value: 'serious', label: 'Serious' },
                      ]}
                    />
                  </Field>
                  <Field label="Assign to" hint={chosenType ? `SLA ${chosenType.sla_hours}h · follow-up in ${chosenType.follow_up_days}d (automatic)` : undefined}>
                    <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                      <option value="auto">Auto-assign (least busy)</option>
                      <option value="me">Me</option>
                      {members
                        .filter((m) => m.active && m.role !== 'viewer' && m.user_id !== member?.user_id)
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name ?? m.email}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <Button variant="primary" onClick={() => void submit(false)} disabled={!canSubmit} loading={create.isPending}>
                    Create case
                  </Button>
                  <Button variant="accent" onClick={() => void submit(true)} disabled={!canSubmit || !(phone || order?.phone)}>
                    <MessageCircleReply className="size-4" /> Create & acknowledge on WhatsApp
                  </Button>
                  <span className="text-xs text-faint">
                    {modKey}+Enter create · {modKey}+Shift+Enter create & acknowledge
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Context */}
          <aside className="min-w-0 space-y-4">
            {key ? (
              <>
                <CustomerCard name={name || null} phone={phone || null} city={city || null} phoneKey={key} />
                {recentCases.length ? (
                  <Card title={`Previous complaints (${customer?.cases.length ?? 0})`}>
                    <ul className="divide-y divide-border">
                      {(customer?.cases ?? []).slice(0, 5).map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => navigate(`/inbox/all/${c.id}`)} className="w-full px-4 py-2 text-left hover:bg-hover">
                            <div className="flex items-center gap-2 text-[13px]">
                              <span className="font-medium">{c.ref}</span>
                              <span className="text-muted">{typeById(c.type_id)?.label}</span>
                              <span className="ml-auto text-xs text-faint">{fmtDate(c.received_at)}</span>
                            </div>
                            <p className="line-clamp-1 text-xs text-faint">{c.summary}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted">
                Customer history, return rate and past complaints appear here once you pick an order.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
