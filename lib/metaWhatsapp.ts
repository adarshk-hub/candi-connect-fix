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
// Billing / pricing analytics
//
// Meta's pricing_analytics is a field-expansion query on the WABA node
// (same family as conversation_analytics), e.g.:
//   GET /{waba-id}?fields=pricing_analytics.start(UNIX).end(UNIX).granularity(MONTHLY)
// It returns delivered-message cost broken down by category/country over
// the requested window. NOTE: Meta's exact response field names for this
// endpoint aren't pinned down here with certainty — the parser below reads
// the fields we could confirm (cost, volume/count, pricing_category,
// country) defensively, and always returns the raw per-month response
// alongside the parsed summary so the UI/caller can inspect real payload
// shape on first use and this can be tightened if Meta's field names
// differ slightly from what's assumed here.
export interface PricingAnalyticsCategoryBreakdown {
  category: string // e.g. MARKETING, UTILITY, AUTHENTICATION
  country?: string
  count: number
  cost: number
}

export interface PricingAnalyticsMonth {
  month: string // 'YYYY-MM'
  currency: string | null
  totalCost: number
  totalCount: number
  byCategory: PricingAnalyticsCategoryBreakdown[]
  raw: any // untouched Meta response for this month, for debugging/verification
}

export interface PricingAnalyticsSummary {
  months: PricingAnalyticsMonth[]
  allTimeTotalCost: number
  allTimeTotalCount: number
  currency: string | null
  fetchedAt: string
}

// Fetches one calendar month of pricing analytics for a WABA.
async function fetchPricingAnalyticsMonth(
  creds: WaBillingCredentials,
  monthStart: Date
): Promise<PricingAnalyticsMonth> {
  const start = Math.floor(monthStart.getTime() / 1000)
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))
  const end = Math.floor(Math.min(monthEnd.getTime(), Date.now()) / 1000)
  const monthLabel = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`

  const fields = `pricing_analytics.start(${start}).end(${end}).granularity(MONTHLY)`
  const url = withAppSecretProof(
    `${GRAPH_API_URL}/${creds.wabaId}?fields=${encodeURIComponent(fields)}`,
    creds.accessToken
  )

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return {
      month: monthLabel,
      currency: null,
      totalCost: 0,
      totalCount: 0,
      byCategory: [],
      raw: data,
    }
  }

  // Defensive parse: Meta typically nests results under
  // data.pricing_analytics.data[].data_points[], each point carrying
  // cost/volume/pricing_category/country — but field names can vary by
  // API version, so we walk the structure loosely rather than assuming
  // one fixed shape.
  const points: any[] =
    data?.pricing_analytics?.data?.flatMap((d: any) => d?.data_points || d?.entries || []) || []

  let totalCost = 0
  let totalCount = 0
  let currency: string | null = null
  const byCategory = new Map<string, PricingAnalyticsCategoryBreakdown>()

  for (const p of points) {
    const cost = Number(p.cost ?? p.total_cost ?? p.amount ?? 0)
    const count = Number(p.volume ?? p.count ?? p.num_messages ?? p.delivered ?? 0)
    const category = String(p.pricing_category ?? p.category ?? 'UNKNOWN').toUpperCase()
    const country = p.country ?? p.country_code ?? undefined
    currency = currency || p.currency || null

    totalCost += cost
    totalCount += count

    const key = `${category}:${country || ''}`
    const existing = byCategory.get(key)
    if (existing) {
      existing.cost += cost
      existing.count += count
    } else {
      byCategory.set(key, { category, country, cost, count })
    }
  }

  return {
    month: monthLabel,
    currency,
    totalCost,
    totalCount,
    byCategory: Array.from(byCategory.values()),
    raw: data,
  }
}

// Loops month-by-month from `monthsBack` months ago through the current
// month and aggregates pricing_analytics into an all-time summary. Meta's
// analytics endpoints can cap how much range a single call returns at fine
// granularity, so we deliberately request one month at a time rather than
// one big range, and stitch the results together here.
//
// Note: per-message billing only started July 1, 2025 — requesting months
// before that will return zero/empty data from Meta since a different
// (deprecated) pricing model applied then.
export async function getAllTimePricingAnalytics(
  clientId: string,
  monthsBack: number = 24
): Promise<PricingAnalyticsSummary | null> {
  const creds = await getClientWabaCredentials(clientId)
  if (!creds) return null

  const now = new Date()
  const months: PricingAnalyticsMonth[] = []

  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    if (monthStart.getTime() > now.getTime()) continue
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential to stay well under Graph API rate limits
    const monthData = await fetchPricingAnalyticsMonth(creds, monthStart)
    months.push(monthData)
  }

  const allTimeTotalCost = months.reduce((sum, m) => sum + m.totalCost, 0)
  const allTimeTotalCount = months.reduce((sum, m) => sum + m.totalCount, 0)
  const currency = months.find((m) => m.currency)?.currency || null

  return {
    months,
    allTimeTotalCost,
    allTimeTotalCount,
    currency,
    fetchedAt: new Date().toISOString(),
  }
}
