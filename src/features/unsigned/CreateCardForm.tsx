import { useState } from 'react'
import { AmountInput } from '../../components/AmountInput.tsx'
import { Button } from '../../components/Button.tsx'
import { TextArea, TextInput } from '../../components/Field.tsx'
import {
  CARD_BIO_MAX,
  CARD_NAME_MAX,
  MAX_MINIMUM_ZAT,
  MIN_MINIMUM_ZAT,
  type CardField,
} from './card.ts'
import type { CreateCardResult } from './service.ts'

interface CreateCardFormProps {
  onSubmit: (input: {
    name: string
    bio: string
    minimumZat: bigint | null
    acceptsReplies: boolean
  }) => Promise<CreateCardResult>
}

const PROBLEMS = {
  'wallet-unavailable': 'The wallet is not available yet, so a card cannot be created.',
  'wallet-error': 'The wallet could not create the card. Nothing was created. Try again.',
} as const

export function CreateCardForm({ onSubmit }: CreateCardFormProps) {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [minimumZat, setMinimumZat] = useState<bigint | null>(null)
  const [acceptsReplies, setAcceptsReplies] = useState(true)
  const [errors, setErrors] = useState<Partial<Record<CardField, string>>>({})
  const [problem, setProblem] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setProblem(undefined)
        void onSubmit({ name, bio, minimumZat, acceptsReplies }).then((result) => {
          setBusy(false)
          if (result.ok) {
            setErrors({})
          } else if (result.reason === 'invalid') setErrors(result.errors)
          else {
            setErrors({})
            setProblem(PROBLEMS[result.reason])
          }
        })
      }}
      className="space-y-5"
    >
      <TextInput
        label="Display name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
        maxLength={CARD_NAME_MAX * 4}
        autoComplete="off"
        hint="Shown to anyone who opens your link. It need not be your real name."
        {...(errors.name === undefined ? {} : { error: errors.name })}
      />
      <TextArea
        label="Short bio (optional)"
        rows={3}
        value={bio}
        onChange={(event) => {
          setBio(event.target.value)
        }}
        hint={`${String(bio.trim().length)} of ${String(CARD_BIO_MAX)} characters. Say what you want to hear about.`}
        {...(errors.bio === undefined ? {} : { error: errors.bio })}
      />
      <AmountInput
        label="Minimum payment per message (ZEC)"
        hint="Messages paying less go to a hidden folder, so spam costs money. From 0.001 to 100 ZEC."
        minZat={MIN_MINIMUM_ZAT}
        maxZat={MAX_MINIMUM_ZAT}
        onChange={setMinimumZat}
      />
      {errors.minimum !== undefined && (
        <p className="text-sm font-medium text-bad">{errors.minimum}</p>
      )}
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={acceptsReplies}
          onChange={(event) => {
            setAcceptsReplies(event.target.checked)
          }}
          className="mt-1 size-5 accent-seal"
        />
        <span>
          Allow replies
          <span className="block text-sm text-muted">
            If a sender includes a reply address, you can answer them. You never learn who they are.
          </span>
        </span>
      </label>
      {problem !== undefined && (
        <p
          role="alert"
          className="rounded-control border border-warn bg-warn-soft px-4 py-3 text-sm"
        >
          {problem}
        </p>
      )}
      <Button type="submit" busy={busy}>
        Create contact card
      </Button>
    </form>
  )
}
