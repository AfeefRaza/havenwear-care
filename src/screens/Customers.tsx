import { useQuery } from '@tanstack/react-query'
import { Search, ShieldAlert, Star, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, Input, Skeleton, Spinner } from '../components/ui'
import { useLookup } from '../data/queries'
import { fmtDate, relTime } from '../domain/format'
import { FLAG_LABEL } from '../domain/labels'
import { formatPhone } from '../domain/phone'
import type { CustomerFlag } from '../domain/types'
import { errorMessage, supabase } from '../lib/supabase'
import { useDebounced } from '../lib/utils'

interface Recent {
  phone_key: string
  customer_name: string | null
  city: string | null
  received_at: string
  status: string
}

export default function Customers() {
  const [q, setQ] = useState('')
  const term = useDebounced(q, 300)
  const lookup = useLookup(term)

  // Shopify orders → unique customers by canonical phone
  const found = useMemo(() => {
    const m = new Map<string, { key: string; name: string | null; phone: string | null; city: string | null; orders: number; last: string }>()
    for (const o of lookup.data ?? []) {
      if (!o.phone_key) continue
      const cur = m.get(o.phone_key)
      if (cur) {
        cur.orders++
        if (o.created_at > cur.last) cur.last = o.created_at
      } else m.set(o.phone_key, { key: o.phone_key, name: o.customer_name, phone: o.phone, city: o.city, orders: 1, last: o.created_at })
    }
    return [...m.values()]
  }, [lookup.data])

  const flagged = useQuery({
    queryKey: ['flagged'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_customer_profiles')
        .select('phone_key, flag, note, updated_at')
        .neq('flag', 'none')
        .order('updated_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(errorMessage(error))
      return data as { phone_key: string; flag: CustomerFlag; note: string | null; updated_at: string }[]
    },
    staleTime: 5 * 60_000,
  })

  const recent = useQuery({
    queryKey: ['recent-complainers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_cases')
        .select('phone_key, customer_name, city, received_at, status')
        .not('phone_key', 'is', null)
        .order('received_at', { ascending: false })
        .limit(120)
      if (error) throw new Error(errorMessage(error))
      const seen = new Map<string, Recent & { n: number }>()
      for (const r of data as Recent[]) {
        const cur = seen.get(r.phone_key)
        if (cur) cur.n++
        else seen.set(r.phone_key, { ...r, n: 1 })
      }
      return [...seen.values()].slice(0, 30)
    },
    staleTime: 2 * 60_000,
  })

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Customers</h1>
          <p className="text-[13px] text-muted">Every Shopify customer, identified by phone number — orders, deliveries, returns and complaints in one place.</p>
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by phone, name, city or order number" className="h-11 pl-9 text-[15px]" autoFocus />
          {lookup.isFetching ? <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" /> : null}
        </div>

        {term.length >= 3 ? (
          <Card title="Results">
            {found.length ? (
              <ul className="divide-y divide-border">
                {found.map((c) => (
                  <li key={c.key}>
                    <Link to={`/customers/${c.key}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">{c.name ?? 'Unknown'}</span>
                        <span className="block text-xs text-muted">
                          {formatPhone(c.phone)} · {c.city}
                        </span>
                      </span>
                      <span className="text-xs text-faint">last order {fmtDate(c.last)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : lookup.isFetching ? (
              <Skeleton className="m-4 h-10" />
            ) : (
              <p className="px-4 py-3 text-[13px] text-muted">No customers match.</p>
            )}
          </Card>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Recently complained">
            {recent.isLoading ? (
              <Skeleton className="m-4 h-24" />
            ) : recent.data?.length ? (
              <ul className="divide-y divide-border">
                {recent.data.map((r) => (
                  <li key={r.phone_key}>
                    <Link to={`/customers/${r.phone_key}`} className="flex items-center gap-3 px-4 py-2 hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{r.customer_name ?? formatPhone(r.phone_key)}</span>
                        <span className="block text-xs text-muted">{r.city}</span>
                      </span>
                      {r.n > 1 ? <Badge tone="warn">{r.n} cases</Badge> : null}
                      <span className="text-xs text-faint">{relTime(r.received_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Users className="size-5" />} title="No complaints yet" />
            )}
          </Card>
          <Card title="Flagged customers">
            {flagged.data?.length ? (
              <ul className="divide-y divide-border">
                {flagged.data.map((f) => (
                  <li key={f.phone_key}>
                    <Link to={`/customers/${f.phone_key}`} className="flex items-center gap-3 px-4 py-2 hover:bg-hover">
                      {f.flag === 'vip' ? <Star className="size-4 fill-accent text-accent" aria-hidden /> : <ShieldAlert className={f.flag === 'blocked' ? 'size-4 text-bad' : 'size-4 text-warn'} aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">{formatPhone(f.phone_key)}</span>
                        <span className="block truncate text-xs text-muted">{f.note ?? FLAG_LABEL[f.flag]}</span>
                      </span>
                      <Badge tone={f.flag === 'vip' ? 'accent' : f.flag === 'blocked' ? 'bad' : 'warn'}>{FLAG_LABEL[f.flag]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-[13px] text-muted">Mark customers as VIP, Watch or Blocked from their profile. Flags show on every case and in Delivery watch.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
