import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, ChevronDown, Link2, MoreHorizontal, RotateCcw, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useDeleteCase, useUpdateCase } from '../../data/mutations'
import { useCase, useCaseEvents, useOrder, useRefs } from '../../data/queries'
import { fmtDateTime, fmtHours, fmtMoney, relTime } from '../../domain/format'
import { CHANNEL_LABEL, RESOLUTION_LABEL, STATUS_LABEL, STATUSES } from '../../domain/labels'
import { pkMorning } from '../../domain/sla'
import type { Case } from '../../domain/types'
import { useAuth } from '../../lib/auth'
import { errorMessage } from '../../lib/supabase'
import { cn, useHotkeys } from '../../lib/utils'
import { ChannelIcon, StatusBadge, TagChips, UrgencyBadge } from '../badges'
import { Avatar, Badge, Button, EmptyState, Menu, MenuItem, MenuLabel, MenuSeparator, Modal, Skeleton, Textarea } from '../ui'
import { Composer } from './Composer'
import { AttachmentsCard, CustomerCard, LineItems, OrderCard, ShipmentCard } from './Panels'
import { ResolveDialog } from './ResolveDialog'
import { Timeline } from './Timeline'

function followUpOptions() {
  const now = Date.now()
  const today5 = new Date(pkMorning(0, 17, now))
  return [
    ...(today5.getTime() > now + 30 * 60_000 ? [{ label: 'Later today (5 PM)', at: today5 }] : []),
    { label: 'Tomorrow morning', at: pkMorning(1, 11, now) },
    { label: 'In 2 days', at: pkMorning(2, 11, now) },
    { label: 'In 3 days', at: pkMorning(3, 11, now) },
    { label: 'Next week', at: pkMorning(7, 11, now) },
  ]
}

export function CaseDetail({ id, onBack }: { id: number; onBack?: () => void }) {
  const { data: c, isLoading, error } = useCase(id)
  if (isLoading && !c)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    )
  if (error || !c) return <EmptyState title="Case not found">{error ? errorMessage(error) : 'It may have been deleted.'}</EmptyState>
  return <CaseBody c={c} onBack={onBack} />
}

