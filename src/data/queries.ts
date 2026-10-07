import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { looksLikePhone, phoneKey } from '../domain/phone'
import { priorityScore } from '../domain/sla'
import type {
  Attachment,
  Case,
  CaseEvent,
  ComplaintType,
  Counts,
  Customer360,
  Insights,
  Member,
  Order,
  SearchResult,
  Settings,
  Severity,
  Status,
  Template,
  TrackEvent,
  WatchRow,
} from '../domain/types'
import { useAuth } from '../lib/auth'
import { edge, errorMessage, rpc, supabase } from '../lib/supabase'
import { usePageVisible } from '../lib/utils'

const TEN_MIN = 10 * 60_000

export const qk = {
  members: ['members'] as const,
  types: ['types'] as const,
  templates: ['templates'] as const,
  settings: ['settings'] as const,
  counts: ['counts'] as const,
  cases: ['cases'] as const,
  case: (id: number) => ['case', id] as const,
  events: (id: number) => ['events', id] as const,
  attachments: (id: number) => ['attachments', id] as const,
  order: (id: number) => ['order', id] as const,
  lookup: (q: string) => ['lookup', q] as const,
  customer: (k: string) => ['customer', k] as const,
  watch: ['watch'] as const,
  insights: (from: string, to: string) => ['insights', from, to] as const,
  search: (q: string) => ['search', q] as const,
  images: (ids: string) => ['images', ids] as const,
  track: (tn: string) => ['track', tn] as const,
}

async function select<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(errorMessage(error))
  return data as T
}

// ---------------------------------------------------------------- reference data
export function useMembers() {
  return useQuery({
    queryKey: qk.members,
    queryFn: () => select<Member[]>(supabase.from('crm_members').select('*').order('full_name')),
    staleTime: TEN_MIN,
  })
}

export function useTypes() {
  return useQuery({
    queryKey: qk.types,
    queryFn: () => select<ComplaintType[]>(supabase.from('crm_complaint_types').select('*').order('sort').order('label')),
    staleTime: TEN_MIN,
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: qk.templates,
    queryFn: () => select<Template[]>(supabase.from('crm_templates').select('*').order('sort').order('title')),
    staleTime: TEN_MIN,
  })
}

export const DEFAULT_SETTINGS: Settings = {
  auto_assign: true,
  auto_close_awaiting_days: 7,
  order_prefix: '#haven',
  brand_name: 'Havenwear',
  store_url: 'https://havenwearpakistan.com',
  watch: { booked_days: 3, in_transit_days: 5 },
  tracking_urls: {},
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const rows = await select<{ key: string; value: unknown }[]>(supabase.from('crm_settings').select('key,value'))
      const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
      for (const r of rows) s[r.key] = r.value
      return s as unknown as Settings
    },
    staleTime: TEN_MIN,
    placeholderData: DEFAULT_SETTINGS,
  })
}

/** Lookup helpers built from cached reference data. */
export function useRefs() {
  const members = useMembers().data ?? []
  const types = useTypes().data ?? []
  const memberById = new Map(members.map((m) => [m.user_id, m]))
  const typeById = new Map(types.map((t) => [t.id, t]))
  return {
    members,
    types,
    memberName: (id: string | null | undefined) => {
      if (!id) return 'Unassigned'
      const m = memberById.get(id)
      return m ? (m.full_name ?? m.email.split('@')[0]!) : 'Former member'
    },
    member: (id: string | null | undefined) => (id ? memberById.get(id) : undefined),
    typeLabel: (id: number | null | undefined) => (id != null ? (typeById.get(id)?.label ?? '—') : '—'),
    type: (id: number | null | undefined) => (id != null ? typeById.get(id) : undefined),
  }
}

// ---------------------------------------------------------------- badges
export function useCounts() {
  const visible = usePageVisible()
  return useQuery({
    queryKey: qk.counts,
    queryFn: () => rpc<Counts>('crm_counts'),
    // One cheap call per minute, only while the tab is visible (no realtime channel).
    refetchInterval: visible ? 60_000 : false,
    staleTime: 20_000,
  })
}

// ---------------------------------------------------------------- cases
export type QueueView = 'mine' | 'all_open' | 'unassigned' | 'overdue' | 'followups' | 'awaiting' | 'serious' | 'resolved' | 'all'

export interface CaseFilters {
  view: QueueView
  q?: string
  typeId?: number | null
  severity?: Severity | null
  assignee?: string | null
  status?: Status | null
  channel?: string | null
}

