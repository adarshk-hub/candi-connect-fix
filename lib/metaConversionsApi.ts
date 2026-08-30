//Re
import crypto from 'crypto'
import { query } from './db'

const META_API_VERSION = process.env.META_MARKETING_API_VERSION || 'v26.0'

// Re-exported for convenience so server code can `import { META_STANDARD_EVENTS } from './metaConversionsApi'`
// — the canonical definition lives in lib/types.ts because that file is
// also safe to import from client components. See the comment there.
export { META_STANDARD_EVENTS } from './types'

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

// Meta requires phone numbers in the hashed match key to be digits-only
// with country code, no leading zeros/symbols. We don't reliably know the
// country code for every number in this CRM (leads.whatsapp_number is
// stored however it was submitted), so we assume India (+91) when a raw
// 10-digit number is given — correct for the overwhelming majority of leads
// in this app's actual usage, but worth revisiting if an institute starts
// taking international enquiries.
function normalizePhoneForHash(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  return digits
}

export interface CapiMatchKeys {
  email?: string | null
  phone?: string | null
  externalId?: string | null
  fbc?: string | null
  fbp?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
  // Meta Lead Ads' own lead_id — the strongest possible match key for a
  // lead that originated from a Lead Ads form, per Meta's own CAPI docs.
  leadId?: string | null
}

export interface SendCapiEventParams {
  clientId: string
  leadId?: string | null
  pixelId: string
  accessToken: string
  testEventCode?: string | null
  eventName: string
  eventId: string
  eventTime?: number // unix seconds, defaults to now
  match: CapiMatchKeys
  pipelineStage?: string | null
  customData?: Record<string, any>
  eventSourceUrl?: string | null
}

export interface SendCapiEventResult {
  ok: boolean
  fbtraceId?: string
  error?: string
  warnings?: string
}

// Sends one server-side event to Meta's Conversions API and writes an audit
// row to capi_event_log regardless of outcome — that log is what the
// Settings UI reads to show "is this actually working". Never throws: a
// failed Meta call should show up as a red row in the log, not break the
// lead-creation or stage-update request that triggered it.
export async function sendCapiEvent(params: SendCapiEventParams): Promise<SendCapiEventResult> {
  const {
    clientId,
    leadId = null,
    pixelId,
    accessToken,
    testEventCode,
    eventName,
    eventId,
    eventTime = Math.floor(Date.now() / 1000),
    match,
    pipelineStage = null,
    customData,
    eventSourceUrl,
  } = params

  const userData: Record<string, any> = {}
  if (match.email) userData.em = [sha256(match.email)]
  if (match.phone) userData.ph = [sha256(normalizePhoneForHash(match.phone))]
  if (match.externalId) userData.external_id = [sha256(match.externalId)]
  if (match.fbc) userData.fbc = match.fbc
  if (match.fbp) userData.fbp = match.fbp
  if (match.clientIpAddress) userData.client_ip_address = match.clientIpAddress
  if (match.clientUserAgent) userData.client_user_agent = match.clientUserAgent
  if (match.leadId) userData.lead_id = match.leadId

  // Meta's CRM integration flow (the "Connect data > CRM" dataset setup —
  // as opposed to a plain browser/pixel dataset) requires custom_data to
  // identify the event as CRM-sourced: event_source: "crm" and
  // lead_event_source: "<your CRM's name>". This isn't optional decoration
  // for CRM-type datasets — omitting it is a documented reason events sent
  // via this integration type don't get credited/shown correctly, separate
  // from any transport-level failure. Always included, with any caller-
  // supplied customData layered on top (never overriding these two keys).
  const customDataPayload = {
    ...customData,
    event_source: 'crm',
    lead_event_source: 'Candi Connect',
  }

  const eventPayload = {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    action_source: 'system_generated',
    ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
    user_data: userData,
    custom_data: customDataPayload,
  }

  const body: Record<string, any> = {
    data: [eventPayload],
    access_token: accessToken,
  }
  if (testEventCode) body.test_event_code = testEventCode

  let result: SendCapiEventResult
  try {
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      result = { ok: false, error: json?.error?.message || `Meta returned ${res.status}`, fbtraceId: json?.error?.fbtrace_id }
    } else {
      // A 200 OK only means Meta accepted the HTTP request — it doesn't
      // mean the event was fully processed with no complaints. Meta can
      // return warnings in `messages` (e.g. an expired/invalid
      // test_event_code) alongside a perfectly normal-looking
      // fbtrace_id, and `events_received: 0` on an ostensibly successful
      // call is itself a sign the event was accepted but then dropped.
      // Surface both instead of only recording the fbtrace_id.
      const messages: string[] = Array.isArray(json?.messages)
        ? json.messages.map((m: any) => (typeof m === 'string' ? m : JSON.stringify(m)))
        : []
      if (typeof json?.events_received === 'number' && json.events_received === 0) {
        messages.push('Meta returned events_received: 0 — the event was accepted but not counted as processed.')
      }
      result = {
        ok: true,
        fbtraceId: json?.fbtrace_id,
        warnings: messages.length ? messages.join(' | ') : undefined,
      }
    }
  } catch (err: any) {
    result = { ok: false, error: err?.message || 'Network error calling Meta Conversions API' }
  }

  await query(
    `INSERT INTO capi_event_log (client_id, lead_id, event_name, event_id, pipeline_stage, status, fbtrace_id, error, request_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      clientId,
      leadId,
      eventName,
      eventId,
      pipelineStage,
      result.ok ? 'sent' : 'failed',
      result.fbtraceId || null,
      result.error || result.warnings || null,
      JSON.stringify(eventPayload),
    ]
  )

  return result
}

// Logs a "skipped" row (no pixel configured, CAPI off, stage not mapped,
// etc.) so the Settings log tells the full story of why an event didn't go
// out, instead of just going quiet.
export async function logCapiSkipped(params: {
  clientId: string
  leadId?: string | null
  eventName: string
  pipelineStage?: string | null
  reason: string
}): Promise<void> {
  await query(
    `INSERT INTO capi_event_log (client_id, lead_id, event_name, event_id, pipeline_stage, status, error)
     VALUES ($1,$2,$3,$4,$5,'skipped',$6)`,
    [params.clientId, params.leadId || null, params.eventName, `skipped:${Date.now()}`, params.pipelineStage || null, params.reason]
  )
}
