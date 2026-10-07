import { Link, Outlet } from 'react-router'
import { ZCASH_NETWORK } from '../config/network.ts'
import { useSettings } from './settingsStore.ts'

export function RootLayout() {
  const demoMode = useSettings((state) => state.demoMode)

  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Zealed
        </Link>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border border-stone-300 px-2 py-0.5 dark:border-stone-700">
            {ZCASH_NETWORK}
          </span>
          {demoMode && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-amber-950">Demo mode</span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12">
        <Outlet />
      </main>
    </div>
  )
}
