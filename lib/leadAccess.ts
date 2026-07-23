import { query } from './db'
import { SessionUser } from './auth'

interface LeadAccessOk {
  ok: true
  lead: any
}
interface LeadAccessErr {
  ok: false
  status: number
  error: string
}

// Every /api/leads/[id]/* sub-route (Info, Action, Follow Up, Comment tabs)
// must check lead ownership the same way the main GET/PATCH route does —
// otherwise an authenticated counsellor or client_admin from one institution
// could read or write another institution's lead by guessing/enumerating its
// ID. Centralized here so that check can't be silently skipped in a new route.
export async function assertLeadAccess(
  session: SessionUser | null,
  leadId: string
): Promise<LeadAccessOk | LeadAccessErr> {
  if (!session) return { ok: false, status: 401, error: 'Unauthorized' }

  const lead = (await query('SELECT * FROM leads WHERE id = $1', [leadId]))[0]
  if (!lead) return { ok: false, status: 404, error: 'Not found' }

  if (session.role === 'client_admin' && lead.client_id !== session.clientId) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  if (session.role === 'client_counsellor' && lead.assigned_counsellor_id !== session.id) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  return { ok: true, lead }
}
