'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  CalendarDays,
  Settings,
  LogOut,
  Flame,
  Snowflake,
  ThermometerSun,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'

interface SidebarUser {
  fullName: string | null
  role: string
}

const ROLE_LABEL: Record<string, string> = {
  agency_admin: 'Admin',
  agency_staff: 'Staff',
  client_admin: 'Client Admin',
  client_counsellor: 'Counsellor',
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string
  icon: any
  label: string
  active: boolean
  collapsed: boolean
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={clsx(
        'flex items-center gap-3 rounded-md border-l-2 py-2 text-sm transition-colors',
        collapsed ? 'justify-center border-l-0 px-0' : 'px-3',
        active
          ? 'border-blue-500 bg-sidebar-active font-medium text-fg'
          : 'border-transparent text-muted2 hover:bg-sidebar-hover hover:text-fg'
      )}
    >
      <Icon size={18} />
      {!collapsed && label}
    </Link>
  )
}

export default function Sidebar({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('cc-sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('cc-sidebar-collapsed', String(next))
      return next
    })
  }

  async function logout() {
    await fetch('/api/auth/login', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  const leadsActive = pathname.startsWith('/leads')

  return (
    <aside
      className={clsx(
        'relative flex h-screen shrink-0 flex-col bg-sidebar px-3 py-6 transition-[width]',
        collapsed ? 'w-16 items-center px-2' : 'w-64'
      )}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-sidebar-hover text-muted2 hover:text-fg"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={clsx('mb-6 flex items-center gap-2', collapsed ? 'justify-center' : 'px-2')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-sm font-bold text-white">
          C
        </div>
        {!collapsed && <span className="whitespace-nowrap text-lg font-bold text-fg">Candi Connect</span>}
      </div>

      {user && !collapsed && (
        <div className="mb-6 w-full rounded-card border border-border bg-sidebar-hover px-3 py-2.5">
          <p className="text-sm font-medium text-fg">{user.fullName}</p>
          <p className="text-xs text-muted2">{ROLE_LABEL[user.role] || user.role}</p>
        </div>
      )}

      <nav className={clsx('w-full flex-1 space-y-1', collapsed && 'mt-2')}>
        {user?.role !== 'client_counsellor' && (
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/dashboard'} collapsed={collapsed} />
        )}
        <NavItem href="/follow-ups" icon={CalendarClock} label="Follow Up" active={pathname === '/follow-ups'} collapsed={collapsed} />
        <NavItem href="/calendar" icon={CalendarDays} label="Calendar View" active={pathname === '/calendar'} collapsed={collapsed} />

        <div className="pt-2">
          <NavItem href="/leads" icon={Users} label="All Leads" active={leadsActive && !tab} collapsed={collapsed} />
          {leadsActive && !collapsed && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
              <NavItem href="/leads?tab=warm" icon={ThermometerSun} label="Warm" active={tab === 'warm'} collapsed={false} />
              <NavItem href="/leads?tab=hot" icon={Flame} label="Hot" active={tab === 'hot'} collapsed={false} />
              <NavItem href="/leads?tab=cold" icon={Snowflake} label="Cold" active={tab === 'cold'} collapsed={false} />
              <NavItem href="/leads?tab=enrolled" icon={CheckCircle2} label="Enrolled" active={tab === 'enrolled'} collapsed={false} />
            </div>
          )}
        </div>
      </nav>

      <div className={clsx('w-full space-y-1 border-t border-border pt-3', collapsed && 'flex flex-col items-center')}>
        {user?.role !== 'client_counsellor' && (
          <NavItem href="/settings" icon={Settings} label="Settings" active={pathname === '/settings'} collapsed={collapsed} />
        )}
        <ThemeToggle collapsed={collapsed} />
        <button
          onClick={logout}
          title={collapsed ? 'Log out' : undefined}
          className={clsx(
            'flex items-center gap-3 rounded-md py-2 text-left text-sm text-muted2 hover:bg-sidebar-hover hover:text-fg',
            collapsed ? 'w-auto justify-center px-0' : 'w-full px-3'
          )}
        >
          <LogOut size={18} />
          {!collapsed && 'Log out'}
        </button>
      </div>
    </aside>
  )
}
