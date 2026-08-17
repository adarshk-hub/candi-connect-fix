import Link from 'next/link'
import { getClientDashboardMetrics } from '@/lib/clientDashboardMetrics'
import { getCapiSummary } from '@/lib/capiSummary'
import { formatLakh, formatDateTime } from '@/lib/format'
import { Card, SectionLabel, Row, Pill } from '@/components/ui'
import GenerateReportButton from './GenerateReportButton'
import BackfillMetaLeadsButton from './BackfillMetaLeadsButton'

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function presetRange(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: isoDate(from), to: isoDate(to) }
}

function fmtMoney(v: number | null): string {
  return v !== null ? formatLakh(v) : '—'
}

function pctCaption(n: number, d: number, suffix: string): string | null {
  if (d <= 0) return null
  return `${Math.round((n / d) * 100)}% ${suffix}`
}

function formatWeekLabel(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function KpiCard({
  label,
  value,
  caption,
  color,
}: {
  label: string
  value: string | number
  caption?: string | null
  color?: string
}) {
  return (
    <div className="rounded-card border border-border bg-card p-6">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color || 'text-fg'}`}>{value}</p>
      {caption && <p className="mt-1 text-xs text-muted2">{caption}</p>}
    </div>
  )
}

export default async function ClientDashboard({
  clientId,
  clientName,
  from,
  to,
}: {
  clientId: string
  clientName: string
  from?: string
  to?: string
}) {
  const metrics = await getClientDashboardMetrics(clientId, from, to)
  const capi = await getCapiSummary(clientId, from, to)

  const presets = [
    { label: '7d', ...presetRange(7) },
    { label: '30d', ...presetRange(30) },
    { label: '90d', ...presetRange(90) },
  ]

  const maxFunnel = Math.max(...metrics.funnel.map((f) => f.count), 1)
  const maxWeeklySpend = Math.max(...metrics.weeklySpend.map((w) => w.amount), 1)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-blue-500 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-fg">{metrics.clientName}</h1>
          <p className="mt-1 text-sm text-muted2">Performance dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`/dashboard?from=${p.from}&to=${p.to}`}
              className="rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Agency-only in practice — the API route itself enforces this via
          AGENCY_ROLES, so a client_admin clicking it just sees "Forbidden"
          rather than the button being hidden client-side. */}
      <BackfillMetaLeadsButton clientId={clientId} />

      <form className="flex items-end gap-3 rounded-card border border-border bg-card p-4 text-sm">
        <span className="font-medium text-fg">Custom range</span>
        <div>
          <label className="mb-1 block text-xs text-muted">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-border bg-card2 px-3 py-2 text-fg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-md border border-border bg-card2 px-3 py-2 text-fg outline-none focus:border-blue-500"
          />
        </div>
        <button type="submit" className="rounded-md bg-zinc-700 px-4 py-2 font-medium text-white hover:bg-zinc-600">
          Submit
        </button>
      </form>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total leads" value={metrics.kpis.totalLeads} />
        <KpiCard
          label="Qualified"
          value={metrics.kpis.qualified}
          caption={pctCaption(metrics.kpis.qualified, metrics.kpis.totalLeads, 'of leads')}
          color="text-blue-400"
        />
        <KpiCard
          label="Visits booked"
          value={metrics.kpis.visitsBooked}
          caption={pctCaption(metrics.kpis.visitsBooked, metrics.kpis.qualified, 'of qualified')}
        />
        <KpiCard
          label="Enrolled"
          value={metrics.kpis.enrolled}
          caption={pctCaption(metrics.kpis.enrolled, metrics.kpis.visitsBooked, 'of visits')}
          color="text-green-400"
        />
        <KpiCard label="Fees collected" value={formatLakh(metrics.kpis.feesCollected)} color="text-green-400" />
        <KpiCard label="Total spent" value={formatLakh(metrics.kpis.totalSpent)} />
      </div>

      <div>
        <SectionLabel>Live funnel</SectionLabel>
        <div className="grid grid-cols-2 gap-6 rounded-card border border-border bg-card p-6 sm:grid-cols-4">
          {metrics.funnel.map((f) => (
            <div key={f.label} className="text-center">
              <p className="text-2xl font-bold text-fg">{f.count}</p>
              <p className="mb-3 text-xs uppercase tracking-widest text-muted">{f.label}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-card2">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.max(4, (f.count / maxFunnel) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">{f.pctOfLeads.toFixed(0)}%</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionLabel>Cost metrics</SectionLabel>
          <Row label="Cost per lead (CPL)">{fmtMoney(metrics.costMetrics.cpl)}</Row>
          <Row label="Cost per visit (CPV)">{fmtMoney(metrics.costMetrics.cpv)}</Row>
          <Row label="Cost per admission (CPA)">{fmtMoney(metrics.costMetrics.cpa)}</Row>
          <Row label="Avg fee per student">{fmtMoney(metrics.costMetrics.avgFeePerStudent)}</Row>
          <Row label="Admission ROAS">
            {metrics.costMetrics.roas !== null ? `${metrics.costMetrics.roas.toFixed(1)}x` : '—'}
          </Row>
        </Card>
        <Card>
          <SectionLabel>Weekly ad spend</SectionLabel>
          {metrics.weeklySpend.length === 0 ? (
            <p className="text-sm text-muted">No spend recorded in this range.</p>
          ) : (
            <div className="space-y-3">
              {metrics.weeklySpend.map((w) => (
                <div key={w.weekStarting} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-muted2">{formatWeekLabel(w.weekStarting)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-card2">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.max(4, (w.amount / maxWeeklySpend) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm font-medium text-fg">{formatLakh(w.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel>Campaign breakdown</SectionLabel>
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Visits</th>
                <th className="px-4 py-3">Enrolled</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Fees</th>
                <th className="px-4 py-3">CPL</th>
                <th className="px-4 py-3">Conv %</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metrics.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-fg">{c.displayName}</td>
                  <td className="px-4 py-3">
                    <Pill color={c.platform === 'google' ? 'green' : 'blue'}>
                      {c.platform === 'google' ? 'Google' : 'Meta'}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-fg">{c.leads}</td>
                  <td className="px-4 py-3 text-fg">{c.visits}</td>
                  <td className="px-4 py-3 text-fg">{c.enrolled}</td>
                  <td className="px-4 py-3 text-fg">{formatLakh(c.spend)}</td>
                  <td className="px-4 py-3 text-fg">{formatLakh(c.fees)}</td>
                  <td className="px-4 py-3 text-fg">{fmtMoney(c.cpl)}</td>
                  <td className="px-4 py-3 text-fg">{c.convPct !== null ? `${c.convPct.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-3">
                    <Pill color={c.status.color}>{c.status.label}</Pill>
                  </td>
                </tr>
              ))}
              {metrics.campaigns.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted">
                    No active campaigns.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <SectionLabel>Fees collected</SectionLabel>
          <Row label="Total collected">{formatLakh(metrics.fees.totalCollected)}</Row>
          <Row label="Deposit payments">
            {metrics.fees.depositCount} · {formatLakh(metrics.fees.depositSum)}
          </Row>
          <Row label="Full payments">
            {metrics.fees.fullCount} · {formatLakh(metrics.fees.fullSum)}
          </Row>
          <Row label="Last received">
            {metrics.fees.lastReceivedAt ? formatDateTime(metrics.fees.lastReceivedAt) : '—'}
          </Row>
        </Card>
        <Card>
          <SectionLabel>Conversions API</SectionLabel>
          {!capi.configured ? (
            <>
              <p className="text-sm text-muted2">Not connected yet.</p>
              <Link href="/settings/customize" className="mt-2 inline-block text-sm text-blue-400 hover:underline">
                Connect Meta Pixel →
              </Link>
            </>
          ) : (
            <>
              <Row label="Status">
                <Pill color={capi.enabled ? 'green' : 'gray'}>{capi.enabled ? 'Enabled' : 'Disabled'}</Pill>
              </Row>
              <Row label="Events sent">{capi.sent}</Row>
              <Row label="Failed">{capi.failed}</Row>
              <Row label="Last event">{capi.lastEventAt ? formatDateTime(capi.lastEventAt) : '—'}</Row>
            </>
          )}
        </Card>
        <Card>
          <SectionLabel>Client report</SectionLabel>
          <p className="mb-4 text-sm text-muted2">
            Funnel, cost metrics, and campaign breakdown for {metrics.clientName}, {from || 'all time'} to{' '}
            {to || 'now'}.
          </p>
          <GenerateReportButton clientId={clientId} from={from} to={to} />
        </Card>
      </div>
    </div>
  )
}
