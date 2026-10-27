import { useEffect, useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { CountdownTimer } from '../../components/CountdownTimer.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { formatZec } from '../../lib/zec.ts'
import { describeInterval } from './batching.ts'
import { buildHostView } from './hostView.ts'
import { closePot } from './service.ts'
import { SharedWithdraw } from './shared/SharedWithdraw.tsx'
import { STRENGTH_TEXT } from './strength.ts'
import type { HostView, Pot } from './types.ts'
import type { PotWalletPort } from './walletPort.ts'

interface HostViewPanelProps {
  pot: Pot
  wallet: PotWalletPort
  onClosed: () => void
}

/** The only place the host sees pot activity. It shows a total, a strength and wishes, no list of payments. */
export function HostViewPanel({ pot, wallet, onClosed }: HostViewPanelProps) {
  const push = useToasts((state) => state.push)
  const [now, setNow] = useState(() => Date.now())
  const [view, setView] = useState<HostView | undefined>()
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    let cancelled = false
    buildHostView(wallet, pot, now).then(
      (next) => {
        if (!cancelled) {
          setView(next)
          setFailed(false)
        }
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [wallet, pot, now])

  async function handleClose() {
    setClosing(true)
    const result = await closePot(wallet, pot)
    setClosing(false)
    setConfirming(false)
    if (result.ok) {
      push('success', 'Pot closed. Everything was sent to your main account.')
      onClosed()
    } else {
      push('error', 'The pot could not be closed. Nothing was moved. Try again.')
    }
  }

  if (failed && view === undefined) {
    return (
      <p role="alert" className="rounded-control border border-bad bg-bad-soft px-4 py-3">
        The pot total could not be loaded. Try again in a moment.
      </p>
    )
  }
  if (view === undefined) return <p role="status">Loading the total…</p>

  const strength = STRENGTH_TEXT[view.strength]

  return (
    <div className="space-y-8">
      <section className="space-y-2 rounded-card border border-line bg-surface p-5">
        <h2 className="text-lg text-muted">Total so far</h2>
        <p className="font-display text-4xl font-semibold">
          {formatZec(view.totalZat)} <span className="text-xl font-medium text-muted">ZEC</span>
        </p>
        {!pot.closed && (
          <div className="text-sm text-muted">
            Next update in{' '}
            <CountdownTimer
              targetMs={view.nextUpdateMs}
              onDone={() => {
                setNow(Date.now())
              }}
            />
            <p>
              The total refreshes every {describeInterval(pot.batchIntervalMs)} so single gifts
              cannot be picked out.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-1">
        <h2 className="text-xl">Privacy strength</h2>
        <p>
          <span className="font-semibold">{strength.label}</span>. {strength.detail}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">Wishes</h2>
        {view.wishes.length === 0 ? (
          <EmptyState title="No wishes yet">
            Wishes from guests appear here, anonymously and in random order.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {view.wishes.map((wish, index) => (
              <li
                key={`${String(index)}-${wish}`}
                className="rounded-card border border-line bg-surface p-4"
              >
                {wish}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!pot.closed && pot.sharedId !== undefined && (
        <SharedWithdraw sharedId={pot.sharedId} onSent={onClosed} />
      )}
      {!pot.closed && pot.sharedId === undefined && (
        <section className="space-y-3">
          <h2 className="text-xl">Close the pot</h2>
          <p className="text-muted">
            Sends everything in the pot to your main account. Guests can no longer give once it is
            closed.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(true)
            }}
          >
            Close pot and withdraw
          </Button>
          <ConfirmDialog
            open={confirming}
            title="Close this pot?"
            confirmLabel={closing ? 'Closing…' : 'Close and withdraw'}
            danger
            onCancel={() => {
              if (!closing) setConfirming(false)
            }}
            onConfirm={() => {
              void handleClose()
            }}
          >
            Everything in the pot moves to your main account. This cannot be undone.
          </ConfirmDialog>
        </section>
      )}
    </div>
  )
}
