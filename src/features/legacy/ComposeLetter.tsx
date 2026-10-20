import { useEffect, useState } from 'react'
import type { ChainClient } from 'tlock-js'
import { AddressInput } from '../../components/AddressInput.tsx'
import { AmountInput } from '../../components/AmountInput.tsx'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { TextArea, TextInput } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { LEGACY_LETTER_MAX_BYTES } from '../../config/constants.ts'
import { formatZec } from '../../lib/zec.ts'
import { formatDateTime, fromLocalInput, shortAddress, toLocalInput } from './format.ts'
import { previewFee, sealAndSend } from './seal.ts'
import { useLegacy } from './stores.ts'
import type { SealField } from './types.ts'
import { MIN_GIFT_ZAT, validateSeal } from './validate.ts'
import type { LegacyWalletPort } from './walletPort.ts'

interface ComposeLetterProps {
  /** `null` until the wallet exists. */
  wallet: LegacyWalletPort | null
  /** How far ahead the unlock time starts out. */
  defaultUnlockDelayMs: number
  demoMode: boolean
  client?: ChainClient
}

function currentTime(): number {
  return Date.now()
}

export function ComposeLetter({
  wallet,
  defaultUnlockDelayMs,
  demoMode,
  client,
}: ComposeLetterProps) {
  const push = useToasts((state) => state.push)
  const addSent = useLegacy((state) => state.addSent)
  const [recipient, setRecipient] = useState('')
  const [letter, setLetter] = useState('')
  const [withGift, setWithGift] = useState(false)
  const [amount, setAmount] = useState<bigint | null>(null)
  const [unlock, setUnlock] = useState(() => toLocalInput(currentTime() + defaultUnlockDelayMs))
  const [errors, setErrors] = useState<Partial<Record<SealField, string>>>({})
  const [problem, setProblem] = useState<string | undefined>()
  const [fee, setFee] = useState<bigint | undefined>()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const giftZat = withGift ? amount : null
  const unlockMs = fromLocalInput(unlock)
  const checked = validateSeal({ recipient, letter, amountZat: giftZat, unlockMs }, currentTime())
  const letterBytes = new TextEncoder().encode(letter.trim()).length

  // Show the fee as soon as the letter can be sent.
  useEffect(() => {
    if (wallet === null || !checked.ok) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      previewFee(wallet, checked.value, letterBytes).then(
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
  }, [wallet, recipient, letter, giftZat, unlockMs])

  async function send() {
    setConfirming(false)
    setBusy(true)
    setProblem(undefined)
    const result = await sealAndSend(
      wallet,
      { recipient, letter, amountZat: giftZat, unlockMs },
      {
        nowMs: currentTime(),
        ...(client === undefined ? {} : { client }),
      },
    )
    setBusy(false)

    if (result.ok) {
      addSent(result.item)
      push('success', 'Your letter was sealed and sent.')
      setLetter('')
      setErrors({})
      return
    }
    switch (result.reason) {
      case 'invalid':
        setErrors(result.errors)
        break
      case 'wallet-unavailable':
        setProblem('The wallet is not available yet, so nothing was sealed or sent.')
        break
      case 'seal-failed':
        setProblem(
          'The letter could not be sealed. Check your connection and try again. Nothing was sent.',
        )
        break
      case 'funding-failed':
        setProblem('The gift could not be funded. Nothing was sent. Try again.')
        break
      case 'delivery-failed':
        addSent(result.item)
        setProblem(
          'The gift was funded but the letter was not delivered. Use Retry in the Sent list below. Your funds are safe.',
        )
        break
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const result = validateSeal(
          { recipient, letter, amountZat: giftZat, unlockMs },
          currentTime(),
        )
        if (!result.ok) {
          setErrors(result.errors)
          return
        }
        setErrors({})
        if (wallet === null) {
          setProblem('The wallet is not available yet, so nothing was sealed or sent.')
          return
        }
        setConfirming(true)
      }}
      className="space-y-5"
    >
      <AddressInput
        label="Recipient’s Zealed address"
        value={recipient}
        onChange={setRecipient}
        {...(errors.recipient === undefined ? {} : { error: errors.recipient })}
      />

      <TextArea
        label="Your letter"
        rows={6}
        value={letter}
        onChange={(event) => {
          setLetter(event.target.value)
        }}
        hint={`${String(letterBytes)} of ${String(LEGACY_LETTER_MAX_BYTES)} bytes. Only the recipient can read it, and only after the unlock time.`}
        {...(errors.letter === undefined ? {} : { error: errors.letter })}
      />

      <TextInput
        label="Open on"
        type="datetime-local"
        step="1"
        value={unlock}
        onChange={(event) => {
          setUnlock(event.target.value)
        }}
        hint={
          demoMode
            ? 'Demo mode: it starts 30 seconds from now.'
            : 'Nobody, including you, can open it earlier. This uses the drand network’s clock.'
        }
        {...(errors.unlock === undefined ? {} : { error: errors.unlock })}
      />

      <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={withGift}
            onChange={(event) => {
              setWithGift(event.target.checked)
            }}
            className="size-5 accent-seal"
          />
          Include ZEC with the letter
        </label>
        {withGift && (
          <AmountInput
            label="Gift amount (ZEC)"
            minZat={MIN_GIFT_ZAT}
            onChange={setAmount}
            hint="Held in a new wallet whose key is sealed inside the letter. The recipient moves it into their own wallet after opening."
          />
        )}
        {errors.amount !== undefined && (
          <p className="text-sm font-medium text-bad">{errors.amount}</p>
        )}
      </div>

      {fee !== undefined && (
        <p className="text-sm text-muted" aria-live="polite">
          Network fee: <span className="font-medium text-ink">{formatZec(fee)} ZEC</span>
          {giftZat !== null && <> on top of the {formatZec(giftZat)} ZEC gift.</>}
        </p>
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
        Seal and send
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Seal this letter?"
        confirmLabel="Seal and send"
        onCancel={() => {
          setConfirming(false)
        }}
        onConfirm={() => {
          void send()
        }}
      >
        {checked.ok
          ? `It goes to ${shortAddress(checked.value.recipient)} and opens on ${formatDateTime(checked.value.unlockMs)}.${giftZat === null ? '' : ` It includes ${formatZec(giftZat)} ZEC.`}${fee === undefined ? '' : ` The network fee is ${formatZec(fee)} ZEC.`} A sealed letter cannot be taken back.`
          : ''}
      </ConfirmDialog>
    </form>
  )
}
