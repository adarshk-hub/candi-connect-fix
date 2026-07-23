'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'

export default function LogoPanel({ clientId }: { clientId: string }) {
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clients/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setLogoDataUrl(data?.logo_data_url || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [clientId])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      setError('Logo image is too large (max 500KB). Please use a smaller file.')
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => setLogoDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function save() {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoDataUrl }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
        return
      }
      setStatus('Logo saved.')
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <h2 className="mb-1 text-lg font-bold text-fg">Institute Logo</h2>
      <p className="mb-4 text-sm text-muted2">Shown on branded pages for this institute. Max 500KB.</p>

      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-card border border-border bg-card2">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="Institute logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">No logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
          >
            <Upload size={14} /> Upload image
          </button>
          {logoDataUrl && (
            <button
              onClick={() => setLogoDataUrl(null)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-red-400"
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {status && <p className="mb-3 text-sm text-green-400">{status}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Logo'}
      </button>
    </div>
  )
}
