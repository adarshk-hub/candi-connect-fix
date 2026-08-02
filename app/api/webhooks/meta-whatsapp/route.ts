import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { findOrCreateLead } from '@/lib/leadIntake'
import { verifySignature } from '@/lib/metaLeadAds'

// Meta's one-time subscription handshake for the WhatsApp Business
// Account's webhook — same pattern as /api/webhooks/meta-leads, but this
// is a separate endpoint because WhatsApp and Lead Ads are subscribed as
// independent webhook fields in the Meta App dashboard.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN
  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// One shared webhook URL handles every client's WABA — Meta posts to a
// single App-level endpoint regardless of how many phone numbers are
// subscribed under it, so routing to the right client happens per-message
// via metadata.phone_number_id (see clients.meta_whatsapp_phone_number_id).
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const results: any[] = []

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      // Template approval/rejection is a WABA-level event (keyed by
      // entry.id = the WABA ID), not tied to a phone_number_id like
      // message events are — handled separately below.
      if (change.field === 'message_template_status_update') {
        results.push(await handleTemplateStatusUpdate(entry.id, change.value || {}))
        continue
      }

      if (change.field !== 'messages') continue
      const value = change.value || {}
      const phoneNumberId = value.metadata?.phone_number_id

      const client = phoneNumberId
        ? (await query('SELECT id FROM clients WHERE meta_whatsapp_phone_number_id = $1', [phoneNumberId]))[0]
        : null

      if (!client) {
        results.push({ phoneNumberId, error: 'No client mapped to this WhatsApp phone_number_id' })
        continue
      }

      for (const msg of value.messages || []) {
        results.push(await handleInboundMessage(client.id, msg))
      }

      for (const status of value.statuses || []) {
        results.push(await handleStatusUpdate(status))
      }
    }
  }

  return NextResponse.json({ ok: true, results })
}

async function handleInboundMessage(clientId: string, msg: any) {
  const from: string = msg.from
  const wamid: string = msg.id
  const text: string = msg.text?.body || msg[msg.type]?.caption || ''
  const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date()

  const { lead, created, duplicate } = await findOrCreateLead({
    clientId,
    fullName: `WhatsApp Lead ${from.slice(-4)}`,
    whatsappNumber: from,
    source: 'facebook',
    entryType: 'whatsapp_ctc',
    externalRef: `meta_wa:${wamid}`,
    rawPayload: msg,
  })

  const msgRows = await query(
    `INSERT INTO whatsapp_messages
       (lead_id, direction, message_type, body, status, wamid, external_message_id, raw_payload, created_at)
     VALUES ($1, 'inbound', 'session', $2, 'delivered', $3, $3, $4, $5)
     ON CONFLICT (external_message_id) DO NOTHING
     RETURNING id`,
    [lead.id, text, wamid, JSON.stringify(msg), timestamp]
  )

  if (msgRows.length > 0) {
    await applyReplyScoreBonus(lead.id)
  }

  return { leadId: lead.id, created, duplicate, wamid }
}

// Reply-tier scoring: if this lead has an active/recent sequence, base the
// bonus on elapsed time since that sequence's Day 0 send (per spec); if
// there's no sequence (e.g. reply to a manual message), fall back to
// "reply within 1hr of last outbound" the way the Aisensy path worked.
async function applyReplyScoreBonus(leadId: string): Promise<void> {
  const lead = (await query('SELECT wa_sequence_id, engagement_score FROM leads WHERE id = $1', [leadId]))[0]
  if (!lead) return

  let day0SentAt: string | null = null
  if (lead.wa_sequence_id) {
    const day0 = (
      await query(
        `SELECT sent_at FROM wa_sequence_messages WHERE sequence_id = $1 AND day_number = 0 AND status = 'sent'`,
        [lead.wa_sequence_id]
      )
    )[0]
    day0SentAt = day0?.sent_at || null
  }

  if (!day0SentAt) {
    const lastOutbound = (
      await query(
        `SELECT created_at FROM whatsapp_messages
         WHERE lead_id = $1 AND direction = 'outbound'
         ORDER BY created_at DESC LIMIT 1`,
        [leadId]
      )
    )[0]
    day0SentAt = lastOutbound?.created_at || null
  }

  if (!day0SentAt) return

  const elapsedMs = Date.now() - new Date(day0SentAt).getTime()
  const oneHour = 60 * 60 * 1000
  const twentyFourHours = 24 * oneHour

  let bonus = 0
  let label = ''
  if (elapsedMs <= oneHour) {
    bonus = 2
    label = 'Replied within 1 hour of Day 0 — engagement +2.'
  } else if (elapsedMs <= twentyFourHours) {
    bonus = 1
    label = 'Replied within 24 hours of Day 0 — engagement +1.'
  } else {
    return
  }

  await query('UPDATE leads SET engagement_score = LEAST(3, engagement_score + $1) WHERE id = $2', [
    bonus,
    leadId,
  ])
  await query(
    `INSERT INTO activity_log (lead_id, activity_type, title, description)
     VALUES ($1, 'system', 'Engagement Score Updated', $2)`,
    [leadId, label]
  )

  // Recalculate tier — if urgency + program_fit + engagement now clears
  // the hot threshold, flip lead_tier so Kanban/list views reflect it
  // immediately rather than waiting for the next full recompute.
  const scored = (
    await query(
      `SELECT urgency_score, program_fit_score, engagement_score FROM leads WHERE id = $1`,
      [leadId]
    )
  )[0]
  if (scored) {
    const total = (scored.urgency_score || 0) + (scored.program_fit_score || 0) + (scored.engagement_score || 0)
    if (total >= 6) {
      await query(`UPDATE leads SET lead_tier = 'hot' WHERE id = $1`, [leadId])
    }
  }
}

