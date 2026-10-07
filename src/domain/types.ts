// Shapes of the rows / RPC results the app reads. Mirrors supabase/migrations.

export type Role = 'viewer' | 'agent' | 'admin'
export type Status = 'open' | 'in_progress' | 'awaiting_customer' | 'resolved'
export type Severity = 'non_serious' | 'serious'
export type Channel = 'whatsapp' | 'call' | 'instagram' | 'facebook' | 'email' | 'website' | 'other'
export type Resolution =
  | 'exchange'
  | 'refund'
  | 'partial_refund'
  | 'reship'
  | 'voucher'
  | 'return_accepted'
  | 'info_provided'
  | 'courier_claim'
  | 'no_action'
  | 'no_response'
export type CustomerFlag = 'none' | 'vip' | 'watch' | 'blocked'
export type ShipmentStatus =
  | 'booked'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivery_failed'
  | 'delivered'
  | 'return_in_transit'
  | 'returned'
  | 'cancelled'
  | 'lost'
  | 'unknown'

export interface Member {
  user_id: string
  email: string
  full_name: string | null
  role: Role
  active: boolean
  auto_assign: boolean
  created_at: string
}

export interface ComplaintType {
  id: number
  label: string
  category: 'delivery' | 'product' | 'service' | 'other'
  default_severity: Severity
  sla_hours: number
  follow_up_days: number
  keywords: string[]
  sort: number
  active: boolean
}

export interface Template {
  id: number
  title: string
  body: string
  category: 'general' | 'delivery' | 'resolution' | 'followup' | 'info'
  sets_status: Status | null
  sort: number
  active: boolean
}

export interface CaseItem {
  line_id?: number | null
  title: string
  variant?: string | null
  sku?: string | null
  qty?: number | null
  product_id?: number | null
}

