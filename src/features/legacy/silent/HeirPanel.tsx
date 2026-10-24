import { useState } from 'react'
import { Button } from '../../../components/Button.tsx'
import { EmptyState } from '../../../components/EmptyState.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import type { LegacyContent } from '../../../crypto/bundle.ts'
import { formatZec } from '../../../lib/zec.ts'
import { sweepGift } from '../inbox.ts'
import type { LegacyWalletPort } from '../walletPort.ts'
import { openGuarded, shareCount, type HeirItem } from './heir.ts'
import { useSilent } from './stores.ts'

const OPEN_ERRORS = {
  waiting: 'Not enough guardians have released their shares yet.',
  mismatch:
    'Enough shares arrived but they do not open the letter. Some may be wrong. Wait for more.',
  damaged: 'This letter is damaged and cannot be opened.',
} as const

const SWEEP_ERRORS = {
  'nothing-to-sweep': 'There is nothing left to move. The gift may already have been collected.',
  'not-ready': 'The gift is not ready to move yet. Wait a moment and try again.',
  failed: 'The funds could not be moved. Try again.',
} as const

function HeirCard({ item, wallet }: { item: HeirItem; wallet: LegacyWalletPort | null }) {
  const push = useToasts((state) => state.push)
  const [content, setContent] = useState<LegacyContent | undefined>()
  const [problem, setProblem] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [swept, setSwept] = useState<bigint | undefined>()
  const have = shareCount(item)
  const enough = have >= item.threshold

  async function open() {
    setBusy(true)
    setProblem(undefined)
    const result = await openGuarded(item)
    setBusy(false)
    if (result.ok) setContent(result.content)
    else setProblem(OPEN_ERRORS[result.reason])
  }

  async function sweep(seed: string, birthday?: number) {
    if (wallet === null) return
    setBusy(true)
    const result = await sweepGift(wallet, seed, birthday)
    setBusy(false)
    if (result.ok) {
      setSwept(result.sweptZat)
      push('success', 'The gift was moved into your wallet.')
    } else setProblem(SWEEP_ERRORS[result.reason])
  }

  if (content !== undefined) {
    return (
      <li className="space-y-4 rounded-card border border-line bg-surface p-5">
        <h3 className="text-lg">A letter for you</h3>
        <p className="whitespace-pre-wrap break-words">{content.letter}</p>
        {content.giftSeed !== undefined && (
          <div className="space-y-2 rounded-control border border-line p-4">
            {swept === undefined ? (
              <>
                <p>This letter came with a gift of ZEC.</p>
                <Button
                  busy={busy}
                  disabled={wallet === null}
                  onClick={() => {
                    void sweep(content.giftSeed ?? '', content.giftBirthday)
                  }}
                >
                  Move the gift into my wallet
                </Button>
              </>
            ) : (
              <p role="status">
                Moved {formatZec(swept)} ZEC into your wallet, after the network fee.
              </p>
            )}
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
      </li>
    )
  }

  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-5">
      <h3 className="text-lg">A sealed letter is waiting</h3>
      <p>
        Waiting for guardians ({String(have)} of {String(item.threshold)} shares)
      </p>
      <progress
        value={Math.min(have, item.threshold)}
        max={item.threshold}
        className="h-3 w-full accent-seal"
      >
        {have} of {item.threshold}
      </progress>
      <p className="text-sm text-muted">
        It opens only when {String(item.threshold)} of its {String(item.total)} guardians release
        their shares.
      </p>
      <Button
        busy={busy}
        disabled={!enough}
        onClick={() => {
          void open()
        }}
      >
        Open letter
      </Button>
      {problem !== undefined && (
        <p
          role="alert"
          className="rounded-control border border-warn bg-warn-soft px-4 py-3 text-sm"
        >
          {problem}
        </p>
      )}
    </li>
  )
}

export function HeirPanel({ wallet }: { wallet: LegacyWalletPort | null }) {
  const heirs = useSilent((state) => state.heirs)
  if (heirs.length === 0) {
    return (
      <EmptyState title="Nothing waiting for you">
        Letters left to you appear here after you check for messages.
      </EmptyState>
    )
  }
  return (
    <ul className="space-y-4">
      {heirs.map((item) => (
        <HeirCard key={item.bundleIdHex} item={item} wallet={wallet} />
      ))}
    </ul>
  )
}
