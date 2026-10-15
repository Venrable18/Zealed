import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { formatZec } from '../../lib/zec.ts'
import { formatDateTime, shortAddress } from './format.ts'
import { retryDelivery } from './seal.ts'
import { useLegacy } from './stores.ts'
import type { LegacyWalletPort } from './walletPort.ts'

/** Letters this person sealed. Only "sent" is knowable: Zealed cannot tell whether one was opened. */
export function SentList({ wallet }: { wallet: LegacyWalletPort | null }) {
  const sent = useLegacy((state) => state.sent)
  const replaceSent = useLegacy((state) => state.replaceSent)
  const push = useToasts((state) => state.push)
  const [retrying, setRetrying] = useState<string | undefined>()

  if (sent.length === 0) {
    return <EmptyState title="Nothing sealed yet">Letters you seal appear here.</EmptyState>
  }

  async function retry(id: string) {
    const item = sent.find((candidate) => candidate.id === id)
    if (item === undefined || wallet === null) return
    setRetrying(id)
    const next = await retryDelivery(wallet, item)
    setRetrying(undefined)
    if (next === null) push('error', 'The letter could not be delivered. Try again.')
    else {
      replaceSent(next)
      push('success', 'The letter was delivered.')
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {sent.map((item) => (
          <li key={item.id} className="space-y-2 rounded-card border border-line bg-surface p-4">
            <p className="font-medium">To {shortAddress(item.recipient)}</p>
            <p className="text-sm text-muted">
              Opens {formatDateTime(item.unlockMs)}
              {item.amountZat !== null && ` · ${formatZec(item.amountZat)} ZEC included`}
            </p>
            <p className={item.status === 'sent' ? 'text-sm' : 'text-sm font-medium text-bad'}>
              {item.status === 'sent' ? 'Sent' : 'Not delivered. Your funds are safe.'}
            </p>
            {item.status === 'failed' && (
              <Button
                variant="secondary"
                busy={retrying === item.id}
                disabled={wallet === null}
                onClick={() => {
                  void retry(item.id)
                }}
              >
                Retry
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Zealed cannot tell you whether a letter has been opened. That is part of keeping it private.
      </p>
    </div>
  )
}
