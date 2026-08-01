import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/serverAuth'
import { query } from '@/lib/db'
import { AGENCY_ROLES } from '@/lib/auth'
import BroadcastsShell from '@/components/broadcast/BroadcastsShell'

export default async function BroadcastsPage() {
  const session = getServerSession()
  if (!session) redirect('/login')

  // Counsellors don't get to create/send broadcasts (they cost real
  // money out of the client's WCC wallet) — same restriction as
  // Settings > Customize.
  if (session.role === 'client_counsellor') redirect('/leads')

  const isAgency = AGENCY_ROLES.includes(session.role)
  const institutes = isAgency
    ? await query<{ id: string; name: string }>('SELECT id, name FROM clients ORDER BY name')
    : session.clientId
      ? await query<{ id: string; name: string }>('SELECT id, name FROM clients WHERE id = $1', [session.clientId])
      : []

  return <BroadcastsShell institutes={institutes} lockedToClientId={isAgency ? null : session.clientId} />
}
