import type { Channel, CustomerFlag, Resolution, Severity, ShipmentStatus, Status, WatchOutcome, WatchReason } from './types'

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  awaiting_customer: 'Awaiting customer',
  resolved: 'Resolved',
}
export const STATUSES: Status[] = ['open', 'in_progress', 'awaiting_customer', 'resolved']

export const SEVERITY_LABEL: Record<Severity, string> = { serious: 'Serious', non_serious: 'Non-serious' }

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  call: 'Phone call',
  instagram: 'Instagram',
  facebook: 'Facebook',
  email: 'Email',
  website: 'Website',
  other: 'Other',
}
export const CHANNELS = Object.keys(CHANNEL_LABEL) as Channel[]

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  exchange: 'Exchange',
  refund: 'Full refund',
  partial_refund: 'Partial refund',
  reship: 'Re-shipped item',
  voucher: 'Discount voucher',
  return_accepted: 'Return accepted',
  info_provided: 'Info / guidance given',
  courier_claim: 'Courier claim',
  no_action: 'No action needed',
  no_response: 'No customer response',
}
export const RESOLUTIONS = Object.keys(RESOLUTION_LABEL) as Resolution[]
/** Resolutions that usually cost money — the cost field is shown for these. */
export const COSTLY_RESOLUTIONS: Resolution[] = ['exchange', 'refund', 'partial_refund', 'reship', 'voucher', 'courier_claim']

export const FLAG_LABEL: Record<CustomerFlag, string> = {
  none: 'No flag',
  vip: 'VIP',
  watch: 'Watch',
  blocked: 'Blocked (no COD)',
}

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  booked: 'Booked',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivery_failed: 'Delivery failed',
  delivered: 'Delivered',
  return_in_transit: 'Returning',
  returned: 'Returned',
  cancelled: 'Cancelled',
  lost: 'Lost',
  unknown: 'Unknown',
}

export const COURIER_LABEL: Record<string, string> = {
  postex: 'PostEx',
  xps: 'XPS',
  tranzo: 'Tranzo',
  blueex: 'BlueEx',
  mnp: 'M&P',
  unknown: 'Unknown',
}
export const courierLabel = (c: string | null | undefined) => (c ? (COURIER_LABEL[c.toLowerCase()] ?? c) : '—')

export const WATCH_REASON_LABEL: Record<WatchReason, string> = {
  failed_attempt: 'Delivery attempt failed',
  stuck: 'Stuck in transit',
  not_picked: 'Not picked up',
  returning: 'Being returned',
}

export const WATCH_OUTCOME_LABEL: Record<WatchOutcome, string> = {
  reached: 'Reached customer',
  will_receive: 'Will receive',
  address_updated: 'Address updated',
  no_answer: 'No answer',
  refused: 'Refused',
  cancel_requested: 'Wants to cancel',
  dismissed: 'Dismissed',
}

export const ROLE_LABEL = { viewer: 'Viewer', agent: 'Agent', admin: 'Admin' } as const
