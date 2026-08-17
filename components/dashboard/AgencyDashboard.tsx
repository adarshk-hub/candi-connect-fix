import Link from 'next/link'
import { query } from '@/lib/db'
import { getPrimaryClientStages } from '@/lib/stagesServer'
import { SOURCE_LABEL } from '@/lib/types'
import { pieSlicePaths, PALETTE } from '@/lib/pie'

export default async function AgencyDashboard({
  from,
  to,
}: {
  from?: string
  to?: string
}) {
  const params: any[] = []
  let dateWhere = ''
  if (from) {
    params.push(from)
    dateWhere += ` AND created_at >= $${params.length}`
  }
  if (to) {
    params.push(to)
    dateWhere += ` AND created_at <= $${params.length}::date + interval '1 day'`
  }

  const [{ all_leads }] = await query<{ all_leads: string }>(
    `SELECT COUNT(*)::int AS all_leads FROM leads WHERE true ${dateWhere}`,
    params
  )
  const [{ warm }] = await query<{ warm: string }>(
    `SELECT COUNT(*)::int AS warm FROM leads WHERE pipeline_stage != 'enrolled' AND lead_score >= 3 AND lead_score < 6 ${dateWhere}`,
    params
  )
  const [{ hot }] = await query<{ hot: string }>(
    `SELECT COUNT(*)::int AS hot FROM leads WHERE pipeline_stage != 'enrolled' AND lead_score >= 6 ${dateWhere}`,
    params
  )
  const [{ cold }] = await query<{ cold: string }>(
    `SELECT COUNT(*)::int AS cold FROM leads WHERE pipeline_stage != 'enrolled' AND lead_score < 3 ${dateWhere}`,
    params
  )
  const [{ enrolled }] = await query<{ enrolled: string }>(
    `SELECT COUNT(*)::int AS enrolled FROM leads WHERE pipeline_stage = 'enrolled' ${dateWhere}`,
    params
  )

  const sourceRows = await query<{ source: string; count: string }>(
    `SELECT source, COUNT(*)::int AS count FROM leads WHERE true ${dateWhere} GROUP BY source ORDER BY count DESC`,
    params
  )
  const totalForSource = sourceRows.reduce((s, r) => s + Number(r.count), 0) || 1
  const slices = pieSlicePaths(
    sourceRows.map((r, i) => ({
      label: SOURCE_LABEL[r.source] || r.source,
      value: Number(r.count),
      color: PALETTE[i % PALETTE.length],
    }))
  )

  const stageRows = await query<{ pipeline_stage: string; count: string }>(
    `SELECT pipeline_stage, COUNT(*)::int AS count FROM leads WHERE true ${dateWhere} GROUP BY pipeline_stage`,
    params
  )
  const stageCounts: Record<string, number> = {}
  for (const r of stageRows) stageCounts[r.pipeline_stage] = Number(r.count)
  const totalLeads = Number(all_leads) || 1
  const allStagesOrdered = await getPrimaryClientStages()
  const maxStageCount = Math.max(...allStagesOrdered.map((s) => stageCounts[s.key] || 0), 1)

  const institutes = await query<{ id: string; name: string; lead_count: string }>(
    `SELECT c.id, c.name, COUNT(l.id)::int AS lead_count
     FROM clients c
     LEFT JOIN leads l ON l.client_id = c.id
     GROUP BY c.id, c.name
     ORDER BY c.name`
  )

  return (
    <div>
      <h1 className="mb-1 border-b-2 border-blue-500 pb-3 text-2xl font-bold text-fg">Dashboard Overview</h1>

      <form className="my-6 flex items-end gap-3 rounded-card border border-border bg-card p-4 text-sm">
        <span className="font-medium text-fg">Select Date</span>
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

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted2">All Leads</p>
          <p className="mt-2 text-3xl font-bold text-fg">{all_leads}</p>
        </div>
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted2">Warm</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">{warm}</p>
        </div>
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted2">Hot</p>
          <p className="mt-2 text-3xl font-bold text-red-400">{hot}</p>
        </div>
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted2">Cold</p>
          <p className="mt-2 text-3xl font-bold text-zinc-300">{cold}</p>
        </div>
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted2">Enrolled</p>
          <p className="mt-2 text-3xl font-bold text-green-400">{enrolled}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">Source Performance</h2>
          {sourceRows.length === 0 ? (
            <p className="text-muted">No leads yet.</p>
          ) : (
            <>
              <svg viewBox="0 0 200 200" className="mx-auto h-56 w-56">
                {slices.map((s) => (
                  <path key={s.label} d={s.path} fill={s.color} />
                ))}
              </svg>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {slices.map((s) => (
                  <div key={s.label} className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                    <div>
                      <p className="text-xs font-medium text-fg">{s.label}</p>
                      <p className="text-xs text-muted">
                        {s.value} {s.percent}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-card border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-semibold text-fg">Stage</h2>
          <p className="mb-4 text-sm text-muted2">Total Leads: {totalLeads}</p>
          <div className="space-y-2">
            {allStagesOrdered.map((s) => {
              const count = stageCounts[s.key] || 0
              const widthPct = Math.max(4, (count / maxStageCount) * 100)
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div
                    className="flex h-9 items-center rounded-md px-3 text-sm font-medium text-zinc-900"
                    style={{ width: `${widthPct}%`, backgroundColor: s.color, minWidth: '110px' }}
                  >
                    {s.label}
                  </div>
                  <span className="text-sm font-semibold text-fg">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-card border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-fg">Institutes</h2>
        <p className="mb-4 text-sm text-muted2">
          Open an institute's own dashboard to see its funnel, cost metrics, ad spend, and campaign breakdown.
        </p>
        <div className="divide-y divide-border">
          {institutes.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/${c.id}`}
              className="flex items-center justify-between py-3 text-sm text-fg hover:text-blue-400"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-muted2">{c.lead_count} leads →</span>
            </Link>
          ))}
          {institutes.length === 0 && <p className="py-3 text-sm text-muted">No institutes yet.</p>}
        </div>
      </div>
    </div>
  )
}
