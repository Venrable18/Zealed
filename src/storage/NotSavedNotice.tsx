import { Link } from 'react-router'
import { useT } from '../i18n/index.ts'
import { useVaultStatus } from './vaultState.ts'

/** A reminder, shown where data is made, that without a passphrase nothing is saved. */
export function NotSavedNotice() {
  const status = useVaultStatus((state) => state.status)
  const t = useT()
  if (status !== 'none' && status !== 'unavailable') return null
  return (
    <p role="note" className="rounded-control border border-warn bg-warn-soft px-4 py-3 text-sm">
      {t('notSaved.text')}{' '}
      {status === 'none' ? (
        <Link to="/settings#vault" className="font-medium underline underline-offset-4">
          {t('notSaved.choose')}
        </Link>
      ) : (
        t('notSaved.unavailable')
      )}
    </p>
  )
}
