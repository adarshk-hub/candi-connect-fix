import { query } from './db'

// Server-side equivalents of StagesContext's helpers, for server components
// and API routes that can't use a React context. Every lookup is scoped to
// one client's stage config since stages are per-institute.
export async function getStageLabel(clientId: string, key: string): Promise<string> {
  const rows = await query<{ label: string }>(
    'SELECT label FROM pipeline_stages WHERE client_id = $1 AND key = $2',
    [clientId, key]
  )
  return rows[0]?.label ?? key
}

export interface ServerStageRow {
  key: string
  label: string
  color: string
  status_group: string
  is_cold_lane: boolean
  is_active: boolean
  sort_order: number
}

// Used by the agency dashboard's stage funnel — since leads may span
// multiple institutes with different stage configs, the funnel renders
// using one representative institute's stage list/order/colors (the first
// client alphabetically) as a reasonable default for the aggregate view.
export async function getPrimaryClientStages(): Promise<ServerStageRow[]> {
  return query<ServerStageRow>(
    `SELECT key, label, color, status_group, is_cold_lane, is_active, sort_order
     FROM pipeline_stages
     WHERE client_id = (SELECT id FROM clients ORDER BY name LIMIT 1)
     ORDER BY sort_order ASC`
  )
}
