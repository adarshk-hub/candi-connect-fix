import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'

// Powers the "Recent events" log in Settings > Customize > Conversions API
// and the small dashboard status card — the actual visibility into what's
// being sent to Meta and whether it's succeeding.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const requestedClientId = sp.get('clientId')
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 25, 1), 200)

  let clientId: string | null
  if (AGENCY_ROLES.includes(session.role)) {
    clientId = requestedClientId
  } else {
    if (requestedClientId && requestedClientId !== session.clientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    clientId = session.clientId
  }

  const params: any[] = []
  let where = ''
  if (clientId) {
    params.push(clientId)
    where = 'WHERE l.client_id = $1'
  }

  params.push(limit)
  const rows = await query(
    `SELECT l.id, l.client_id, l.lead_id, l.event_name, l.pipeline_stage, l.status,
            l.fbtrace_id, l.error, l.created_at, le.full_name AS lead_name
     FROM capi_event_log l
     LEFT JOIN leads le ON le.id = l.lead_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length}`,
    params
  )

  const summaryParams: any[] = clientId ? [clientId] : []
  const summaryWhere = clientId ? 'WHERE client_id = $1' : ''
  const [summary] = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'sent') AS sent,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
       MAX(created_at) AS last_event_at
     FROM capi_event_log ${summaryWhere}`,
    summaryParams
  )

  return NextResponse.json({ events: rows, summary })
}
