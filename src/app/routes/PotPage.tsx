import { Link, useParams } from 'react-router'
import { EmptyState } from '../../components/EmptyState.tsx'
import { HostViewPanel } from '../../features/blindpot/HostViewPanel.tsx'
import { usePots } from '../../features/blindpot/potStore.ts'
import { SharePot } from '../../features/blindpot/SharePot.tsx'
import { usePotWallet } from '../../features/blindpot/walletPort.ts'

export function PotPage() {
  const { id } = useParams()
  const pot = usePots((state) => state.pots.find((candidate) => candidate.id === id))
  const markClosed = usePots((state) => state.markClosed)
  const wallet = usePotWallet()

  if (pot === undefined) {
    return (
      <div className="py-10">
        <EmptyState
          title="Pot not found"
          action={
            <Link to="/blind-pot" className="underline underline-offset-4">
              Back to Blind Pot
            </Link>
          }
        >
          Pots are kept in memory for now, so a pot disappears when the page is reloaded.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="space-y-10 py-10">
      <div>
        <p className="text-sm">
          <Link to="/blind-pot" className="underline underline-offset-4">
            All pots
          </Link>
        </p>
        <h1 className="mt-2 text-3xl">
          {pot.cover} {pot.name}
        </h1>
        <p className="mt-1 text-muted">
          Event {pot.eventDate}. Gifts until {pot.endDate}.{pot.closed && ' This pot is closed.'}
        </p>
      </div>

      {wallet === null ? (
        <p role="status" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          The wallet is not available, so the total cannot be shown.
        </p>
      ) : (
        <HostViewPanel
          pot={pot}
          wallet={wallet}
          onClosed={() => {
            markClosed(pot.id)
          }}
        />
      )}
      {!pot.closed && <SharePot pot={pot} />}
    </div>
  )
}
