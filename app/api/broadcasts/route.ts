import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { handleWriteError } from '@/lib/apiError'
import { createBroadcast, listBroadcasts, BroadcastFilters } from '@/lib/waBroadcast'

function resolveClientId(session: ReturnType<typeof getSession>, requestedClientId?: string | null): string | null {
  if (!session) return null
  if (AGENCY_ROLES.includes(session.role)) return requestedClientId || null
  if (session.role === 'client_admin') return session.clientId
  return null // counsellors can view but not create broadcasts (see POST below)
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedClientId = req.nextUrl.searchParams.get('clientId')
  const clientId = AGENCY_ROLES.includes(session.role) ? requestedClientId : session.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  const rows = await listBroadcasts(clientId)
  return NextResponse.json(rows)
}

// Creates a broadcast and immediately snapshots its audience into
// wa_broadcast_recipients (status 'pending'). It does NOT send anything
// synchronously — app/api/cron/wa-broadcast-send works through the queue
// in small batches on its own schedule, so this request stays fast even
// for a broadcast targeting thousands of leads.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json().catch(() => null)
  const clientId = resolveClientId(session, body?.clientId)
  if (!clientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const name = String(body?.name || '').trim()
  const templateName = String(body?.templateName || '').trim()
  const languageCode = String(body?.languageCode || 'en')
  const personalizeField = ['none', 'full_name', 'child_name'].includes(body?.personalizeField)
    ? body.personalizeField
    : 'none'

  if (!name || !templateName) {
    return NextResponse.json({ error: 'Broadcast name and template are required' }, { status: 400 })
  }

  const template = (
    await query<{ category: string; status: string }>(
      'SELECT category, status FROM wa_templates WHERE client_id = $1 AND name = $2 LIMIT 1',
      [clientId, templateName]
    )
  )[0]
  if (!template) return NextResponse.json({ error: 'Template not found for this client' }, { status: 404 })
  if (template.status !== 'approved') {
    return NextResponse.json({ error: 'Only Meta-approved templates can be used in a broadcast' }, { status: 400 })
  }

  const filters: BroadcastFilters = {
    tags: Array.isArray(body?.filters?.tags) ? body.filters.tags : [],
    tagsMode: body?.filters?.tagsMode === 'all' ? 'all' : 'any',
    stageKeys: Array.isArray(body?.filters?.stageKeys) ? body.filters.stageKeys : [],
    createdFrom: body?.filters?.createdFrom || null,
    createdTo: body?.filters?.createdTo || null,
    lastContactedFrom: body?.filters?.lastContactedFrom || null,
    lastContactedTo: body?.filters?.lastContactedTo || null,
  }

  try {
    const { broadcastId, totalRecipients } = await createBroadcast({
      clientId,
      name,
      templateName,
      templateCategory: template.category,
      languageCode,
      personalizeField,
      filters,
      createdBy: session!.id,
    })

    if (totalRecipients === 0) {
      await query(`UPDATE wa_broadcasts SET status = 'completed', completed_at = now() WHERE id = $1`, [broadcastId])
    }

    return NextResponse.json({ broadcastId, totalRecipients })
  } catch (err: any) {
    return handleWriteError(err)
  }
}