export interface Case {
  id: number
  ref: string
  received_at: string
  channel: Channel
  order_id: number | null
  order_name: string | null
  customer_name: string | null
  phone: string | null
  phone_key: string | null
  city: string | null
  items: CaseItem[]
  courier: string | null
  tracking_number: string | null
  type_id: number | null
  severity: Severity
  status: Status
  description: string
  tags: string[]
  assignee: string | null
  follow_up_at: string | null
  due_at: string | null
  first_response_at: string | null
  resolved_at: string | null
  resolution: Resolution | null
  resolution_cost: number
  resolution_notes: string | null
  last_activity_at: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EventKind =
  | 'created'
  | 'status'
  | 'assigned'
  | 'note'
  | 'contact'
  | 'follow_up'
  | 'resolved'
  | 'reopened'
  | 'attachment'
  | 'system'
  | 'edit'

export interface CaseEvent {
  id: number
  case_id: number
  kind: EventKind
  body: string | null
  meta: Record<string, unknown>
  actor: string | null
  created_at: string
}

export interface Attachment {
  id: number
  case_id: number
  path: string
  mime: string
  size_bytes: number
  created_by: string | null
  created_at: string
}

export interface OrderLine {
  id: number
  title: string
  variant: string | null
  sku: string | null
  qty: number
  ordered_qty: number
  price: number
  product_id: number | null
}

export interface Shipment {
  id: number
  tracking_number: string
  courier: string | null
  status: ShipmentStatus
  status_raw: string | null
  status_at: string | null
  fulfilled_at: string | null
  delivered_at: string | null
  returned_at: string | null
  last_checked_at: string | null
}

export interface TrackEvent {
  shipment_id?: number
  status: ShipmentStatus
  raw: string | null
  at: string | null
}

export interface Order {
  id: number
  name: string
  created_at: string
  cancelled_at: string | null
  financial_status: string | null
  fulfillment_status: string | null
  is_cod: boolean
  total: number
  outstanding: number
  customer_name: string | null
  phone: string | null
  phone_key: string | null
  city: string | null
  province: string | null
  tags: string[]
  note: string | null
  synced_at: string | null
  lines: OrderLine[]
  shipments: Shipment[]
  cases: { id: number; ref: string; status: Status; type_id: number | null; received_at: string }[]
  events?: TrackEvent[]
  /** true when fetched live from Shopify because it is newer than the last sync */
  live?: boolean
}

export interface CustomerProfile {
  phone_key: string
  flag: CustomerFlag
  tags: string[]
  note: string | null
  updated_at: string
  updated_by: string | null
}

export interface CustomerCaseSummary {
  id: number
  ref: string
  status: Status
  type_id: number | null
  severity: Severity
  received_at: string
  resolved_at: string | null
  order_name: string | null
  resolution: Resolution | null
  resolution_cost: number
  summary: string
}

export interface Customer360 {
  phone_key: string
  profile: CustomerProfile | null
  identity: { name: string | null; phone: string | null; city: string | null } | null
  stats: {
    orders: number
    cancelled: number
    delivered: number
    returned: number
    in_flight: number
    spent: number
    first_order: string | null
    last_order: string | null
  }
  orders: Order[]
  cases: CustomerCaseSummary[]
}

export type WatchReason = 'failed_attempt' | 'stuck' | 'not_picked' | 'returning'
export type WatchOutcome =
  | 'reached'
  | 'no_answer'
  | 'address_updated'
  | 'will_receive'
  | 'refused'
  | 'cancel_requested'
  | 'dismissed'

export interface WatchRow {
  shipment_id: number
  tracking_number: string
  courier: string | null
  status: ShipmentStatus
  status_raw: string | null
  status_at: string
  reason: WatchReason
  priority: number
  order: {
    id: number
    name: string
    total: number
    is_cod: boolean
    customer_name: string | null
    phone: string | null
    city: string | null
    created_at: string
  }
  contact: {
    outcome: WatchOutcome
    note: string | null
    attempts: number
    at: string
    by: string | null
    stale: boolean
  } | null
  open_case: number | null
}

export interface Counts {
  open: number
  mine: number
  unassigned: number
  overdue: number
  followups: number
  awaiting: number
  serious: number
  my_due: number
  watch: number
}

export interface Insights {
  bucket: 'day' | 'week' | 'month'
  kpis: {
    cases: number
    serious: number
    resolved: number
    open: number
    avg_resolution_h: number | null
    median_resolution_h: number | null
    avg_first_response_h: number | null
    sla_met_pct: number | null
    resolution_cost: number
    customers: number
    repeat_customers: number
  }
  orders: number
  orders_with_case: number
  open_now: { open: number; overdue: number; oldest_h: number | null }
  by_type: { type_id: number | null; label: string | null; total: number; serious: number; resolved: number; avg_h: number | null }[]
  trend: { b: string; total: number; serious: number; resolved: number }[]
  by_product: { title: string; complaints: number; serious: number; top_type: string | null; sold: number }[]
  by_courier: { courier: string; total: number; serious: number }[]
  by_city: { city: string; total: number }[]
  by_channel: { channel: Channel; total: number }[]
  by_resolution: { resolution: Resolution; total: number; cost: number }[]
  by_agent: {
    assignee: string | null
    name: string
    handled: number
    resolved: number
    sla_met: number
    avg_h: number | null
    first_response_h: number | null
  }[]
  delivery: { shipments: number; delivered: number; returned: number; failed: number; in_flight: number }
  watch_outcomes: { outcome: WatchOutcome; total: number }[]
}

export interface SearchResult {
  cases: {
    id: number
    ref: string
    status: Status
    severity: Severity
    customer_name: string | null
    order_name: string | null
    type_id: number | null
    received_at: string
  }[]
  orders: Order[]
}

export interface Settings {
  auto_assign: boolean
  auto_close_awaiting_days: number
  order_prefix: string
  brand_name: string
  store_url: string
  watch: { booked_days: number; in_transit_days: number }
  tracking_urls: Record<string, string>
}
