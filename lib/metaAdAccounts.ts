const META_API_VERSION = process.env.META_MARKETING_API_ACCESS_TOKEN
  ? process.env.META_MARKETING_API_VERSION || 'v19.0'
  : 'v19.0'

export interface MetaAdAccountOption {
  id: string // digits only, no "act_" prefix — matches clients.meta_ad_account_id's format
  name: string
  accountStatus: number | null
}

// Lists every ad account the connected System User token can currently see
// — i.e. every ad account it's been added to as a partner/admin across
// however many separate Business Managers, regardless of which one. This is
// what powers the "pick your ad account" dropdown in Settings, so nobody
// has to go hunting for a numeric account ID in Ads Manager's URL bar.
export async function fetchAccessibleMetaAdAccounts(): Promise<MetaAdAccountOption[]> {
  const token = process.env.META_MARKETING_API_ACCESS_TOKEN
  if (!token) {
    throw new Error('META_MARKETING_API_ACCESS_TOKEN is not set on the server.')
  }

  const results: MetaAdAccountOption[] = []
  let url: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=account_id,name,account_status&limit=200&access_token=${encodeURIComponent(token)}`

  // Paginates through every page Graph API returns — an agency token added
  // as a partner across many small school ad accounts can easily have more
  // than one page's worth (Graph's default page size is well under 200).
  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || `Meta Graph API returned ${res.status}`)
    }
    const json: any = await res.json()
    for (const row of json.data || []) {
      results.push({ id: row.account_id, name: row.name || `Ad account ${row.account_id}`, accountStatus: row.account_status ?? null })
    }
    url = json.paging?.next || null
  }

  return results
}
