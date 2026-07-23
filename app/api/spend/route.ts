import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { campaignId, weekStarting, spendAmount } = await req.json()
  if (!campaignId || !weekStarting || spendAmount === undefined) {
    return NextResponse.json({ error: 'campaignId, weekStarting, spendAmount required' }, { status: 400 })
  }

  const rows = await query(
    `INSERT INTO ad_spend_weekly (campaign_id, week_starting, spend_amount, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id, week_starting)
     DO UPDATE SET spend_amount = EXCLUDED.spend_amount, entered_by = EXCLUDED.entered_by, entered_at = now()
     RETURNING *`,
    [campaignId, weekStarting, spendAmount, session.id]
  )
  return NextResponse.json(rows[0])
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await query(
    `SELECT s.*, c.display_name AS campaign_display_name
     FROM ad_spend_weekly s
     JOIN campaigns c ON c.id = s.campaign_id
     ORDER BY s.week_starting DESC
     LIMIT 50`
  )
  return NextResponse.json(rows)
}
