import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { getBroadcastDetail } from '@/lib/emailBroadcast'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedClientId = req.nextUrl.searchParams.get('clientId')
  const clientId = AGENCY_ROLES.includes(session.role) ? requestedClientId : session.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  const detail = await getBroadcastDetail(params.id, clientId)
  if (!detail) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  return NextResponse.json(detail)
}