const LIST_COLUMNS =
  'id,ref,received_at,channel,order_id,order_name,customer_name,phone,phone_key,city,courier,tracking_number,type_id,severity,status,description,tags,assignee,follow_up_at,due_at,first_response_at,resolved_at,resolution,resolution_cost,last_activity_at,items'

export type CaseRow = Omit<Case, 'resolution_notes' | 'created_by' | 'created_at' | 'updated_at'>

const PAGE = 40

function eodPk(): string {
  const now = Date.now() + 5 * 3_600_000
  const day = new Date(now).toISOString().slice(0, 10)
  return new Date(`${day}T23:59:59+05:00`).toISOString()
}

function applyFilters(uid: string | undefined, f: CaseFilters) {
  let q = supabase.from('crm_cases').select(LIST_COLUMNS)
  const nowIso = new Date().toISOString()
  switch (f.view) {
    case 'mine':
      q = q.eq('assignee', uid ?? '00000000-0000-0000-0000-000000000000').neq('status', 'resolved')
      break
    case 'all_open':
      q = q.neq('status', 'resolved')
      break
    case 'unassigned':
      q = q.is('assignee', null).neq('status', 'resolved')
      break
    case 'overdue':
      q = q.in('status', ['open', 'in_progress']).lt('due_at', nowIso)
      break
    case 'followups':
      q = q.neq('status', 'resolved').lte('follow_up_at', eodPk())
      break
    case 'awaiting':
      q = q.eq('status', 'awaiting_customer')
      break
    case 'serious':
      q = q.neq('status', 'resolved').eq('severity', 'serious')
      break
    case 'resolved':
      q = q.eq('status', 'resolved')
      break
    case 'all':
      break
  }
  if (f.typeId) q = q.eq('type_id', f.typeId)
  if (f.severity) q = q.eq('severity', f.severity)
  if (f.status) q = q.eq('status', f.status)
  if (f.channel) q = q.eq('channel', f.channel)
  if (f.assignee) q = f.assignee === 'none' ? q.is('assignee', null) : q.eq('assignee', f.assignee)
  const term = (f.q ?? '').trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    const safe = term.replace(/[%,()*\\]/g, ' ').trim()
    const ors: string[] = [`customer_name.ilike.*${safe}*`, `order_name.ilike.*${safe}*`, `description.ilike.*${safe}*`]
    if (/^hc-?\d+$/i.test(term)) ors.push(`id.eq.${Number(digits)}`)
    if (looksLikePhone(term)) ors.push(`phone_key.eq.${phoneKey(term)}`)
    if (/^[A-Z0-9]{6,}$/i.test(term)) ors.push(`tracking_number.eq.${term.toUpperCase()}`)
    q = q.or(ors.join(','))
  }
  return q
}

const isWorkQueue = (v: QueueView) => v !== 'resolved' && v !== 'all'

/**
 * Work queues (open cases) are small, so they load in one request and are sorted by
 * priority on the device. History views (resolved / all) are keyset-paginated.
 */
