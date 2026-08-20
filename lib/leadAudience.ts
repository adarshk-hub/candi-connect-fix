import { query } from './db'

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
// broadcast's filters" — shared by WhatsApp broadcasts (lib/waBroadcast.ts)
// and email broadcasts (lib/emailBroadcast.ts) so the two channels can
// never drift into disagreeing about what a filter means, and by both the
// live-count preview and the actual recipient-list insert at send time so
// preview and reality can never disagree either.
//
// "Last contacted" spans BOTH channels (whatsapp_messages and
// email_messages) — a lead who replied on WhatsApp yesterday counts as
// "contacted yesterday" even when building an email broadcast's audience,
// since from the counsellor's point of view a reply is a reply regardless
// of channel. There's no separate "last_contacted_at" column on leads, so
// this correlates via a subquery rather than a trigger-maintained column.
//
// requireContactMethod optionally excludes leads missing the field a
// given channel actually needs (e.g. email broadcasts skip leads with no
// email on file, rather than queuing a send that will just fail).
function buildAudienceQuery(
  clientId: string,
  filters: BroadcastFilters,
  requireContactMethod?: 'whatsapp_number' | 'email'
): AudienceQuery {
  const where: string[] = ['l.client_id = $1']
  const params: any[] = [clientId]

  if (requireContactMethod === 'whatsapp_number') {
    where.push(`l.whatsapp_number IS NOT NULL AND l.whatsapp_number <> ''`)
  } else if (requireContactMethod === 'email') {
    where.push(`l.email IS NOT NULL AND l.email <> ''`)
  }

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
      `EXISTS (
         SELECT 1 FROM whatsapp_messages wm WHERE wm.lead_id = l.id AND wm.created_at >= $${params.length}
         UNION ALL
         SELECT 1 FROM email_messages em WHERE em.lead_id = l.id AND em.created_at >= $${params.length}
       )`
    )
  }
  if (filters.lastContactedTo) {
    params.push(filters.lastContactedTo)
    where.push(
      `GREATEST(
         COALESCE((SELECT MAX(wm.created_at) FROM whatsapp_messages wm WHERE wm.lead_id = l.id), '-infinity'),
         COALESCE((SELECT MAX(em.created_at) FROM email_messages em WHERE em.lead_id = l.id), '-infinity')
       ) < ($${params.length}::date + INTERVAL '1 day')`
    )
  }

  return { whereSql: where.join(' AND '), params }
}

export interface AudienceLead {
  id: string
  full_name: string
  child_name: string | null
  whatsapp_number: string
  email: string | null
  pipeline_stage: string
}

// Used by the "preview" step in both broadcast composers — shows the
// match count plus a small sample before the admin commits to sending.
export async function previewAudience(
  clientId: string,
  filters: BroadcastFilters,
  requireContactMethod?: 'whatsapp_number' | 'email',
  sampleSize = 10
): Promise<{ count: number; sample: AudienceLead[] }> {
  const { whereSql, params } = buildAudienceQuery(clientId, filters, requireContactMethod)

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM leads l WHERE ${whereSql}`,
    params
  )

  const sample = await query<AudienceLead>(
    `SELECT l.id, l.full_name, l.child_name, l.whatsapp_number, l.email, l.pipeline_stage
     FROM leads l WHERE ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT ${sampleSize}`,
    params
  )

  return { count: Number(count), sample }
}

// Full (capped) matching list for the audience picker — lets the person
// building a broadcast see and individually check/uncheck every lead the
// filters matched, rather than only a 10-row sample with no way to hand-
// pick or exclude specific recipients. Capped rather than unbounded so a
// very broad filter (e.g. no filters at all) can't return thousands of
// rows into a checkbox list that would be unusable anyway; the count from
// previewAudience() already tells the person how many would be included
// if they don't narrow the filters further.
const AUDIENCE_LIST_CAP = 500

export async function listAudience(
  clientId: string,
  filters: BroadcastFilters,
  requireContactMethod?: 'whatsapp_number' | 'email'
): Promise<{ count: number; leads: AudienceLead[]; truncated: boolean }> {
  const { whereSql, params } = buildAudienceQuery(clientId, filters, requireContactMethod)

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM leads l WHERE ${whereSql}`,
    params
  )

  const leads = await query<AudienceLead>(
    `SELECT l.id, l.full_name, l.child_name, l.whatsapp_number, l.email, l.pipeline_stage
     FROM leads l WHERE ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT ${AUDIENCE_LIST_CAP + 1}`,
    params
  )

  const truncated = leads.length > AUDIENCE_LIST_CAP
  return { count: Number(count), leads: leads.slice(0, AUDIENCE_LIST_CAP), truncated }
}

export { buildAudienceQuery }
