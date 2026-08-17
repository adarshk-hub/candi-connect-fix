import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { decrypt } from '@/lib/waEncryption'
import { uploadTemplateMediaForHandle } from '@/lib/metaWhatsapp'

const MAX_BYTES = 16 * 1024 * 1024 // 16MB — comfortably covers Meta's per-type caps (images 5MB, docs 100MB, video 16MB for this upload path); reject early rather than let a huge file hang the request.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (16MB max).' }, { status: 400 })
  }

  const config = (
    await query<{ access_token: string }>('SELECT access_token FROM wa_client_config WHERE client_id = $1', [params.id])
  )[0]
  if (!config) {
    return NextResponse.json({ error: 'No WhatsApp config saved for this client yet' }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadTemplateMediaForHandle({
    accessToken: decrypt(config.access_token),
    fileBuffer,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name || 'template-sample',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true, handle: result.handle, fileName: file.name })
}
