import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
import { useEffect, useRef, useState } from 'react'
import { AmountInput } from '../../components/AmountInput.tsx'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { TextArea } from '../../components/Field.tsx'
import { WISH_MAX_CHARS } from '../../config/constants.ts'
import { formatZec } from '../../lib/zec.ts'
import type { ContributorWalletPort } from './contributorWallet.ts'
import { memoryContributionStore, type ContributionStore } from './contributionStore.ts'
import { todayString } from './pot.ts'
import {
  beginSend,
  completeSend,
  createContribution,
  progress,
  receipt,
  recoverInterrupted,
  resolveUnconfirmed,
  resume,
  type Contribution,
  type DelayRange,
} from './queue.ts'
import type { SharedPot } from './shareLink.ts'
import { maxGiftZat, splitContribution } from './splitter.ts'
import { WISH_ERROR_MESSAGES, encodeWishMemo } from './wishMemo.ts'

interface GiftFlowProps {
  pot: SharedPot
  /** `null` until the wallet exists. */
  wallet: ContributorWalletPort | null
  /** Random extra wait between pieces. */
  delays: DelayRange
  store?: ContributionStore
  /** How often the queue is checked. */
  tickMs?: number
}

const MIN_GIFT_ZAT = 100_000n

function currentTime(): number {
  return Date.now()
}