export function useCases(f: CaseFilters) {
  const { member } = useAuth()
  const uid = member?.user_id
  return useInfiniteQuery({
    queryKey: [...qk.cases, f, uid],
    initialPageParam: null as null | { at: string; id: number },
    queryFn: async ({ pageParam }) => {
      let q = applyFilters(uid, f)
      if (isWorkQueue(f.view)) {
        const rows = await select<CaseRow[]>(q.order('received_at', { ascending: false }).limit(500))
        const now = Date.now()
        rows.sort((a, b) => priorityScore(a, now) - priorityScore(b, now) || (a.due_at ?? '').localeCompare(b.due_at ?? ''))
        return { rows, next: null }
      }
      if (pageParam) {
        q = q.or(`received_at.lt.${pageParam.at},and(received_at.eq.${pageParam.at},id.lt.${pageParam.id})`)
      }
      const rows = await select<CaseRow[]>(q.order('received_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE))
      const last = rows[rows.length - 1]
      return { rows, next: rows.length === PAGE && last ? { at: last.received_at, id: last.id } : null }
    },
    getNextPageParam: (p) => p.next,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  })
}

/** Fetch every row for the current filters (CSV export), page by page. */
export async function fetchAllCases(uid: string | undefined, f: CaseFilters): Promise<CaseRow[]> {
  const out: CaseRow[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const rows = await select<CaseRow[]>(
      applyFilters(uid, f)
        .order('received_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + 999),
    )
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export function useCase(id: number | null) {
  return useQuery({
    queryKey: qk.case(id ?? 0),
    queryFn: () => select<Case>(supabase.from('crm_cases').select('*').eq('id', id!).single()),
    enabled: !!id,
    staleTime: 15_000,
  })
}

export function useCaseEvents(id: number | null) {
  return useQuery({
    queryKey: qk.events(id ?? 0),
    queryFn: () =>
      select<CaseEvent[]>(supabase.from('crm_case_events').select('*').eq('case_id', id!).order('created_at').order('id').limit(500)),
    enabled: !!id,
    staleTime: 15_000,
  })
}

export function useAttachments(id: number | null) {
  return useQuery({
    queryKey: qk.attachments(id ?? 0),
    queryFn: async () => {
      const rows = await select<Attachment[]>(supabase.from('crm_attachments').select('*').eq('case_id', id!).order('created_at'))
      if (!rows.length) return [] as (Attachment & { url: string | null })[]
      // Short-lived signed URLs; the bucket is private.
      const { data } = await supabase.storage.from('crm-attachments').createSignedUrls(
        rows.map((r) => r.path),
        3600,
      )
      const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
      return rows.map((r) => ({ ...r, url: byPath.get(r.path) ?? null }))
    },
    enabled: !!id,
    staleTime: 30 * 60_000,
  })
}

// ---------------------------------------------------------------- Shopify / courier data (via Hisab Kitab sync)
export function useOrder(orderId: number | null | undefined) {
  return useQuery({
    queryKey: qk.order(orderId ?? 0),
    queryFn: () => rpc<Order | null>('crm_order', { p_id: orderId }),
    enabled: !!orderId,
    staleTime: 5 * 60_000,
  })
}

const looksLikeOrder = (q: string) => /^#?[a-z]*\d{3,8}$/i.test(q.replace(/\s/g, ''))

/**
 * Finds orders by order number, tracking number, phone or name from the synced data.
 * If an order number is not found (placed after the last 30-minute sync), it is fetched
 * live from Shopify through the crm-live function.
 */
export function useLookup(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: qk.lookup(term.toLowerCase()),
    queryFn: async () => {
      const found = await rpc<Order[]>('crm_lookup', { p_q: term, p_limit: 8 })
      if (found.length || !looksLikeOrder(term)) return found
      try {
        const live = await edge<{ order: Order | null }>('crm-live', { action: 'order', name: term })
        return live.order ? [{ ...live.order, live: true }] : []
      } catch {
        return found
      }
    },
    enabled: term.length >= 3,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useCustomer(phoneKey: string | null | undefined) {
  return useQuery({
    queryKey: qk.customer(phoneKey ?? ''),
    queryFn: () => rpc<Customer360 | null>('crm_customer', { p_phone: phoneKey }),
    enabled: !!phoneKey && phoneKey.length >= 6,
    staleTime: 2 * 60_000,
  })
}

export function useWatch() {
  return useQuery({ queryKey: qk.watch, queryFn: () => rpc<WatchRow[]>('crm_delivery_watch'), staleTime: 2 * 60_000 })
}

export function useInsights(from: string, to: string) {
  return useQuery({
    queryKey: qk.insights(from, to),
    queryFn: () => rpc<Insights>('crm_insights', { p_from: from, p_to: to }),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useSearch(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: qk.search(term.toLowerCase()),
    queryFn: () => rpc<SearchResult>('crm_search', { p_q: term }),
    enabled: term.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** Product thumbnails from Shopify (cached on the device for a day). */
export function useProductImages(productIds: (number | null | undefined)[]) {
  const ids = [...new Set(productIds.filter((x): x is number => !!x))].sort((a, b) => a - b)
  const key = ids.join(',')
  return useQuery({
    queryKey: qk.images(key),
    queryFn: () => edge<{ images: Record<string, string> }>('crm-live', { action: 'images', product_ids: ids }).then((r) => r.images),
    enabled: ids.length > 0,
    staleTime: 24 * 60 * 60_000,
    gcTime: 3 * 24 * 60 * 60_000,
    retry: false,
  })
}

export interface LiveTracking {
  ok: boolean
  status?: string
  raw?: string
  at?: string | null
  events?: TrackEvent[]
  error?: string
  checked_at: string
}

/** On-demand live courier tracking (the hourly sync covers everything else). */
export function useLiveTracking(trackingNumber: string | null | undefined, courier: string | null | undefined) {
  return useQuery({
    queryKey: qk.track(trackingNumber ?? ''),
    queryFn: () => edge<LiveTracking>('crm-live', { action: 'track', tracking_number: trackingNumber, courier }),
    enabled: false,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
