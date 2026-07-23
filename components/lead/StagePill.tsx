'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useStages } from '@/lib/StagesContext'

export default function StagePill({
  stage,
  clientId,
  onChange,
}: {
  stage: string
  clientId: string
  onChange: (next: string, comment?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { stagesFor, stageLabel, stageColor } = useStages()
  const stages = stagesFor(clientId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-zinc-900"
        style={{ backgroundColor: stageColor(stage, clientId) }}
      >
        {stageLabel(stage, clientId)}
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-card border border-border bg-card2 p-1 shadow-xl">
            {stages.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setOpen(false)
                  if (s.key !== stage) onChange(s.key)
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-card"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
