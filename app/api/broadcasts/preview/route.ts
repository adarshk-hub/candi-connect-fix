import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { previewAudience, BroadcastFilters } from '@/lib/waBroadcast'

function resolveClientId(session: ReturnType<typeof getSession>, requestedClientId?: string | null): string | null {
  if (!session) return null
  if (AGENCY_ROLES.includes(session.role)) return requestedClientId || null
  if (session.role === 'client_admin') return session.clientId
  return null // counsellors don't get to build broadcasts
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json().catch(() => null)
  const clientId = resolveClientId(session, body?.clientId)
  if (!clientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const filters: BroadcastFilters = {
    tags: Array.isArray(body?.filters?.tags) ? body.filters.tags : [],
    tagsMode: body?.filters?.tagsMode === 'all' ? 'all' : 'any',
    stageKeys: Array.isArray(body?.filters?.stageKeys) ? body.filters.stageKeys : [],
    createdFrom: body?.filters?.createdFrom || null,
    createdTo: body?.filters?.createdTo || null,
    lastContactedFrom: body?.filters?.lastContactedFrom || null,
    lastContactedTo: body?.filters?.lastContactedTo || null,
  }

  const result = await previewAudience(clientId, filters)
  return NextResponse.json(result)
}
