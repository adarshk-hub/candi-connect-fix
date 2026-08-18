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

// Looks up everything about a submitted template that sending needs — the
// WCC rate category, plus the durable header info persisted at submission
// time (see wa-template-header-media-migration.sql). Combined into one
// query so sendTemplateMessage doesn't have to hit the DB twice per send.
interface TemplateMeta {
  category: string
  headerFormat: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  headerMediaData: string | null
  headerMediaMime: string | null
  headerMediaFilename: string | null
}

async function getTemplateMeta(clientId: string, templateName: string): Promise<TemplateMeta> {
  const row = (
    await query<{
      category: string | null
      header_format: string | null
      header_media_data: string | null
      header_media_mime: string | null
      header_media_filename: string | null
    }>(
      `SELECT category, header_format, header_media_data, header_media_mime, header_media_filename
       FROM wa_templates WHERE client_id = $1 AND name = $2 LIMIT 1`,
      [clientId, templateName]
    )
  )[0]
  return {
    category: (row?.category || DEFAULT_MESSAGE_CATEGORY).toLowerCase(),
    headerFormat: (row?.header_format as TemplateMeta['headerFormat']) || null,
    headerMediaData: row?.header_media_data || null,
    headerMediaMime: row?.header_media_mime || null,
    headerMediaFilename: row?.header_media_filename || null,
  }
}

