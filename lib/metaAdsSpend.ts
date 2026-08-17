const META_API_VERSION = process.env.META_MARKETING_API_VERSION || 'v19.0'

export interface CampaignSpend {
  platformCampaignId: string
  campaignName: string
  spend: number
}

// Pulls per-campaign spend for one ad account over a date range from Meta's
// Marketing API (Insights endpoint, campaign-level breakdown). Requires a
// System User access token with ads_read permission on the ad account —
// confirm the exact token/permission setup in Meta Business Settings once
// ready. Until META_MARKETING_API_ACCESS_TOKEN is set, returns stub data so
// the sync pipeline (matching, upserting, UI) is fully exercisable in dev.
export async function fetchMetaCampaignSpend(params: {
  adAccountId: string
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
}): Promise<CampaignSpend[]> {
  const token = process.env.META_MARKETING_API_ACCESS_TOKEN

  if (!token) {
    console.log(
      `[meta-ads:stub] would fetch campaign spend for act_${params.adAccountId} from ${params.since} to ${params.until}`
    )
    return []
  }

  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/act_${params.adAccountId}/insights`)
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('fields', 'campaign_id,campaign_name,spend')
  url.searchParams.set('time_range', JSON.stringify({ since: params.since, until: params.until }))
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Meta Insights API returned ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()

  return (data.data || []).map((row: any) => ({
    platformCampaignId: row.campaign_id,
    campaignName: row.campaign_name,
    spend: parseFloat(row.spend) || 0,
  }))
}

export interface WeeklyCampaignSpend extends CampaignSpend {
  weekStarting: string // YYYY-MM-DD, Monday
}

// Same Insights endpoint as fetchMetaCampaignSpend, but spans a wider date
// range and asks Meta to bucket results into 7-day increments itself
// (time_increment=7) rather than us looping one API call per week — one
// request returns however many weeks of history exist in the range. Used
// for backfilling historical spend, since fetchMetaCampaignSpend alone only
// ever covers a single week.
export async function fetchMetaCampaignSpendRange(params: {
  adAccountId: string
  since: string // YYYY-MM-DD, should be a Monday
  until: string // YYYY-MM-DD
}): Promise<WeeklyCampaignSpend[]> {
  const token = process.env.META_MARKETING_API_ACCESS_TOKEN
  if (!token) {
    console.log(`[meta-ads:stub] would backfill campaign spend for act_${params.adAccountId} from ${params.since} to ${params.until}`)
    return []
  }

  const results: WeeklyCampaignSpend[] = []
  let url: string | null = (() => {
    const u = new URL(`https://graph.facebook.com/${META_API_VERSION}/act_${params.adAccountId}/insights`)
    u.searchParams.set('level', 'campaign')
    u.searchParams.set('fields', 'campaign_id,campaign_name,spend')
    u.searchParams.set('time_range', JSON.stringify({ since: params.since, until: params.until }))
    u.searchParams.set('time_increment', '7')
    u.searchParams.set('limit', '200')
    u.searchParams.set('access_token', token)
    return u.toString()
  })()

  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) {
      throw new Error(`Meta Insights API returned ${res.status}: ${await res.text()}`)
    }
    const data: any = await res.json()
    for (const row of data.data || []) {
      results.push({
        platformCampaignId: row.campaign_id,
        campaignName: row.campaign_name,
        spend: parseFloat(row.spend) || 0,
        // Meta's time_increment buckets are anchored to `since`, so
        // date_start already lands on the Monday we asked for.
        weekStarting: row.date_start,
      })
    }
    url = data.paging?.next || null
  }

  return results
}
