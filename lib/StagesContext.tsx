'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface StageRow {
  id: string
  client_id: string
  key: string
  label: string
  color: string
  status_group: 'warm' | 'hot' | 'cold' | 'won'
  max_minutes: number | null
  is_cold_lane: boolean
  is_active: boolean
  sort_order: number
}

interface StagesContextValue {
  loading: boolean
  // Ordered, active stages for one institute (defaults to the "primary"
  // client — the first one seen — when no clientId is given, which is what
  // single-institute users always want and is a reasonable default for the
  // agency's aggregate views too).
  stagesFor: (clientId?: string | null) => StageRow[]
  stageLabel: (key: string, clientId?: string | null) => string
  stageColor: (key: string, clientId?: string | null) => string
  stageMaxMinutes: (key: string, clientId?: string | null) => number | null
  primaryClientId: string | null
  refresh: () => void
}

const StagesContext = createContext<StagesContextValue>({
  loading: true,
  stagesFor: () => [],
  stageLabel: (key) => key,
  stageColor: () => '#9ca3af',
  stageMaxMinutes: () => null,
  primaryClientId: null,
  refresh: () => {},
})

export function useStages() {
  return useContext(StagesContext)
}

export function StagesProvider({ children }: { children: React.ReactNode }) {
  const [byClient, setByClient] = useState<Record<string, StageRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/pipeline-stages')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: StageRow[]) => {
        const grouped: Record<string, StageRow[]> = {}
        for (const row of rows) {
          if (!grouped[row.client_id]) grouped[row.client_id] = []
          grouped[row.client_id].push(row)
        }
        for (const clientId of Object.keys(grouped)) {
          grouped[clientId].sort((a, b) => a.sort_order - b.sort_order)
        }
        setByClient(grouped)
        setPrimaryClientId(Object.keys(grouped)[0] || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const value = useMemo<StagesContextValue>(() => {
    function resolveList(clientId?: string | null): StageRow[] {
      const id = clientId || primaryClientId
      if (!id) return []
      return (byClient[id] || []).filter((s) => s.is_active)
    }
    function find(key: string, clientId?: string | null): StageRow | undefined {
      const id = clientId || primaryClientId
      if (!id) return undefined
      return (byClient[id] || []).find((s) => s.key === key)
    }
    return {
      loading,
      stagesFor: resolveList,
      stageLabel: (key, clientId) => find(key, clientId)?.label ?? key,
      stageColor: (key, clientId) => find(key, clientId)?.color ?? '#9ca3af',
      stageMaxMinutes: (key, clientId) => find(key, clientId)?.max_minutes ?? null,
      primaryClientId,
      refresh: load,
    }
  }, [byClient, loading, primaryClientId, load])

  return <StagesContext.Provider value={value}>{children}</StagesContext.Provider>
}
