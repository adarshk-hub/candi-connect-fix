import { query } from './db'
import { sendTemplateMessage } from './metaWhatsapp'

export interface BroadcastFilters {
  tags: string[]
  tagsMode: 'any' | 'all'
  stageKeys: string[]
  createdFrom?: string | null // YYYY-MM-DD
  createdTo?: string | null
  lastContactedFrom?: string | null
  lastContactedTo?: string | null
}

interface AudienceQuery {
  whereSql: string
  params: any[]
}

// Builds the WHERE clause + params for "which leads match this
// broadcast's filters", shared by both the live-count preview and the
// actual recipient-list insert at send time so they can never disagree.
// "Last contacted" is defined as the most recent whatsapp_messages row
// (inbound or outbound) for the lead — there's no separate
// "last_contacted_at" column on leads, so this correlates via a
// subquery rather than requiring a schema change or a trigger to keep a
// duplicate column in sync.
function buildAudienceQuery(clientId: string, filters: BroadcastFilters): AudienceQuery {
  const where: string[] = ['l.client_id = $1']
  const params: any[] = [clientId]

  if (filters.tags.length > 0) {
    params.push(filters.tags)
    const tagsParamIdx = params.length
    if (filters.tagsMode === 'all') {
      // Lead must have a tag row for every tag in the filter list.
      where.push(
        `(SELECT COUNT(DISTINCT tag) FROM lead_tags WHERE lead_id = l.id AND tag = ANY($${tagsParamIdx})) = ${filters.tags.length}`
      )
    } else {
      where.push(`EXISTS (SELECT 1 FROM lead_tags WHERE lead_id = l.id AND tag = ANY($${tagsParamIdx}))`)
    }
  }

  if (filters.stageKeys.length > 0) {
    params.push(filters.stageKeys)
    where.push(`l.pipeline_stage = ANY($${params.length})`)
  }

  if (filters.createdFrom) {
    params.push(filters.createdFrom)
    where.push(`l.created_at >= $${params.length}`)
  }
  if (filters.createdTo) {
    params.push(filters.createdTo)
    where.push(`l.created_at < ($${params.length}::date + INTERVAL '1 day')`)
  }

  if (filters.lastContactedFrom) {
    params.push(filters.lastContactedFrom)
    where.push(
      `EXISTS (SELECT 1 FROM whatsapp_messages wm WHERE wm.lead_id = l.id AND wm.created_at >= $${params.length})`
    )
  }
  if (filters.lastContactedTo) {
    params.push(filters.lastContactedTo)
    where.push(
      `(SELECT MAX(wm.created_at) FROM whatsapp_messages wm WHERE wm.lead_id = l.id) < ($${params.length}::date + INTERVAL '1 day')`
    )
  }

  return { whereSql: where.join(' AND '), params }
}

export interface AudienceLead {
  id: string
  full_name: string
  child_name: string | null
  whatsapp_number: string
  pipeline_stage: string
}

