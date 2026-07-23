import { clsx } from 'clsx'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-card border border-border bg-card p-6', className)}>{children}</div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted">{children}</h2>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted2">{label}</span>
      <span className="text-right text-sm text-fg">{children}</span>
    </div>
  )
}

export function Divider() {
  return <div className="my-4 h-px w-full bg-border" />
}

export function Pill({
  children,
  color = 'blue',
}: {
  children: React.ReactNode
  color?: 'blue' | 'green' | 'amber' | 'gray'
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/20 text-blue-300',
    green: 'bg-green-500/20 text-green-300',
    amber: 'bg-amber-500/20 text-amber-300',
    gray: 'bg-transparent text-muted2 border border-border',
  }
  return (
    <span className={clsx('inline-block rounded-md px-3 py-1 text-xs font-medium', colors[color])}>
      {children}
    </span>
  )
}
