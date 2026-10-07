import type { Channel, ComplaintType, Member, Severity, Status } from './types'

/**
 * Converts rows of the old "HAVENWEAR Complaint log" Google Sheet into case inserts.
 * Columns are found by header name, so re-ordered or extra columns are fine.
 */
export interface ImportedCase {
  received_at: string
  order_name: string | null
  customer_name: string | null
  phone: string | null
  description: string
  type_id: number | null
  severity: Severity
  status: Status
  courier: string | null
  assignee: string | null
  follow_up_at: string | null
  resolved_at: string | null
  resolution_notes: string | null
  items: { title: string }[]
  channel: Channel
  tags: string[]
}

export interface ImportPlan {
  rows: ImportedCase[]
  warnings: string[]
  skipped: number
}

const HEADERS: Record<string, string[]> = {
  received: ['received date', 'received', 'date'],
  order: ['order number', 'order', 'order #', 'order no'],
  name: ['customer name', 'customer', 'name'],
  phone: ['phone / whatsapp', 'phone', 'whatsapp', 'mobile'],
  product: ['product / variant', 'product', 'item'],
  detail: ['detailed complaint', 'complaint', 'details', 'description'],
  type: ['complaint type', 'type'],
  severity: ['severity'],
  status: ['status'],
  courier: ['courier'],
  assigned: ['assigned to', 'assigned', 'owner'],
  followup: ['follow-up date', 'follow up date', 'follow-up'],
  resolved: ['resolved date', 'resolved'],
  notes: ['action / resolution notes', 'resolution notes', 'notes', 'action'],
}

const clean = (v: unknown) => String(v ?? '').trim()
const norm = (v: unknown) => clean(v).toLowerCase().replace(/\s+/g, ' ')

/** Excel serial (days since 1899-12-30) or common text dates → ISO at noon Pakistan time. */
export function parseSheetDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString()
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86_400_000)
    const d = new Date(ms)
    return new Date(`${d.toISOString().slice(0, 10)}T12:00:00+05:00`).toISOString()
  }
  const s = clean(v)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!
    return iso(y, +m[2]!, +m[1]!)
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})$/)
  if (m) {
    const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2]!.slice(0, 3).toLowerCase())
    if (mon >= 0) return iso(+m[3]! < 100 ? 2000 + +m[3]! : +m[3]!, mon + 1, +m[1]!)
  }
  return null
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return new Date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+05:00`).toISOString()
}

const STATUS_MAP: Record<string, Status> = {
  open: 'open',
  'in progress': 'in_progress',
  'awaiting customer': 'awaiting_customer',
  resolved: 'resolved',
  closed: 'resolved',
}

export function planSheetImport(grid: unknown[][], types: ComplaintType[], members: Member[]): ImportPlan {
  const warnings: string[] = []
  const headerIdx = grid.findIndex((r) => r.some((c) => norm(c) === 'order number') && r.some((c) => norm(c).includes('complaint')))
  if (headerIdx < 0) {
    return { rows: [], warnings: ['Could not find the header row (needs “Order number” and “Detailed complaint”).'], skipped: 0 }
  }
  const header = grid[headerIdx]!.map(norm)
  const col: Record<string, number> = {}
  for (const [key, names] of Object.entries(HEADERS)) {
    col[key] = header.findIndex((h) => names.includes(h))
  }
  const get = (r: unknown[], key: string) => (col[key]! >= 0 ? r[col[key]!] : undefined)

  const typeByLabel = new Map(types.map((t) => [t.label.toLowerCase(), t]))
  const other = types.find((t) => t.label === 'Other')
  const memberByName = (v: string) => {
    const s = v.toLowerCase()
    if (!s) return null
    return (
      members.find((m) => m.email.toLowerCase() === s) ??
      members.find((m) => (m.full_name ?? '').toLowerCase() === s) ??
      members.find((m) => (m.full_name ?? '').toLowerCase().split(' ')[0] === s.split(' ')[0]) ??
      null
    )
  }

  const rows: ImportedCase[] = []
  let skipped = 0
  const unknownTypes = new Set<string>()
  const unknownPeople = new Set<string>()

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? []
    const order = clean(get(r, 'order'))
    const detail = clean(get(r, 'detail'))
    if (!order && !detail) continue
    // A row with a name/phone but no order number and no complaint text is unusable.
    if (!order && !clean(get(r, 'type'))) {
      skipped++
      continue
    }
    const typeLabel = clean(get(r, 'type'))
    let type = typeByLabel.get(typeLabel.toLowerCase())
    if (!type && typeLabel) unknownTypes.add(typeLabel)
    type = type ?? other
    const status = STATUS_MAP[norm(get(r, 'status'))] ?? 'open'
    const sev = norm(get(r, 'severity'))
    const severity: Severity = sev.startsWith('serious') ? 'serious' : sev ? 'non_serious' : (type?.default_severity ?? 'non_serious')
    const assignedRaw = clean(get(r, 'assigned'))
    const member = memberByName(assignedRaw)
    if (assignedRaw && !member) unknownPeople.add(assignedRaw)
    const received = parseSheetDate(get(r, 'received')) ?? new Date().toISOString()
    let resolvedAt = parseSheetDate(get(r, 'resolved'))
    if (status === 'resolved' && !resolvedAt) resolvedAt = received
    const product = clean(get(r, 'product'))
    const courier = norm(get(r, 'courier'))
    const tags = ['imported']
    if (assignedRaw && !member) tags.push(`owner:${assignedRaw.slice(0, 30)}`)

    rows.push({
      received_at: received,
      order_name: order || null,
      customer_name: clean(get(r, 'name')) || null,
      phone: clean(get(r, 'phone')) || null,
      description: (detail || typeLabel || 'Imported complaint').slice(0, 5000),
      type_id: type?.id ?? null,
      severity,
      status,
      courier: courier && courier !== 'other' ? courier : null,
      assignee: member?.user_id ?? null,
      follow_up_at: status === 'resolved' ? null : parseSheetDate(get(r, 'followup')),
      resolved_at: status === 'resolved' ? resolvedAt : null,
      resolution_notes: clean(get(r, 'notes')) || null,
      items: product ? [{ title: product.slice(0, 200) }] : [],
      channel: 'whatsapp',
      tags,
    })
  }
  if (unknownTypes.size) warnings.push(`Unknown complaint types imported as “Other”: ${[...unknownTypes].join(', ')}`)
  if (unknownPeople.size) warnings.push(`“Assigned to” names with no matching team member (kept as a tag): ${[...unknownPeople].join(', ')}`)
  return { rows, warnings, skipped }
}
