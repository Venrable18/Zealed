import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { TextArea, TextInput } from '../../components/Field.tsx'
import { formatZec } from '../../lib/zec.ts'
import { formatDateTime } from '../legacy/format.ts'
import type { UnsignedMessage } from './inbox.ts'
import { checkReveal, parseReceipt, sameCommitment } from './receipt.ts'

type Outcome =
  | { kind: 'match'; message: UnsignedMessage }
  | { kind: 'no-match' }
  | { kind: 'bad-salt' }
  | { kind: 'bad-message' }

/**
 * Checks a message a sender reveals against the commitments in the inbox. The sender gives the
 * message and the salt from their receipt; if SHA-256(salt || message) equals a commitment that
 * arrived with a message, that is the message they sent.
 */
export function VerifyReceipt({ messages }: { messages: readonly UnsignedMessage[] }) {
  const [salt, setSalt] = useState('')
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState<Outcome | undefined>()
  const [busy, setBusy] = useState(false)

  async function verify() {
    setBusy(true)
    // The salt box also accepts a whole pasted receipt file.
    const saltHex = parseReceipt(salt)?.saltHex ?? salt
    const check = await checkReveal(saltHex, text)
    setBusy(false)
    if (!check.ok) {
      setOutcome({ kind: check.reason })
      return
    }
    const match = messages.find(
      (m) => m.commitment !== undefined && sameCommitment(m.commitment, check.commitment),
    )
    setOutcome(match === undefined ? { kind: 'no-match' } : { kind: 'match', message: match })
  }

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-muted">
        A sender who kept a receipt can prove what they sent. Paste the message and the salt from
        their receipt (or the whole receipt file). Nothing here leaves your device.
      </p>
      <TextInput
        label="Salt, or the whole receipt"
        value={salt}
        onChange={(event) => {
          setSalt(event.target.value)
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <TextArea
        label="The message they say they sent"
        rows={4}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />
      <Button
        variant="secondary"
        busy={busy}
        onClick={() => {
          void verify()
        }}
      >
        Check
      </Button>
      {outcome?.kind === 'match' && (
        <p role="status" className="rounded-control border border-good bg-good-soft px-4 py-3">
          <strong>It matches.</strong> This is the message you received on{' '}
          {formatDateTime(outcome.message.receivedAtMs)}, paid{' '}
          {formatZec(outcome.message.amountZat)} ZEC (payment {outcome.message.txid.slice(0, 10)}).
        </p>
      )}
      {outcome?.kind === 'no-match' && (
        <p role="alert" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          No message in your inbox carries this commitment. The message or salt may be wrong, or the
          message was sent without a receipt.
        </p>
      )}
      {outcome?.kind === 'bad-salt' && (
        <p role="alert" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          The salt should be 32 letters and digits (hex), or a whole receipt file.
        </p>
      )}
      {outcome?.kind === 'bad-message' && (
        <p role="alert" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          Paste the message text first. It must be up to 2,048 bytes with no unsafe characters.
        </p>
      )}
      <p className="text-xs text-muted">
        {String(messages.filter((m) => m.commitment !== undefined).length)} message(s) in your inbox
        carry a receipt commitment.
      </p>
    </div>
  )
}
