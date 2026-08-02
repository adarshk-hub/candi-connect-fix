import { query } from './db'
import { sendResendEmail } from './resendEmail'
import { buildAudienceQuery, previewAudience as previewAudienceShared, BroadcastFilters, AudienceLead } from './leadAudience'

export type { BroadcastFilters, AudienceLead }

// Email broadcasts require an email on file — leads with no email are
// excluded from the audience entirely rather than queued and failed.
export async function previewAudience(
  clientId: string,
  filters: BroadcastFilters,
  sampleSize = 10
): Promise<{ count: number; sample: AudienceLead[] }> {
  return previewAudienceShared(clientId, filters, 'email', sampleSize)
}

export interface CreateEmailBroadcastParams {
  clientId: string
  name: string
  subject: string
  body: string // HTML
  filters: BroadcastFilters
  createdBy?: string | null
}

export async function createBroadcast(
  params: CreateEmailBroadcastParams
): Promise<{ broadcastId: string; totalRecipients: number }> {
  const { whereSql, params: audienceParams } = buildAudienceQuery(params.clientId, params.filters, 'email')

  const broadcast = (
    await query<{ id: string }>(
      `INSERT INTO email_broadcasts
         (client_id, name, subject, body,
          filter_tags, filter_tags_mode, filter_stage_keys,
          filter_created_from, filter_created_to, filter_last_contacted_from, filter_last_contacted_to,
          created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        params.clientId,
        params.name,
        params.subject,
        params.body,
        params.filters.tags,
        params.filters.tagsMode,
        params.filters.stageKeys,
        params.filters.createdFrom || null,
        params.filters.createdTo || null,
        params.filters.lastContactedFrom || null,
        params.filters.lastContactedTo || null,
        params.createdBy || null,
      ]
    )
  )[0]

  const inserted = await query<{ one: number }>(
    `WITH matched AS (
       SELECT l.id AS lead_id, l.email AS to_email
       FROM leads l
       WHERE ${whereSql}
     )
     INSERT INTO email_broadcast_recipients (broadcast_id, lead_id, to_email)
     SELECT $${audienceParams.length + 1}, lead_id, to_email FROM matched
     RETURNING 1 AS one`,
    [...audienceParams, broadcast.id]
  )

  const totalRecipients = inserted.length
  await query('UPDATE email_broadcasts SET total_recipients = $1 WHERE id = $2', [totalRecipients, broadcast.id])

  return { broadcastId: broadcast.id, totalRecipients }
}

export interface EmailBroadcastBatchResult {
  processed: number
  sent: number
  failed: number
  broadcastsCompleted: number
}

// Sends up to `batchSize` pending recipients (across all in-progress
// broadcasts, oldest first) via Resend. Every successful send is also
// logged into email_messages (the same table the per-lead Email tab
// reads from) and activity_log, so a broadcast email shows up in that
// lead's history exactly like a one-off email would — one source of
// truth for "what did we email this lead," regardless of which flow
// sent it. Meant to be called every ~30-60s by the same external cron
// scheduler already hitting the WhatsApp broadcast/sequence endpoints.
export async function processNextBatch(batchSize = 20): Promise<EmailBroadcastBatchResult> {
  const pending = await query<{ id: string; broadcast_id: string; lead_id: string; to_email: string }>(
    `SELECT r.id, r.broadcast_id, r.lead_id, r.to_email
     FROM email_broadcast_recipients r
     JOIN email_broadcasts b ON b.id = r.broadcast_id
     WHERE r.status = 'pending' AND b.status = 'sending'
     ORDER BY b.created_at ASC, r.id ASC
     LIMIT $1`,
    [batchSize]
  )

  const result: EmailBroadcastBatchResult = { processed: 0, sent: 0, failed: 0, broadcastsCompleted: 0 }
  const touchedBroadcastIds = new Set<string>()

  for (const recipient of pending) {
    touchedBroadcastIds.add(recipient.broadcast_id)
    result.processed++

    const broadcast = (
      await query<{ subject: string; body: string; client_id: string }>(
        'SELECT subject, body, client_id FROM email_broadcasts WHERE id = $1',
        [recipient.broadcast_id]
      )
    )[0]
    if (!broadcast) continue

    const client = (
      await query<{ name: string; school_email: string | null; email_from_name: string | null }>(
        'SELECT name, school_email, email_from_name FROM clients WHERE id = $1',
        [broadcast.client_id]
      )
    )[0]

    const sendResult = await sendResendEmail({
      toEmail: recipient.to_email,
      fromName: client?.email_from_name || client?.name || 'School',
      replyTo: client?.school_email || null,
      subject: broadcast.subject,
      html: broadcast.body,
    })

    if (sendResult.ok) {
      await query(
        `UPDATE email_broadcast_recipients SET status = 'sent', resend_message_id = $1, sent_at = now() WHERE id = $2`,
        [sendResult.messageId || null, recipient.id]
      )
      await query('UPDATE email_broadcasts SET sent_count = sent_count + 1 WHERE id = $1', [recipient.broadcast_id])
      result.sent++
    } else {
      await query(`UPDATE email_broadcast_recipients SET status = 'failed', error = $1 WHERE id = $2`, [
        sendResult.error || 'Unknown error',
        recipient.id,
      ])
      await query('UPDATE email_broadcasts SET failed_count = failed_count + 1 WHERE id = $1', [recipient.broadcast_id])
      result.failed++
    }

    // Log into email_messages either way (sent or failed), matching how
    // the per-lead one-off email route logs both outcomes — keeps the
    // lead's Email tab history complete even for failures.
    await query(
      `INSERT INTO email_messages (lead_id, template_key, subject, body, to_email, status, error)
       VALUES ($1, 'broadcast', $2, $3, $4, $5, $6)`,
      [
        recipient.lead_id,
        broadcast.subject,
        broadcast.body,
        recipient.to_email,
        sendResult.ok ? 'sent' : 'failed',
        sendResult.error || null,
      ]
    ).catch(() => {})
  }

  for (const broadcastId of touchedBroadcastIds) {
    const [{ remaining }] = await query<{ remaining: string }>(
      `SELECT COUNT(*)::int AS remaining FROM email_broadcast_recipients WHERE broadcast_id = $1 AND status = 'pending'`,
      [broadcastId]
    )
    if (Number(remaining) === 0) {
      await query(`UPDATE email_broadcasts SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'sending'`, [
        broadcastId,
      ])
      result.broadcastsCompleted++
    }
  }

  return result
}

export interface EmailBroadcastListRow {
  id: string
  name: string
  subject: string
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  created_at: string
  completed_at: string | null
}

export async function listBroadcasts(clientId: string): Promise<EmailBroadcastListRow[]> {
  return query<EmailBroadcastListRow>(
    `SELECT id, name, subject, status, total_recipients, sent_count, failed_count, created_at, completed_at
     FROM email_broadcasts
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [clientId]
  )
}

export interface EmailBroadcastRecipientRow {
  lead_id: string
  full_name: string
  to_email: string
  status: string
  error: string | null
  sent_at: string | null
}

export async function getBroadcastDetail(broadcastId: string, clientId: string) {
  const broadcast = (
    await query(`SELECT * FROM email_broadcasts WHERE id = $1 AND client_id = $2`, [broadcastId, clientId])
  )[0]
  if (!broadcast) return null

  const recipients = await query<EmailBroadcastRecipientRow>(
    `SELECT r.lead_id, l.full_name, r.to_email, r.status, r.error, r.sent_at
     FROM email_broadcast_recipients r
     JOIN leads l ON l.id = r.lead_id
     WHERE r.broadcast_id = $1
     ORDER BY r.sent_at DESC NULLS LAST
     LIMIT 500`,
    [broadcastId]
  )

  return { broadcast, recipients }
}
