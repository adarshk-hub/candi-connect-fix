'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { formatLakh } from '@/lib/format'

interface ClientDashboardMetrics {
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
  costMetrics: {
    cpl: number | null
    cpv: number | null
    cpa: number | null
    avgFeePerStudent: number | null
    roas: number | null
  }
  campaigns: {
    displayName: string
    platform: string | null
    leads: number
    visits: number
    enrolled: number
    fees: number
    spend: number
    cpl: number | null
    convPct: number | null
  }[]
}

function money(v: number | null): string {
  return v !== null ? formatLakh(v) : '—'
}

export default function GenerateReportButton({
  clientId,
  from,
  to,
}: {
  clientId: string
  from?: string
  to?: string
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const params = new URLSearchParams({ clientId })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/reports/client-summary?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to load report data')
        return
      }
      const metrics: ClientDashboardMetrics = await res.json()

      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const doc = new jsPDF()

      doc.setFontSize(16)
      doc.text(`${metrics.clientName} — Performance Report`, 14, 18)
      doc.setFontSize(10)
      doc.setTextColor(120)
      doc.text(`Range: ${metrics.from || 'all time'} to ${metrics.to || 'now'}`, 14, 25)

      doc.setTextColor(0)
      doc.setFontSize(11)
      const kpiLines = [
        `Total leads: ${metrics.kpis.totalLeads}`,
        `Qualified: ${metrics.kpis.qualified}`,
        `Visits booked: ${metrics.kpis.visitsBooked}`,
        `Enrolled: ${metrics.kpis.enrolled}`,
        `Fees collected: ${money(metrics.kpis.feesCollected)}`,
        `Total spent: ${money(metrics.kpis.totalSpent)}`,
        `CPL: ${money(metrics.costMetrics.cpl)}   CPV: ${money(metrics.costMetrics.cpv)}   CPA: ${money(metrics.costMetrics.cpa)}`,
        `Admission ROAS: ${metrics.costMetrics.roas !== null ? `${metrics.costMetrics.roas.toFixed(1)}x` : '—'}`,
      ]
      doc.text(kpiLines, 14, 35)

      autoTable(doc, {
        startY: 35 + kpiLines.length * 5 + 6,
        head: [['Campaign', 'Source', 'Leads', 'Visits', 'Enrolled', 'Spend', 'Fees', 'CPL', 'Conv %']],
        body: metrics.campaigns.map((c) => [
          c.displayName,
          c.platform === 'google' ? 'Google' : 'Meta',
          c.leads,
          c.visits,
          c.enrolled,
          money(c.spend),
          money(c.fees),
          money(c.cpl),
          c.convPct !== null ? `${c.convPct.toFixed(1)}%` : '—',
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      })

      doc.save(`${metrics.clientName.replace(/\s+/g, '-').toLowerCase()}-report.pdf`)
    } catch (err: any) {
      setError(err?.message || 'Failed to generate PDF')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={generating}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        <Download size={16} /> {generating ? 'Generating…' : 'Generate PDF'}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
