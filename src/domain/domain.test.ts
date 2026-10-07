import { describe, expect, it } from 'vitest'
import { phoneKey, formatPhone, looksLikePhone } from './phone'
import { suggestTypes, suggestSeverity } from './classify'
import { renderTemplate, firstName, whatsappLink, trackingUrl } from './templates'
import { caseHealth, followUpState, priorityScore, pkMorning } from './sla'
import { parseSheetDate, planSheetImport } from './importSheet'
import { toCsv } from './csv'
import { relTime, fmtHours, fmtMoney } from './format'
import type { ComplaintType, Member } from './types'

const T = (id: number, label: string, keywords: string[], sev: 'serious' | 'non_serious' = 'non_serious', sort = id): ComplaintType => ({
  id,
  label,
  category: 'product',
  default_severity: sev,
  sla_hours: 48,
  follow_up_days: 2,
  keywords,
  sort,
  active: true,
})

const TYPES: ComplaintType[] = [
  T(1, 'Late delivery', ['late', 'delay', 'nahi mila', 'abhi tak', 'where is my order']),
  T(2, 'Size / fit issue', ['size', 'chota', 'bara', 'tight', 'loose']),
  T(3, 'Damaged / defective item', ['damaged', 'phata', 'hole', 'stain', 'kharab'], 'serious'),
  T(4, 'Wrong item / color / size', ['wrong', 'galat', 'wrong size'], 'serious'),
  T(5, 'Color differs from photos', ['color', 'rang', 'picture']),
  T(99, 'Other', []),
]

describe('phoneKey', () => {
  it('normalises every Pakistani format to 92XXXXXXXXXX', () => {
    expect(phoneKey('0300-1234567')).toBe('923001234567')
    expect(phoneKey('+92 300 1234567')).toBe('923001234567')
    expect(phoneKey('00923001234567')).toBe('923001234567')
    expect(phoneKey('3001234567')).toBe('923001234567')
    expect(phoneKey('923001234567')).toBe('923001234567')
  })
  it('keeps unknown shapes as digits and empties as null', () => {
    expect(phoneKey('')).toBeNull()
    expect(phoneKey(null)).toBeNull()
    expect(phoneKey('12345')).toBe('12345')
  })
  it('formats for display and detects phone-like input', () => {
    expect(formatPhone('+923001234567')).toBe('0300 1234567')
    expect(looksLikePhone('0300 1234567')).toBe(true)
    expect(looksLikePhone('#haven33919')).toBe(false)
    expect(looksLikePhone('33919')).toBe(false)
  })
})

describe('suggestTypes', () => {
  it('matches Roman Urdu and English keywords as whole words', () => {
    expect(suggestTypes('Order abhi tak nahi mila', TYPES)[0]?.label).toBe('Late delivery')
    expect(suggestTypes('shirt ka size chota hai', TYPES)[0]?.label).toBe('Size / fit issue')
    expect(suggestTypes('kurta phata hua aya, hole hai', TYPES)[0]?.label).toBe('Damaged / defective item')
  })
  it('does not match inside other words', () => {
    // "lateral" must not count as "late"
    expect(suggestTypes('lateral thinking', TYPES)).toHaveLength(0)
  })
  it('prefers longer phrases and serious types on ties', () => {
    const r = suggestTypes('wrong size bheja', TYPES)
    expect(r[0]?.label).toBe('Wrong item / color / size')
  })
  it('returns nothing for empty text', () => {
    expect(suggestTypes('  ', TYPES)).toEqual([])
  })
})

describe('suggestSeverity', () => {
  it('uses the type default', () => {
    expect(suggestSeverity('hole in shirt', TYPES[2]).severity).toBe('serious')
    expect(suggestSeverity('size issue', TYPES[1]).severity).toBe('non_serious')
  })
  it('escalates on angry words, repeat customers and VIPs', () => {
    expect(suggestSeverity('I want a refund, worst experience', TYPES[1]).severity).toBe('serious')
    expect(suggestSeverity('size issue', TYPES[1], { repeatCustomer: true }).reasons).toContain('Customer complained before (last 90 days)')
    expect(suggestSeverity('size issue', TYPES[1], { vip: true }).severity).toBe('serious')
  })
})

describe('templates', () => {
  it('fills variables and removes unknown ones cleanly', () => {
    const out = renderTemplate('Hi {first_name}, order {order} via {courier}.\n{tracking_url}\nThanks', {
      first_name: 'Ayesha',
      order: '#haven1',
      courier: '',
    })
    expect(out).toBe('Hi Ayesha, order #haven1 via.\nThanks')
    expect(out).not.toContain('{')
  })
  it('first name is capitalised', () => {
    expect(firstName('ayesha khan')).toBe('Ayesha')
    expect(firstName(null)).toBe('')
  })
  it('builds wa.me links only for valid numbers', () => {
    expect(whatsappLink('0300 1234567', 'Hi there')).toBe('https://wa.me/923001234567?text=Hi%20there')
    expect(whatsappLink('123')).toBeNull()
  })
  it('builds tracking URLs from the courier pattern', () => {
    expect(trackingUrl('PostEx', '2123', { postex: 'https://t.example/?cn={tracking}' })).toBe('https://t.example/?cn=2123')
    expect(trackingUrl('xps', '1', { postex: 'x' })).toBe('')
  })
})

