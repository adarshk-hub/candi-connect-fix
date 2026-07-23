'use client'

import { useEffect, useState } from 'react'

// Persists per-user column-width preferences for a resizable list-view table
// (keyed by table name so different pages don't clash). Kanban columns are
// intentionally NOT resizable and don't use this hook — only flat/grouped
// list tables let a counsellor adjust widths.
export function useColumnWidths(storageKey: string, defaults: Record<string, number>) {
  const key = `cc-colwidths-${storageKey}`
  const [widths, setWidths] = useState<Record<string, number>>(defaults)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) setWidths({ ...defaults, ...JSON.parse(stored) })
    } catch {
      // ignore malformed/unavailable storage — falls back to defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function setWidth(columnKey: string, width: number) {
    setWidths((prev) => {
      const next = { ...prev, [columnKey]: width }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return { widths, setWidth }
}
