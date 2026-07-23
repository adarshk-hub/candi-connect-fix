import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { sendTextMessage } from '@/lib/metaWhatsapp'
import { pauseSequenceForLead } from '@/lib/waSequenceEngine'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const rows = await query(
    `SELECT wm.*, u.full_name AS sent_by_name
     FROM whatsapp_messages wm
     LEFT JOIN users u ON u.id = wm.sent_by
     WHERE wm.lead_id = $1
     ORDER BY wm.created_at ASC`,
    [params.id]
  )
  return NextResponse.json(rows)
}

function getBaseUrl() {
  const h = headers()
  const host = h.get('host') || 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return `${proto}://${host}`
}

const URL_PATTERN = /https?:\/\/[^\s]+/i

// Sends a counsellor's free-form reply from inside the CRM — this is the
// endpoint that replaces "open Aisensy's dashboard to reply." If the message
// contains a link (e.g. a visit booking link), it's rewritten to a tracked
// redirect before sending so we can record when the parent clicks it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const access = await assertLeadAccess(session, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const lead = access.lead

  const { body: messageBody } = await req.json()
  if (!messageBody || !messageBody.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const urlMatch = messageBody.match(URL_PATTERN)
  const originalUrl: string | null = urlMatch ? urlMatch[0] : null

  try {
    // Insert first (with the untracked body) so a link-tracking row has an id
    // to build the redirect URL from, then rewrite + send.
    let row = (
      await query(
        `INSERT INTO whatsapp_messages (lead_id, direction, message_type, body, status, sent_by, link_url)
         VALUES ($1, 'outbound', 'session', $2, 'queued', $3, $4)
         RETURNING *`,
        [params.id, messageBody, session!.id, originalUrl]
      )
    )[0]

    let outgoingBody = messageBody
    if (originalUrl) {
      const trackedUrl = `${getBaseUrl()}/api/track/click/${row.id}`
      outgoingBody = messageBody.replace(originalUrl, trackedUrl)
    }

    const result = await sendTextMessage({
      clientId: lead.client_id,
      to: lead.whatsapp_number,
      body: outgoingBody,
    })

    const updated = (
      await query(
        `UPDATE whatsapp_messages SET body = $1, status = $2, wamid = $3, external_message_id = $3 WHERE id = $4 RETURNING *`,
        [outgoingBody, result.ok ? 'sent' : 'failed', result.wamid || null, row.id]
      )
    )[0]

    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: updated }, { status: 502 })
    }

    // A counsellor is now actively talking to this lead — pause the
    // automated nurture drip so it doesn't talk over a live conversation.
    await pauseSequenceForLead(params.id)

    return NextResponse.json(updated)
  } catch (err: any) {
    return handleWriteError(err)
  }
}
