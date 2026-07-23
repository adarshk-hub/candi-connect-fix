import { SessionUser, AGENCY_ROLES } from './auth'

// Who may edit an institute's customization settings (stages, sources,
// custom fields, counsellors, logo): agency staff for any client, or that
// client's own client_admin for their own institute. Counsellors are
// read-only — they consume the config (e.g. render Kanban columns) but
// don't get to redefine it.
export function canCustomize(session: SessionUser | null, targetClientId: string): boolean {
  if (!session) return false
  if (AGENCY_ROLES.includes(session.role)) return true
  return session.role === 'client_admin' && session.clientId === targetClientId
}
