import { useEffect, useState } from 'react'
import { AmountInput } from '../../../components/AmountInput.tsx'
import { Button } from '../../../components/Button.tsx'
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { formatZec } from '../../../lib/zec.ts'
import { summarizeWithdrawal } from './describe.ts'
import { startWithdrawal } from './engine.ts'
import { actShared, useSharedPotPort, useSharedPots } from './store.ts'

const FEE_STEP = 5_000n
/** The smallest amount worth withdrawing, so the output is not dust. */
const MIN_AMOUNT = 10_000n

type Mode = 'all' | 'amount'

/** What a pending withdrawal takes, in words, from the transaction's own outputs. */
function withdrawingText(
  outputs: Parameters<typeof summarizeWithdrawal>[0],
  potAddress: string | undefined,
): string {
  const summary = summarizeWithdrawal(outputs, potAddress)
  return summary.kind === 'all'
    ? `Withdrawing everything: ${formatZec(summary.paidZat)} TAZ.`
    : `Withdrawing ${formatZec(summary.paidZat)} TAZ. ${formatZec(summary.staysZat)} TAZ stays in the pot.`
}

/** The host's withdrawal from a shared pot: ask co-hosts, then the money moves once enough approve. */
export function SharedWithdraw({ sharedId, onSent }: { sharedId: string; onSent: () => void }) {
  const port = useSharedPotPort()
  const push = useToasts((state) => state.push)
  const pot = useSharedPots((state) => state.state.pots.find((p) => p.id === sharedId))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('all')
  const [amount, setAmount] = useState<bigint | null>(null)
  const [inPot, setInPot] = useState<bigint | undefined>()
  const accountId = pot?.accountId
  useEffect(() => {
    if (port === null || accountId === undefined) return
    let cancelled = false
    port.potSpendableZat(accountId).then(
      (value) => {
        if (!cancelled) setInPot(value)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [port, accountId])
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
      if (mode === 'amount') {
        // The host chose this amount, so it is never changed: it either goes out as asked or not at all.
        if (amount !== null) {
          try {
            await actShared(
              port,
              async (s) =>
                (await startWithdrawal(port, s, pot.id, to, amount, Date.now(), { exact: true }))
                  .state,
            )
            started = true
          } catch (error) {
            lastError = error
          }
        }
      } else {
        // Everything: the fee depends on how many pieces are spent, so try a few amounts, each a
        // little lower, until one is accepted.
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
      }
      if (started) push('success', 'Request sent to your co-hosts.')
      else if (mode === 'amount')
        push(
          'error',
          'The request could not be made. The amount plus the network fee may be more than the pot holds. Try a smaller amount, or withdraw everything.',
        )
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

  const canAsk = mode === 'all' || amount !== null
  const maxAmount = inPot === undefined ? undefined : inPot - FEE_STEP * 2n

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
          {withdrawingText(latest.request.outputs, pot.address)}
        </p>
      ) : (
        <>
          {latest?.status === 'declined' && (
            <p className="text-sm font-medium text-bad">
              Your last request was declined by too many co-hosts.
            </p>
          )}
          <fieldset className="space-y-3">
            <legend className="font-medium">What to withdraw</legend>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="radio"
                name="withdraw-mode"
                checked={mode === 'all'}
                onChange={() => {
                  setMode('all')
                }}
                className="mt-1 size-5 accent-seal"
              />
              <span>
                Everything in the pot
                <span className="block text-sm text-muted">
                  {inPot === undefined
                    ? 'Less the network fee.'
                    : `${formatZec(inPot)} TAZ, less the network fee.`}
                </span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="radio"
                name="withdraw-mode"
                checked={mode === 'amount'}
                onChange={() => {
                  setMode('amount')
                }}
                className="mt-1 size-5 accent-seal"
              />
              <span>
                An amount
                <span className="block text-sm text-muted">
                  The rest stays in the pot. The network fee is paid from it as well.
                </span>
              </span>
            </label>
            {mode === 'amount' && (
              <AmountInput
                label="Amount to withdraw (ZEC)"
                minZat={MIN_AMOUNT}
                {...(maxAmount === undefined ? {} : { maxZat: maxAmount })}
                onChange={setAmount}
              />
            )}
          </fieldset>
          <Button
            variant="danger"
            disabled={!canAsk}
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
        {mode === 'all' || amount === null
          ? 'Everything in the pot, less the network fee, goes to your wallet once enough co-hosts approve.'
          : `${formatZec(amount)} TAZ goes to your wallet once enough co-hosts approve. The rest stays in the pot.`}{' '}
        Your co-hosts see which one you chose.
      </ConfirmDialog>
    </section>
  )
}
