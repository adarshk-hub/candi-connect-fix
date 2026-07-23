import { CampaignSpend } from './metaAdsSpend'

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v17'

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google OAuth token refresh failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token
}

// Pulls per-campaign spend for one customer account over a date range from
// the Google Ads API (GAQL search against the `campaign` resource). Needs a
// developer token approved for at least Basic Access, plus OAuth
// credentials for a user with access to the agency's manager (MCC) account —
// confirm exact scopes/setup in Google Ads API Center once ready. Until
// GOOGLE_ADS_* env vars are set, returns stub data so the sync pipeline is
// fully exercisable in dev.
export async function fetchGoogleCampaignSpend(params: {
  customerId: string // digits only, no dashes
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
}): Promise<CampaignSpend[]> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  const accessToken = await getAccessToken()

  if (!developerToken || !accessToken) {
    console.log(
      `[google-ads:stub] would fetch campaign spend for customer ${params.customerId} from ${params.since} to ${params.until}`
    )
    return []
  }

  const query = `
    SELECT campaign.id, campaign.name, metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '${params.since}' AND '${params.until}'
  `.trim()

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${params.customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
    }
  )
  if (!res.ok) {
    throw new Error(`Google Ads API returned ${res.status}: ${await res.text()}`)
  }
  const batches = await res.json()

  const results: CampaignSpend[] = []
  for (const batch of Array.isArray(batches) ? batches : [batches]) {
    for (const row of batch.results || []) {
      results.push({
        platformCampaignId: String(row.campaign.id),
        campaignName: row.campaign.name,
        spend: (row.metrics.costMicros || 0) / 1_000_000,
      })
    }
  }
  return results
}
