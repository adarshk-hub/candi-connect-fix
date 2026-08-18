//Re

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { findOrCreateLead } from '@/lib/leadIntake'
import { fireCapiEventForLead } from '@/lib/capiTriggers'
import { startSequence } from '@/lib/waSequenceEngine'

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
    // Have the website's form JS read these off the page (fbclid from the
    // URL query string, fbp/fbc from the _fbp/_fbc cookies the Meta Pixel
    // already sets) and include them in the POST body — they're what lets
    // a "Qualified"/"Enrolled" event sent days later via Conversions API
    // still be attributed back to the original ad click.
    fbclid: body.fbclid || null,
    fbc: body.fbc || null,
    fbp: body.fbp || null,
  })

  // Only the first touch fires the Lead event and the WhatsApp welcome
  // sequence — a duplicate submit from a number that's already a lead is
  // a re-engagement, not a new conversion, and shouldn't restart Day 0.
  if (created) {
    void fireCapiEventForLead({
      lead,
      trigger: 'lead_created',
      eventIdSeed: `lead:${lead.id}`,
      clientIpAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      clientUserAgent: req.headers.get('user-agent'),
    })
    startSequence(lead.id)
      .then((r) => {
        if (!r.ok) console.error(`[landing-page webhook] Could not start welcome sequence for lead ${lead.id}: ${r.error}`)
      })
      .catch((err) => console.error(`[landing-page webhook] startSequence threw for lead ${lead.id}`, err))
  }

  return NextResponse.json({ ok: true, leadId: lead.id, created, duplicate })
}
