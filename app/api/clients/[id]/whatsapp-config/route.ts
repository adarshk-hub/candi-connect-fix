import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { encrypt } from '@/lib/waEncryption'
import { handleWriteError } from '@/lib/apiError'

// Returns the client's saved WABA config with the access token masked —
// the plaintext token is never sent back to the browser once saved.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = (
    await query(
      `SELECT phone_number_id, waba_id, display_phone_number, verified,
              (access_token IS NOT NULL AND access_token != '') AS token_set,
              updated_at
       FROM wa_client_config WHERE client_id = $1`,
      [params.id]
    )
  )[0]

  if (!row) return NextResponse.json({ configured: false })

  return NextResponse.json({
    configured: true,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    displayPhoneNumber: row.display_phone_number,
    verified: row.verified,
    accessToken: row.token_set ? '••••••••••••' : null,
    updatedAt: row.updated_at,
  })
}

// Saves (or updates) a client's WhatsApp Business Account credentials.
// The access token is encrypted before it ever touches the database —
// see lib/waEncryption.ts. Saving new credentials resets verified to
// false; call POST /api/clients/[id]/verify-whatsapp to re-confirm.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { phoneNumberId, wabaId, accessToken, displayPhoneNumber } = body || {}

  const existing = (await query('SELECT access_token FROM wa_client_config WHERE client_id = $1', [params.id]))[0]

  if (!phoneNumberId || !wabaId || (!accessToken && !existing)) {
    return NextResponse.json({ error: 'phoneNumberId, wabaId, and accessToken are required' }, { status: 400 })
  }

  try {
    // Keep the existing encrypted token if the field was left blank
    // ("leave blank to keep current") rather than requiring it on every
    // save once it's already set.
    const encryptedToken = accessToken ? encrypt(accessToken) : existing.access_token

    const row = (
      await query(
        `INSERT INTO wa_client_config (client_id, phone_number_id, waba_id, access_token, display_phone_number, verified, updated_at)
         VALUES ($1, $2, $3, $4, $5, false, now())
         ON CONFLICT (client_id) DO UPDATE
           SET phone_number_id = $2, waba_id = $3, access_token = $4,
               display_phone_number = $5, verified = false, updated_at = now()
         RETURNING id`,
        [params.id, phoneNumberId, wabaId, encryptedToken, displayPhoneNumber || null]
      )
    )[0]

    // Keep the webhook's client-lookup column in sync so inbound messages
    // for this phone_number_id route to the right client immediately.
    await query('UPDATE clients SET meta_whatsapp_phone_number_id = $1 WHERE id = $2', [
      phoneNumberId,
      params.id,
    ])

    return NextResponse.json({ ok: true, id: row.id })
  } catch (err: any) {
    return handleWriteError(err)
  }
}
