//Re

'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
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
  Radio,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import InstituteSwitcher from './settings/InstituteSwitcher'

interface SidebarUser {
  fullName: string | null
  role: string
  clientId: string | null
}

const ROLE_LABEL: Record<string, string> = {
  agency_admin: 'Admin',
  agency_staff: 'Staff',
  client_admin: 'Client Admin',
  client_staff: 'Staff',
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
      // Every one of these routes does real server-side DB work on load
      // (each is its own query() call needing a pooled connection). Next.js
      // prefetches every visible Link's target by default the instant it
      // renders — since the whole sidebar is visible on every page, that
      // was firing 5-8 simultaneous background page loads (and DB
      // connections) on every single navigation, none of which the person
      // asked for yet. That's a direct cause of connection-pool
      // contention, not just wasted work — turning it off means the
      // sidebar only ever fetches the one page actually being viewed.
      prefetch={false}
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

export default function Sidebar({
  user,
  showLeadStatusTabs = true,
  institutionName = null,
}: {
  user: SidebarUser | null
  showLeadStatusTabs?: boolean
  institutionName?: string | null
}) {
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
        // sticky top-0: without this, the sidebar just scrolls away with
        // the rest of the page once main content (e.g. a long leads list)
        // grows taller than one screen — h-screen alone only fixes its
        // height, not its position. This pins it to the viewport so it
        // stays fully visible regardless of how far the content scrolls.
        'sticky top-0 relative flex h-screen shrink-0 flex-col bg-sidebar px-3 py-6 transition-[width]',
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

      <div className={clsx('mb-6 flex items-center', collapsed ? 'justify-center' : 'px-2')}>
        <Image
          src="/logo.png"
          alt="Candi Connect"
          width={2172}
          height={724}
          className={collapsed ? 'h-auto w-10' : 'h-auto w-40'}
          priority
        />
      </div>

      {user && !collapsed && (
        <div className="mb-6 w-full rounded-card border border-border bg-sidebar-hover px-3 py-2.5">
          <p className="text-sm font-medium text-fg">{user.fullName}</p>
          <p className="text-xs text-muted2">{ROLE_LABEL[user.role] || user.role}</p>
          {(user.role === 'agency_admin' || user.role === 'agency_staff') && (
            <div className="mt-2 border-t border-border pt-2">
              <InstituteSwitcher currentClientId={user.clientId} currentClientName={institutionName || ''} />
            </div>
          )}
        </div>
      )}

      <nav className={clsx('w-full flex-1 space-y-1 overflow-y-auto', collapsed && 'mt-2')}>
        {user?.role !== 'client_counsellor' && (
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/dashboard'} collapsed={collapsed} />
        )}
        <NavItem href="/follow-ups" icon={CalendarClock} label="Follow Up" active={pathname === '/follow-ups'} collapsed={collapsed} />
        <NavItem href="/calendar" icon={CalendarDays} label="Calendar View" active={pathname === '/calendar'} collapsed={collapsed} />

        <div className="pt-2">
          <NavItem href="/leads" icon={Users} label="All Leads" active={leadsActive && !tab} collapsed={collapsed} />
          {leadsActive && !collapsed && showLeadStatusTabs && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
              <NavItem href="/leads?tab=warm" icon={ThermometerSun} label="Warm" active={tab === 'warm'} collapsed={false} />
              <NavItem href="/leads?tab=hot" icon={Flame} label="Hot" active={tab === 'hot'} collapsed={false} />
              <NavItem href="/leads?tab=cold" icon={Snowflake} label="Cold" active={tab === 'cold'} collapsed={false} />
              <NavItem href="/leads?tab=enrolled" icon={CheckCircle2} label="Enrolled" active={tab === 'enrolled'} collapsed={false} />
            </div>
          )}
        </div>

        {user?.role !== 'client_counsellor' && (
          <NavItem href="/broadcasts" icon={Radio} label="Broadcasts" active={pathname === '/broadcasts'} collapsed={collapsed} />
        )}
      </nav>

      <div className={clsx('w-full space-y-1 border-t border-border pt-3', collapsed && 'flex flex-col items-center')}>
        {user?.role !== 'client_counsellor' && user?.role !== 'client_staff' && (
          // Everyone with settings access — agency roles included — lands
          // on Customize (their day-to-day config: Lead Stages,
          // Counsellors, WhatsApp, etc.) by default rather than the raw
          // webhook-keys/Users page. Agency roles can still get to that
          // page via the "← Settings" link inside Customize.
          <NavItem
            href="/settings/customize"
            icon={Settings}
            label="Settings"
            active={pathname === '/settings' || pathname === '/settings/customize'}
            collapsed={collapsed}
          />
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
