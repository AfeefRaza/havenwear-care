import type { ComplaintType, Severity } from './types'

export interface TypeSuggestion {
  typeId: number
  label: string
  score: number
  matched: string[]
}

const normalize = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim()} `

/**
 * Suggests complaint types from the customer's message using each type's keywords
 * (English + Roman Urdu). Whole-word matching; longer phrases weigh more. Returns
 * the best matches first (empty when nothing matches).
 */
export function suggestTypes(text: string, types: ComplaintType[], limit = 3): TypeSuggestion[] {
  const hay = normalize(text)
  if (hay.trim().length < 2) return []
  const out: TypeSuggestion[] = []
  for (const t of types) {
    if (!t.active) continue
    let score = 0
    const matched: string[] = []
    for (const kw of t.keywords) {
      const k = normalize(kw)
      if (k.trim().length < 2) continue
      if (hay.includes(k)) {
        score += 1 + k.trim().split(' ').length * 0.5
        matched.push(kw)
      }
    }
    if (score > 0) out.push({ typeId: t.id, label: t.label, score, matched })
  }
  // Ties → the more specific (serious) type, then sort order
  const byId = new Map(types.map((t) => [t.id, t]))
  return out
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ta = byId.get(a.typeId)!
      const tb = byId.get(b.typeId)!
      if (ta.default_severity !== tb.default_severity) return ta.default_severity === 'serious' ? -1 : 1
      return ta.sort - tb.sort
    })
    .slice(0, limit)
}

// Phrases that signal an angry / escalating customer → treat as serious.
const ESCALATION = [
  'refund',
  'paise wapis',
  'paisay wapis',
  'money back',
  'fraud',
  'scam',
  'dhoka',
  'police',
  'court',
  'consumer',
  'fir',
  'review',
  'social media',
  'instagram pe',
  'facebook pe',
  'post kar',
  'worst',
  'never again',
  'dobara nahi',
  'cheat',
  'third time',
  'second time',
  'dusri baar',
  'teesri baar',
]

export interface SeveritySuggestion {
  severity: Severity
  reasons: string[]
}

export function suggestSeverity(
  text: string,
  type: ComplaintType | undefined,
  context: { repeatCustomer?: boolean; vip?: boolean } = {},
): SeveritySuggestion {
  const reasons: string[] = []
  const hay = normalize(text)
  if (type?.default_severity === 'serious') reasons.push(`${type.label} is serious by default`)
  const hits = ESCALATION.filter((w) => hay.includes(normalize(w)))
  if (hits.length) reasons.push(`Escalation words: ${hits.slice(0, 3).join(', ')}`)
  if (context.repeatCustomer) reasons.push('Customer complained before (last 90 days)')
  if (context.vip) reasons.push('VIP customer')
  return { severity: reasons.length ? 'serious' : 'non_serious', reasons }
}
