import type { Case } from './types'

export type Health = 'resolved' | 'paused' | 'overdue' | 'due_soon' | 'on_track'

const HOUR = 3_600_000

/** SLA state of a case. The clock pauses while waiting on the customer. */
export function caseHealth(c: Pick<Case, 'status' | 'due_at'>, now = Date.now()): Health {
  if (c.status === 'resolved') return 'resolved'
  if (c.status === 'awaiting_customer') return 'paused'
  if (!c.due_at) return 'on_track'
  const left = new Date(c.due_at).getTime() - now
  if (left < 0) return 'overdue'
  if (left < 4 * HOUR) return 'due_soon'
  return 'on_track'
}

export type FollowUpState = 'overdue' | 'today' | 'upcoming' | null

/** Follow-up state using Pakistan's calendar day. */
export function followUpState(c: Pick<Case, 'status' | 'follow_up_at'>, now = Date.now()): FollowUpState {
  if (c.status === 'resolved' || !c.follow_up_at) return null
  const at = new Date(c.follow_up_at).getTime()
  if (at < now) return 'overdue'
  return pkDay(at) === pkDay(now) ? 'today' : 'upcoming'
}

export function pkDay(ms: number): string {
  return new Date(ms + 5 * HOUR).toISOString().slice(0, 10)
}

/** End of the given Pakistan day, offset by `days` (used for "snooze to tomorrow"). */
export function pkMorning(daysFromToday: number, hour = 11, now = Date.now()): Date {
  const day = pkDay(now + daysFromToday * 24 * HOUR)
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:00`)
}

/** Composite priority for sorting a work queue: lower = handle first. */
export function priorityScore(c: Pick<Case, 'status' | 'due_at' | 'severity' | 'follow_up_at' | 'tags'>, now = Date.now()): number {
  const h = caseHealth(c, now)
  let s = 100
  if (h === 'overdue') s -= 50
  if (h === 'due_soon') s -= 25
  if (c.severity === 'serious') s -= 20
  if (c.tags.includes('vip')) s -= 10
  if (c.tags.includes('repeat')) s -= 5
  const f = followUpState(c, now)
  if (f === 'overdue') s -= 15
  if (f === 'today') s -= 8
  if (h === 'paused') s += 40
  return s
}