async function handleStatusUpdate(status: any) {
  const wamid: string = status.id
  const newStatus: string = status.status // sent | delivered | read | failed

  const validStatuses = ['sent', 'delivered', 'read', 'failed']
  if (!validStatuses.includes(newStatus)) {
    return { wamid, skipped: true, reason: `unrecognized status ${newStatus}` }
  }

  const rows = await query(
    `UPDATE whatsapp_messages SET status = $1 WHERE wamid = $2 OR external_message_id = $2 RETURNING id, lead_id`,
    [newStatus, wamid]
  )

  await query(
    `UPDATE wa_sequence_messages SET status = CASE WHEN $1 = 'failed' THEN 'failed' ELSE status END WHERE wamid = $2`,
    [newStatus, wamid]
  )

  if (rows.length === 0) {
    return { wamid, updated: false }
  }
  return { wamid, updated: true, leadId: rows[0].lead_id }
}

// Pushes template approval/rejection into wa_templates the moment Meta
// decides it — this is what makes the Templates table in Settings show
// "approved" in real time instead of only after someone clicks "Check
// availability" (app/api/templates/sync/[clientId], still kept as a
// manual backup/backfill path in case this webhook is ever missed).
//
// Meta's event values are a wider set than our own status column
// supports (APPROVED, REJECTED, PENDING, PENDING_DELETION, IN_APPEAL,
// PAUSED, DISABLED, FLAGGED...) — wa_templates.status only has
// pending/approved/rejected (see scripts/meta-whatsapp-migration.sql),
// so anything other than an explicit APPROVED/REJECTED collapses to
// 'pending' rather than widening the schema for states this app doesn't
// otherwise act on.
async function handleTemplateStatusUpdate(wabaId: string, value: any) {
  const event = String(value.event || '').toUpperCase()
  const templateName = value.message_template_name
  const metaTemplateId = value.message_template_id ? String(value.message_template_id) : null

  if (!templateName) {
    return { wabaId, skipped: true, reason: 'missing message_template_name' }
  }

  const client = (
    await query('SELECT id FROM clients c JOIN wa_client_config cfg ON cfg.client_id = c.id WHERE cfg.waba_id = $1', [
      wabaId,
    ])
  )[0]
  if (!client) {
    return { wabaId, templateName, error: 'No client mapped to this WABA_id' }
  }

  let newStatus: 'pending' | 'approved' | 'rejected' = 'pending'
  if (event === 'APPROVED') newStatus = 'approved'
  else if (event === 'REJECTED') newStatus = 'rejected'

  const rejectionReason = event === 'REJECTED' ? value.reason || null : null

  const rows = await query(
    `UPDATE wa_templates
     SET status = $1,
         rejection_reason = $2,
         meta_template_id = COALESCE($3, meta_template_id),
         approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END
     WHERE client_id = $4 AND name = $5
     RETURNING id`,
    [newStatus, rejectionReason, metaTemplateId, client.id, templateName]
  )

  if (rows.length === 0) {
    return { wabaId, templateName, updated: false, reason: 'No matching wa_templates row for this client/name' }
  }
  return { wabaId, templateName, updated: true, status: newStatus }
}
