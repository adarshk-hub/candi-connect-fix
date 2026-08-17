import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { sendVerificationPing, subscribeWabaToApp } from '@/lib/metaWhatsapp'
import { decrypt } from '@/lib/waEncryption'

// Sends a one-off test message to the number provided in the request body
// and, if Meta accepts it, marks wa_client_config.verified = true. This is
// how the settings UI confirms a newly pasted access token/phone number ID
// actually works before the client is allowed to launch sequences on it.
//
// It also (re-)subscribes the WABA to this app's webhook every time — a
// separate Meta-side link (POST /{waba-id}/subscribed_apps) that toggling
// webhook fields in the App Dashboard does NOT create by itself. Without
// it, outbound sends and "Verified" can look completely fine while every
// inbound reply is silently dropped, so it's folded into the same button
// rather than left as a step someone has to know to do separately.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const testPhone: string | undefined = body?.testPhone

  if (!testPhone) {
    return NextResponse.json({ error: 'testPhone is required' }, { status: 400 })
  }

  const config = (
    await query<{ id: string; waba_id: string; access_token: string }>(
      'SELECT id, waba_id, access_token FROM wa_client_config WHERE client_id = $1',
      [params.id]
    )
  )[0]
  if (!config) {
    return NextResponse.json({ error: 'No WhatsApp config saved for this client yet' }, { status: 404 })
  }

  const subscribeResult = await subscribeWabaToApp(config.waba_id, decrypt(config.access_token))
  if (!subscribeResult.ok) {
    return NextResponse.json(
      { ok: false, error: `Could not subscribe this WABA to the app's webhook: ${subscribeResult.error}` },
      { status: 502 }
    )
  }

  const result = await sendVerificationPing(params.id, testPhone)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  await query('UPDATE wa_client_config SET verified = true, updated_at = now() WHERE client_id = $1', [
    params.id,
  ])

  return NextResponse.json({ ok: true, wamid: result.wamid, webhookSubscribed: true })
}
