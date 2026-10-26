import { useState, type SubmitEvent } from 'react'
import { Button } from '../../components/Button.tsx'
import { TextInput } from '../../components/Field.tsx'
import { describeInterval } from './batching.ts'
import { sharedPotProblem } from './shared/engine.ts'
import { CohostFields, type CohostChoice } from './shared/CohostFields.tsx'
import { POT_NAME_MAX_CHARS, type PotInput, type PotInputField } from './pot.ts'
import type { CreatePotResult } from './service.ts'
import type { Pot } from './types.ts'

interface CreatePotFormProps {
  batchIntervalMs: number
  onSubmit: (input: PotInput) => Promise<CreatePotResult>
  onCreated: (pot: Pot) => void
  /** Starts a pot with co-hosts; resolves to field errors, a problem, or nothing when invites went out. */
  onSubmitShared?: (
    input: PotInput,
    choice: { cohosts: string[]; threshold: number },
  ) => Promise<{ errors?: Partial<Record<PotInputField, string>>; problem?: string } | null>
}

const MESSAGES = {
  'wallet-unavailable': 'You need a wallet first to create a pot. Set one up on the Wallet page.',
  'wallet-error': 'The wallet could not create the pot. Nothing was created. Try again.',
} as const

export function CreatePotForm({
  batchIntervalMs,
  onSubmit,
  onCreated,
  onSubmitShared,
}: CreatePotFormProps) {
  const [input, setInput] = useState<PotInput>({ name: '', cover: '', eventDate: '', endDate: '' })
  const [errors, setErrors] = useState<Partial<Record<PotInputField, string>>>({})
  const [problem, setProblem] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [cohost, setCohost] = useState<CohostChoice>({ on: false, cohosts: [], threshold: 2 })
  const [cohostError, setCohostError] = useState<string | undefined>()
  const [invited, setInvited] = useState(false)

  const set = (field: PotInputField) => (event: { target: { value: string } }) => {
    setInput((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(undefined)
    setInvited(false)
    if (cohost.on && onSubmitShared !== undefined) {
      const choice = { cohosts: cohost.cohosts.map((a) => a.trim()), threshold: cohost.threshold }
      const bad = choice.cohosts.some((a) => a === '')
        ? 'Fill in every co-host address, or remove it.'
        : sharedPotProblem(choice)
      setCohostError(bad ?? undefined)
      if (bad !== null) return
      setBusy(true)
      const outcome = await onSubmitShared(input, choice)
      setBusy(false)
      setErrors(outcome?.errors ?? {})
      setProblem(outcome?.problem)
      if (outcome === null) {
        setInvited(true)
        setInput({ name: '', cover: '', eventDate: '', endDate: '' })
        setCohost({ on: false, cohosts: [], threshold: 2 })
      }
      return
    }
    setBusy(true)
    const result = await onSubmit(input)
    setBusy(false)
    if (result.ok) onCreated(result.pot)
    else if (result.reason === 'invalid') setErrors(result.errors)
    else {
      setErrors({})
      setProblem(MESSAGES[result.reason])
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className="space-y-4"
    >
      <TextInput
        label="Pot name"
        value={input.name}
        onChange={set('name')}
        maxLength={POT_NAME_MAX_CHARS * 4}
        autoComplete="off"
        placeholder="Ada and Tunde's wedding"
        {...(errors.name === undefined ? {} : { error: errors.name })}
      />
      <TextInput
        label="Cover emoji (optional)"
        value={input.cover}
        onChange={set('cover')}
        autoComplete="off"
        placeholder="🎁"
        hint="Kept on this device and shown on the pot page."
        {...(errors.cover === undefined ? {} : { error: errors.cover })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Event date"
          type="date"
          value={input.eventDate}
          onChange={set('eventDate')}
          {...(errors.eventDate === undefined ? {} : { error: errors.eventDate })}
        />
        <TextInput
          label="Last day for gifts"
          type="date"
          value={input.endDate}
          onChange={set('endDate')}
          {...(errors.endDate === undefined ? {} : { error: errors.endDate })}
        />
      </div>
      <p className="text-sm text-muted">
        To protect your guests, your total refreshes only every{' '}
        <strong className="font-medium text-ink">{describeInterval(batchIntervalMs)}</strong>. You
        will never see who gave or how much each gift was.
      </p>
      {onSubmitShared !== undefined && (
        <CohostFields value={cohost} onChange={setCohost} error={cohostError} />
      )}
      {invited && (
        <p role="status" className="rounded-control border border-line bg-sunken px-4 py-3 text-sm">
          Invitations sent. The pot opens under Your pots once every co-host has accepted.
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
        {cohost.on ? 'Invite co-hosts' : 'Create pot'}
      </Button>
    </form>
  )
}
