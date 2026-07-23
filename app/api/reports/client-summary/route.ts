import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { getClientDashboardMetrics } from '@/lib/clientDashboardMetrics'

// Backs the dashboard's "Generate PDF" button — same underlying metrics as
// the server-rendered ClientDashboard, fetched as JSON so the PDF can be
// built client-side with jsPDF instead of server-side rendering.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedClientId = req.nextUrl.searchParams.get('clientId')
  const clientId = AGENCY_ROLES.includes(session.role) ? requestedClientId : session.clientId
  if (!clientId || !canCustomize(session, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const from = req.nextUrl.searchParams.get('from') || undefined
  const to = req.nextUrl.searchParams.get('to') || undefined

  const metrics = await getClientDashboardMetrics(clientId, from, to)
  return NextResponse.json(metrics)
}
