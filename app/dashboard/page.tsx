import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/serverAuth'
import { query } from '@/lib/db'
import AgencyDashboard from '@/components/dashboard/AgencyDashboard'
import ClientDashboard from '@/components/dashboard/ClientDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string }
}) {
  const session = getServerSession()
  if (!session) redirect('/login')

  if (session.role === 'client_counsellor') {
    redirect('/leads')
  }

  if (session.role === 'agency_admin' || session.role === 'agency_staff') {
    return <AgencyDashboard from={searchParams.from} to={searchParams.to} />
  }

  // client_admin — scoped strictly to their own workspace, never a list of
  // other institutions.
  if (!session.clientId) {
    return <p className="text-muted2">No institution linked to this account.</p>
  }
  const client = (await query<{ id: string; name: string }>('SELECT id, name FROM clients WHERE id = $1', [session.clientId]))[0]
  if (!client) {
    return <p className="text-muted2">Institution not found.</p>
  }
  return <ClientDashboard clientId={client.id} clientName={client.name} from={searchParams.from} to={searchParams.to} />
}
