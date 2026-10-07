import { CheckSquare, Download, Inbox as InboxIcon, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChannelIcon, SeverityBadge, StatusDot, TagChips, UrgencyBadge } from '../components/badges'
import { CaseDetail } from '../components/case/CaseDetail'
import { Avatar, Button, EmptyState, Menu, MenuItem, MenuLabel, MenuSeparator, Select, Skeleton } from '../components/ui'
import { useBulkUpdate } from '../data/mutations'
import { fetchAllCases, useCases, useRefs, type CaseFilters, type CaseRow, type QueueView } from '../data/queries'
import { toCsv, downloadText } from '../domain/csv'
import { fmtDateTime, relTime, pkIsoDate } from '../domain/format'
import { CHANNEL_LABEL, RESOLUTION_LABEL, SEVERITY_LABEL, STATUS_LABEL, STATUSES } from '../domain/labels'
import { pkMorning } from '../domain/sla'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/supabase'
import { cn, useDebounced, useHotkeys } from '../lib/utils'

const VIEW_TITLE: Record<QueueView, { title: string; empty: string }> = {
  mine: { title: 'My queue', empty: 'Nothing assigned to you. New cases are auto-assigned to whoever has the fewest open.' },
  followups: { title: 'Follow-ups due', empty: 'No follow-ups due today. 🎉' },
  overdue: { title: 'Overdue', empty: 'Every open case is within its SLA.' },
  unassigned: { title: 'Unassigned', empty: 'Every open case has an owner.' },
  serious: { title: 'Serious', empty: 'No serious cases open.' },
  awaiting: { title: 'Awaiting customer', empty: 'No cases are waiting on customers.' },
  all_open: { title: 'All open', empty: 'No open cases — inbox zero!' },
  resolved: { title: 'Resolved', empty: 'No resolved cases match.' },
  all: { title: 'All cases', empty: 'No cases match.' },
}

