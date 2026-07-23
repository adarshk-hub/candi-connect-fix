import { query } from './db'

export interface CampaignRow {
  id: string
  displayName: string
  platform: string | null
  leads: number
  visits: number
  enrolled: number
  fees: number
  cpl: number | null
  convPct: number | null
  status: { label: string; color: 'green' | 'gray' | 'amber' }
}

export interface ClientDashboardMetrics {
  clientId: string
  clientName: string
  from: string | null
  to: string | null
  kpis: {
    totalLeads: number
    qualified: number
    visitsBooked: number
    enrolled: number
    feesCollected: number
    totalSpent: number
  }
  funnel: { label: string; count: number; pctOfLeads: number }[]
  costMetrics: {
    cpl: number | null
    cpv: number | null
    cpa: number | null
    avgFeePerStudent: number | null
    roas: number | null
  }
  weeklySpend: { weekStarting: string; amount: number }[]
  campaigns: CampaignRow[]
  fees: {
    totalCollected: number
    depositCount: number
    depositSum: number
    fullCount: number
    fullSum: number
    lastReceivedAt: string | null
  }
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

// Best performer / steady / watching / low volume classification — same rule
// this dashboard has used since the original ClientDashboard: best converter
// wins outright, "watching" flags above-median lead volume converting below
// 30%, "low volume" flags well-below-median lead volume.
function classifyCampaign(c: CampaignRow, rows: CampaignRow[]): { label: string; color: 'green' | 'gray' | 'amber' } {
  const best = Math.max(...rows.map((r) => r.enrolled), 0)
  const leadCounts = rows.map((r) => r.leads).sort((a, b) => a - b)
  const median = leadCounts.length ? leadCounts[Math.floor(leadCounts.length / 2)] : 0

  if (best > 0 && c.enrolled === best) return { label: 'Best performer', color: 'green' }
  if (best > 0 && c.enrolled >= best * 0.5) return { label: 'Steady', color: 'gray' }
  if (c.leads > median && c.leads > 0 && c.enrolled / c.leads < 0.3) {
    return { label: 'Watching', color: 'amber' }
  }
  if (median > 0 && c.leads < median * 0.5) return { label: 'Low volume', color: 'gray' }
  return { label: 'Steady', color: 'gray' }
}

export async function getClientDashboardMetrics(
  clientId: string,
  from?: string,
  to?: string
): Promise<ClientDashboardMetrics> {
  const client = (await query<{ name: string }>('SELECT name FROM clients WHERE id = $1', [clientId]))[0]
  if (!client) throw new Error('Client not found')

  // Lead-cohort date filter (leads.created_at) and spend date filter
  // (ad_spend_weekly.week_starting) are kept separate on purpose — spend is a
  // time-based cost, not a property of the lead cohort, same separation
  // ClientDashboard has always used between "leads this month" and "spend
  // this month".
  const leadParams: any[] = [clientId]
  let leadWhere = 'WHERE l.client_id = $1'
  if (from) {
    leadParams.push(from)
    leadWhere += ` AND l.created_at >= $${leadParams.length}`
  }
  if (to) {
    leadParams.push(to)
    leadWhere += ` AND l.created_at <= $${leadParams.length}::date + interval '1 day'`
  }

  const spendParams: any[] = [clientId]
  let spendWhere = 'WHERE c.client_id = $1'
  if (from) {
    spendParams.push(from)
    spendWhere += ` AND s.week_starting >= $${spendParams.length}`
  }
  if (to) {
    spendParams.push(to)
    spendWhere += ` AND s.week_starting <= $${spendParams.length}::date`
  }

  const [{ total_leads }] = await query<{ total_leads: string }>(
    `SELECT COUNT(*)::int AS total_leads FROM leads l ${leadWhere}`,
    leadParams
  )
  const [{ qualified }] = await query<{ qualified: string }>(
    `SELECT COUNT(*)::int AS qualified FROM leads l ${leadWhere} AND l.lead_score >= 3`,
    leadParams
  )
  const [{ visits_booked }] = await query<{ visits_booked: string }>(
    `SELECT COUNT(DISTINCT l.id)::int AS visits_booked
     FROM leads l JOIN events ev ON ev.lead_id = l.id AND ev.event_type = 'session_booked'
     ${leadWhere}`,
    leadParams
  )
  const [{ enrolled, fees_collected }] = await query<{ enrolled: string; fees_collected: string | null }>(
    `SELECT COUNT(DISTINCT en.lead_id)::int AS enrolled, COALESCE(SUM(en.fee_amount), 0) AS fees_collected
     FROM leads l JOIN enrollments en ON en.lead_id = l.id
     ${leadWhere}`,
    leadParams
  )
  const [{ total_spent }] = await query<{ total_spent: string | null }>(
    `SELECT COALESCE(SUM(s.spend_amount), 0) AS total_spent
     FROM ad_spend_weekly s JOIN campaigns c ON c.id = s.campaign_id
     ${spendWhere}`,
    spendParams
  )

  const weeklySpendRows = await query<{ week_starting: string; amount: string }>(
    `SELECT s.week_starting, SUM(s.spend_amount) AS amount
     FROM ad_spend_weekly s JOIN campaigns c ON c.id = s.campaign_id
     ${spendWhere}
     GROUP BY s.week_starting
     ORDER BY s.week_starting DESC
     LIMIT 6`,
    spendParams
  )
  const weeklySpend = weeklySpendRows
    .map((r) => ({ weekStarting: r.week_starting, amount: Number(r.amount) }))
    .reverse()

  const feeRows = await query<{ payment_status: string; count: string; sum: string }>(
    `SELECT en.payment_status, COUNT(*)::int AS count, SUM(en.fee_amount) AS sum
     FROM leads l JOIN enrollments en ON en.lead_id = l.id
     ${leadWhere}
     GROUP BY en.payment_status`,
    leadParams
  )
  const [{ last_received }] = await query<{ last_received: string | null }>(
    `SELECT MAX(en.payment_date) AS last_received
     FROM leads l JOIN enrollments en ON en.lead_id = l.id
     ${leadWhere}`,
    leadParams
  )
  const depositRow = feeRows.find((r) => r.payment_status === 'deposit_paid')
  const fullRow = feeRows.find((r) => r.payment_status === 'full_paid')

  // Leads/visits per campaign — safe to COUNT(DISTINCT ...) across a join
  // fanout, but fee totals below are queried separately since SUM would
  // double-count once the events join fans a lead out across multiple rows.
  const campaignActivityParams: any[] = [clientId]
  let campaignLeadJoin = 'ON l.campaign_id = c.id'
  if (from) {
    campaignActivityParams.push(from)
    campaignLeadJoin += ` AND l.created_at >= $${campaignActivityParams.length}`
  }
  if (to) {
    campaignActivityParams.push(to)
    campaignLeadJoin += ` AND l.created_at <= $${campaignActivityParams.length}::date + interval '1 day'`
  }
  // Date filter lives on the JOIN condition, not WHERE — filtering a
  // LEFT JOIN's matched columns in WHERE turns it into an inner join, which
  // would drop any campaign whose leads all fall outside the range instead
  // of correctly showing it with a 0 count.
  const campaignActivity = await query<{
    id: string
    display_name: string
    platform: string | null
    leads: string
    visits: string
  }>(
    `SELECT c.id, c.display_name, c.platform,
            COUNT(DISTINCT l.id)::int AS leads,
            COUNT(DISTINCT ev.id) FILTER (WHERE ev.event_type = 'session_booked')::int AS visits
     FROM campaigns c
     LEFT JOIN leads l ${campaignLeadJoin}
     LEFT JOIN events ev ON ev.lead_id = l.id
     WHERE c.client_id = $1 AND c.status = 'active'
     GROUP BY c.id, c.display_name, c.platform
     ORDER BY leads DESC`,
    campaignActivityParams
  )

  const campaignFees = await query<{ campaign_id: string; fees: string; enrolled: string }>(
    `SELECT l.campaign_id, COALESCE(SUM(en.fee_amount), 0) AS fees, COUNT(DISTINCT en.lead_id)::int AS enrolled
     FROM leads l JOIN enrollments en ON en.lead_id = l.id
     ${leadWhere} AND l.campaign_id IS NOT NULL
     GROUP BY l.campaign_id`,
    leadParams
  )
  const campaignSpend = await query<{ campaign_id: string; spend: string }>(
    `SELECT s.campaign_id, SUM(s.spend_amount) AS spend
     FROM ad_spend_weekly s JOIN campaigns c ON c.id = s.campaign_id
     ${spendWhere}
     GROUP BY s.campaign_id`,
    spendParams
  )
  const feesByCampaign = new Map(campaignFees.map((r) => [r.campaign_id, r]))
  const spendByCampaign = new Map(campaignSpend.map((r) => [r.campaign_id, Number(r.spend)]))

  const campaignRowsBase: CampaignRow[] = campaignActivity.map((c) => {
    const leads = Number(c.leads)
    const fee = feesByCampaign.get(c.id)
    const enrolled = fee ? Number(fee.enrolled) : 0
    const fees = fee ? Number(fee.fees) : 0
    const spend = spendByCampaign.get(c.id) ?? 0
    return {
      id: c.id,
      displayName: c.display_name,
      platform: c.platform,
      leads,
      visits: Number(c.visits),
      enrolled,
      fees,
      cpl: ratio(spend, leads),
      convPct: leads > 0 ? (enrolled / leads) * 100 : null,
      status: { label: 'Steady', color: 'gray' },
    }
  })
  const campaigns = campaignRowsBase.map((c) => ({ ...c, status: classifyCampaign(c, campaignRowsBase) }))

  const totalLeads = Number(total_leads)
  const qualifiedNum = Number(qualified)
  const visitsBooked = Number(visits_booked)
  const enrolledNum = Number(enrolled)
  const feesCollected = Number(fees_collected)
  const totalSpent = Number(total_spent)

  const funnel = [
    { label: 'Leads', count: totalLeads, pctOfLeads: totalLeads > 0 ? 100 : 0 },
    { label: 'Qualified', count: qualifiedNum, pctOfLeads: totalLeads > 0 ? (qualifiedNum / totalLeads) * 100 : 0 },
    { label: 'Visits', count: visitsBooked, pctOfLeads: totalLeads > 0 ? (visitsBooked / totalLeads) * 100 : 0 },
    { label: 'Enrolled', count: enrolledNum, pctOfLeads: totalLeads > 0 ? (enrolledNum / totalLeads) * 100 : 0 },
  ]

  return {
    clientId,
    clientName: client.name,
    from: from || null,
    to: to || null,
    kpis: {
      totalLeads,
      qualified: qualifiedNum,
      visitsBooked,
      enrolled: enrolledNum,
      feesCollected,
      totalSpent,
    },
    funnel,
    costMetrics: {
      cpl: ratio(totalSpent, totalLeads),
      cpv: ratio(totalSpent, visitsBooked),
      cpa: ratio(totalSpent, enrolledNum),
      avgFeePerStudent: ratio(feesCollected, enrolledNum),
      roas: ratio(feesCollected, totalSpent),
    },
    weeklySpend,
    campaigns,
    fees: {
      totalCollected: feesCollected,
      depositCount: depositRow ? Number(depositRow.count) : 0,
      depositSum: depositRow ? Number(depositRow.sum) : 0,
      fullCount: fullRow ? Number(fullRow.count) : 0,
      fullSum: fullRow ? Number(fullRow.sum) : 0,
      lastReceivedAt: last_received,
    },
  }
}