export function GiftFlow({
  pot,
  wallet,
  delays,
  store = memoryContributionStore,
  tickMs = 1000,
}: GiftFlowProps) {
  const [amount, setAmount] = useState<bigint | null>(null)
  const [wish, setWish] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<string | undefined>()
  const [contribution, setContribution] = useState<Contribution | undefined>()
  const latest = useRef<Contribution | undefined>(undefined)
  const stepping = useRef(false)
  const [today] = useState(() => todayString(currentTime()))

  // Pick up a gift that was already started for this pot.
  useEffect(() => {
    let cancelled = false
    void store.load(pot.id).then((existing) => {
      if (!cancelled && existing !== undefined) {
        // A piece that was mid-send when the page closed may or may not have gone out.
        const recovered = recoverInterrupted(existing)
        latest.current = recovered
        setContribution(recovered)
        if (recovered !== existing) void store.save(recovered)
      }
    })
    return () => {
      cancelled = true
    }
  }, [store, pot.id])

  const state = contribution === undefined ? undefined : progress(contribution).state

  // Send the next piece whenever one is due.
  useEffect(() => {
    if (wallet === null || state !== 'running') return
    const timer = window.setInterval(() => {
      const current = latest.current
      if (current === undefined || stepping.current) return
      const begun = beginSend(current, currentTime())
      if (begun === null) return
      stepping.current = true
      // Save "sending" first, so a page that closes mid-send is never mistaken for "not sent yet".
      latest.current = begun.contribution
      setContribution(begun.contribution)
      void store
        .save(begun.contribution)
        .then(() => completeSend(begun.contribution, begun.index, wallet, currentTime()))
        .then(async (next) => {
          latest.current = next
          setContribution(next)
          await store.save(next)
        })
        .finally(() => {
          stepping.current = false
        })
    }, tickMs)
    return () => {
      window.clearInterval(timer)
    }
  }, [wallet, state, tickMs, store])

  if (today > pot.endDate && contribution === undefined) {
    return (
      <p role="status" className="rounded-control border border-line px-4 py-3">
        This pot is closed to gifts. The last day was {pot.endDate}.
      </p>
    )
  }

  const wishText = wish.trim()
  const wishCheck = wishText === '' ? undefined : encodeWishMemo(wishText)
  const wishError =
    wishCheck !== undefined && !wishCheck.ok && wishCheck.reason !== 'empty'
      ? WISH_ERROR_MESSAGES[wishCheck.reason]
      : undefined
  const withWish = wishCheck?.ok === true
  const split = amount === null ? undefined : splitContribution(amount, withWish)
  const ready = split?.ok === true && wishError === undefined

  async function startGift() {
    if (wallet === null || split?.ok !== true) return
    setConfirming(false)
    let spendable: bigint
    try {
      spendable = await wallet.spendableZat()
    } catch {
      setProblem('Your balance could not be read. Nothing was sent. Try again.')
      return
    }
    if (spendable < split.totalZat) {
      setProblem(
        `You have ${formatZec(spendable)} ZEC to spend, and this gift needs ${formatZec(split.totalZat)} ZEC plus a small fee for each piece.`,
      )
      return
    }
    setProblem(undefined)
    const created = createContribution({
      pot,
      split,
      wish: withWish ? wishText : undefined,
      nowMs: currentTime(),
      delays,
    })
    latest.current = created
    setContribution(created)
    await store.save(created)
  }

  if (contribution !== undefined) {
    const { sent, total, state: queueState } = progress(contribution)
    const mine = receipt(contribution)

    if (queueState === 'done') {
      return (
        <section
          className="space-y-3 rounded-card border border-good bg-good-soft p-5"
          aria-labelledby="receipt"
        >
          <h2 id="receipt" className="text-xl">
            Thank you
          </h2>
          <p>
            You sent {formatZec(mine.totalZat)} ZEC in {String(mine.pieces)}{' '}
            {mine.pieces === 1 ? 'piece' : 'pieces'}.
          </p>
          {mine.wish !== undefined && <p>Your wish: “{mine.wish}”</p>}
          <p className="text-sm text-muted">
            This receipt is only for you. The host sees a total, never who gave or how much.
          </p>
        </section>
      )
    }

    return (
      <section className="space-y-4" aria-labelledby="sending">
        <h2 id="sending" className="text-xl">
          Sending your gift
        </h2>
        <progress value={sent} max={total} className="h-3 w-full accent-seal">
          {sent} of {total}
        </progress>
        <p role="status">
          {String(sent)} of {String(total)} pieces sent
        </p>
        {queueState === 'running' && (
          <p className="text-muted">
            Keep this page open until it finishes. The pieces go out a little at a time, so no
            single gift can be picked out.
          </p>
        )}
        {queueState === 'unconfirmed' && (
          <div
            role="alert"
            className="space-y-3 rounded-control border border-warn bg-warn-soft p-4"
          >
            <p>
              This page closed while one piece of your gift was being sent, so it is not certain
              whether it went through. Check your wallet’s recent activity, then choose. Choosing
              wrongly would send that piece twice, or not at all.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  const next = resolveUnconfirmed(contribution, 'sent', currentTime())
                  latest.current = next
                  setContribution(next)
                  void store.save(next)
                }}
              >
                It was sent
              </Button>
              <Button
                onClick={() => {
                  const next = resolveUnconfirmed(contribution, 'resend', currentTime())
                  latest.current = next
                  setContribution(next)
                  void store.save(next)
                }}
              >
                It was not sent: send it again
              </Button>
            </div>
          </div>
        )}
        {queueState === 'blocked' && (
          <div
            role="alert"
            className="space-y-3 rounded-control border border-warn bg-warn-soft p-4"
          >
            <p>Your wallet ran out of funds. Add more, then continue.</p>
            <Button
              onClick={() => {
                const next = resume(contribution, currentTime())
                latest.current = next
                setContribution(next)
                void store.save(next)
              }}
            >
              Continue
            </Button>
          </div>
        )}
        {queueState === 'failed' && (
          <div role="alert" className="space-y-3 rounded-control border border-bad bg-bad-soft p-4">
            <p>
              A piece could not be sent after several tries. The pieces already sent are not lost.
            </p>
            <Button
              onClick={() => {
                const next = resume(contribution, currentTime())
                latest.current = next
                setContribution(next)
                void store.save(next)
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {wallet === null && <NoWalletNotice to="to send a gift" />}

      <AmountInput
        label="Gift amount (ZEC)"
        hint="Your gift is split into standard pieces and sent a little at a time."
        minZat={MIN_GIFT_ZAT}
        onChange={setAmount}
      />

      <TextArea
        label="A wish for the host (optional)"
        hint={`Anonymous. Up to ${String(WISH_MAX_CHARS)} characters.`}
        rows={3}
        value={wish}
        onChange={(event) => {
          setWish(event.target.value)
        }}
        {...(wishError === undefined ? {} : { error: wishError })}
      />

      {split?.ok === true && (
        <div
          className="space-y-1 rounded-card border border-line bg-surface p-4"
          aria-live="polite"
        >
          <p>
            You will send <strong className="font-semibold">{formatZec(split.totalZat)} ZEC</strong>{' '}
            in {String(split.pieces.length)} {split.pieces.length === 1 ? 'piece' : 'pieces'}.
          </p>
          {split.adjusted && !split.capped && (
            <p className="text-sm text-muted">
              Rounded from {formatZec(split.requestedZat)} ZEC to match the standard piece sizes
              {withWish ? ' and make room for your wish' : ''}. This is the exact amount that will
              be sent.
            </p>
          )}
          {split.capped && (
            <p className="text-sm text-muted">
              The most one gift can be is {formatZec(maxGiftZat(withWish))} ZEC.
            </p>
          )}
        </div>
      )}

      {problem !== undefined && (
        <p role="alert" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          {problem}
        </p>
      )}

      <Button
        disabled={!ready}
        onClick={() => {
          if (wallet === null) {
            setProblem(
              'You need a wallet first, so nothing was sent. Set one up on the Wallet page.',
            )
            return
          }
          setConfirming(true)
        }}
      >
        Send gift
      </Button>

      <ConfirmDialog
        open={confirming}
        title={split?.ok === true ? `Send ${formatZec(split.totalZat)} ZEC?` : 'Send gift?'}
        confirmLabel="Send"
        onCancel={() => {
          setConfirming(false)
        }}
        onConfirm={() => {
          void startGift()
        }}
      >
        {split?.ok === true
          ? `This sends ${formatZec(split.totalZat)} ZEC in ${String(split.pieces.length)} ${split.pieces.length === 1 ? 'piece' : 'pieces'}, over a little while. Gifts cannot be taken back.`
          : ''}
      </ConfirmDialog>
    </div>
  )
}
