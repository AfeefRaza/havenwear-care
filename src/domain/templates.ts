import { phoneKey } from './phone'

export type TemplateVars = Partial<
  Record<
    | 'name'
    | 'first_name'
    | 'order'
    | 'ref'
    | 'tracking'
    | 'tracking_url'
    | 'courier'
    | 'shipment_status'
    | 'brand'
    | 'agent'
    | 'store_url',
    string | null | undefined
  >
>

export const TEMPLATE_VARIABLES: (keyof TemplateVars)[] = [
  'first_name',
  'name',
  'order',
  'ref',
  'courier',
  'tracking',
  'tracking_url',
  'shipment_status',
  'brand',
  'agent',
  'store_url',
]

export function firstName(name: string | null | undefined): string {
  const n = (name ?? '').trim().split(/\s+/)[0] ?? ''
  if (!n) return ''
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

/**
 * Fills {variables}. Unknown or empty variables are removed and the whitespace
 * around them tidied, so a message never shows "{tracking}" to a customer.
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  const fill = (line: string) =>
    line.replace(/\{([a-z_]+)\}/g, (_m, key: string) => {
      const v = vars[key as keyof TemplateVars]
      return v == null ? '' : String(v)
    })
  return body
    .split('\n')
    .flatMap((line) => {
      const out = fill(line)
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([,.!?])/g, '$1')
        .trimEnd()
      // A line that only held empty variables disappears; intentional blank lines stay.
      return line.trim() !== '' && out.trim() === '' ? [] : [out]
    })
    .join('\n')
    .trim()
}

export function trackingUrl(courier: string | null | undefined, tracking: string | null | undefined, urls: Record<string, string>): string {
  if (!tracking) return ''
  const pattern = urls[(courier ?? '').toLowerCase()] ?? ''
  return pattern ? pattern.replace('{tracking}', encodeURIComponent(tracking)) : ''
}

/** wa.me deep link (opens WhatsApp / WhatsApp Business with the message ready to send). */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const k = phoneKey(phone)
  if (!k || k.length < 10) return null
  return `https://wa.me/${k}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function telLink(phone: string | null | undefined): string | null {
  const k = phoneKey(phone)
  if (!k) return null
  return `tel:+${k}`
}
