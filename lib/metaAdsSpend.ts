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
