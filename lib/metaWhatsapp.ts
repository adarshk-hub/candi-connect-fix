import crypto from 'crypto'
import { query } from './db'
import { decrypt } from './waEncryption'
import { defaultClientCode } from './waTemplateNaming'

const GRAPH_API_URL = process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v19.0'

// Meta's "Require App Secret" setting (App Dashboard > Settings > Advanced)
// makes every Graph API call using this app's tokens require an
// appsecret_proof query param — an HMAC-SHA256 of the access token, keyed
// by the app secret, proving the caller actually holds the secret and not
// just a leaked token. Returns '' (omitted) if META_APP_SECRET isn't set,
// so this only activates once that env var is configured.
function appSecretProof(accessToken: string): string {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return ''
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex')
}

// Appends appsecret_proof to a Graph API URL that already has an access
// token attached via the Authorization header. Meta expects this proof as
// a query param regardless of whether the token itself is sent via header
// or query string.
function withAppSecretProof(url: string, accessToken: string): string {
  const proof = appSecretProof(accessToken)
  if (!proof) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}appsecret_proof=${proof}`
}

export interface SendResult {
  ok: boolean
  wamid?: string
  error?: string
}

interface WaCredentials {
  phoneNumberId: string
  accessToken: string
}

// Per-client credentials come from wa_client_config (BYO WABA per client).
// Falls back to the single default/test WHATSAPP_ACCESS_TOKEN /
// WHATSAPP_PHONE_NUMBER_ID env vars when a client hasn't configured their
// own number yet, so the integration is testable end-to-end before every
// client has been onboarded with their own WABA.
export async function getClientCredentials(clientId: string): Promise<WaCredentials | null> {
  const row = (
    await query<{ phone_number_id: string; access_token: string }>(
      'SELECT phone_number_id, access_token FROM wa_client_config WHERE client_id = $1',
      [clientId]
    )
  )[0]

  if (row) {
    return { phoneNumberId: row.phone_number_id, accessToken: decrypt(row.access_token) }
  }

  const fallbackPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const fallbackToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (fallbackPhoneId && fallbackToken) {
    return { phoneNumberId: fallbackPhoneId, accessToken: fallbackToken }
  }

  return null
}

interface WaBillingCredentials {
  wabaId: string
  accessToken: string
}

// Like getClientCredentials, but returns the WABA ID instead of the phone
// number ID — pricing/billing analytics are queried at the WABA level
// (a WABA can hold multiple phone numbers), not the phone-number level
// used for sending messages.
export async function getClientWabaCredentials(clientId: string): Promise<WaBillingCredentials | null> {
  const row = (
    await query<{ waba_id: string; access_token: string }>(
      'SELECT waba_id, access_token FROM wa_client_config WHERE client_id = $1',
      [clientId]
    )
  )[0]

  if (row?.waba_id) {
    return { wabaId: row.waba_id, accessToken: decrypt(row.access_token) }
  }

  const fallbackWabaId = process.env.WHATSAPP_WABA_ID
  const fallbackToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (fallbackWabaId && fallbackToken) {
    return { wabaId: fallbackWabaId, accessToken: fallbackToken }
  }

  return null
}

async function callMetaSendApi(creds: WaCredentials, payload: Record<string, any>): Promise<SendResult> {
  try {
    const url = withAppSecretProof(`${GRAPH_API_URL}/${creds.phoneNumberId}/messages`, creds.accessToken)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errMsg = data?.error?.message || `Meta API returned ${res.status}`
      return { ok: false, error: errMsg }
    }
    return { ok: true, wamid: data?.messages?.[0]?.id }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Meta WhatsApp request failed' }
  }
}

// Sends a free-form session reply (only valid inside the 24hr customer
// service window). Until a client has WHATSAPP_ACCESS_TOKEN configured
// (either via wa_client_config or the default env vars), sends are logged
// and stubbed as successful so the Action/reply UI stays usable in dev.
export async function sendTextMessage(params: {
  clientId: string
  to: string
  body: string
}): Promise<SendResult> {
  const creds = await getClientCredentials(params.clientId)
  if (!creds) {
    console.log(`[metaWhatsapp:stub] would send text to ${params.to}: "${params.body}"`)
    return { ok: true, wamid: `stub-${Date.now()}` }
  }

  return callMetaSendApi(creds, {
    to: params.to,
    type: 'text',
    text: { body: params.body },
  })
}

// Sends an approved template message — used for nurture sequence sends and
// any first-touch/outside-24hr-window message, since templates are the
// only message type Meta allows outside an open session.
export async function sendTemplateMessage(params: {
  clientId: string
  to: string
  templateName: string
  languageCode?: string
  components?: any[]
}): Promise<SendResult> {
  const creds = await getClientCredentials(params.clientId)
  if (!creds) {
    console.log(
      `[metaWhatsapp:stub] would send template "${params.templateName}" to ${params.to}`
    )
    return { ok: true, wamid: `stub-${Date.now()}` }
  }

  return callMetaSendApi(creds, {
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode || 'en' },
      components: params.components || [],
    },
  })
}

export interface TemplateSubmitResult {
  ok: boolean
  metaTemplateId?: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
}

// Submits one template to Meta's message_templates endpoint for a given
// WABA. Shared by POST /api/templates/submit (one-off) and
// POST /api/clients/[id]/whatsapp-templates/seed-defaults (the 5 spec'd
// nurture templates, submitted in a loop) so both go through the same
// request/response handling.
export async function submitTemplateToMeta(params: {
  wabaId: string
  accessToken: string
  name: string
  category?: string
  language?: string
  components: any[]
}): Promise<TemplateSubmitResult> {
  try {
    const res = await fetch(withAppSecretProof(`${GRAPH_API_URL}/${params.wabaId}/message_templates`, params.accessToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.accessToken}` },
      body: JSON.stringify({
        name: params.name,
        category: params.category || 'UTILITY',
        language: params.language || 'en',
        components: params.components,
      }),
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      return {
        ok: true,
        metaTemplateId: data.id || undefined,
        status: (data.status ? String(data.status).toLowerCase() : 'pending') as TemplateSubmitResult['status'],
      }
    }
    return {
      ok: false,
      status: 'rejected',
      rejectionReason: data?.error?.message || `Meta returned ${res.status}`,
    }
  } catch (err: any) {
    return { ok: false, status: 'rejected', rejectionReason: err?.message || 'Request to Meta failed' }
  }
}

