import { Link } from 'react-router'
import { useVaultStatus } from './vaultState.ts'

/** A reminder, shown where data is made, that without a passphrase nothing is saved. */
export function NotSavedNotice() {
  const status = useVaultStatus((state) => state.status)
  if (status !== 'none' && status !== 'unavailable') return null
  return (
    <p role="note" className="rounded-control border border-warn bg-warn-soft px-4 py-3 text-sm">
      Nothing is saved on this device yet, so reloading clears everything.{' '}
      {status === 'none' ? (
        <Link to="/settings#vault" className="font-medium underline underline-offset-4">
          Choose a passphrase to keep your data, encrypted.
        </Link>
      ) : (
        'This browser cannot store data securely here.'
      )}
    </p>
  )
}
