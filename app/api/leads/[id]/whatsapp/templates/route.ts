import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'

// Lead-scoped (assertLeadAccess), not the settings-only canCustomize check
// GET /api/templates/[clientId] uses — a counsellor who can open this lead's
// WhatsApp tab needs to be able to pick a template to restart a closed
// 24hr window, even if they can't manage templates in Settings.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const rows = await query<{ id: string; name: string; category: string | null; language: string; components: any }>(
    `SELECT id, name, category, language, components
     FROM wa_templates WHERE client_id = $1 AND status = 'approved' ORDER BY name ASC`,
    [access.lead.client_id]
  )

  const templates = rows.map((row) => {
    const components = Array.isArray(row.components) ? row.components : []
    const bodyComponent = components.find((c: any) => String(c.type || '').toUpperCase() === 'BODY')
    const bodyText: string = bodyComponent?.text || ''
    const variableCount = new Set(Array.from(bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => m[1])).size

    return {
      id: row.id,
      name: row.name,
      category: row.category,
      language: row.language,
      bodyPreview: bodyText,
      variableCount,
    }
  })

  return NextResponse.json(templates)
}
