import { query } from './db'

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Keep the last 10 digits so "9876543210", "+91 98765 43210", and
  // "919876543210" all normalize to the same lookup key.
  return digits.slice(-10)
}

export interface IntakeInput {
  clientId: string
  fullName: string
  whatsappNumber: string
  email?: string | null
  grade?: string | null
  source: string
  entryType: string
  campaignId?: string | null
  externalRef?: string | null
  rawPayload?: any
  serviceInterestedIn?: string | null
  // Ad-click match keys for Meta Conversions API — only ever supplied by
  // the landing-page webhook (a Meta Lead Ads form submit has no browser
  // cookie jar to read fbc/fbp from; that channel matches via lead_id
  // instead, see lib/capiTriggers.ts).
  fbclid?: string | null
  fbc?: string | null
  fbp?: string | null
}

export interface IntakeResult {
  lead: any
  created: boolean
  duplicate: boolean
}

// Shared entry point for every inbound channel (Meta webhook, landing-page
// webhook, WhatsApp click-to-chat). Enforces "same number = merge, not a new
// record": if a lead with this phone already exists for the client, we leave
// the original record untouched (same counsellor, stage, created_at) and
// just log the new touch to its activity timeline, rather than reassigning
// or resetting it.
export async function findOrCreateLead(input: IntakeInput): Promise<IntakeResult> {
  if (input.externalRef) {
    const existingByRef = await query('SELECT * FROM leads WHERE external_ref = $1', [input.externalRef])
    if (existingByRef[0]) {
      return { lead: existingByRef[0], created: false, duplicate: false }
    }
  }

  const normalized = normalizePhone(input.whatsappNumber)
  // Backed by the unique index idx_leads_client_normalized_phone on the
  // generated/stored normalized_phone column — an index lookup, not a
  // per-row regex scan.
  const candidates = await query(
    `SELECT * FROM leads WHERE client_id = $1 AND normalized_phone = $2
     ORDER BY created_at ASC LIMIT 1`,
    [input.clientId, normalized]
  )

  if (candidates[0]) {
    const existing = candidates[0]
    await logDuplicateTouch(existing.id, input)
    return { lead: existing, created: false, duplicate: true }
  }

  // Check-then-insert still has a race window between two concurrent
  // webhook deliveries for the same phone number (common with Meta's
  // batched sends and webhook retries). The UNIQUE index on
  // (client_id, normalized_phone) is what actually closes it: if both
  // requests reach here at once, only one INSERT wins and the other fails
  // with 23505, which we catch below and fold into a merge instead of
  // letting it surface as a 500.
  try {
    const rows = await query(
      `INSERT INTO leads (
        client_id, campaign_id, full_name, whatsapp_number, email, grade,
        source, entry_type, external_ref, raw_payload, service_interested_in,
        fbclid, fbc, fbp
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        input.clientId,
        input.campaignId || null,
        input.fullName,
        input.whatsappNumber,
        input.email || null,
        input.grade || null,
        input.source,
        input.entryType,
        input.externalRef || null,
        input.rawPayload ? JSON.stringify(input.rawPayload) : null,
        input.serviceInterestedIn || null,
        input.fbclid || null,
        input.fbc || null,
        input.fbp || null,
      ]
    )
    const lead = rows[0]

    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description)
       VALUES ($1, 'system', 'Lead Created', $2)`,
      [lead.id, `New lead created: ${input.fullName} - ${input.whatsappNumber} from ${input.source} (${input.entryType})`]
    )

    return { lead, created: true, duplicate: false }
  } catch (err: any) {
    if (err?.code === '23505' && String(err?.constraint || '').includes('idx_leads_client_normalized_phone')) {
      const [existing] = await query(
        `SELECT * FROM leads WHERE client_id = $1 AND normalized_phone = $2
         ORDER BY created_at ASC LIMIT 1`,
        [input.clientId, normalized]
      )
      if (existing) {
        await logDuplicateTouch(existing.id, input)
        return { lead: existing, created: false, duplicate: true }
      }
    }
    throw err
  }
}

async function logDuplicateTouch(leadId: string, input: IntakeInput): Promise<void> {
  await query(
    `INSERT INTO activity_log (lead_id, activity_type, title, description)
     VALUES ($1, 'system', 'Duplicate touch received', $2)`,
    [
      leadId,
      `New ${input.entryType} touch from ${input.source}${input.campaignId ? ' (campaign matched)' : ''} — merged into existing lead, no new record created.`,
    ]
  )
}

// Finds an existing campaign by its platform IDs, or auto-creates one so
// leads land pre-tagged even for campaigns nobody registered in the CRM by
// hand yet. displayName falls back to the platform campaign id if the
// webhook payload doesn't carry a human-readable name.
export async function findOrCreateCampaign(params: {
  clientId: string
  platform: 'meta' | 'google'
  platformCampaignId: string
  platformAdsetId?: string | null
  platformAdId?: string | null
  displayName?: string | null
  adSetLabel?: string | null
  creativeAngle?: string | null
}): Promise<string> {
  const existing = await query(
    `SELECT id FROM campaigns
     WHERE client_id = $1 AND platform = $2 AND platform_campaign_id = $3
       AND platform_adset_id IS NOT DISTINCT FROM $4
       AND platform_ad_id IS NOT DISTINCT FROM $5`,
    [params.clientId, params.platform, params.platformCampaignId, params.platformAdsetId || null, params.platformAdId || null]
  )
  if (existing[0]) return existing[0].id

  // Same check-then-insert race as findOrCreateLead above. campaigns
  // already had a UNIQUE (client_id, platform, platform_campaign_id,
  // platform_adset_id, platform_ad_id) constraint, but nothing caught the
  // violation — a second concurrent webhook for a brand-new campaign would
  // 500 instead of just resolving to the row the first request created.
  try {
    const rows = await query(
      `INSERT INTO campaigns (
        client_id, platform, display_name, ad_set_label, creative_angle,
        platform_campaign_id, platform_adset_id, platform_ad_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`,
      [
        params.clientId,
        params.platform,
        params.displayName || `Auto: ${params.platformCampaignId}`,
        params.adSetLabel || null,
        params.creativeAngle || null,
        params.platformCampaignId,
        params.platformAdsetId || null,
        params.platformAdId || null,
      ]
    )
    return rows[0].id
  } catch (err: any) {
    if (err?.code === '23505') {
      const retry = await query(
        `SELECT id FROM campaigns
         WHERE client_id = $1 AND platform = $2 AND platform_campaign_id = $3
           AND platform_adset_id IS NOT DISTINCT FROM $4
           AND platform_ad_id IS NOT DISTINCT FROM $5`,
        [params.clientId, params.platform, params.platformCampaignId, params.platformAdsetId || null, params.platformAdId || null]
      )
      if (retry[0]) return retry[0].id
    }
    throw err
  }
}
