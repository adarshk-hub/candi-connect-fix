import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { handleWriteError } from '@/lib/apiError'

async function canAccessLead(session: ReturnType<typeof getSession>, leadId: string): Promise<string | null> {
  if (!session) return null
  const lead = (await query<{ client_id: string }>('SELECT client_id FROM leads WHERE id = $1', [leadId]))[0]
  if (!lead) return null
  if (AGENCY_ROLES.includes(session.role)) return lead.client_id
  if (session.role === 'client_admin' && session.clientId === lead.client_id) return lead.client_id
  if (session.role === 'client_counsellor') {
    const owns = (await query('SELECT 1 FROM leads WHERE id = $1 AND assigned_counsellor_id = $2', [leadId, session.id]))[0]
    if (owns) return lead.client_id
  }
  return null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const clientId = await canAccessLead(session, params.id)
  if (!clientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await query<{ tag: string }>('SELECT tag FROM lead_tags WHERE lead_id = $1 ORDER BY tag', [params.id])
  return NextResponse.json(rows.map((r) => r.tag))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const clientId = await canAccessLead(session, params.id)
  if (!clientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const tag = String(body?.tag || '').trim()
  if (!tag) return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
  if (tag.length > 50) return NextResponse.json({ error: 'Tag must be 50 characters or fewer' }, { status: 400 })

  try {
    await query(
      `INSERT INTO lead_tags (lead_id, client_id, tag, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (lead_id, tag) DO NOTHING`,
      [params.id, clientId, tag, session!.id]
    )
  } catch (err: any) {
    return handleWriteError(err)
  }

  const rows = await query<{ tag: string }>('SELECT tag FROM lead_tags WHERE lead_id = $1 ORDER BY tag', [params.id])
  return NextResponse.json(rows.map((r) => r.tag))
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const clientId = await canAccessLead(session, params.id)
  if (!clientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tag = req.nextUrl.searchParams.get('tag') || ''
  if (!tag) return NextResponse.json({ error: 'Tag is required' }, { status: 400 })

  await query('DELETE FROM lead_tags WHERE lead_id = $1 AND tag = $2', [params.id, tag])

  const rows = await query<{ tag: string }>('SELECT tag FROM lead_tags WHERE lead_id = $1 ORDER BY tag', [params.id])
  return NextResponse.json(rows.map((r) => r.tag))
}
