import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { fetchHistoricalMetaLeads, META_LEAD_RETENTION_DAYS } from '@/lib/metaLeadAdsBackfill'
import { findOrCreateLead, findOrCreateCampaign } from '@/lib/leadIntake'

// One-time (or occasionally re-run) catch-up for leads that came in through
// Meta Lead Ads forms before this CRM was capturing them live via webhook.
// Deliberately does NOT fire Conversions API events for anything pulled in
// here — those leads are old news by definition, and reporting them to Meta
// as if they just converted would misrepresent real-time performance to
// Meta's ad delivery algorithm.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!session || !AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const client = (await query<{ id: string; meta_page_id: string | null }>(
    'SELECT id, meta_page_id FROM clients WHERE id = $1',
    [params.id]
  ))[0]
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.meta_page_id) {
    return NextResponse.json({ error: 'This client has no Meta Page ID configured (clients.meta_page_id).' }, { status: 400 })
  }

  let historicalLeads
  try {
    historicalLeads = await fetchHistoricalMetaLeads(client.meta_page_id)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch historical leads from Meta' }, { status: 502 })
  }

  let created = 0
  let duplicate = 0
  const campaignIdCache = new Map<string, string>()

  for (const hl of historicalLeads) {
    let internalCampaignId: string | null = null
    if (hl.campaignId) {
      const cacheKey = `${hl.campaignId}:${hl.adsetId}:${hl.adId}`
      internalCampaignId =
        campaignIdCache.get(cacheKey) ||
        (await findOrCreateCampaign({
          clientId: client.id,
          platform: 'meta',
          platformCampaignId: hl.campaignId,
          platformAdsetId: hl.adsetId,
          platformAdId: hl.adId,
          adSetLabel: hl.adsetId ? `Ad set ${hl.adsetId}` : null,
        }))
      campaignIdCache.set(cacheKey, internalCampaignId)
    }

    const result = await findOrCreateLead({
      clientId: client.id,
      fullName: hl.fullName,
      whatsappNumber: hl.whatsappNumber,
      email: hl.email,
      grade: hl.grade,
      source: 'facebook',
      entryType: 'meta_form_backfill',
      campaignId: internalCampaignId,
      externalRef: `meta:${hl.leadgenId}`,
      rawPayload: { formId: hl.formId, formName: hl.formName, backfilled: true, originalCreatedTime: hl.createdTime },
      createdAt: hl.createdTime,
    })

    if (result.created) created++
    else duplicate++
  }

  return NextResponse.json({
    ok: true,
    totalFound: historicalLeads.length,
    created,
    duplicate,
    retentionNote: `Meta only retains Lead Ads submissions for ${META_LEAD_RETENTION_DAYS} days — anything older was already gone before this ran.`,
  })
}
