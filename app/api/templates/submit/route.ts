import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { decrypt } from '@/lib/waEncryption'
import { submitTemplateToMeta } from '@/lib/metaWhatsapp'
import { handleWriteError } from '@/lib/apiError'

// Submits a template to Meta for approval (POST /{waba_id}/message_templates)
// and records it in wa_templates with status='pending'. Approval itself
// happens asynchronously on Meta's side — poll status via
// POST /api/templates/sync/[clientId].
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json().catch(() => null)
  const { clientId, name, category, language, components, headerFormat, headerText, headerMediaData, headerMediaMime, headerMediaFilename } = body || {}

  if (!clientId || !name || !components) {
    return NextResponse.json({ error: 'clientId, name, and components are required' }, { status: 400 })
  }
  if (!canCustomize(session, clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = (
    await query('SELECT waba_id, access_token FROM wa_client_config WHERE client_id = $1', [clientId])
  )[0]
  if (!config) {
    return NextResponse.json({ error: 'No WhatsApp config saved for this client yet' }, { status: 400 })
  }

  try {
    const accessToken = decrypt(config.access_token)
    const result = await submitTemplateToMeta({
      wabaId: config.waba_id,
      accessToken,
      name,
      category,
      language,
      components,
    })

    const row = (
      await query(
        `INSERT INTO wa_templates (
           client_id, meta_template_id, name, category, language, status, rejection_reason, components,
           header_format, header_text, header_media_data, header_media_mime, header_media_filename
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          clientId,
          result.metaTemplateId || null,
          name,
          category || 'UTILITY',
          language || 'en',
          result.status,
          result.rejectionReason || null,
          JSON.stringify(components),
          headerFormat || null,
          headerText || null,
          headerMediaData || null,
          headerMediaMime || null,
          headerMediaFilename || null,
        ]
      )
    )[0]

    return NextResponse.json(row)
  } catch (err: any) {
    return handleWriteError(err)
  }
}
