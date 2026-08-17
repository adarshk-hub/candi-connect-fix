//Re
import { query } from './db'

export interface CapiSummary {
  configured: boolean
  enabled: boolean
  sent: number
  failed: number
  lastEventAt: string | null
}

// Powers the small "Conversions API" card on the client dashboard — just
// enough to answer "is this actually running" at a glance, without
// duplicating the full log (that lives in Settings > Customize >
// Conversions API via /api/capi-events).
export async function getCapiSummary(clientId: string, from?: string, to?: string): Promise<CapiSummary> {
  const [client] = await query<{ capi_enabled: boolean; meta_pixel_id: string | null }>(
    'SELECT capi_enabled, meta_pixel_id FROM clients WHERE id = $1',
    [clientId]
  )

  const params: any[] = [clientId]
  let range = ''
  if (from) {
    params.push(from)
    range += ` AND created_at >= $${params.length}`
  }
  if (to) {
    params.push(to)
    range += ` AND created_at < ($${params.length}::date + interval '1 day')`
  }

  const [row] = await query<{ sent: number; failed: number; last_event_at: string | null }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'sent') AS sent,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       MAX(created_at) AS last_event_at
     FROM capi_event_log WHERE client_id = $1 ${range}`,
    params
  )

  return {
    configured: !!client?.meta_pixel_id,
    enabled: !!client?.capi_enabled,
    sent: Number(row?.sent || 0),
    failed: Number(row?.failed || 0),
    lastEventAt: row?.last_event_at || null,
  }
}
