import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { verifySignature, fetchLeadFields } from '@/lib/metaLeadAds'
import { findOrCreateLead, findOrCreateCampaign } from '@/lib/leadIntake'
import { fireCapiEventForLead } from '@/lib/capiTriggers'
import { startSequence } from '@/lib/waSequenceEngine'

// Meta's one-time subscription handshake: echoes hub.challenge back if
// hub.verify_token matches what you configured in the Meta App dashboard.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  const expectedToken = process.env.META_VERIFY_TOKEN
  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const results: any[] = []

  for (const entry of payload.entry || []) {
    const pageId = entry.id
    const client = (await query('SELECT id FROM clients WHERE meta_page_id = $1', [pageId]))[0]
    if (!client) {
      results.push({ pageId, error: 'No client mapped to this Meta Page ID' })
      continue
    }

    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen') continue
      const value = change.value || {}
      const leadgenId: string = value.leadgen_id
      const formId: string = value.form_id
      const campaignId: string | undefined = value.campaign_id
      const adsetId: string | undefined = value.adgroup_id
      const adId: string | undefined = value.ad_id

      const fields = await fetchLeadFields(leadgenId, pageId)

      let internalCampaignId: string | null = null
      if (campaignId) {
        internalCampaignId = await findOrCreateCampaign({
          clientId: client.id,
          platform: 'meta',
          platformCampaignId: campaignId,
          platformAdsetId: adsetId,
          platformAdId: adId,
          adSetLabel: adsetId ? `Ad set ${adsetId}` : null,
        })
      }

      const { lead, created, duplicate } = await findOrCreateLead({
        clientId: client.id,
        fullName: fields.fullName,
        whatsappNumber: fields.whatsappNumber,
        email: fields.email,
        grade: fields.grade,
        source: 'facebook',
        entryType: 'meta_form',
        campaignId: internalCampaignId,
        externalRef: `meta:${leadgenId}`,
        rawPayload: { formId, leadgenId, campaignId, adsetId, adId },
      })

      // Sends the Lead event back to Meta via CAPI, matched on the Lead
      // Ads lead_id itself (the strongest match key available for this
      // channel) — mainly useful for institutes running the CAPI Gateway
      // or wanting deduped/offline-safe attribution rather than relying on
      // Meta's own client-side capture of the form submit. Also kicks off
      // the WhatsApp welcome sequence (Day 0 template, sent immediately)
      // for genuinely new leads only — never for a duplicate/merged touch.
      if (created) {
        void fireCapiEventForLead({ lead, trigger: 'lead_created', eventIdSeed: `lead:${lead.id}` })
        startSequence(lead.id)
          .then((r) => {
            if (!r.ok) console.error(`[meta-leads webhook] Could not start welcome sequence for lead ${lead.id}: ${r.error}`)
          })
          .catch((err) => console.error(`[meta-leads webhook] startSequence threw for lead ${lead.id}`, err))
      }

      results.push({ leadId: lead.id, created, duplicate })
    }
  }

  return NextResponse.json({ ok: true, results })
}
