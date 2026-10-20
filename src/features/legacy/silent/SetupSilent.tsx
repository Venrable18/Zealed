import { useState } from 'react'
import { AddressInput } from '../../../components/AddressInput.tsx'
import { AmountInput } from '../../../components/AmountInput.tsx'
import { Button } from '../../../components/Button.tsx'
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx'
import { TextArea, TextInput } from '../../../components/Field.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { LEGACY_LETTER_MAX_BYTES } from '../../../config/constants.ts'
import { formatZec } from '../../../lib/zec.ts'
import { shortAddress } from '../format.ts'
import { MIN_GIFT_ZAT } from '../validate.ts'
import type { LegacyWalletPort } from '../walletPort.ts'
import { UNIT_MS, describeDuration, joinDuration, splitDuration, type Unit } from './duration.ts'
import { GUARDIANS_LIMITS, setupSilentLetter, validateSilent, type SilentField } from './owner.ts'
import { useSilent } from './stores.ts'
import { currentTime } from './useNow.ts'

interface SetupSilentProps {
  wallet: LegacyWalletPort | null
  defaultPeriodMs: number
  defaultGraceMs: number
}

function DurationField({
  label,
  value,
  unit,
  error,
  onChange,
}: {
  label: string
  value: string
  unit: Unit
  error: string | undefined
  onChange: (value: string, unit: Unit) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <TextInput
          label={label}
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            onChange(event.target.value, unit)
          }}
          {...(error === undefined ? {} : { error })}
        />
        <select
          aria-label={`${label} unit`}
          value={unit}
          onChange={(event) => {
            onChange(value, event.target.value as Unit)
          }}
          className="mb-0 min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
          style={error === undefined ? undefined : { marginBottom: '1.75rem' }}
        >
          {(Object.keys(UNIT_MS) as Unit[]).map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function SetupSilent({ wallet, defaultPeriodMs, defaultGraceMs }: SetupSilentProps) {
  const push = useToasts((state) => state.push)
  const upsertOwned = useSilent((state) => state.upsertOwned)
  const [heir, setHeir] = useState('')
  const [guardians, setGuardians] = useState<string[]>(['', '', ''])
  const [threshold, setThreshold] = useState(2)
  const [period, setPeriod] = useState(() => splitDuration(defaultPeriodMs))
  const [grace, setGrace] = useState(() => splitDuration(defaultGraceMs))
  const [letter, setLetter] = useState('')
  const [withGift, setWithGift] = useState(false)
  const [amount, setAmount] = useState<bigint | null>(null)
  const [errors, setErrors] = useState<Partial<Record<SilentField, string>>>({})
  const [problem, setProblem] = useState<string | undefined>()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const giftZat = withGift ? amount : null
  const periodMs = joinDuration(period.value, period.unit)
  const graceMs = joinDuration(grace.value, grace.unit)
  const input = {
    heirAddress: heir,
    guardianAddresses: guardians,
    threshold,
    periodMs,
    graceMs,
    letter,
    amountZat: giftZat,
  }
  const letterBytes = new TextEncoder().encode(letter.trim()).length
  const maxThreshold = Math.max(2, guardians.length)

  async function send() {
    setConfirming(false)
    setBusy(true)
    setProblem(undefined)
    const result = await setupSilentLetter(wallet, input, { nowMs: currentTime() })
    setBusy(false)
    if (result.ok) {
      upsertOwned(result.record)
      push('success', 'Your letter is sealed. Remember to check in.')
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
        setProblem('The letter could not be sealed. Nothing was sent. Try again.')
        break
      case 'funding-failed':
        setProblem('The gift could not be funded. Nothing was sent. Try again.')
        break
      case 'delivery-failed':
        upsertOwned(result.record)
        setProblem(
          'Some messages were not delivered. Use Retry on your letter below. Your funds are safe.',
        )
        break
    }
  }

  const checked = validateSilent(input)

  return (
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
          setProblem('The wallet is not available yet, so nothing was sealed or sent.')
          return
        }
        setConfirming(true)
      }}
      className="space-y-5"
    >
      <AddressInput
        label="Heir’s Zealed address"
        hint="Who receives the letter if you go silent."
        value={heir}
        onChange={setHeir}
        {...(errors.heir === undefined ? {} : { error: errors.heir })}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          Guardians ({GUARDIANS_LIMITS.min} to {GUARDIANS_LIMITS.max})
        </legend>
        <p className="text-sm text-muted">
          Each holds one key share. They cannot read your letter, and alone they cannot open it.
        </p>
        {guardians.map((address, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <AddressInput
                label={`Guardian ${String(index + 1)} address`}
                value={address}
                onChange={(value) => {
                  setGuardians((current) => current.map((g, i) => (i === index ? value : g)))
                }}
              />
            </div>
            {guardians.length > GUARDIANS_LIMITS.min && (
              <Button
                variant="ghost"
                aria-label={`Remove guardian ${String(index + 1)}`}
                onClick={() => {
                  setGuardians((current) => current.filter((_, i) => i !== index))
                  setThreshold((t) => Math.min(t, Math.max(2, guardians.length - 1)))
                }}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        {guardians.length < GUARDIANS_LIMITS.max && (
          <Button
            variant="secondary"
            onClick={() => {
              setGuardians((current) => [...current, ''])
            }}
          >
            Add a guardian
          </Button>
        )}
        {errors.guardians !== undefined && (
          <p className="text-sm font-medium text-bad">{errors.guardians}</p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="threshold" className="block text-sm font-medium">
          Guardians needed to open the letter
        </label>
        <select
          id="threshold"
          value={threshold}
          onChange={(event) => {
            setThreshold(Number(event.target.value))
          }}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
        >
          {Array.from({ length: maxThreshold - 1 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>
              {n} of {guardians.length}
            </option>
          ))}
        </select>
        {errors.threshold !== undefined && (
          <p className="text-sm font-medium text-bad">{errors.threshold}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DurationField
          label="Check in every"
          value={period.value}
          unit={period.unit}
          error={errors.period}
          onChange={(value, unit) => {
            setPeriod({ value, unit })
          }}
        />
        <DurationField
          label="Then wait"
          value={grace.value}
          unit={grace.unit}
          error={errors.grace}
          onChange={(value, unit) => {
            setGrace({ value, unit })
          }}
        />
      </div>
      <p className="text-sm text-muted">
        If you miss a check-in, guardians are alerted. If you are still silent after the extra wait,
        they release their shares to your heir.
      </p>

      <TextArea
        label="Your letter"
        rows={6}
        value={letter}
        onChange={(event) => {
          setLetter(event.target.value)
        }}
        hint={`${String(letterBytes)} of ${String(LEGACY_LETTER_MAX_BYTES)} bytes.`}
        {...(errors.letter === undefined ? {} : { error: errors.letter })}
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
          <AmountInput label="Gift amount (ZEC)" minZat={MIN_GIFT_ZAT} onChange={setAmount} />
        )}
        {errors.amount !== undefined && (
          <p className="text-sm font-medium text-bad">{errors.amount}</p>
        )}
      </div>

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
          ? `It goes to ${shortAddress(checked.value.heirAddress)}, locked until ${String(checked.value.threshold)} of your ${String(checked.value.guardianAddresses.length)} guardians release it. You must check in every ${describeDuration(periodMs)}${giftZat === null ? '' : `, and ${formatZec(giftZat)} ZEC goes with it`}. Guardians only act when they open Zealed.`
          : ''}
      </ConfirmDialog>
    </form>
  )
}