// Every WhatsApp template name is namespaced per client as {CODE}_{slug}
// (see lib/waTemplateNaming.ts) so two clients never collide on the same
// Meta template name. Reads the code saved on the clients row; if none has
// been set yet (client hasn't touched Settings > WhatsApp), derives one
// from the client's name and persists it so it stays stable from here on.
export async function getOrCreateClientTemplateCode(clientId: string): Promise<string> {
  const row = (
    await query<{ name: string; wa_template_code: string | null }>(
      'SELECT name, wa_template_code FROM clients WHERE id = $1',
      [clientId]
    )
  )[0]
  if (!row) throw new Error(`Client ${clientId} not found`)
  if (row.wa_template_code) return row.wa_template_code

  const code = defaultClientCode(row.name)
  await query('UPDATE clients SET wa_template_code = $1 WHERE id = $2', [code, clientId])
  return code
}

// Sends one of the event-triggered lifecycle templates (post-visit
// summary, visit reminders, no-show reschedule — see
// lib/operationalTemplateDefinitions.ts) via direct Meta Cloud API. This
// is the direct-Meta replacement for the old sendAisensyTemplate() calls —
// same call sites (stage-change trigger, visit reminder cron, no-show
// handler), same {@link SendResult} shape, no BSP in the path.
export async function sendOperationalTemplate(params: {
  clientId: string
  to: string
  slug: string
  /** Ordered {{1}}, {{2}}... values. Defaults to [destinationName] for the common single-variable case. */
  bodyParams?: string[]
  destinationName?: string
}): Promise<SendResult> {
  const code = await getOrCreateClientTemplateCode(params.clientId)
  const templateName = `${code}_${params.slug}`
  const values = params.bodyParams || (params.destinationName ? [params.destinationName] : [])

  return sendTemplateMessage({
    clientId: params.clientId,
    to: params.to,
    templateName,
    components:
      values.length > 0
        ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }]
        : [],
  })
}

export interface SeedTemplateResult {
  name: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
}

// Submits one template to Meta and upserts the result into wa_templates.
// Shared by the nurture-defaults seeder (which additionally wires each
// result into wa_sequence_templates by day) and the operational-templates
// seeder (which doesn't need day wiring — those fire on lifecycle events,
// not a schedule).
export async function submitAndRecordTemplate(params: {
  clientId: string
  wabaId: string
  accessToken: string
  name: string
  category: string
  body: string
}): Promise<SeedTemplateResult> {
  const components = [{ type: 'BODY', text: params.body }]
  const submitted = await submitTemplateToMeta({
    wabaId: params.wabaId,
    accessToken: params.accessToken,
    name: params.name,
    category: params.category,
    language: 'en',
    components,
  })

  await query(
    `INSERT INTO wa_templates (client_id, meta_template_id, name, category, language, status, rejection_reason, components)
     VALUES ($1, $2, $3, $4, 'en', $5, $6, $7)
     ON CONFLICT (client_id, name) DO UPDATE
       SET meta_template_id = EXCLUDED.meta_template_id,
           status = EXCLUDED.status,
           rejection_reason = EXCLUDED.rejection_reason,
           components = EXCLUDED.components`,
    [
      params.clientId,
      submitted.metaTemplateId || null,
      params.name,
      params.category,
      submitted.status,
      submitted.rejectionReason || null,
      JSON.stringify(components),
    ]
  )

  return { name: params.name, status: submitted.status, rejectionReason: submitted.rejectionReason }
}

