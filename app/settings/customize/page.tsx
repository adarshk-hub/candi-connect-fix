import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/serverAuth'
import { query } from '@/lib/db'
import { AGENCY_ROLES } from '@/lib/auth'
import CustomizeShell from '@/components/settings/CustomizeShell'

export default async function CustomizePage() {
  const session = getServerSession()
  if (!session) redirect('/login')

  const isAgency = AGENCY_ROLES.includes(session.role)
  if (!isAgency && session.role !== 'client_admin') redirect('/settings')

  const institutes = isAgency
    ? await query<{ id: string; name: string }>('SELECT id, name FROM clients ORDER BY name')
    : session.clientId
      ? await query<{ id: string; name: string }>('SELECT id, name FROM clients WHERE id = $1', [session.clientId])
      : []

  return <CustomizeShell institutes={institutes} lockedToClientId={isAgency ? null : session.clientId} />
}