function CaseListRow({
  c,
  active,
  selected,
  selecting,
  onOpen,
  onToggle,
}: {
  c: CaseRow
  active: boolean
  selected: boolean
  selecting: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  const { memberName, typeLabel } = useRefs()
  return (
    <li
      data-case={c.id}
      className={cn(
        'group relative flex cursor-pointer gap-2.5 border-b border-border px-3 py-2.5 transition-colors',
        active ? 'bg-accent-bg/60' : 'hover:bg-hover/60',
      )}
    >
      {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden /> : null}
      <div className="flex w-4 flex-col items-center pt-0.5">
        <input
          type="checkbox"
          aria-label={`Select ${c.ref}`}
          checked={selected}
          onChange={onToggle}
          className={cn('size-3.5 accent-[var(--c-accent)]', selecting || selected ? 'block' : 'hidden group-hover:block')}
        />
        {!(selecting || selected) ? <StatusDot status={c.status} className="group-hover:hidden" /> : null}
      </div>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold">{c.customer_name || 'Unknown customer'}</span>
          <span className="tabular shrink-0 text-[11px] text-faint">{c.order_name ?? c.ref}</span>
          <span className="ml-auto shrink-0 text-[11px] text-faint" title={fmtDateTime(c.received_at)}>
            {relTime(c.received_at).replace(' ago', '')}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          <ChannelIcon channel={c.channel} />
          <span className="font-medium text-muted">{typeLabel(c.type_id)}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-faint">{c.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <SeverityBadge severity={c.severity} />
          <UrgencyBadge c={c} />
          <TagChips tags={c.tags.filter((t) => t === 'vip' || t === 'repeat')} />
          <span className="ml-auto" title={memberName(c.assignee)}>
            {c.assignee ? <Avatar name={memberName(c.assignee)} size={18} /> : <span className="text-[11px] text-bad">Unassigned</span>}
          </span>
        </div>
      </button>
    </li>
  )
}

export default function Inbox() {
  const params = useParams()
  const view = (params.view as QueueView) in VIEW_TITLE ? (params.view as QueueView) : 'mine'
  const caseId = params.caseId ? Number(params.caseId) : null
  const navigate = useNavigate()
  const { member, can } = useAuth()
  const { types, members, memberName, typeLabel } = useRefs()
  const [q, setQ] = useState('')
  const [typeId, setTypeId] = useState<number | null>(null)
  const [severity, setSeverity] = useState<'serious' | 'non_serious' | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  // Selection belongs to one view; switching views starts fresh.
  const [selection, setSelection] = useState<{ view: QueueView; ids: Set<number> }>({ view, ids: new Set() })
  const selected = selection.view === view ? selection.ids : new Set<number>()
  const setSelected = (fn: Set<number> | ((s: Set<number>) => Set<number>)) =>
    setSelection({ view, ids: typeof fn === "function" ? fn(selected) : fn })
  const [exporting, setExporting] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const debounced = useDebounced(q, 250)
  const bulk = useBulkUpdate()

  const filters: CaseFilters = useMemo(
    () => ({ view, q: debounced, typeId, severity, assignee: view === 'mine' ? null : assignee }),
    [view, debounced, typeId, severity, assignee],
  )
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, error } = useCases(filters)
  const rows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data])

  const open = (id: number) => navigate(`/inbox/${view}/${id}`)
  const idx = rows.findIndex((r) => r.id === caseId)
  useHotkeys({
    j: () => {
      const next = rows[Math.min(rows.length - 1, idx + 1)]
      if (next) open(next.id)
    },
    k: () => {
      const prev = rows[Math.max(0, idx - 1)]
      if (prev) open(prev.id)
    },
    escape: () => caseId && navigate(`/inbox/${view}`),
    f: () => searchRef.current?.focus(),
  })

  useEffect(() => {
    if (caseId) listRef.current?.querySelector(`[data-case="${caseId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [caseId])

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const bulkPatch = (patch: Parameters<typeof bulk.mutate>[0]['patch'], label: string) =>
    bulk.mutate(
      { ids: [...selected], patch },
      {
        onSuccess: () => {
          toast.success(`${label} — ${selected.size} case${selected.size > 1 ? 's' : ''}`)
          setSelected(new Set())
        },
      },
    )

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all = await fetchAllCases(member?.user_id, filters)
      const csv = toCsv(
        ['Ref', 'Received', 'Channel', 'Order', 'Customer', 'Phone', 'City', 'Type', 'Severity', 'Status', 'Assigned to', 'Courier', 'Tracking', 'Follow-up', 'SLA due', 'First response', 'Resolved', 'Resolution', 'Cost (Rs)', 'Items', 'Complaint', 'Tags'],
        all.map((c) => [
          c.ref,
          fmtDateTime(c.received_at),
          CHANNEL_LABEL[c.channel],
          c.order_name,
          c.customer_name,
          c.phone,
          c.city,
          typeLabel(c.type_id),
          SEVERITY_LABEL[c.severity],
          STATUS_LABEL[c.status],
          c.assignee ? memberName(c.assignee) : '',
          c.courier,
          c.tracking_number,
          c.follow_up_at ? fmtDateTime(c.follow_up_at) : '',
          c.due_at ? fmtDateTime(c.due_at) : '',
          c.first_response_at ? fmtDateTime(c.first_response_at) : '',
          c.resolved_at ? fmtDateTime(c.resolved_at) : '',
          c.resolution ? RESOLUTION_LABEL[c.resolution] : '',
          c.resolution_cost || '',
          c.items.map((i) => i.title + (i.variant ? ` (${i.variant})` : '')).join('; '),
          c.description,
          c.tags.join(', '),
        ]),
      )
      downloadText(`havenwear-cases-${view}-${pkIsoDate()}.csv`, csv)
      toast.success(`Exported ${all.length} cases`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  const activeFilters = [typeId, severity, view === 'mine' ? null : assignee].filter(Boolean).length
  const meta = VIEW_TITLE[view]

  return (
    <div className="flex h-full">
      {/* List */}
      <section className={cn('flex min-w-0 flex-col border-r border-border bg-surface lg:w-[400px] lg:shrink-0', caseId ? 'hidden lg:flex' : 'flex w-full')} aria-label={meta.title}>
        <div className="space-y-2 border-b border-border px-3 pt-3 pb-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold">{meta.title}</h1>
            <span className="tabular text-xs text-faint">
              {rows.length}
              {hasNextPage ? '+' : ''}
            </span>
            <div className="ml-auto flex gap-1">
              <Button variant={showFilters || activeFilters ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setShowFilters((v) => !v)} aria-label="Filters" aria-pressed={showFilters}>
                <SlidersHorizontal className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => void exportCsv()} disabled={exporting} aria-label="Export CSV" title="Export these cases (CSV)">
                <Download className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by name, order, phone, text…  (F)"
              className="h-8 w-full rounded-lg border border-border bg-surface-2 pr-7 pl-8 text-[13px] placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
            {q ? (
              <button type="button" onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-faint hover:text-text" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          {showFilters ? (
            <div className="grid grid-cols-2 gap-1.5 animate-in">
              <Select value={typeId ?? ''} onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)} aria-label="Type" className="[&_select]:h-8 [&_select]:text-[13px]">
                <option value="">All types</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Select value={severity ?? ''} onChange={(e) => setSeverity((e.target.value || null) as typeof severity)} aria-label="Severity" className="[&_select]:h-8 [&_select]:text-[13px]">
                <option value="">Any severity</option>
                <option value="serious">Serious</option>
                <option value="non_serious">Non-serious</option>
              </Select>
              {view !== 'mine' ? (
                <Select value={assignee ?? ''} onChange={(e) => setAssignee(e.target.value || null)} aria-label="Assignee" className="col-span-2 [&_select]:h-8 [&_select]:text-[13px]">
                  <option value="">Anyone</option>
                  <option value="none">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name ?? m.email}
                    </option>
                  ))}
                </Select>
              ) : null}
              {activeFilters ? (
                <button
                  type="button"
                  className="col-span-2 text-left text-xs font-medium text-accent hover:underline"
                  onClick={() => {
                    setTypeId(null)
                    setSeverity(null)
                    setAssignee(null)
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {selected.size && can('agent') ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-accent-bg/50 px-3 py-2 text-[13px]">
            <CheckSquare className="size-4 text-accent" aria-hidden />
            <span className="font-medium">{selected.size} selected</span>
            <Menu trigger={<Button size="xs">Assign</Button>}>
              <MenuLabel>Assign to</MenuLabel>
              {members
                .filter((m) => m.active && m.role !== 'viewer')
                .map((m) => (
                  <MenuItem key={m.user_id} onSelect={() => bulkPatch({ assignee: m.user_id }, `Assigned to ${m.full_name ?? m.email}`)}>
                    {m.full_name ?? m.email}
                  </MenuItem>
                ))}
              <MenuSeparator />
              <MenuItem onSelect={() => bulkPatch({ assignee: null }, 'Unassigned')}>Unassigned</MenuItem>
            </Menu>
            <Menu trigger={<Button size="xs">Status</Button>}>
              {STATUSES.filter((s) => s !== 'resolved').map((s) => (
                <MenuItem key={s} onSelect={() => bulkPatch({ status: s }, STATUS_LABEL[s])}>
                  {STATUS_LABEL[s]}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => bulkPatch({ status: 'resolved', resolution: 'no_action' }, 'Resolved')}>Resolve (no action needed)</MenuItem>
            </Menu>
            <Button size="xs" onClick={() => bulkPatch({ follow_up_at: pkMorning(1).toISOString() }, 'Follow-up tomorrow')}>
              Follow up tomorrow
            </Button>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="mb-2 h-16" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Could not load cases">{errorMessage(error)}</EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState icon={<InboxIcon className="size-5" />} title={debounced || activeFilters ? 'No matches' : 'All clear'}>
              {debounced || activeFilters ? 'Try a different search or clear the filters.' : meta.empty}
            </EmptyState>
          ) : (
            <ul ref={listRef}>
              {rows.map((c) => (
                <CaseListRow
                  key={c.id}
                  c={c}
                  active={c.id === caseId}
                  selected={selected.has(c.id)}
                  selecting={selected.size > 0}
                  onOpen={() => open(c.id)}
                  onToggle={() => toggle(c.id)}
                />
              ))}
            </ul>
          )}
          {hasNextPage ? (
            <div className="p-3">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => void fetchNextPage()} loading={isFetchingNextPage}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
        <div className="hidden border-t border-border px-3 py-1.5 text-[11px] text-faint lg:block">
          <b>J/K</b> next/prev · <b>C</b> new · <b>R</b> resolve · <b>M</b> assign to me · <b>/</b> search
        </div>
      </section>

      {/* Detail */}
      <section className={cn('min-w-0 flex-1 bg-bg', caseId ? 'block' : 'hidden lg:block')}>
        {caseId ? (
          <CaseDetail key={caseId} id={caseId} onBack={() => navigate(`/inbox/${view}`)} />
        ) : (
          <EmptyState icon={<InboxIcon className="size-5" />} title="Select a case">
            Pick a case on the left, or press <b>C</b> to log a new complaint. Search any order, phone or tracking number with <b>/</b>.
          </EmptyState>
        )}
      </section>
    </div>
  )
}