// Sends a one-off test message and reports success — used by
// POST /api/clients/[id]/verify-whatsapp to confirm a newly-saved WABA
// config actually works before flipping wa_client_config.verified to true.
//
// NOTE: Meta's "hello_world" template is auto-created and pre-approved on
// every WABA, but it is restricted to Meta's built-in Public Test Numbers
// only — sending it from a real, verified business phone number fails with
// (#131058) "Hello World templates can only be sent from the Public Test
// Numbers." So we use "testing_address" instead, a custom Utility template
// already approved on this WABA, with fixed placeholder values for its
// three body variables (this is only used for the connectivity/verify
// check, so the copy doesn't need to be dynamic). Body:
// "Hi {{1}}, your delivery address has been successfully updated to {{2}}.
// Contact {{3}} for any inquiries." — uses language code "en_US" to match
// how the template was created in Meta.
export async function sendVerificationPing(clientId: string, to: string): Promise<SendResult> {
  return sendTemplateMessage({
    clientId,
    to,
    templateName: 'testing_address',
    languageCode: 'en_US',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'there' },
          { type: 'text', text: '123 Test Street' },
          { type: 'text', text: 'support@candidschools.com' },
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------
// Billing / usage — built on Meta's template_analytics endpoint
//
// Switched from pricing_analytics (WABA-wide cost/volume by category) to
// template_analytics (per-template Sent/Delivered/Cost) because it's the
// more mature, GA, well-documented endpoint — see developers.facebook.com/
// documentation/business-messaging/whatsapp/analytics#template-analytics.
// Template IDs are fetched live from Meta's message_templates endpoint
// (fetchAllTemplatesFromMeta below), NOT from the local wa_templates
// table — a template created directly in Meta's WhatsApp Manager (rather
// than submitted through this app) would otherwise be invisible here even
// if it's the one actually being sent and billed.
//
// Response shape (confirmed from Meta's docs):
//   GET /{waba-id}/template_analytics
//       ?start=<unix|YYYY-MM-DD>&end=<unix|YYYY-MM-DD>&granularity=daily
//       &metric_types=cost,delivered,read,sent
//       &template_ids=[id1,id2,...]        (max 10 per call)
//   {
//     "data": [{
//       "granularity": "DAILY",
//       "data_points": [{
//         "template_id": "...", "start": ..., "end": ...,
//         "sent": N, "delivered": N, "read": N,
//         "cost": [{ "type": "amount_spent", "value": 0.03 }, ...]
//       }]
//     }]
//   }
//
// Notes:
// - Template analytics must be "confirmed"/enabled once per WABA before
//   Meta starts capturing it (POST /{waba-id}?is_enabled_for_insights=true).
//   This is idempotent and safe to call every time — see enableInsights().
// - Lookback window is up to 90 days (shorter than pricing_analytics' 365,
//   but simpler/more reliable, and covers "since this was set up" for a
//   freshly-onboarded client either way).
// - Max 10 template_ids per call — if a client has more than 10 templates,
//   this loops in batches of 10 and merges results.

export interface TemplateAnalyticsRow {
  templateId: string
  templateName: string
  sent: number
  delivered: number
  read: number
  cost: number // sum of "amount_spent" cost entries across the window
}

export interface TemplateAnalyticsSummary {
  templates: TemplateAnalyticsRow[]
  allTimeTotalCost: number
  allTimeTotalSent: number
  fetchedAt: string
  raw: any[] // untouched Meta response(s), one per batch call, for debugging
}

// One-time (idempotent) opt-in required before Meta starts capturing
// template analytics for a WABA. Safe to call on every load — Meta just
// no-ops if already enabled, and per the docs this cannot be disabled once
// turned on, so there's no "undo" state to worry about.
async function enableTemplateInsights(creds: WaBillingCredentials): Promise<void> {
  try {
    const url = withAppSecretProof(
      `${GRAPH_API_URL}/${creds.wabaId}?is_enabled_for_insights=true`,
      creds.accessToken
    )
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    })
  } catch {
    // Best-effort — if this fails (e.g. already enabled, or a transient
    // network error), the subsequent template_analytics call will simply
    // return empty data rather than throwing, so nothing else breaks.
  }
}

