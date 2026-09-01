'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, Check } from 'lucide-react'

interface ClientOption {
  id: string
  name: string
}

// Lets an agency user jump into any institute's own settings/data without
// logging out and back in. Only ever shown for agency roles (agency_admin /
// agency_staff) — client-scoped roles only ever have the one institute
// they're already in, so there's nothing to switch between.
export default function InstituteSwitcher({
  currentClientId,
  currentClientName,
}: {
  currentClientId: string | null
  currentClientName: string
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ClientOption[]>([])
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setOptions(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadedOnce(true))
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function switchTo(id: string) {
    if (id === currentClientId) {
      setOpen(false)
      return
    }
    setSwitching(id)
    setError('')
    try {
      const res = await fetch('/api/auth/switch-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not switch institution.')
        setSwitching(null)
        return
      }
      // The cc_session cookie now points at a different institute's
      // database — a hard reload is the simplest way to make sure every
      // server component (Sidebar, this page, everything) re-renders
      // against it, rather than trying to patch client-side state around a
      // session change that touches the whole app.
      window.location.reload()
    } catch {
      setError('Could not switch institution. Please try again.')
      setSwitching(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card2 px-2.5 py-1.5 text-xs text-fg hover:border-blue-500"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Building2 size={14} className="shrink-0 text-muted2" />
          <span className="truncate">{currentClientName || 'Select institution'}</span>
        </span>
        <ChevronDown size={12} className="shrink-0 text-muted2" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {!loadedOnce && <p className="px-3 py-4 text-sm text-muted">Loading institutions...</p>}
          {loadedOnce && options.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted">No institutions found.</p>
          )}
          {options.map((c) => (
            <button
              key={c.id}
              onClick={() => switchTo(c.id)}
              disabled={switching !== null}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-card2 disabled:opacity-50"
            >
              <span className="truncate">{c.name}</span>
              {switching === c.id ? (
                <span className="shrink-0 text-xs text-muted">Switching...</span>
              ) : c.id === currentClientId ? (
                <Check size={14} className="shrink-0 text-blue-400" />
              ) : null}
            </button>
          ))}
          {error && <p className="border-t border-border px-3 py-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