// Sends an approved template message — used for nurture sequence sends and
// any first-touch/outside-24hr-window message, since templates are the
// only message type Meta allows outside an open session. This covers
// marketing, utility, and authentication template sends, broadcasts (just
// repeated calls to this function), and any media/document header inside
// the template — all billed at that template's category rate.
//
// If this template has a stored IMAGE/VIDEO/DOCUMENT header (see
// getTemplateMeta), that media is (re-)uploaded to Meta fresh on every
// call — Meta requires a live media id or URL at send time, not the
// one-time example handle used when the template was submitted for
// approval, so there is no way to "attach once" and skip this step on
// later sends. A stored TEXT header needs no per-send parameter; Meta
// renders the approved static text automatically.
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

  const meta = await getTemplateMeta(params.clientId, params.templateName)

  const components = params.components ? [...params.components] : []
  const hasHeaderAlready = components.some((c) => String(c?.type).toUpperCase() === 'HEADER')

  if (!hasHeaderAlready && meta.headerFormat && meta.headerFormat !== 'TEXT' && meta.headerMediaData) {
    const upload = await uploadMediaForSending({
      phoneNumberId: creds.phoneNumberId,
      accessToken: creds.accessToken,
      base64Data: meta.headerMediaData,
      mimeType: meta.headerMediaMime || 'application/octet-stream',
      fileName: meta.headerMediaFilename || 'attachment',
    })
    if (!upload.ok) {
      return { ok: false, error: `Could not attach header media: ${upload.error}` }
    }

    const key = meta.headerFormat.toLowerCase() // image | video | document
    const mediaParam: Record<string, any> = { id: upload.handle }
    if (meta.headerFormat === 'DOCUMENT' && meta.headerMediaFilename) {
      mediaParam.filename = meta.headerMediaFilename
    }
    components.unshift({ type: 'header', parameters: [{ type: key, [key]: mediaParam }] })
  }

  const debit = await debitForMessage({
    clientId: params.clientId,
    category: meta.category,
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
      components,
    },
  })

  if (!result.ok) {
    await refundMessage({ clientId: params.clientId, category: meta.category, templateName: params.templateName })
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
      // Meta's top-level error.message is often a generic category label
      // (e.g. "Invalid parameter") while the actually useful, specific
      // explanation sits in error_user_msg / error_user_title /
      // error_data.details — surface whichever of those is present so the
      // Notes column shows something a person can act on, not just the
      // generic label repeated back.
      rejectionReason:
        data?.error?.error_user_msg ||
        data?.error?.error_data?.details ||
        [data?.error?.error_user_title, data?.error?.message].filter(Boolean).join(': ') ||
        `Meta returned ${res.status}`,
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

// Turning on webhook fields (e.g. "messages") at the App level only makes
// the app *capable* of receiving those events — it does nothing on its
// own. A WABA has to separately subscribe to this specific app's webhook
// via this call, or Meta never sends it anything for that WABA, even with
// every field toggled on in the App Dashboard. This step is normally done
// automatically by Meta's guided Embedded Signup flow, but is easy to miss
// entirely on a direct/manual Cloud API integration like this one — with
// no error surfaced anywhere, inbound messages just silently never arrive.
export async function subscribeWabaToApp(wabaId: string, accessToken: string): Promise<SendResult> {
  try {
    const url = withAppSecretProof(`${GRAPH_API_URL}/${wabaId}/subscribed_apps`, accessToken)
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.success === false) {
      return { ok: false, error: data?.error?.message || `Meta API returned ${res.status}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Request to Meta failed' }
  }
}

export interface MediaUploadResult {
  ok: boolean
  handle?: string
  error?: string
}

// A template with an IMAGE/VIDEO/DOCUMENT header can't just reference a
// URL — Meta requires one real example file to be uploaded up front via
// the (separate, two-step) Resumable Upload API, and the opaque "handle"
// it returns is what actually goes into the template's
// components[].example.header_handle when submitting for approval.
// Docs: https://developers.facebook.com/docs/graph-api/guides/upload
export async function uploadTemplateMediaForHandle(params: {
  accessToken: string
  fileBuffer: Buffer
  mimeType: string
  fileName: string
}): Promise<MediaUploadResult> {
  const appId = process.env.META_APP_ID
  if (!appId) {
    return { ok: false, error: 'META_APP_ID is not configured on the server.' }
  }

  try {
    // Step 1: start an upload session sized for this exact file.
    const sessionUrl = `${GRAPH_API_URL}/${appId}/uploads?file_length=${params.fileBuffer.byteLength}&file_type=${encodeURIComponent(params.mimeType)}&file_name=${encodeURIComponent(params.fileName)}&access_token=${encodeURIComponent(params.accessToken)}`
    const sessionRes = await fetch(sessionUrl, { method: 'POST' })
    const sessionData = await sessionRes.json().catch(() => ({}))
    if (!sessionRes.ok || !sessionData?.id) {
      return { ok: false, error: sessionData?.error?.message || `Could not start upload session (${sessionRes.status})` }
    }

    // Step 2: push the actual bytes to that session in one shot (files
    // this app deals with — template sample images/videos/PDFs — are
    // small enough not to need chunking). sessionData.id already comes
    // back as "upload:<session-id>" and is used as the path verbatim.
    const uploadRes = await fetch(`${GRAPH_API_URL}/${sessionData.id}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${params.accessToken}`,
        file_offset: '0',
      },
      body: new Uint8Array(params.fileBuffer),
    })
    const uploadData = await uploadRes.json().catch(() => ({}))
    if (!uploadRes.ok || !uploadData?.h) {
      return { ok: false, error: uploadData?.error?.message || `Upload failed (${uploadRes.status})` }
    }

    return { ok: true, handle: uploadData.h }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Request to Meta failed' }
  }
}

// The SEND-time counterpart to uploadTemplateMediaForHandle above — a
// completely separate, simpler Meta API (the regular, non-resumable Media
// API) that has to be called fresh before every message that carries a
// media header, because the resumable-upload handle used at template
// *submission* time is not valid for actually sending. Returns a media id
// that's referenced in that one outgoing message's header parameter.
export async function uploadMediaForSending(params: {
  phoneNumberId: string
  accessToken: string
  base64Data: string
  mimeType: string
  fileName: string
}): Promise<MediaUploadResult> {
  try {
    const buffer = Buffer.from(params.base64Data, 'base64')
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('file', new Blob([new Uint8Array(buffer)], { type: params.mimeType }), params.fileName)

    const url = withAppSecretProof(`${GRAPH_API_URL}/${params.phoneNumberId}/media`, params.accessToken)
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.id) {
      return { ok: false, error: data?.error?.message || `Meta API returned ${res.status}` }
    }
    return { ok: true, handle: data.id }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Request to Meta failed' }
  }
}
