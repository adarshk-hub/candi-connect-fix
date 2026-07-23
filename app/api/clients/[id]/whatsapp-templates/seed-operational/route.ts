import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { decrypt } from '@/lib/waEncryption'
import { getOrCreateClientTemplateCode, submitAndRecordTemplate } from '@/lib/metaWhatsapp'
import { OPERATIONAL_TEMPLATE_DEFINITIONS, buildTemplateName } from '@/lib/operationalTemplateDefinitions'
import { handleWriteError } from '@/lib/apiError'

// Submits the 4 event-triggered lifecycle templates — post_visit_summary,
// visit_reminder_48h, visit_reminder_24h, visit_noshow_reschedule — for
// this client. These aren't part of the Day 0/2/4/7/10 nurture cadence, so
// unlike seed-defaults there's no wa_sequence_templates wiring: the call
// sites (stage-change trigger, visit-reminder cron, no-show handler) build
// the template name themselves via sendOperationalTemplate() using the
// same {CLIENT_CODE}_{slug} scheme.
//
// Safe to re-run, same as seed-defaults.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = (
    await query<{ waba_id: string; access_token: string }>(
      'SELECT waba_id, access_token FROM wa_client_config WHERE client_id = $1',
      [params.id]
    )
  )[0]
  if (!config) {
    return NextResponse.json({ error: "Save this client's WhatsApp config before submitting templates" }, { status: 400 })
  }

  try {
    const clientCode = await getOrCreateClientTemplateCode(params.id)
    const accessToken = decrypt(config.access_token)
    const results: any[] = []

    for (const def of OPERATIONAL_TEMPLATE_DEFINITIONS) {
      const name = buildTemplateName(clientCode, def.slug)
      const result = await submitAndRecordTemplate({
        clientId: params.id,
        wabaId: config.waba_id,
        accessToken,
        name,
        category: def.category,
        body: def.body,
      })
      results.push(result)
    }

    return NextResponse.json({ ok: true, clientCode, templates: results })
  } catch (err: any) {
    return handleWriteError(err)
  }
}
