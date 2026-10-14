import { Link, NavLink, Outlet } from 'react-router'
import { ToastViewport } from '../components/Toasts.tsx'
import { ZCASH_NETWORK } from '../config/network.ts'
import { FEATURES } from './features.tsx'
import { useSettings } from './settingsStore.ts'

const NAV_ITEMS = [
  ...FEATURES.map(({ path, title }) => ({ path, label: title })),
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/settings', label: 'Settings' },
]

export function RootLayout() {
  const demoMode = useSettings((state) => state.demoMode)

  return (
    <div className="min-h-dvh bg-page text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="mx-auto max-w-3xl px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight">
            Zealed
          </Link>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-line-strong px-2 py-0.5">
              {ZCASH_NETWORK}
            </span>
            {demoMode && (
              <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">
                Demo mode
              </span>
            )}
          </div>
        </div>
        <nav aria-label="Main" className="mt-3 border-b border-line pb-3">
          <ul className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
            {NAV_ITEMS.map(({ path, label }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center rounded-control px-3 ${isActive ? 'bg-seal-soft font-semibold text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-24">
        <Outlet />
      </main>
      <ToastViewport />
    </div>
  )
}
