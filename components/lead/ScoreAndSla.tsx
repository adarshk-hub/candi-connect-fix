'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Lead } from '@/lib/types'
import { tierFromScore, tierCaption, maxAllowedLabel } from '@/lib/leadScore'
import { useStages } from '@/lib/StagesContext'
import { elapsedLabel } from '@/lib/format'

function ScoreDots({ earned, max }: { earned: number; max: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} className={clsx('h-2 w-2 rounded-full', i < earned ? 'bg-green-500' : 'bg-zinc-700')} />
        ))}
      </div>
      <span className="text-xs text-muted2">
        {earned}/{max}
      </span>
    </div>
  )
}

const TIER_PILL: Record<string, string> = {
  'HOT LEAD': 'bg-green-500/20 text-green-300',
  'WARM LEAD': 'bg-amber-500/20 text-amber-300',
  'COLD LEAD': 'bg-zinc-600/40 text-zinc-300',
}

export default function ScoreAndSla({ lead }: { lead: Lead }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const { stageMaxMinutes } = useStages()
  const tier = tierFromScore(lead.lead_score)
  const maxMinutes = stageMaxMinutes(lead.pipeline_stage, lead.client_id)
  const elapsedMs = now - new Date(lead.stage_updated_at).getTime()
  const overdue = maxMinutes !== null && elapsedMs > maxMinutes * 60000

  return (
    <div className="grid grid-cols-2 gap-6 border-t border-border px-6 py-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Lead Score</p>
        <div className="mb-2 flex items-center gap-3">
          <span className="text-3xl font-bold text-green-400">{lead.lead_score}</span>
          <div>
            <span className={clsx('inline-block rounded-md px-2.5 py-0.5 text-xs font-medium', TIER_PILL[tier])}>
              {tier}
            </span>
            <p className="mt-0.5 text-xs text-muted">{tierCaption(tier)}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted2">Urgency</span>
            <ScoreDots earned={lead.urgency_score} max={3} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted2">Program fit</span>
            <ScoreDots earned={lead.program_fit_score} max={2} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted2">Engagement</span>
            <ScoreDots earned={lead.engagement_score} max={3} />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Pipeline SLA</p>
        <p className="text-sm">
          <span className="text-muted2">Time in current stage: </span>
          <span className={overdue ? 'font-semibold text-red-400' : 'text-amber-400'}>
            {elapsedLabel(lead.stage_updated_at)}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted">max allowed: {maxAllowedLabel(maxMinutes)}</p>
        {overdue && <p className="mt-2 text-xs font-medium text-red-400">⚠ This lead is past SLA for its stage.</p>}
      </div>
    </div>
  )
}