// Fetches Sent/Delivered/Read/Cost for up to 10 template IDs at once.
async function fetchTemplateAnalyticsBatch(
  creds: WaBillingCredentials,
  templateIds: string[],
  startUnix: number,
  endUnix: number
): Promise<any> {
  const params = new URLSearchParams({
    start: String(startUnix),
    end: String(endUnix),
    granularity: 'daily',
    metric_types: 'cost,delivered,read,sent',
    template_ids: `[${templateIds.join(',')}]`,
  })
  const baseUrl = `${GRAPH_API_URL}/${creds.wabaId}/template_analytics?${params.toString()}`
  const url = withAppSecretProof(baseUrl, creds.accessToken)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  })
  return res.json().catch(() => ({}))
}

// Fetches the live list of templates for a WABA directly from Meta,
// rather than relying on the local wa_templates table — which only
// contains templates submitted *through this app*. Templates created
// directly in Meta's WhatsApp Manager (e.g. a manually-created test
// template) would otherwise be invisible to billing/usage reporting even
// though they're the ones actually being sent and billed.
async function fetchAllTemplatesFromMeta(
  creds: WaBillingCredentials
): Promise<{ id: string; name: string }[]> {
  const results: { id: string; name: string }[] = []
  let url: string | null = withAppSecretProof(
    `${GRAPH_API_URL}/${creds.wabaId}/message_templates?fields=id,name&limit=100`,
    creds.accessToken
  )

  // Follow pagination in case a WABA has more than 100 templates.
  while (url) {
    // eslint-disable-next-line no-await-in-loop -- pagination is inherently sequential
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.accessToken}` } })
    // eslint-disable-next-line no-await-in-loop
    const data = await res.json().catch(() => ({}))
    if (!res.ok) break
    for (const t of data?.data || []) {
      if (t?.id && t?.name) results.push({ id: String(t.id), name: String(t.name) })
    }
    url = data?.paging?.next || null
  }

  return results
}

// Fetches all-time (last 90 days — Meta's max lookback for this endpoint)
// per-template Sent/Delivered/Cost for a client, using the live list of
// templates from Meta directly (see fetchAllTemplatesFromMeta above) —
// not just the ones this app happens to have submitted itself. Returns
// null if the client has no WABA configured yet.
export async function getAllTimeTemplateAnalytics(clientId: string): Promise<TemplateAnalyticsSummary | null> {
  const creds = await getClientWabaCredentials(clientId)
  if (!creds) return null

  const templateRows = await fetchAllTemplatesFromMeta(creds)

  if (templateRows.length === 0) {
    return {
      templates: [],
      allTimeTotalCost: 0,
      allTimeTotalSent: 0,
      fetchedAt: new Date().toISOString(),
      raw: [],
    }
  }

  await enableTemplateInsights(creds)

  const nameById = new Map(templateRows.map((t) => [t.id, t.name]))
  const endUnix = Math.floor(Date.now() / 1000)
  const startUnix = endUnix - 89 * 24 * 3600 // Meta's max lookback for this endpoint is 90 days

  const totalsById = new Map<string, TemplateAnalyticsRow>()
  const rawResponses: any[] = []

  // Batch in groups of 10 (Meta's per-call max for template_ids).
  for (let i = 0; i < templateRows.length; i += 10) {
    const batchIds = templateRows.slice(i, i + 10).map((t) => t.id)
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential to stay well under Graph API rate limits
    const data = await fetchTemplateAnalyticsBatch(creds, batchIds, startUnix, endUnix)
    rawResponses.push(data)

    const points: any[] = data?.data?.flatMap((d: any) => d?.data_points || []) || []
    for (const p of points) {
      const templateId = String(p.template_id ?? '')
      if (!templateId) continue
      const sent = Number(p.sent ?? 0)
      const delivered = Number(p.delivered ?? 0)
      const read = Number(p.read ?? 0)
      const costEntries: any[] = Array.isArray(p.cost) ? p.cost : []
      const amountSpent = costEntries.find((c) => c.type === 'amount_spent')?.value ?? 0

      const existing = totalsById.get(templateId)
      if (existing) {
        existing.sent += sent
        existing.delivered += delivered
        existing.read += read
        existing.cost += Number(amountSpent)
      } else {
        totalsById.set(templateId, {
          templateId,
          templateName: nameById.get(templateId) || templateId,
          sent,
          delivered,
          read,
          cost: Number(amountSpent),
        })
      }
    }
  }

  const templates = Array.from(totalsById.values()).sort((a, b) => b.cost - a.cost)
  const allTimeTotalCost = templates.reduce((sum, t) => sum + t.cost, 0)
  const allTimeTotalSent = templates.reduce((sum, t) => sum + t.sent, 0)

  return {
    templates,
    allTimeTotalCost,
    allTimeTotalSent,
    fetchedAt: new Date().toISOString(),
    raw: rawResponses,
  }
}
