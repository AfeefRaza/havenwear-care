// All dates are shown in Pakistan time regardless of the device's timezone.
const TZ = 'Asia/Karachi'

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
const numFmt = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 })

export function fmtDate(v: string | number | Date | null | undefined): string {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

export function fmtDateTime(v: string | number | Date | null | undefined): string {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d).replace(' am', ' AM').replace(' pm', ' PM')
}

export function fmtTime(v: string | number | Date): string {
  return timeFmt.format(new Date(v)).replace(' am', ' AM').replace(' pm', ' PM')
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return `Rs ${numFmt.format(Number(n))}`
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return numFmt.format(Number(n))
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

/** "3h", "2d", "just now" — compact, for lists. Future times get "in …". */
export function relTime(v: string | number | Date | null | undefined, now = Date.now()): string {
  if (v == null) return '—'
  const t = new Date(v).getTime()
  if (isNaN(t)) return '—'
  const diff = t - now
  const abs = Math.abs(diff)
  const m = Math.round(abs / 60_000)
  let s: string
  if (m < 1) return 'just now'
  if (m < 60) s = `${m}m`
  else if (m < 60 * 24) s = `${Math.round(m / 60)}h`
  else if (m < 60 * 24 * 60) s = `${Math.round(m / 1440)}d`
  else s = `${Math.round(m / 43_200)}mo`
  return diff > 0 ? `in ${s}` : `${s} ago`
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h`
  return `${(h / 24).toFixed(1)}d`
}

/** Date in Pakistan as yyyy-mm-dd (for <input type=date> and RPC params). */
export function pkIsoDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