function CaseBody({ c, onBack }: { c: Case; onBack?: () => void }) {
  const { can, member } = useAuth()
  const { members, types, memberName, typeLabel, type } = useRefs()
  const update = useUpdateCase()
  const del = useDeleteCase()
  const navigate = useNavigate()
  const events = useCaseEvents(c.id)
  const order = useOrder(c.order_id)
  const [resolving, setResolving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.description)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const agent = can('agent')
  const resolved = c.status === 'resolved'
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: c.id, patch: p })
  const shipment = order.data?.shipments.find((s) => s.tracking_number === c.tracking_number) ?? order.data?.shipments[0] ?? null
  const assignable = members.filter((m) => m.active && m.role !== 'viewer')

  useHotkeys(
    {
      r: () => !resolved && setResolving(true),
      m: () => member && c.assignee !== member.user_id && patch({ assignee: member.user_id }),
    },
    agent,
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        {onBack ? (
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to list" className="lg:hidden">
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <span className="tabular text-[13px] font-semibold text-muted">{c.ref}</span>

        {agent && !resolved ? (
          <Menu
            trigger={
              <button type="button" className="inline-flex items-center gap-0.5" aria-label="Change status">
                <StatusBadge status={c.status} />
                <ChevronDown className="size-3 text-faint" />
              </button>
            }
          >
            {STATUSES.filter((s) => s !== 'resolved').map((s) => (
              <MenuItem key={s} checked={c.status === s} onSelect={() => patch({ status: s })}>
                {STATUS_LABEL[s]}
              </MenuItem>
            ))}
          </Menu>
        ) : (
          <StatusBadge status={c.status} />
        )}

        <UrgencyBadge c={c} />

        <div className="ml-auto flex items-center gap-1.5">
          {agent ? (
            <Menu
              align="end"
              trigger={
                <Button variant="secondary" size="sm">
                  <Avatar name={memberName(c.assignee)} size={18} />
                  <span className="max-w-28 truncate">{memberName(c.assignee)}</span>
                  <ChevronDown className="size-3 text-faint" />
                </Button>
              }
            >
              <MenuLabel>Assign to</MenuLabel>
              {member && c.assignee !== member.user_id ? (
                <MenuItem onSelect={() => patch({ assignee: member.user_id })} hint="M">
                  Me
                </MenuItem>
              ) : null}
              {assignable.map((m) => (
                <MenuItem key={m.user_id} checked={c.assignee === m.user_id} onSelect={() => patch({ assignee: m.user_id })}>
                  {m.full_name ?? m.email}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => patch({ assignee: null })}>Unassigned</MenuItem>
            </Menu>
          ) : null}

          {agent && !resolved ? (
            <Menu
              align="end"
              trigger={
                <Button variant="secondary" size="sm" title={c.follow_up_at ? `Follow-up ${fmtDateTime(c.follow_up_at)}` : 'Set follow-up'}>
                  <BellRing className="size-3.5" />
                  <span className="hidden sm:inline">{c.follow_up_at ? relTime(c.follow_up_at) : 'Follow-up'}</span>
                </Button>
              }
            >
              <MenuLabel>Remind me</MenuLabel>
              {followUpOptions().map((o) => (
                <MenuItem key={o.label} onSelect={() => patch({ follow_up_at: o.at.toISOString() })} hint={fmtDateTime(o.at).split(',')[0]}>
                  {o.label}
                </MenuItem>
              ))}
              {c.follow_up_at ? (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => patch({ follow_up_at: null })}>Clear follow-up</MenuItem>
                </>
              ) : null}
            </Menu>
          ) : null}

          {agent ? (
            resolved ? (
              <Button variant="secondary" size="sm" onClick={() => patch({ status: 'in_progress' })}>
                <RotateCcw className="size-3.5" /> Reopen
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setResolving(true)}>
                <CheckCircle2 className="size-3.5" /> Resolve <span className="opacity-50">R</span>
              </Button>
            )
          ) : null}

          <Menu
            align="end"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            }
          >
            <MenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(`${location.origin}${location.pathname}#/inbox/all/${c.id}`)
                toast.success('Link copied')
              }}
            >
              <span className="flex items-center gap-2">
                <Link2 className="size-3.5" /> Copy link
              </span>
            </MenuItem>
            {c.phone_key ? (
              <MenuItem onSelect={() => navigate(`/customers/${c.phone_key}`)}>
                <span className="flex items-center gap-2">
                  <UserRound className="size-3.5" /> Customer profile
                </span>
              </MenuItem>
            ) : null}
            {can('admin') ? (
              <>
                <MenuSeparator />
                <MenuItem danger onSelect={() => setConfirmDelete(true)}>
                  <span className="flex items-center gap-2">
                    <Trash2 className="size-3.5" /> Delete case
                  </span>
                </MenuItem>
              </>
            ) : null}
          </Menu>
        </div>
      </div>

      {/* Body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:p-6">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {agent ? (
                  <Menu
                    trigger={
                      <button type="button" className="inline-flex items-center gap-1 text-[19px] font-semibold tracking-tight hover:text-accent">
                        {typeLabel(c.type_id)} <ChevronDown className="size-4 text-faint" />
                      </button>
                    }
                  >
                    <MenuLabel>Complaint type</MenuLabel>
                    {types
                      .filter((t) => t.active || t.id === c.type_id)
                      .map((t) => (
                        <MenuItem key={t.id} checked={c.type_id === t.id} onSelect={() => patch({ type_id: t.id })}>
                          {t.label}
                        </MenuItem>
                      ))}
                  </Menu>
                ) : (
                  <h2 className="text-[19px] font-semibold tracking-tight">{typeLabel(c.type_id)}</h2>
                )}
                <button
                  type="button"
                  disabled={!agent}
                  onClick={() => patch({ severity: c.severity === 'serious' ? 'non_serious' : 'serious' })}
                  title={agent ? 'Toggle severity' : undefined}
                >
                  {c.severity === 'serious' ? (
                    <Badge tone="bad">
                      <AlertTriangle className="size-3" /> Serious
                    </Badge>
                  ) : (
                    <Badge>Non-serious</Badge>
                  )}
                </button>
                <TagChips tags={c.tags} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <ChannelIcon channel={c.channel} /> via {CHANNEL_LABEL[c.channel]}
                </span>
                <span>Received {fmtDateTime(c.received_at)}</span>
                {c.due_at && !resolved ? <span>SLA due {fmtDateTime(c.due_at)}</span> : null}
                {c.first_response_at ? <span>First reply in {fmtHours((Date.parse(c.first_response_at) - Date.parse(c.received_at)) / 3_600_000)}</span> : null}
              </div>
            </div>

            {resolved ? (
              <div className="flex items-start gap-3 rounded-xl border border-ok/30 bg-ok-bg px-4 py-3 text-[13px]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                <div>
                  <b>Resolved {fmtDateTime(c.resolved_at)}</b>
                  {c.resolution ? <> — {RESOLUTION_LABEL[c.resolution]}</> : null}
                  {c.resolution_cost > 0 ? <> · cost {fmtMoney(c.resolution_cost)}</> : null}
                  {c.resolution_notes ? <p className="mt-1 text-muted">{c.resolution_notes}</p> : null}
                </div>
              </div>
            ) : null}

            <section className="rounded-xl border border-border bg-surface">
              <header className="flex items-center justify-between border-b border-border px-4 py-2">
                <h3 className="text-[13px] font-semibold">Customer’s complaint</h3>
                {agent && !editing ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setDraft(c.description)
                      setEditing(true)
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </header>
              <div className="px-4 py-3">
                {editing ? (
                  <div className="space-y-2">
                    <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!draft.trim()}
                        onClick={() => {
                          patch({ description: draft.trim() })
                          setEditing(false)
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{c.description}</p>
                )}
                {c.items.length ? (
                  <div className="mt-3 border-t border-border pt-2">
                    <div className="text-[11px] font-semibold tracking-wide text-faint uppercase">Affected items</div>
                    <LineItems lines={c.items} />
                  </div>
                ) : null}
              </div>
            </section>

            <Composer c={c} shipmentStatus={shipment?.status} readOnly={!agent} />

            <section>
              <h3 className="mb-3 text-[13px] font-semibold">Activity</h3>
              <Timeline events={events.data} loading={events.isLoading} />
            </section>
          </div>

          <aside className="min-w-0 space-y-4">
            <CustomerCard name={c.customer_name} phone={c.phone} city={c.city} phoneKey={c.phone_key} />
            {c.order_id || c.tracking_number ? (
              <ShipmentCard shipment={shipment} events={order.data?.events} fallback={{ courier: c.courier, tracking: c.tracking_number }} />
            ) : null}
            {c.order_id ? (
              <OrderCard order={order.data} loading={order.isLoading} affected={c.items} />
            ) : c.order_name ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted">
                Order {c.order_name} isn’t in the synced Shopify data (it may be older than the sync window or mistyped).
              </p>
            ) : null}
            <AttachmentsCard caseId={c.id} />
          </aside>
        </div>
      </div>

      {resolving ? <ResolveDialog c={c} typeLabel={type(c.type_id)?.label ?? ''} open={resolving} onOpenChange={setResolving} /> : null}
      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${c.ref}?`}
        description="The case, its history and photos are permanently removed. Reports will no longer count it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={() =>
                del.mutate(c.id, {
                  onSuccess: () => {
                    toast.success(`${c.ref} deleted`)
                    setConfirmDelete(false)
                    onBack?.()
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className={cn('text-[13px] text-muted')}>Prefer “Resolve” for normal cases — deletion is for duplicates or test entries.</p>
      </Modal>
    </div>
  )
}
