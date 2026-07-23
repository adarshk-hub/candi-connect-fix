'use client'

import { clsx } from 'clsx'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Light mode' : 'Dark mode'

  return (
    <button
      onClick={toggle}
      title={collapsed ? label : undefined}
      className={clsx(
        'flex items-center gap-3 rounded-md py-2 text-left text-sm text-muted2 hover:bg-sidebar-hover hover:text-fg',
        collapsed ? 'w-auto justify-center px-0' : 'w-full px-3'
      )}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      {!collapsed && label}
    </button>
  )
}
