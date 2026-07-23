import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'

export async function GET(req: NextRequest, { params }: { params: { clientId: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await query(
    `SELECT id, meta_template_id, name, category, language, status, rejection_reason, submitted_at, approved_at
     FROM wa_templates WHERE client_id = $1 ORDER BY submitted_at DESC`,
    [params.clientId]
  )
  return NextResponse.json(rows)
}
