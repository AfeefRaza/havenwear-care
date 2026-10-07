import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState, Segmented, Skeleton, Stat } from '../components/ui'
import { useInsights } from '../data/queries'
import { fmtDate, fmtHours, fmtMoney, fmtNum, fmtPct, pkIsoDate } from '../domain/format'
import { CHANNEL_LABEL, courierLabel, RESOLUTION_LABEL, WATCH_OUTCOME_LABEL } from '../domain/labels'
import type { Insights as InsightsData } from '../domain/types'
import { errorMessage } from '../lib/supabase'
import { cn } from '../lib/utils'

type Period = '7' | '30' | '90' | 'month' | '365'

function range(p: Period): [string, string] {
  const to = pkIsoDate()
  if (p === 'month') return [to.slice(0, 8) + '01', to]
  const d = new Date(Date.now() - (Number(p) - 1) * 86_400_000)
  return [pkIsoDate(d), to]
}

/** Ranked horizontal bars (single hue — magnitude only), each with its value as text. */
function BarList({ rows, max, format = fmtNum }: { rows: { label: string; value: number; sub?: string }[]; max?: number; format?: (n: number) => string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="px-4 py-3 text-[13px] text-faint">No data for this period.</p>
  return (
    <ul className="space-y-2.5 px-4 py-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="tabular shrink-0 font-medium">
              {format(r.value)}
              {r.sub ? <span className="ml-1.5 text-xs font-normal text-faint">{r.sub}</span> : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2">
            <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${Math.max(2, (100 * r.value) / top)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Trend({ data }: { data: InsightsData }) {
  const [table, setTable] = useState(false)
  const rows = data.trend.map((t) => ({ ...t, label: data.bucket === 'month' ? t.b.slice(0, 7) : fmtDate(t.b).replace(/ \d+$/, '') }))
  return (
    <Card
      title="Complaints over time"
      action={
        <Segmented
          value={table ? 'table' : 'chart'}
          onChange={(v) => setTable(v === 'table')}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-faint">No complaints in this period.</p>
      ) : table ? (
        <div className="scroll-thin max-h-72 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{data.bucket === 'day' ? 'Day' : data.bucket === 'week' ? 'Week of' : 'Month'}</th>
                <th className="px-4 py-2 text-right font-medium">Complaints</th>
                <th className="px-4 py-2 text-right font-medium">Serious</th>
                <th className="px-4 py-2 text-right font-medium">Resolved</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.b}>
                  <td className="px-4 py-1.5">{r.label}</td>
                  <td className="px-4 py-1.5 text-right">{r.total}</td>
                  <td className="px-4 py-1.5 text-right">{r.serious}</td>
                  <td className="px-4 py-1.5 text-right">{r.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-2 pt-3 pb-1">
          <div className="mb-1 flex gap-4 px-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-series-1" /> All complaints
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-series-2" /> Serious
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--c-border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--c-faint)' }} minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--c-faint)' }} />
              <Tooltip
                cursor={{ stroke: 'var(--c-border-strong)' }}
                contentStyle={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, fontSize: 12, color: 'var(--c-text)' }}
                labelStyle={{ color: 'var(--c-muted)' }}
              />
              <Line type="monotone" dataKey="total" name="All complaints" stroke="var(--c-series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--c-surface)' }} />
              <Line type="monotone" dataKey="serious" name="Serious" stroke="var(--c-series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--c-surface)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

export default function Insights() {
  const [period, setPeriod] = useState<Period>('30')
  const [from, to] = useMemo(() => range(period), [period])
  const { data, isLoading, error, isFetching } = useInsights(from, to)

  if (error) return <EmptyState title="Could not load insights">{errorMessage(error)}</EmptyState>
  const k = data?.kpis
  const complaintRate = data && data.orders ? (100 * data.orders_with_case) / data.orders : null
  const final = data ? data.delivery.delivered + data.delivery.returned : 0
  const returnRate = data && final ? (100 * data.delivery.returned) / final : null

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className={cn('mx-auto max-w-6xl space-y-5 p-4 transition-opacity lg:p-6', isFetching && 'opacity-80')}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-semibold tracking-tight">Insights</h1>
            <p className="text-[13px] text-muted">
              {fmtDate(from)} – {fmtDate(to)} · complaints joined with Shopify orders and courier outcomes
            </p>
          </div>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
              { value: 'month', label: 'This month' },
              { value: '365', label: '12 months' },
            ]}
          />
        </div>

        {isLoading || !data || !k ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Complaints" value={fmtNum(k.cases)} sub={`${k.serious} serious · ${k.customers} customers`} />
              <Stat label="Complaint rate" value={fmtPct(complaintRate, 1)} sub={`${data.orders_with_case} of ${fmtNum(data.orders)} orders`} />
              <Stat label="First response" value={fmtHours(k.avg_first_response_h)} sub="average" />
              <Stat label="Time to resolve" value={fmtHours(k.median_resolution_h)} sub={`median · avg ${fmtHours(k.avg_resolution_h)}`} />
              <Stat label="Resolved within SLA" value={fmtPct(k.sla_met_pct)} tone={k.sla_met_pct != null && k.sla_met_pct < 80 ? 'bad' : k.sla_met_pct != null ? 'ok' : undefined} sub={`${k.resolved} resolved`} />
              <Stat label="Open right now" value={data.open_now.open} sub={`${data.open_now.overdue} overdue · oldest ${fmtHours(data.open_now.oldest_h)}`} tone={data.open_now.overdue ? 'warn' : undefined} />
              <Stat label="Cost of resolutions" value={fmtMoney(k.resolution_cost)} sub="refunds, reships, vouchers" />
              <Stat label="Repeat complainers" value={k.repeat_customers} sub={`Return rate ${fmtPct(returnRate)} (${data.delivery.returned} parcels)`} />
            </div>

            <Trend data={data} />

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="By complaint type">
                <BarList
                  rows={data.by_type.map((t) => ({
                    label: t.label ?? 'Unknown',
                    value: t.total,
                    sub: `${t.serious ? `${t.serious} serious · ` : ''}${t.avg_h != null ? `${fmtHours(t.avg_h)} to resolve` : 'open'}`,
                  }))}
                />
              </Card>
              <Card title="Resolutions">
                <BarList rows={data.by_resolution.map((r) => ({ label: RESOLUTION_LABEL[r.resolution], value: r.total, sub: r.cost ? fmtMoney(r.cost) : undefined }))} />
              </Card>
            </div>

            <Card title="Products with the most complaints">
              {data.by_product.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 text-left font-medium">Product</th>
                        <th className="px-4 py-2 text-left font-medium">Main issue</th>
                        <th className="px-4 py-2 text-right font-medium">Complaints</th>
                        <th className="px-4 py-2 text-right font-medium">Units sold</th>
                        <th className="px-4 py-2 text-right font-medium">Complaint rate</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-border">
                      {data.by_product.map((p) => {
                        const rate = p.sold ? (100 * p.complaints) / p.sold : null
                        return (
                          <tr key={p.title}>
                            <td className="max-w-72 truncate px-4 py-2 font-medium">{p.title}</td>
                            <td className="px-4 py-2 text-muted">{p.top_type ?? '—'}</td>
                            <td className="px-4 py-2 text-right">
                              {p.complaints}
                              {p.serious ? <span className="ml-1 text-xs text-bad">({p.serious} serious)</span> : null}
                            </td>
                            <td className="px-4 py-2 text-right text-muted">{p.sold ? fmtNum(p.sold) : '—'}</td>
                            <td className={cn('px-4 py-2 text-right font-medium', rate != null && rate >= 5 && 'text-bad')}>{fmtPct(rate, 1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="px-4 py-2 text-xs text-faint">Complaint rate = complaints ÷ units sold in the period. 5%+ is highlighted — check sizing, fabric or print for those products.</p>
                </div>
              ) : (
                <p className="px-4 py-3 text-[13px] text-faint">Products appear once cases are linked to order items.</p>
              )}
            </Card>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card title="By courier">
                <BarList rows={data.by_courier.map((c) => ({ label: courierLabel(c.courier), value: c.total, sub: c.serious ? `${c.serious} serious` : undefined }))} />
              </Card>
              <Card title="Top cities">
                <BarList rows={data.by_city.map((c) => ({ label: c.city, value: c.total }))} />
              </Card>
              <Card title="Channels">
                <BarList rows={data.by_channel.map((c) => ({ label: CHANNEL_LABEL[c.channel], value: c.total }))} />
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card title="Team performance">
                {data.by_agent.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="text-xs text-muted">
                        <tr className="border-b border-border">
                          <th className="px-4 py-2 text-left font-medium">Agent</th>
                          <th className="px-4 py-2 text-right font-medium">Handled</th>
                          <th className="px-4 py-2 text-right font-medium">Resolved</th>
                          <th className="px-4 py-2 text-right font-medium">Within SLA</th>
                          <th className="px-4 py-2 text-right font-medium">First reply</th>
                          <th className="px-4 py-2 text-right font-medium">Resolve time</th>
                        </tr>
                      </thead>
                      <tbody className="tabular divide-y divide-border">
                        {data.by_agent.map((a) => (
                          <tr key={a.assignee ?? 'none'}>
                            <td className="px-4 py-2 font-medium">{a.name}</td>
                            <td className="px-4 py-2 text-right">{a.handled}</td>
                            <td className="px-4 py-2 text-right">{a.resolved}</td>
                            <td className="px-4 py-2 text-right">{a.resolved ? fmtPct((100 * a.sla_met) / a.resolved) : '—'}</td>
                            <td className="px-4 py-2 text-right">{fmtHours(a.first_response_h)}</td>
                            <td className="px-4 py-2 text-right">{fmtHours(a.avg_h)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-4 py-3 text-[13px] text-faint">No cases in this period.</p>
                )}
              </Card>
              <Card title="Delivery watch outcomes">
                <BarList rows={data.watch_outcomes.map((o) => ({ label: WATCH_OUTCOME_LABEL[o.outcome], value: o.total }))} />
                <p className="px-4 pb-3 text-xs text-faint">
                  Period shipments: {fmtNum(data.delivery.delivered)} delivered · {fmtNum(data.delivery.returned)} returned · {fmtNum(data.delivery.in_flight)} in flight
                </p>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
