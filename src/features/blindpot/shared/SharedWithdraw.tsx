import { useEffect, useState } from 'react'
import { Button } from '../../../components/Button.tsx'
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { formatZec } from '../../../lib/zec.ts'
import { startWithdrawal } from './engine.ts'
import { actShared, useSharedPotPort, useSharedPots } from './store.ts'

const FEE_STEP = 5_000n

/** The host's withdrawal from a shared pot: ask co-hosts, then the money moves once enough approve. */
export function SharedWithdraw({ sharedId, onSent }: { sharedId: string; onSent: () => void }) {
  const port = useSharedPotPort()
  const push = useToasts((state) => state.push)
  const pot = useSharedPots((state) => state.state.pots.find((p) => p.id === sharedId))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const latest = pot?.withdrawals.at(-1)
  const sent = latest?.status === 'sent'
  useEffect(() => {
    if (sent) onSent()
  }, [sent, onSent])
  if (pot === undefined || latest?.status === 'sent') return null
  const waiting = latest !== undefined && ['pending', 'approved', 'signing'].includes(latest.status)
  const approvals = latest === undefined ? 0 : Object.keys(latest.commitments).length

  async function ask() {
    if (port === null || pot?.accountId === undefined) return
    setBusy(true)
    try {
      const spendable = await port.potSpendableZat(pot.accountId)
      const to = await port.ownAddress()
      let started = false
      let lastError: unknown
      // The fee depends on how many pieces are spent; try a few amounts, each a little lower.
      for (let actions = 2n; actions <= 12n && !started; actions++) {
        const zat = spendable - FEE_STEP * actions
        if (zat <= 0n) break
        try {
          await actShared(
            port,
            async (s) => (await startWithdrawal(port, s, pot.id, to, zat, Date.now())).state,
          )
          started = true
        } catch (error) {
          // Try a lower amount.
          lastError = error
        }
      }
      if (started) push('success', 'Request sent to your co-hosts.')
      else {
        const detail = lastError instanceof Error ? ` (${lastError.message})` : ''
        push(
          'error',
          `There is nothing to withdraw yet, or the request could not be made.${detail}`,
        )
      }
    } catch {
      push('error', 'The request could not be made. Try again.')
    }
    setBusy(false)
    setConfirming(false)
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl">Withdraw, with your co-hosts</h2>
      <p className="text-muted">
        Any {pot.threshold} of the {pot.members.length} co-hosts, you included, must approve before
        anything moves. Each co-host’s wallet shows them exactly where the money goes.
      </p>
      {waiting ? (
        <p role="status" className="rounded-control border border-line bg-sunken px-4 py-3">
          {latest.status === 'signing'
            ? 'Enough co-hosts approved. Collecting their signatures…'
            : `${String(approvals)} of ${String(pot.threshold)} approvals so far. Waiting for your co-hosts.`}{' '}
          Withdrawing{' '}
          {formatZec(
            BigInt(latest.request.outputs.find((o) => o.address !== pot.address)?.zat ?? '0'),
          )}{' '}
          TAZ.
        </p>
      ) : (
        <>
          {latest?.status === 'declined' && (
            <p className="text-sm font-medium text-bad">
              Your last request was declined by too many co-hosts.
            </p>
          )}
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(true)
            }}
          >
            Ask co-hosts to approve a withdrawal
          </Button>
        </>
      )}
      <ConfirmDialog
        open={confirming}
        title="Ask your co-hosts?"
        confirmLabel={busy ? 'Sending…' : 'Send the request'}
        onCancel={() => {
          if (!busy) setConfirming(false)
        }}
        onConfirm={() => {
          void ask()
        }}
      >
        Everything in the pot, less the network fee, goes to your wallet once enough co-hosts
        approve.
      </ConfirmDialog>
    </section>
  )
}
