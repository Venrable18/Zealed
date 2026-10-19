import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { downloadText } from '../../lib/download.ts'
import { formatZec } from '../../lib/zec.ts'
import { formatDateTime } from '../legacy/format.ts'
import { readInbox, type UnsignedMessage } from './inbox.ts'
import { serializeReceipt } from './receipt.ts'
import type { SentMessage } from './send.ts'
import { useSentMessages } from './stores.ts'
import type { UnsignedWalletPort } from './walletPort.ts'

function SentItem({ item, wallet }: { item: SentMessage; wallet: UnsignedWalletPort | null }) {
  const push = useToasts((state) => state.push)
  const [replies, setReplies] = useState<UnsignedMessage[] | undefined>()
  const [checking, setChecking] = useState(false)

  async function check(replyTo: string) {
    if (wallet === null) return
    setChecking(true)
    try {
      // A reply pays nothing, so the card's minimum does not apply.
      setReplies(await readInbox(await wallet.receivedTransactions(replyTo), { minimumZat: 0n }))
    } catch {
      push('error', 'Could not check for replies. Try again.')
    }
    setChecking(false)
  }

  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-5">
      <p className="font-medium">To {item.cardName}</p>
      <p className="text-sm text-muted">
        {formatDateTime(item.sentAtMs)} · paid {formatZec(item.amountZat)} ZEC
      </p>
      {item.body !== undefined && (
        <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {item.receipt !== undefined && (
          <Button
            variant="secondary"
            onClick={() => {
              if (item.receipt !== undefined)
                downloadText(
                  `zealed-receipt-${item.receipt.txid.slice(0, 8)}.json`,
                  serializeReceipt(item.receipt),
                )
            }}
          >
            Download receipt
          </Button>
        )}
        {item.replyTo !== undefined && (
          <Button
            variant="secondary"
            busy={checking}
            disabled={wallet === null}
            onClick={() => {
              void check(item.replyTo ?? '')
            }}
          >
            Check for replies
          </Button>
        )}
      </div>
      {item.replyTo === undefined && (
        <p className="text-sm text-muted">No reply address was left, so they cannot answer.</p>
      )}
      {replies !== undefined &&
        (replies.length === 0 ? (
          <p role="status" className="text-sm">
            No reply yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {replies.map((reply) => (
              <li key={reply.id} className="rounded-control border border-line p-3">
                <p className="text-xs text-muted">Reply, {formatDateTime(reply.receivedAtMs)}</p>
                <p className="whitespace-pre-wrap break-words">{reply.body}</p>
              </li>
            ))}
          </ul>
        ))}
    </li>
  )
}

/** Messages this person sent. Kept on this device only. */
export function SentMessages({ wallet }: { wallet: UnsignedWalletPort | null }) {
  const sent = useSentMessages((state) => state.sent)
  if (sent.length === 0)
    return (
      <EmptyState title="Nothing sent yet">
        Messages you send appear here, on this device only.
      </EmptyState>
    )
  return (
    <ul className="space-y-4">
      {sent.map((item) => (
        <SentItem key={item.id} item={item} wallet={wallet} />
      ))}
    </ul>
  )
}
