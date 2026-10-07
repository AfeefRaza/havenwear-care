/**
 * Canonical customer key for Pakistani numbers (92XXXXXXXXXX).
 * Must stay identical to public.crm_phone_key() in the database.
 */
export function phoneKey(input: string | null | undefined): string | null {
  const d = (input ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0092')) return d.slice(2)
  if (/^92\d{10}$/.test(d)) return d
  if (/^0\d{10}$/.test(d)) return '92' + d.slice(1)
  if (/^3\d{9}$/.test(d)) return '92' + d
  return d
}

/** 923001234567 → 0300 1234567 (local format agents read on the phone). */
export function formatPhone(input: string | null | undefined): string {
  const k = phoneKey(input)
  if (!k) return ''
  if (/^92\d{10}$/.test(k)) return `0${k.slice(2, 5)} ${k.slice(5)}`
  return input ?? k
}

/** True when the text looks like a phone number rather than an order or name. */
export function looksLikePhone(q: string): boolean {
  const d = q.replace(/\D/g, '')
  return d.length >= 10 && d.length <= 13 && /^[\d\s+()-]+$/.test(q.trim())
}
