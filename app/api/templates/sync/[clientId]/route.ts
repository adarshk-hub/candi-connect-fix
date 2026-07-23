import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { decrypt } from '@/lib/waEncryption'

const GRAPH_API_URL = process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v19.0'

// Polls Meta for the current status of every template still marked
// 'pending' for this client and updates wa_templates accordingly. Meta
// doesn't push a webhook event for template approval by default, so this
// has to be polled — call it from a settings-page "Refresh status" button
// or a periodic cron, same idea as the wa-sequence-advance job.
export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = (
    await query('SELECT waba_id, access_token FROM wa_client_config WHERE client_id = $1', [params.clientId])
  )[0]
  if (!config) return NextResponse.json({ error: 'No WhatsApp config saved for this client yet' }, { status: 400 })

  const pending = await query(
    `SELECT id, name FROM wa_templates WHERE client_id = $1 AND status = 'pending'`,
    [params.clientId]
  )

  const accessToken = decrypt(config.access_token)
  const updated: any[] = []

  for (const tmpl of pending) {
    const res = await fetch(
      `${GRAPH_API_URL}/${config.waba_id}/message_templates?name=${encodeURIComponent(tmpl.name)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json().catch(() => ({}))
    const match = data?.data?.[0]
    if (!match) continue

    const newStatus = String(match.status || 'pending').toLowerCase()
    const rejectionReason = match.rejected_reason || null

    await query(
      `UPDATE wa_templates
       SET status = $1, rejection_reason = $2, approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END
       WHERE id = $3`,
      [newStatus, rejectionReason, tmpl.id]
    )
    updated.push({ id: tmpl.id, name: tmpl.name, status: newStatus })
  }

  return NextResponse.json({ ok: true, updated })
}
