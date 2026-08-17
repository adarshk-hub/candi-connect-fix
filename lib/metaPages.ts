const GRAPH_API_URL = 'https://graph.facebook.com/v19.0'

export interface MetaPageOption {
  id: string
  name: string
}

// Lists every Facebook Page the connected token can currently see — same
// idea as fetchAccessibleMetaAdAccounts, just for Pages instead of ad
// accounts. Powers the Page picker in Settings so nobody has to go hunting
// for a numeric Page ID by hand (or leave the "demo-page-apex" placeholder
// in place, which silently breaks both live webhook routing and the Lead
// Ads historical backfill).
export async function fetchAccessibleMetaPages(): Promise<MetaPageOption[]> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    throw new Error('META_PAGE_ACCESS_TOKEN is not set on the server.')
  }

  const results: MetaPageOption[] = []
  let url: string | null = `${GRAPH_API_URL}/me/accounts?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`

  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || `Meta Graph API returned ${res.status}`)
    }
    const json: any = await res.json()
    for (const row of json.data || []) {
      results.push({ id: row.id, name: row.name || `Page ${row.id}` })
    }
    url = json.paging?.next || null
  }

  return results
}
