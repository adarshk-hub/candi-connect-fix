import { query } from './db'
import { decrypt } from './waEncryption'
import { defaultClientCode } from './waTemplateNaming'

const GRAPH_API_URL = process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v19.0'

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

async function callMetaSendApi(creds: WaCredentials, payload: Record<string, any>): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH_API_URL}/${creds.phoneNumberId}/messages`, {
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
    const res = await fetch(`${GRAPH_API_URL}/${params.wabaId}/message_templates`, {
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
// Uses Meta's "hello_world" template — auto-created and pre-approved on
// every WABA by default — instead of a plain text message. Plain text only
// works inside an open 24h session window (i.e. the recipient messaged you
// first); for a first-time test number with no prior conversation, only an
// approved template can initiate contact. hello_world has zero variables
// and uses language code "en_US" specifically (not "en" — Meta rejects a
// mismatched language code as "template not found").
export async function sendVerificationPing(clientId: string, to: string): Promise<SendResult> {
  return sendTemplateMessage({
    clientId,
    to,
    templateName: 'hello_world',
    languageCode: 'en_US',
  })
}
