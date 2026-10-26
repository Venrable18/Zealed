import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import {
  ChartIcon,
  CloseIcon,
  LockIcon,
  MenuIcon,
  PeopleIcon,
  ReceiveIcon,
  SlidersIcon,
  WalletIcon,
} from '../components/Icons.tsx'
import { ToastViewport } from '../components/Toasts.tsx'
import { ZCASH_NETWORK } from '../config/network.ts'
import { useLanguage, useT, type MessageKey } from '../i18n/index.ts'
import { formatZec } from '../lib/zec.ts'
import { useAutoLock } from '../storage/autoLock.ts'
import { LockScreen } from '../storage/LockScreen.tsx'
import { initVault, lockVault, useVaultStatus } from '../storage/vaultState.ts'
import { WalletProviders } from '../wallet/WalletProviders.tsx'
import { useWalletBoot, useWalletRuntime } from '../wallet/runtime.ts'
import { useBalance } from '../wallet/useBalance.ts'
import { useSharedPotsLoop } from '../features/blindpot/shared/useSharedPotsLoop.ts'
import { FEATURES } from './features.tsx'
import { useSettings } from './settingsStore.ts'

type IconType = ComponentType<SVGProps<SVGSVGElement>>
interface NavItem {
  path: string
  /** Feature names are the product's own names and are the same in every language. */
  name?: string
  key?: MessageKey
  Icon: IconType
}

/** The dashboard, then the three things Zealed does, then what supports them. */
const FEATURE_ITEMS: readonly NavItem[] = [
  { path: '/app', key: 'nav.dashboard', Icon: ChartIcon },
  ...FEATURES.map(({ path, title, Icon }) => ({ path, name: title, Icon })),
]
const ACCOUNT_ITEMS: readonly NavItem[] = [
  { path: '/wallet', key: 'nav.wallet', Icon: WalletIcon },
  { path: '/receive', key: 'nav.receive', Icon: ReceiveIcon },
  { path: '/contacts', key: 'nav.contacts', Icon: PeopleIcon },
  { path: '/settings', key: 'nav.settings', Icon: SlidersIcon },
]

function NavList({ items }: { items: readonly NavItem[] }) {
  const t = useT()
  return (
    <ul className="space-y-0.5">
      {items.map(({ path, name, key, Icon }) => (
        <li key={path}>
          <NavLink
            to={path}
            end={path === '/app'}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-control px-3 text-[0.9375rem] ${
                isActive
                  ? 'bg-seal-soft font-semibold text-ink'
                  : 'text-muted hover:bg-sunken hover:text-ink'
              }`
            }
          >
            <Icon width={20} height={20} className="shrink-0" />
            {key === undefined ? name : t(key)}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

/** The wallet at a glance, at the foot of the sidebar: its balance, or the way to get one. */
function WalletGlance() {
  const t = useT()
  const status = useWalletRuntime((state) => state.status)
  const syncing = useWalletRuntime((state) => state.syncing)
  const vault = useVaultStatus((state) => state.status)
  const balance = useBalance()
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <Link
        to="/wallet"
        className="block rounded-control border border-line bg-surface px-3 py-2.5 hover:border-line-strong"
      >
        {status === 'ready' ? (
          <>
            <span className="block text-sm text-muted">
              {syncing ? t('shell.syncing') : t('wallet.spendable')}
            </span>
            <span className="block text-lg font-semibold tabular-nums" data-testid="glance-balance">
              {balance === undefined ? '…' : `${formatZec(balance.spendableZat)} TAZ`}
            </span>
          </>
        ) : (
          <span className="block text-sm">
            {status === 'opening' ? t('shell.walletOpening') : t('shell.noWallet')}
          </span>
        )}
      </Link>
      {vault === 'unlocked' && (
        <button
          type="button"
          onClick={() => {
            void lockVault()
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-[0.9375rem] text-muted hover:bg-sunken hover:text-ink"
        >
          <LockIcon width={20} height={20} />
          {t('shell.lock')}
        </button>
      )}
    </div>
  )
}

function Brand() {
  const t = useT()
  const demoMode = useSettings((state) => state.demoMode)
  return (
    <div className="flex items-center justify-between gap-3">
      <Link to="/app" className="font-display text-2xl font-semibold tracking-tight">
        Zealed
      </Link>
      <span className="flex gap-1.5 text-xs">
        <span className="rounded-full border border-line-strong px-2 py-0.5">{ZCASH_NETWORK}</span>
        {demoMode && (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">
            {t('shell.demo')}
          </span>
        )}
      </span>
    </div>
  )
}

export function RootLayout() {
  const vaultStatus = useVaultStatus((state) => state.status)
  useAutoLock()
  useWalletBoot()
  useSharedPotsLoop()
  const t = useT()
  const language = useLanguage()
  const { pathname } = useLocation()
  // The phone menu is open for the page it was opened on, so moving to another page closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const menuOpen = menuOpenOn === pathname
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  useEffect(() => {
    void initVault()
  }, [])
  const locked = vaultStatus === 'locked'

  const skip = (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
    >
      {t('shell.skip')}
    </a>
  )

  if (locked || vaultStatus === 'checking') {
    return (
      <div className="min-h-dvh bg-page text-ink">
        {skip}
        <header className="px-5 pt-5 sm:px-8">
          <div className="max-w-md">
            <Brand />
          </div>
        </header>
        <main id="main" className="px-5 pb-24 sm:px-8">
          {locked && <LockScreen />}
        </main>
        <ToastViewport />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-page text-ink lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      {skip}
      <aside className="border-line bg-surface lg:border-r">
        <div className="lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4 lg:border-b-0 lg:pt-6">
            <div className="flex-1">
              <Brand />
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => {
                setMenuOpenOn(menuOpen ? null : pathname)
              }}
            >
              {menuOpen ? (
                <CloseIcon width={20} height={20} />
              ) : (
                <MenuIcon width={20} height={20} />
              )}
              {t('shell.menu')}
            </button>
          </div>
          <div
            id="main-nav"
            className={`${menuOpen ? 'flex' : 'hidden'} flex-1 flex-col gap-4 overflow-y-auto px-3 pb-5 lg:flex`}
          >
            <nav aria-label={t('shell.nav')} className="space-y-4 pt-2">
              <NavList items={FEATURE_ITEMS} />
              <div className="border-t border-line pt-4">
                <NavList items={ACCOUNT_ITEMS} />
              </div>
            </nav>
            <div className="mt-auto px-2">
              <WalletGlance />
            </div>
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-5 pb-24 sm:px-8 lg:px-12">
        <div className="max-w-5xl">
          <WalletProviders>
            <Outlet />
          </WalletProviders>
        </div>
      </main>
      <ToastViewport />
    </div>
  )
}
