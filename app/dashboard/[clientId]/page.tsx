import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/serverAuth'
import { query } from '@/lib/db'
import { AGENCY_ROLES } from '@/lib/auth'
import ClientDashboard from '@/components/dashboard/ClientDashboard'

export const dynamic = 'force-dynamic'

// Fills the gap AgencyDashboard always had: an agency_admin/agency_staff
// session has no clientId of its own, so app/dashboard/page.tsx could never
// route them to a specific institute's funnel/cost-metrics/campaign view —
// only the aggregate cross-client overview. This route is that missing
// per-institute view, reached from the "Institutes" list on the agency
// dashboard.
export default async function ClientDashboardPage({
  params,
  searchParams,
}: {
  params: { clientId: string }
  searchParams: { from?: string; to?: string }
}) {
  const session = getServerSession()
  if (!session) redirect('/login')

  if (!AGENCY_ROLES.includes(session.role)) {
    redirect('/dashboard')
  }

  const client = (await query<{ id: string; name: string }>('SELECT id, name FROM clients WHERE id = $1', [params.clientId]))[0]
  if (!client) {
    return <p className="text-muted2">Institution not found.</p>
  }

  return <ClientDashboard clientId={client.id} clientName={client.name} from={searchParams.from} to={searchParams.to} />
}
