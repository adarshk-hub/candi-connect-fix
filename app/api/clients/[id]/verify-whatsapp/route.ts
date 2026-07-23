import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { sendVerificationPing } from '@/lib/metaWhatsapp'

// Sends a one-off test message to the number provided in the request body
// and, if Meta accepts it, marks wa_client_config.verified = true. This is
// how the settings UI confirms a newly pasted access token/phone number ID
// actually works before the client is allowed to launch sequences on it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const testPhone: string | undefined = body?.testPhone

  if (!testPhone) {
    return NextResponse.json({ error: 'testPhone is required' }, { status: 400 })
  }

  const config = (await query('SELECT id FROM wa_client_config WHERE client_id = $1', [params.id]))[0]
  if (!config) {
    return NextResponse.json({ error: 'No WhatsApp config saved for this client yet' }, { status: 404 })
  }

  const result = await sendVerificationPing(params.id, testPhone)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  await query('UPDATE wa_client_config SET verified = true, updated_at = now() WHERE client_id = $1', [
    params.id,
  ])

  return NextResponse.json({ ok: true, wamid: result.wamid })
}
