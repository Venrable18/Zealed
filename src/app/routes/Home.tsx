import { Link } from 'react-router'
import { useT } from '../../i18n/index.ts'
import { FEATURES } from '../features.tsx'

export function Home() {
  const t = useT()
  return (
    <div className="py-10 sm:py-14">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Zealed</h1>
      <p className="mt-3 max-w-prose text-lg text-muted">{t('home.intro')}</p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ path, title, taglineKey, Icon }) => (
          <li key={path}>
            <Link
              to={path}
              className="group flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 transition-colors hover:border-seal"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-seal-soft text-seal">
                <Icon />
              </span>
              <h2 className="text-xl group-hover:underline group-hover:underline-offset-4">
                {title}
              </h2>
              <p className="text-sm text-muted">{t(taglineKey)}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted">
        {t('home.testnet')}{' '}
        <Link to="/dashboard" className="underline underline-offset-4">
          {t('home.dashboard')}
        </Link>
      </p>
    </div>
  )
}
