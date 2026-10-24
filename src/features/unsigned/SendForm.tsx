import { useEffect, useState } from 'react'
import { AmountInput } from '../../components/AmountInput.tsx'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { FeePreview } from '../../components/FeePreview.tsx'
import { TextArea } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { UNSIGNED_MESSAGE_MAX_BYTES } from '../../config/constants.ts'
import { downloadText } from '../../lib/download.ts'
import { formatZec } from '../../lib/zec.ts'
import type { Card } from './card.ts'
import { serializeReceipt } from './receipt.ts'
import {
  memoCountFor,
  sendMessage,
  validateSend,
  type SendField,
  type SentMessage,
} from './send.ts'
import { useSentMessages } from './stores.ts'
import type { UnsignedWalletPort } from './walletPort.ts'

function currentTime(): number {
  return Date.now()
}

export function SendForm({ card, wallet }: { card: Card; wallet: UnsignedWalletPort | null }) {
  const push = useToasts((state) => state.push)
  const addSent = useSentMessages((state) => state.add)
  const [body, setBody] = useState('')
  const [amount, setAmount] = useState<bigint | null>(null)
  const [allowReplies, setAllowReplies] = useState(false)
  const [keepReceipt, setKeepReceipt] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<SendField, string>>>({})
  const [problem, setProblem] = useState<string | undefined>()
  const [fee, setFee] = useState<bigint | undefined>()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<SentMessage | undefined>()

  const input = { body, amountZat: amount, allowReplies, keepReceipt }
  const checked = validateSend(card, input)
  const bytes = new TextEncoder().encode(body.trim()).length
  const memoCount = memoCountFor(input)

  // Show the fee as soon as the message can be sent.
  useEffect(() => {
    if (wallet === null || !checked.ok) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      wallet.estimateFee({ memoCount }).then(
        (next) => {
          if (!cancelled) setFee(next)
        },
        () => {
          if (!cancelled) setFee(undefined)
        },
      )
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // checked is rebuilt each render; these are the inputs it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, body, amount, memoCount])

  async function send() {
    setConfirming(false)
    setBusy(true)
    setProblem(undefined)
    const result = await sendMessage(wallet, card, input, {
      nowMs: currentTime(),
      ...(fee === undefined ? {} : { feeZat: fee }),
    })
    setBusy(false)
    if (result.ok) {
      addSent(result.sent)
      setDone(result.sent)
      setBody('')
      setErrors({})
      push('success', 'Your message was sent.')
      return
    }
    switch (result.reason) {
      case 'invalid':
        setErrors(result.errors)
        break
      case 'wallet-unavailable':
        setProblem('You need a wallet first, so nothing was sent. Set one up on the Wallet page.')
        break
      case 'insufficient-funds':
        setProblem(
          `You have ${formatZec(result.spendableZat)} ZEC to spend. This message needs ${formatZec(amount ?? 0n)} ZEC plus the network fee. Nothing was sent.`,
        )
        break
      case 'failed':
        setProblem('The message could not be sent. Nothing was paid. Try again.')
        break
    }
  }

  return (
    <div className="space-y-6">
      {done !== undefined && (
        <section
          aria-labelledby="sent-title"
          className="space-y-3 rounded-card border border-good bg-good-soft p-5"
        >
          <h2 id="sent-title" className="text-xl">
            Message sent
          </h2>
          <p>
            You paid {formatZec(done.amountZat)} ZEC to {done.cardName}.
            {done.replyTo !== undefined && ' If they reply, check for it in your sent list below.'}
          </p>
          {done.receipt !== undefined && (
            <>
              <p className="text-sm">
                Keep this receipt <strong>and your message</strong>. Together they can later prove
                what you sent, without anyone being able to read it from the receipt alone.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  if (done.receipt !== undefined)
                    downloadText(
                      `zealed-receipt-${done.receipt.txid.slice(0, 8)}.json`,
                      serializeReceipt(done.receipt),
                    )
                }}
              >
                Download receipt
              </Button>
            </>
          )}
        </section>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!checked.ok) {
            setErrors(checked.errors)
            return
          }
          setErrors({})
          if (wallet === null) {
            setProblem(
              'You need a wallet first, so nothing was sent. Set one up on the Wallet page.',
            )
            return
          }
          setConfirming(true)
        }}
        className="space-y-5"
      >
        <TextArea
          label="Your message"
          rows={7}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
          }}
          hint={`${String(bytes)} of ${String(UNSIGNED_MESSAGE_MAX_BYTES)} bytes. Only ${card.name} can read it.`}
          {...(errors.body === undefined ? {} : { error: errors.body })}
        />

        <AmountInput
          label="Payment (ZEC)"
          minZat={card.minimumZat}
          onChange={setAmount}
          hint={`The smallest payment ${card.name} will read is ${formatZec(card.minimumZat)} ZEC. Paying more does not make it more private.`}
        />
        {errors.amount !== undefined && (
          <p className="text-sm font-medium text-bad">{errors.amount}</p>
        )}

        {card.acceptsReplies && (
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              checked={allowReplies}
              onChange={(event) => {
                setAllowReplies(event.target.checked)
              }}
              className="mt-1 size-5 accent-seal"
            />
            <span>
              Allow a reply
              <span className="block text-sm text-muted">
                A fresh address is made so they can answer. They will not learn who you are.
              </span>
            </span>
          </label>
        )}

        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={keepReceipt}
            onChange={(event) => {
              setKeepReceipt(event.target.checked)
            }}
            className="mt-1 size-5 accent-seal"
          />
          <span>
            Keep a receipt
            <span className="block text-sm text-muted">
              Lets you prove later exactly what you sent. It adds a short code to the message.
            </span>
          </span>
        </label>

        {fee !== undefined && checked.ok && (
          <div className="space-y-2" aria-live="polite">
            <FeePreview amountZat={checked.amountZat} feeZat={fee} />
          </div>
        )}

        {problem !== undefined && (
          <p
            role="alert"
            className="rounded-control border border-warn bg-warn-soft px-4 py-3 text-sm"
          >
            {problem}
          </p>
        )}

        <Button type="submit" busy={busy}>
          Send message
        </Button>
      </form>

      <ConfirmDialog
        open={confirming}
        title="Send this message?"
        confirmLabel="Pay and send"
        onCancel={() => {
          setConfirming(false)
        }}
        onConfirm={() => {
          void send()
        }}
      >
        {checked.ok
          ? `This pays ${formatZec(checked.amountZat)} ZEC to ${card.name}${fee === undefined ? '' : `, plus a ${formatZec(fee)} ZEC network fee`}. It cannot be taken back.`
          : ''}
      </ConfirmDialog>
    </div>
  )
}