describe('SLA', () => {
  const now = Date.parse('2026-10-08T07:00:00Z') // 12:00 PKT
  it('classifies health', () => {
    expect(caseHealth({ status: 'open', due_at: '2026-10-08T06:00:00Z' }, now)).toBe('overdue')
    expect(caseHealth({ status: 'open', due_at: '2026-10-08T09:00:00Z' }, now)).toBe('due_soon')
    expect(caseHealth({ status: 'open', due_at: '2026-10-09T09:00:00Z' }, now)).toBe('on_track')
    expect(caseHealth({ status: 'awaiting_customer', due_at: '2026-10-01T00:00:00Z' }, now)).toBe('paused')
    expect(caseHealth({ status: 'resolved', due_at: null }, now)).toBe('resolved')
  })
  it('follow-up state uses the Pakistan calendar day', () => {
    expect(followUpState({ status: 'open', follow_up_at: '2026-10-08T06:00:00Z' }, now)).toBe('overdue')
    expect(followUpState({ status: 'open', follow_up_at: '2026-10-08T18:00:00Z' }, now)).toBe('today') // 23:00 PKT
    expect(followUpState({ status: 'open', follow_up_at: '2026-10-08T19:30:00Z' }, now)).toBe('upcoming') // next day PKT
    expect(followUpState({ status: 'resolved', follow_up_at: '2026-10-08T06:00:00Z' }, now)).toBeNull()
  })
  it('priority puts overdue serious work first', () => {
    const base = { status: 'open' as const, follow_up_at: null, tags: [] as string[] }
    const a = priorityScore({ ...base, due_at: '2026-10-08T06:00:00Z', severity: 'serious' }, now)
    const b = priorityScore({ ...base, due_at: '2026-10-10T06:00:00Z', severity: 'non_serious' }, now)
    expect(a).toBeLessThan(b)
  })
  it('snooze dates land on a Pakistan morning', () => {
    expect(pkMorning(1, 11, now).toISOString()).toBe('2026-10-09T06:00:00.000Z')
  })
})

describe('sheet import', () => {
  const members: Member[] = [
    { user_id: 'u1', email: 'sara@hw.pk', full_name: 'Sara Ahmed', role: 'agent', active: true, auto_assign: true, created_at: '' },
  ]
  const grid = [
    [],
    ['HAVENWEAR Complaint log'],
    ['Received date', 'Order number', 'Customer name', 'Phone / WhatsApp', 'Product / variant', 'Detailed complaint', 'Complaint type', 'Severity', 'Status', 'Courier', 'Assigned to', 'Follow-up date', 'Resolved date', 'Action / resolution notes'],
    [46000, '33919', 'Ali', '03001234567', 'Tee / M', 'Size chota', 'Size / fit issue', 'Non-serious', 'Resolved', 'PostEx', 'Sara', '', '', 'Exchanged'],
    ['05/10/2026', '#haven33920', 'Zara', '0300 7654321', '', 'Late', 'Mystery type', 'Serious', 'Open', 'Other', 'Bilal', '08/10/2026', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  it('maps columns, statuses, people and dates', () => {
    const plan = planSheetImport(grid, TYPES, members)
    expect(plan.rows).toHaveLength(2)
    const [a, b] = plan.rows
    expect(a!.type_id).toBe(2)
    expect(a!.status).toBe('resolved')
    expect(a!.resolved_at).toBe(a!.received_at)
    expect(a!.assignee).toBe('u1')
    expect(a!.courier).toBe('postex')
    expect(a!.items).toEqual([{ title: 'Tee / M' }])
    expect(b!.type_id).toBe(99)
    expect(b!.severity).toBe('serious')
    expect(b!.courier).toBeNull()
    expect(b!.tags).toContain('owner:Bilal')
    expect(b!.follow_up_at).toBe('2026-10-08T07:00:00.000Z')
    expect(plan.warnings.join(' ')).toContain('Mystery type')
  })
  it('parses sheet dates', () => {
    expect(parseSheetDate('2026-10-05')).toBe('2026-10-05T07:00:00.000Z')
    expect(parseSheetDate('5-Oct-26')).toBe('2026-10-05T07:00:00.000Z')
    expect(parseSheetDate('nonsense')).toBeNull()
  })
  it('reports a missing header row', () => {
    expect(planSheetImport([['a', 'b']], TYPES, members).warnings[0]).toMatch(/header row/)
  })
})

describe('formatting & csv', () => {
  it('escapes CSV and neutralises formulas', () => {
    const csv = toCsv(['a', 'b'], [['x,y', '=SUM(1)']])
    expect(csv).toBe('﻿a,b\r\n"x,y",\'=SUM(1)')
  })
  it('formats relative times, hours and money', () => {
    const now = Date.parse('2026-10-08T07:00:00Z')
    expect(relTime('2026-10-08T05:00:00Z', now)).toBe('2h ago')
    expect(relTime('2026-10-10T07:00:00Z', now)).toBe('in 2d')
    expect(fmtHours(0.5)).toBe('30m')
    expect(fmtHours(72)).toBe('3.0d')
    expect(fmtMoney(2450)).toBe('Rs 2,450')
  })
})
