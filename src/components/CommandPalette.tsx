import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { BarChart3, FilePlus2, Inbox, Package, Search, Truck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefs, useSearch } from '../data/queries'
import { fmtDate, fmtMoney } from '../domain/format'
import { formatPhone } from '../domain/phone'
import { useAuth } from '../lib/auth'
import { useDebounced } from '../lib/utils'
import { ShipmentBadge, StatusBadge } from './badges'
import { Kbd, Spinner } from './ui'

/**
 * One box for everything: case ref, order number, phone, tracking number or name.
 * Orders come straight from the synced Shopify data, so an agent can jump from a
 * WhatsApp message to the order (and start a case) in two keystrokes.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('')
  const term = useDebounced(q, 200)
  const { data, isFetching } = useSearch(term)
  const navigate = useNavigate()
  const { typeLabel } = useRefs()
  const { can } = useAuth()

  const go = (path: string) => {
    onOpenChange(false)
    setQ('')
    navigate(path)
  }

  const cases = term.length >= 2 ? (data?.cases ?? []) : []
  const orders = term.length >= 2 ? (data?.orders ?? []) : []

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed top-[10vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-in"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-faint" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                autoFocus
                placeholder="Order #, phone, tracking, case ref or name…"
                className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
              />
              {isFetching ? <Spinner /> : <Kbd>Esc</Kbd>}
            </div>
            <Command.List className="scroll-thin max-h-[60vh] overflow-y-auto p-1.5">
              {term.length >= 2 && !isFetching && !cases.length && !orders.length ? (
                <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">No cases or orders match “{term}”.</Command.Empty>
              ) : null}

              {cases.length ? (
                <Command.Group heading="Cases" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase">
                  {cases.map((c) => (
                    <Command.Item
                      key={`c${c.id}`}
                      value={`case-${c.id}`}
                      onSelect={() => go(`/inbox/all/${c.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2"
                    >
                      <Inbox className="size-4 text-faint" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">
                          {c.ref} · {c.customer_name ?? 'Unknown'} <span className="text-faint">{c.order_name}</span>
                        </div>
                        <div className="text-xs text-muted">
                          {typeLabel(c.type_id)} · {fmtDate(c.received_at)}
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {orders.length ? (
                <Command.Group heading="Shopify orders" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase">
                  {orders.map((o) => {
                    const open = o.cases.find((c) => c.status !== 'resolved')
                    return (
                      <Command.Item
                        key={`o${o.id}`}
                        value={`order-${o.id}`}
                        onSelect={() =>
                          open ? go(`/inbox/all/${open.id}`) : can('agent') ? go(`/new?order=${encodeURIComponent(o.name)}`) : go(`/customers/${o.phone_key}`)
                        }
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2"
                      >
                        <Package className="size-4 text-faint" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">
                            {o.name} · {o.customer_name ?? 'Unknown'}
                          </div>
                          <div className="truncate text-xs text-muted">
                            {formatPhone(o.phone)} · {o.city} · {fmtMoney(o.total)} · {fmtDate(o.created_at)}
                          </div>
                        </div>
                        {o.shipments[0] ? <ShipmentBadge status={o.shipments[0].status} /> : null}
                        <span className="text-[11px] font-medium text-accent">{open ? 'Open case' : can('agent') ? 'New case' : 'Customer'}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ) : null}

              {term.length < 2 ? (
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase">
                  {[
                    ...(can('agent') ? [{ icon: FilePlus2, label: 'New case', path: '/new', key: 'C' }] : []),
                    { icon: Inbox, label: 'My queue', path: '/inbox/mine', key: 'G' },
                    { icon: Truck, label: 'Delivery watch', path: '/watch' },
                    { icon: UserRound, label: 'Customers', path: '/customers' },
                    { icon: BarChart3, label: 'Insights', path: '/insights' },
                  ].map((a) => (
                    <Command.Item key={a.path} value={a.path} onSelect={() => go(a.path)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[13px]">
                      <a.icon className="size-4 text-faint" aria-hidden />
                      <span className="flex-1">{a.label}</span>
                      {a.key ? <Kbd>{a.key}</Kbd> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
