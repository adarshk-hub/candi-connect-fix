import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { ThemeProvider } from '@/components/ThemeProvider'
import { StagesProvider } from '@/lib/StagesContext'
import { getServerSession } from '@/lib/serverAuth'

export const metadata: Metadata = {
  title: 'Candi Connect',
  description: 'Lead-to-admission CRM for education marketing',
}

// Applies the saved theme class before first paint (falling back to the
// user's OS preference for a first-ever visit), so there's no flash of the
// wrong theme while React hydrates.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('cc-theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = getServerSession()

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <ThemeProvider>
          {session ? (
            <StagesProvider>
              <div className="flex">
                <Sidebar user={session} />
                <main className="min-h-screen flex-1 overflow-x-hidden px-8 py-8">{children}</main>
              </div>
            </StagesProvider>
          ) : (
            <main className="flex min-h-screen items-center justify-center px-4">{children}</main>
          )}
        </ThemeProvider>
      </body>
    </html>
  )
}
