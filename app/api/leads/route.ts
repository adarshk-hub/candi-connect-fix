import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { handleWriteError } from '@/lib/apiError'

const DEFAULT_PAGE_SIZE = 250

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Institutes can set their own preferred page size via Settings >
  // Customize > Display Preferences; agency roles (viewing across clients)
  // and any client without a saved preference fall back to the default.
  let PAGE_SIZE = DEFAULT_PAGE_SIZE
  if (session.clientId) {
    const [row] = await query<{ leads_per_page: number }>('SELECT leads_per_page FROM clients WHERE id = $1', [
      session.clientId,
    ])
    if (row?.leads_per_page) PAGE_SIZE = row.leads_per_page
  }

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page') || '1'))
  const search = sp.get('search')?.trim() || ''
  const tab = sp.get('tab') || ''

  const where: string[] = []
  const params: any[] = []

  if (session.role === 'client_admin') {
    params.push(session.clientId)
    where.push(`l.client_id = $${params.length}`)
  } else if (session.role === 'client_counsellor') {
    params.push(session.id)
    where.push(`l.assigned_counsellor_id = $${params.length}`)
  }

  if (search) {
    params.push(`%${search}%`)
    const i = params.length
    where.push(`(l.full_name ILIKE $${i} OR l.child_name ILIKE $${i} OR l.whatsapp_number ILIKE $${i})`)
  }

  if (tab === 'enrolled') {
    where.push(`l.pipeline_stage = 'enrolled'`)
  } else if (tab === 'hot') {
    where.push(`l.pipeline_stage != 'enrolled' AND l.lead_score >= 6`)
  } else if (tab === 'warm') {
    where.push(`l.pipeline_stage != 'enrolled' AND l.lead_score >= 3 AND l.lead_score < 6`)
  } else if (tab === 'cold') {
    where.push(`l.pipeline_stage != 'enrolled' AND l.lead_score < 3`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM leads l ${whereSql}`,
    params
  )

  const offset = (page - 1) * PAGE_SIZE
  const rows = await query(
    `SELECT l.id, l.client_id, l.full_name, l.child_name, l.whatsapp_number, l.grade, l.pipeline_stage,
            l.source, l.lead_score, l.created_at, l.assigned_counsellor_id,
            u.full_name AS counsellor_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_counsellor_id
     ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  )

  return NextResponse.json({ leads: rows, total: Number(count), page, pageSize: PAGE_SIZE })
}

// Manual lead entry from the "Add Lead" button — the counterpart to the
// webhook-driven findOrCreateLead() in lib/leadIntake.ts, which is built
// around dedup/merge semantics for inbound channels rather than a
// counsellor filling out a full form by hand.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const clientId = AGENCY_ROLES.includes(session.role) ? body.clientId : session.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  if (session.role === 'client_admin' && clientId !== session.clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { fullName, whatsappNumber } = body
  if (!fullName || !whatsappNumber) {
    return NextResponse.json({ error: 'fullName and whatsappNumber required' }, { status: 400 })
  }

  const assignedCounsellorId = session.role === 'client_counsellor' ? session.id : body.assignedCounsellorId || null

  try {
    const rows = await query(
      `INSERT INTO leads (
        client_id, full_name, child_name, whatsapp_number, second_phone, email,
        occupation, company_name, location, grade, service_interested_in,
        source, timeline, decision_maker, competitors_visited, key_concern,
        entry_type, assigned_counsellor_id, custom_fields
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'manual',$17,$18)
      RETURNING *`,
      [
        clientId,
        fullName,
        body.childName || null,
        whatsappNumber,
        body.secondPhone || null,
        body.email || null,
        body.occupation || null,
        body.companyName || null,
        body.location || null,
        body.grade || null,
        body.serviceInterestedIn || null,
        body.source || 'manual',
        body.timeline || null,
        body.decisionMaker || null,
        body.competitorsVisited || null,
        body.keyConcern || null,
        assignedCounsellorId,
        JSON.stringify(body.customFields || {}),
      ]
    )
    const lead = rows[0]

    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
       VALUES ($1, 'system', 'Lead Created', $2, $3)`,
      [lead.id, `New lead added manually: ${fullName} - ${whatsappNumber}.`, session.id]
    )

    return NextResponse.json(lead)
  } catch (err: any) {
    return handleWriteError(err)
  }
}
