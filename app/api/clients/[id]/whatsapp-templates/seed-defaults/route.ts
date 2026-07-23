import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { decrypt } from '@/lib/waEncryption'
import { getOrCreateClientTemplateCode, submitAndRecordTemplate } from '@/lib/metaWhatsapp'
import { NURTURE_TEMPLATE_DEFINITIONS, buildTemplateName } from '@/lib/nurtureTemplateDefinitions'
import { handleWriteError } from '@/lib/apiError'

// Submits the 5 build-spec education nurture templates (day0_welcome,
// day2_story, day4_fee, day7_urgency, day10_visit) for this client, using
// their wa_template_code as the {CLIENT_CODE} prefix, and wires the
// resulting names into wa_sequence_templates so the nurture engine
// actually sends *these* templates once Meta approves them — closing the
// gap where NURTURE_STEPS pointed at template names with no real content
// behind them.
//
// Safe to re-run: re-submitting a template Meta already has just returns
// its current status; wa_sequence_templates rows are upserted by day.
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

    for (const def of NURTURE_TEMPLATE_DEFINITIONS) {
      const name = buildTemplateName(clientCode, def.slug)
      const result = await submitAndRecordTemplate({
        clientId: params.id,
        wabaId: config.waba_id,
        accessToken,
        name,
        category: def.category,
        body: def.body,
      })

      // Point this client's Day N send at the template we just submitted,
      // regardless of whether it was already approved/pending before —
      // this is what the sequence engine (lib/waSequenceEngine.ts) reads.
      await query(
        `INSERT INTO wa_sequence_templates (client_id, day_number, template_name, language_code)
         VALUES ($1, $2, $3, 'en')
         ON CONFLICT (client_id, day_number) DO UPDATE SET template_name = $3, language_code = 'en'`,
        [params.id, def.day, name]
      )

      results.push({ day: def.day, ...result })
    }

    return NextResponse.json({ ok: true, clientCode, templates: results })
  } catch (err: any) {
    return handleWriteError(err)
  }
}
