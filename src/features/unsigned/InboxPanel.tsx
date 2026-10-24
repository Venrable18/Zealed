import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextArea } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { UNSIGNED_MESSAGE_MAX_BYTES } from '../../config/constants.ts'
import { formatZec } from '../../lib/zec.ts'
import { formatDateTime, shortAddress } from '../legacy/format.ts'
import type { Card } from './card.ts'
import { cleanBody } from './format.ts'
import { readInbox, summarize, type UnsignedMessage } from './inbox.ts'
import { sendReply } from './service.ts'
import { useUnsigned } from './stores.ts'
import type { UnsignedWalletPort } from './walletPort.ts'

function ReplyBox({
  message,
  card,
  wallet,
}: {
  message: UnsignedMessage
  card: Card
  wallet: UnsignedWalletPort | null
}) {
  const push = useToasts((state) => state.push)
  const replied = useUnsigned((state) => state.repliedIds.includes(message.id))
  const markReplied = useUnsigned((state) => state.markReplied)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const bytes = new TextEncoder().encode(text.trim()).length

  if (message.replyTo === undefined)
    return <p className="text-sm text-muted">The sender did not leave a way to reply.</p>
  if (!card.acceptsReplies)
    return <p className="text-sm text-muted">Replies are turned off for this card.</p>
  if (replied) return <p className="text-sm">You replied.</p>
  const replyTo = message.replyTo

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true)
        }}
      >
        Reply
      </Button>
    )
  }

  async function send() {
    if (cleanBody(text) === null) {
      setError(
        bytes > UNSIGNED_MESSAGE_MAX_BYTES
          ? `A reply can be up to ${String(UNSIGNED_MESSAGE_MAX_BYTES)} bytes. This one is ${String(bytes)}.`
          : 'Write a reply first.',
      )
      return
    }
    setError(undefined)
    setBusy(true)
    const result = await sendReply(wallet, replyTo, text)
    setBusy(false)
    if (result.ok) {
      markReplied(message.id)
      push('success', 'Your reply was sent.')
    } else if (result.reason === 'wallet-unavailable')
      setError('You need a wallet first, so nothing was sent. Set one up on the Wallet page.')
    else setError('The reply could not be sent. Try again.')
  }

  return (
    <div className="space-y-3">
      <TextArea
        label={`Reply to ${shortAddress(replyTo)}`}
        rows={4}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
        hint={`${String(bytes)} of ${String(UNSIGNED_MESSAGE_MAX_BYTES)} bytes. They will not learn who you are.`}
        {...(error === undefined ? {} : { error })}
      />
      <div className="flex gap-3">
        <Button
          busy={busy}
          onClick={() => {
            void send()
          }}
        >
          Send reply
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

function MessageItem({
  message,
  card,
  wallet,
}: {
  message: UnsignedMessage
  card: Card
  wallet: UnsignedWalletPort | null
}) {
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-5">
      <p className="text-sm text-muted">
        {formatDateTime(message.receivedAtMs)} · paid{' '}
        <span className="font-medium text-ink">{formatZec(message.amountZat)} ZEC</span>
      </p>
      <p className="whitespace-pre-wrap break-words">{message.body}</p>
      <ReplyBox message={message} card={card} wallet={wallet} />
    </li>
  )
}

export function InboxPanel({ card, wallet }: { card: Card; wallet: UnsignedWalletPort | null }) {
  const messages = useUnsigned((state) => state.messages)
  const setMessages = useUnsigned((state) => state.setMessages)
  const push = useToasts((state) => state.push)
  const [checking, setChecking] = useState(false)

  async function check() {
    if (wallet === null) return
    setChecking(true)
    try {
      setMessages(await readInbox(await wallet.receivedTransactions(card.address), card))
      push('info', 'Checked for messages.')
    } catch {
      push('error', 'Could not check for messages. Try again.')
    }
    setChecking(false)
  }

  const paid = messages.filter((m) => !m.belowMinimum)
  const below = messages.filter((m) => m.belowMinimum)
  const earnings = summarize(messages)

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="earnings"
        className="space-y-2 rounded-card border border-line bg-surface p-5"
      >
        <h3 id="earnings" className="text-lg text-muted">
          Earned through this card
        </h3>
        <p className="font-display text-3xl font-semibold tabular-nums">
          {formatZec(earnings.totalZat)} <span className="text-lg font-medium text-muted">ZEC</span>
        </p>
        <p className="text-sm text-muted">
          {String(earnings.messages)} {earnings.messages === 1 ? 'message' : 'messages'} met your
          minimum
          {earnings.belowMinimum > 0 &&
            `; ${String(earnings.belowMinimum)} below it (${formatZec(earnings.belowMinimumZat)} ZEC, included above)`}
          .
        </p>
      </section>

      <div>
        <Button
          variant="secondary"
          busy={checking}
          disabled={wallet === null}
          onClick={() => {
            void check()
          }}
        >
          Check for messages
        </Button>
      </div>

      {paid.length === 0 ? (
        <EmptyState title="No messages yet">
          Messages that meet your minimum appear here, with what was paid.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {paid.map((message) => (
            <MessageItem key={message.id} message={message} card={card} wallet={wallet} />
          ))}
        </ul>
      )}

      {below.length > 0 && (
        <details className="rounded-card border border-line p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">
            Below minimum ({String(below.length)})
          </summary>
          <p className="mb-4 text-sm text-muted">
            These paid less than {formatZec(card.minimumZat)} ZEC, or came bundled in a payment that
            paid for only one message.
          </p>
          <ul className="space-y-4">
            {below.map((message) => (
              <MessageItem key={message.id} message={message} card={card} wallet={wallet} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
