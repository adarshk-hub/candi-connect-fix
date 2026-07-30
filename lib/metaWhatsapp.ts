import crypto from 'crypto'
import { query } from './db'
import { decrypt } from './waEncryption'
import { defaultClientCode } from './waTemplateNaming'
import { debitForMessage, refundMessage, attachWamidToLatestDebit } from './waWallet'
import { DEFAULT_MESSAGE_CATEGORY } from './waCreditRates'

const GRAPH_API_URL = process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v19.0'

function appSecretProof(accessToken: string): string {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return ''
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex')
}

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
// and stubbed as successful so the Action/reply UI stays usable in dev —
// stubbed sends are not billed against the wallet.
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

  // Pre-debit the WCC wallet before contacting Meta at all — if there's
  // no balance left, the message is blocked here and the caller should
  // surface "please recharge" rather than attempting the send.
  const debit = await debitForMessage({ clientId: params.clientId, category: 'session' })
  if (!debit.ok) {
    return { ok: false, error: debit.error }
  }

  const result = await callMetaSendApi(creds, {
    to: params.to,
    type: 'text',
    text: { body: params.body },
  })

  if (!result.ok) {
    // Meta rejected the send after we'd already charged for it — make
    // the client whole again.
    await refundMessage({ clientId: params.clientId, category: 'session' })
  }

  return result
}

// Looks up the category (marketing/utility/authentication) a template
// was submitted under, since sendTemplateMessage's caller only ever
// passes the template name — needed to pick the right WCC rate. Falls
// back to the default rate bucket for templates not in our own registry
// (e.g. the fixed "testing_address" verification-ping template).
async function getTemplateCategory(clientId: string, templateName: string): Promise<string> {
  const row = (
    await query<{ category: string | null }>(
      'SELECT category FROM wa_templates WHERE client_id = $1 AND name = $2 LIMIT 1',
      [clientId, templateName]
    )
  )[0]
  return (row?.category || DEFAULT_MESSAGE_CATEGORY).toLowerCase()
}

// Sends an approved template message — used for nurture sequence sends and
// any first-touch/outside-24hr-window message, since templates are the
// only message type Meta allows outside an open session. This covers
// marketing, utility, and authentication template sends, broadcasts (just
// repeated calls to this function), and any media/document header inside
// the template — all billed at that template's category rate.
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

  const category = await getTemplateCategory(params.clientId, params.templateName)

  const debit = await debitForMessage({
    clientId: params.clientId,
    category,
    templateName: params.templateName,
  })
  if (!debit.ok) {
    return { ok: false, error: debit.error }
  }

  const result = await callMetaSendApi(creds, {
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode || 'en' },
      components: params.components || [],
    },
  })

  if (!result.ok) {
    await refundMessage({ clientId: params.clientId, category, templateName: params.templateName })
  } else if (result.wamid) {
    await attachWamidToLatestDebit({
      clientId: params.clientId,
      templateName: params.templateName,
      wamid: result.wamid,
    })
  }

  return result
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

export async function sendOperationalTemplate(params: {
  clientId: string
  to: string
  slug: string
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
