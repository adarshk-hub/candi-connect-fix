import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { findOrCreateLead } from '@/lib/leadIntake'

// Generic intake for any client website/landing-page form. Auth is a bearer
// token equal to the client's clients.api_key (see Settings page for the
// per-client URL + key to paste into their form's submit handler).
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <api_key>' }, { status: 401 })
  }

  const client = (await query('SELECT id FROM clients WHERE api_key = $1', [apiKey]))[0]
  if (!client) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || !body.name || !body.phone) {
    return NextResponse.json({ error: 'name and phone are required' }, { status: 400 })
  }

  const { lead, created, duplicate } = await findOrCreateLead({
    clientId: client.id,
    fullName: body.name,
    whatsappNumber: body.phone,
    email: body.email || null,
    grade: body.grade || null,
    serviceInterestedIn: body.serviceInterestedIn || body.program || null,
    source: 'website_contact_form',
    entryType: 'landing_page',
    rawPayload: body,
  })

  return NextResponse.json({ ok: true, leadId: lead.id, created, duplicate })
}
