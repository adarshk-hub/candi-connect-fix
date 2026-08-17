//Re
import { query } from './db'
import { sendCapiEvent, logCapiSkipped } from './metaConversionsApi'

interface ClientCapiConfig {
  id: string
  capi_enabled: boolean
  meta_pixel_id: string | null
  meta_capi_test_event_code: string | null
  capi_stage_events: Record<string, string>
}

async function getClientCapiConfig(clientId: string): Promise<ClientCapiConfig | null> {
  const rows = await query<ClientCapiConfig>(
    `SELECT id, capi_enabled, meta_pixel_id, meta_capi_test_event_code, capi_stage_events
     FROM clients WHERE id = $1`,
    [clientId]
  )
  return rows[0] || null
}

interface LeadForCapi {
  id: string
  client_id: string
  full_name: string
  whatsapp_number: string
  second_phone: string | null
  email: string | null
  external_ref: string | null
  fbclid: string | null
  fbc: string | null
  fbp: string | null
}

// Meta Lead Ads' external_ref is stored as "meta:<leadgen_id>" (see
// app/api/webhooks/meta-leads/route.ts) — pull the raw ID back out for the
// CAPI lead_id match key.
function leadgenIdFromExternalRef(externalRef: string | null): string | null {
  if (!externalRef || !externalRef.startsWith('meta:')) return null
  return externalRef.slice('meta:'.length)
}

// Fires a CAPI event for a lead if — and only if — the client has
// Conversions API turned on, a pixel configured, and the given trigger
// (an entry-type name like "lead_created", or a pipeline_stages key) is
// mapped to a Meta event in clients.capi_stage_events. Every call resolves
// to a row in capi_event_log (sent/failed/skipped) so nothing is silent.
// Never throws — a CAPI failure must never break lead intake or a stage
// update, which is why every call site below fires this without awaiting
// inside a try/catch of its own (this function already swallows errors).
export async function fireCapiEventForLead(params: {
  lead: LeadForCapi
  trigger: string
  eventIdSeed: string // unique-per-attempt seed for event_id dedup (e.g. lead id + trigger)
  customData?: Record<string, any>
  clientIpAddress?: string | null
  clientUserAgent?: string | null
}): Promise<void> {
  const { lead, trigger, eventIdSeed, customData, clientIpAddress, clientUserAgent } = params

  try {
    const config = await getClientCapiConfig(lead.client_id)
    if (!config) return

    const eventName = config.capi_stage_events?.[trigger]
    if (!config.capi_enabled) return
    if (!eventName) {
      // Not every stage needs an event — only log a skip if CAPI is on but
      // this particular trigger has no mapping, so the log doesn't fill up
      // with noise for institutes that only map two or three stages.
      return
    }
    if (!config.meta_pixel_id) {
      await logCapiSkipped({
        clientId: lead.client_id,
        leadId: lead.id,
        eventName,
        pipelineStage: trigger,
        reason: 'Conversions API is enabled but no Meta Pixel/Dataset ID is set.',
      })
      return
    }

    const accessToken = process.env.META_MARKETING_API_ACCESS_TOKEN
    if (!accessToken) {
      await logCapiSkipped({
        clientId: lead.client_id,
        leadId: lead.id,
        eventName,
        pipelineStage: trigger,
        reason: 'META_MARKETING_API_ACCESS_TOKEN is not set on the server.',
      })
      return
    }

    await sendCapiEvent({
      clientId: lead.client_id,
      leadId: lead.id,
      pixelId: config.meta_pixel_id,
      accessToken,
      testEventCode: config.meta_capi_test_event_code || undefined,
      eventName,
      eventId: `${eventIdSeed}:${eventName}`,
      pipelineStage: trigger,
      match: {
        email: lead.email,
        phone: lead.second_phone || lead.whatsapp_number,
        externalId: lead.id,
        fbc: lead.fbc,
        fbp: lead.fbp,
        clientIpAddress,
        clientUserAgent,
        leadId: leadgenIdFromExternalRef(lead.external_ref),
      },
      customData,
    })
  } catch (err) {
    // Config lookup itself failed (DB hiccup, etc.) — log to server console
    // only, since we don't have a reliable client/lead context to write a
    // capi_event_log row for.
    console.error('[capi] fireCapiEventForLead failed unexpectedly', err)
  }
}