// Used by the "preview" step in the broadcast composer — shows the
// match count plus a small sample before the admin commits to sending.
export async function previewAudience(
  clientId: string,
  filters: BroadcastFilters,
  sampleSize = 10
): Promise<{ count: number; sample: AudienceLead[] }> {
  const { whereSql, params } = buildAudienceQuery(clientId, filters)

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM leads l WHERE ${whereSql}`,
    params
  )

  const sample = await query<AudienceLead>(
    `SELECT l.id, l.full_name, l.child_name, l.whatsapp_number, l.pipeline_stage
     FROM leads l WHERE ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT ${sampleSize}`,
    params
  )

  return { count: Number(count), sample }
}

export interface CreateBroadcastParams {
  clientId: string
  name: string
  templateName: string
  templateCategory: string
  languageCode: string
  personalizeField: 'none' | 'full_name' | 'child_name'
  filters: BroadcastFilters
  createdBy?: string | null
}

// Creates the broadcast row and immediately inserts one
// wa_broadcast_recipients row per matching lead (status 'pending'). The
// actual sends happen later, in batches, via processNextBatch() — this
// function just snapshots the audience and queues it up, so it stays
// fast even for large audiences.
export async function createBroadcast(params: CreateBroadcastParams): Promise<{ broadcastId: string; totalRecipients: number }> {
  const { whereSql, params: audienceParams } = buildAudienceQuery(params.clientId, params.filters)

  const broadcast = (
    await query<{ id: string }>(
      `INSERT INTO wa_broadcasts
         (client_id, name, template_name, template_category, language_code, personalize_field,
          filter_tags, filter_tags_mode, filter_stage_keys,
          filter_created_from, filter_created_to, filter_last_contacted_from, filter_last_contacted_to,
          created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        params.clientId,
        params.name,
        params.templateName,
        params.templateCategory,
        params.languageCode,
        params.personalizeField,
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

  const inserted = await query<{ count: string }>(
    `WITH matched AS (
       SELECT l.id AS lead_id, l.whatsapp_number AS phone_number
       FROM leads l
       WHERE ${whereSql}
     )
     INSERT INTO wa_broadcast_recipients (broadcast_id, lead_id, phone_number)
     SELECT $${audienceParams.length + 1}, lead_id, phone_number FROM matched
     RETURNING 1 AS one`,
    [...audienceParams, broadcast.id]
  )

  const totalRecipients = inserted.length
  await query('UPDATE wa_broadcasts SET total_recipients = $1 WHERE id = $2', [totalRecipients, broadcast.id])

  return { broadcastId: broadcast.id, totalRecipients }
}

export interface BroadcastBatchResult {
  processed: number
  sent: number
  failed: number
  insufficientCredit: number
  broadcastsCompleted: number
}

// Sends up to `batchSize` pending recipients (across all in-progress
// broadcasts, oldest broadcast first) via the normal
// sendTemplateMessage() path — which means every send here already goes
// through the WCC wallet check/debit in lib/metaWhatsapp.ts. If a
// recipient fails because of insufficient credit, it's marked
// 'insufficient_credit' rather than retried indefinitely — recharging
// the wallet does NOT automatically resume it; a fresh broadcast must be
// created for any leftover recipients, keeping this endpoint simple and
// avoiding surprise sends long after the admin expected the broadcast to
// be done. Meant to be called every ~30-60s by the same external cron
// scheduler already hitting /api/cron/wa-sequence-advance.
export async function processNextBatch(batchSize = 20): Promise<BroadcastBatchResult> {
  const pending = await query<{ id: string; broadcast_id: string; lead_id: string; phone_number: string }>(
    `SELECT r.id, r.broadcast_id, r.lead_id, r.phone_number
     FROM wa_broadcast_recipients r
     JOIN wa_broadcasts b ON b.id = r.broadcast_id
     WHERE r.status = 'pending' AND b.status = 'sending'
     ORDER BY b.created_at ASC, r.id ASC
     LIMIT $1`,
    [batchSize]
  )

  const result: BroadcastBatchResult = { processed: 0, sent: 0, failed: 0, insufficientCredit: 0, broadcastsCompleted: 0 }
  const touchedBroadcastIds = new Set<string>()

  for (const recipient of pending) {
    touchedBroadcastIds.add(recipient.broadcast_id)
    result.processed++

    const broadcast = (
      await query<{ template_name: string; language_code: string; personalize_field: string; client_id: string }>(
        'SELECT template_name, language_code, personalize_field, client_id FROM wa_broadcasts WHERE id = $1',
        [recipient.broadcast_id]
      )
    )[0]
    if (!broadcast) continue

    let components: any[] | undefined
    if (broadcast.personalize_field !== 'none') {
      const lead = (
        await query<{ full_name: string; child_name: string | null }>(
          'SELECT full_name, child_name FROM leads WHERE id = $1',
          [recipient.lead_id]
        )
      )[0]
      const value =
        broadcast.personalize_field === 'child_name' ? lead?.child_name || lead?.full_name : lead?.full_name
      components = [{ type: 'body', parameters: [{ type: 'text', text: value || '' }] }]
    }

    const sendResult = await sendTemplateMessage({
      clientId: broadcast.client_id,
      to: recipient.phone_number,
      templateName: broadcast.template_name,
      languageCode: broadcast.language_code,
      components,
    })

    if (sendResult.ok) {
      await query(
        `UPDATE wa_broadcast_recipients SET status = 'sent', wamid = $1, sent_at = now() WHERE id = $2`,
        [sendResult.wamid || null, recipient.id]
      )
      await query('UPDATE wa_broadcasts SET sent_count = sent_count + 1 WHERE id = $1', [recipient.broadcast_id])
      result.sent++
    } else if (sendResult.error?.toLowerCase().includes('insufficient')) {
      await query(`UPDATE wa_broadcast_recipients SET status = 'insufficient_credit', error = $1 WHERE id = $2`, [
        sendResult.error,
        recipient.id,
      ])
      await query('UPDATE wa_broadcasts SET insufficient_credit_count = insufficient_credit_count + 1 WHERE id = $1', [
        recipient.broadcast_id,
      ])
      result.insufficientCredit++
    } else {
      await query(`UPDATE wa_broadcast_recipients SET status = 'failed', error = $1 WHERE id = $2`, [
        sendResult.error || 'Unknown error',
        recipient.id,
      ])
      await query('UPDATE wa_broadcasts SET failed_count = failed_count + 1 WHERE id = $1', [recipient.broadcast_id])
      result.failed++
    }
  }

  // Mark any touched broadcast as completed once it has no pending
  // recipients left.
  for (const broadcastId of touchedBroadcastIds) {
    const [{ remaining }] = await query<{ remaining: string }>(
      `SELECT COUNT(*)::int AS remaining FROM wa_broadcast_recipients WHERE broadcast_id = $1 AND status = 'pending'`,
      [broadcastId]
    )
    if (Number(remaining) === 0) {
      await query(`UPDATE wa_broadcasts SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'sending'`, [
        broadcastId,
      ])
      result.broadcastsCompleted++
    }
  }

  return result
}

export interface BroadcastListRow {
  id: string
  name: string
  template_name: string
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  insufficient_credit_count: number
  created_at: string
  completed_at: string | null
}

export async function listBroadcasts(clientId: string): Promise<BroadcastListRow[]> {
  return query<BroadcastListRow>(
    `SELECT id, name, template_name, status, total_recipients, sent_count, failed_count, insufficient_credit_count,
            created_at, completed_at
     FROM wa_broadcasts
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [clientId]
  )
}

export interface BroadcastRecipientRow {
  lead_id: string
  full_name: string
  phone_number: string
  status: string
  error: string | null
  sent_at: string | null
}

export async function getBroadcastDetail(broadcastId: string, clientId: string) {
  const broadcast = (
    await query(`SELECT * FROM wa_broadcasts WHERE id = $1 AND client_id = $2`, [broadcastId, clientId])
  )[0]
  if (!broadcast) return null

  const recipients = await query<BroadcastRecipientRow>(
    `SELECT r.lead_id, l.full_name, r.phone_number, r.status, r.error, r.sent_at
     FROM wa_broadcast_recipients r
     JOIN leads l ON l.id = r.lead_id
     WHERE r.broadcast_id = $1
     ORDER BY r.sent_at DESC NULLS LAST
     LIMIT 500`,
    [broadcastId]
  )

  return { broadcast, recipients }
}
