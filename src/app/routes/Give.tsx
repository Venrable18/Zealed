import { Link, useLocation } from 'react-router'
import { EmptyState } from '../../components/EmptyState.tsx'
import { getTimers } from '../../config/demo.ts'
import { useContributorWallet } from '../../features/blindpot/contributorWallet.ts'
import { GiftFlow } from '../../features/blindpot/GiftFlow.tsx'
import { readShareFromHash } from '../../features/blindpot/shareLink.ts'
import { useSettings } from '../settingsStore.ts'

/** The page a pot link opens. Everything it needs is in the URL fragment. */
export function Give() {
  const { hash } = useLocation()
  const wallet = useContributorWallet()
  const demoMode = useSettings((state) => state.demoMode)
  const pot = readShareFromHash(hash)
  const { potPieceDelayMs } = getTimers(demoMode)

  if (pot === null) {
    return (
      <div className="py-10">
        <EmptyState
          title="This link does not look right"
          action={
            <Link to="/" className="underline underline-offset-4">
              Back to home
            </Link>
          }
        >
          Ask the host to send the pot link again, and make sure the whole link was copied.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="space-y-8 py-10">
      <div>
        <h1 className="text-3xl">
          {pot.cover} {pot.name}
        </h1>
        <p className="mt-2 text-muted">
          A gift pot. Event {pot.eventDate}. Gifts until {pot.endDate}.
        </p>
        <p className="mt-2 text-sm text-muted">
          The host sees only a total and anonymous wishes, never who gave or how much.
        </p>
      </div>
      <GiftFlow pot={pot} wallet={wallet} delays={potPieceDelayMs} />
    </div>
  )
}
