import { useState } from 'react'
import { trackWork } from '../../storage/inflight.ts'
import type { ChainClient } from 'tlock-js'
import { Button } from '../../components/Button.tsx'
import { CountdownTimer } from '../../components/CountdownTimer.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { useToasts } from '../../components/toastStore.ts'
import type { LegacyContent } from '../../crypto/bundle.ts'
import { formatZec } from '../../lib/zec.ts'
import { formatDateTime } from './format.ts'
import { findSealedLetters, openLetter, sweepGift } from './inbox.ts'
import { useLegacy } from './stores.ts'
import type { InboxItem } from './types.ts'
import type { LegacyWalletPort } from './walletPort.ts'

function currentTime(): number {
  return Date.now()
}

const OPEN_ERRORS = {
  'not-yet': 'It is not time yet.',
  unavailable:
    'The key could not be fetched from the drand network. Check your connection and try again.',
  damaged: 'This letter is damaged and cannot be opened.',
} as const

const SWEEP_ERRORS = {
  'nothing-to-sweep': 'There is nothing left to move. The gift may already have been collected.',
  'not-ready': 'The gift is not ready to move yet. Wait a moment and try again.',
  failed: 'The funds could not be moved. Try again.',
} as const

function InboxCard({
  item,
  wallet,
  client,
}: {
  item: InboxItem
  wallet: LegacyWalletPort | null
  client?: ChainClient
}) {
  const push = useToasts((state) => state.push)
  const [ready, setReady] = useState(() => currentTime() >= item.unlockMs)
  const [content, setContent] = useState<LegacyContent | undefined>()
  const [problem, setProblem] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [swept, setSwept] = useState<bigint | undefined>()

  async function open() {
    setBusy(true)
    setProblem(undefined)
    const result = await openLetter(item, client === undefined ? {} : { client })
    setBusy(false)
    if (result.ok) setContent(result.content)
    else setProblem(OPEN_ERRORS[result.reason])
  }

  async function sweep(seed: string, birthday?: number) {
    if (wallet === null) return
    setBusy(true)
    const result = await trackWork(() => sweepGift(wallet, seed, birthday))
    setBusy(false)
    if (result.ok) {
      setSwept(result.sweptZat)
      push('success', 'The gift was moved into your wallet.')
    } else setProblem(SWEEP_ERRORS[result.reason])
  }

  if (content !== undefined) {
    return (
      <li className="space-y-4 rounded-card border border-line bg-surface p-5">
        <h3 className="text-lg">Your letter</h3>
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
      <h3 className="text-lg">Sealed until {formatDateTime(item.unlockMs)}</h3>
      {ready ? (
        <p>It is time. You can open it now.</p>
      ) : (
        <div>
          <p className="text-sm text-muted">It cannot be opened before then, by anyone.</p>
          <CountdownTimer
            targetMs={item.unlockMs}
            doneLabel="It is time."
            onDone={() => {
              setReady(true)
            }}
          />
        </div>
      )}
      <Button
        disabled={!ready}
        busy={busy}
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

export function InboxList({
  wallet,
  client,
}: {
  wallet: LegacyWalletPort | null
  client?: ChainClient
}) {
  const inbox = useLegacy((state) => state.inbox)
  const addInbox = useLegacy((state) => state.addInbox)
  const push = useToasts((state) => state.push)
  const [checking, setChecking] = useState(false)

  async function check() {
    if (wallet === null) return
    setChecking(true)
    try {
      const found = await findSealedLetters(await wallet.receivedMemos(), currentTime())
      addInbox(found)
      push('info', found.length === 0 ? 'No sealed letters found.' : 'Checked for sealed letters.')
    } catch {
      push('error', 'Could not check for letters. Try again.')
    }
    setChecking(false)
  }

  return (
    <div className="space-y-4">
      <Button
        variant="secondary"
        busy={checking}
        disabled={wallet === null}
        onClick={() => {
          void check()
        }}
      >
        Check for sealed letters
      </Button>
      {inbox.length === 0 ? (
        <EmptyState title="No sealed letters">
          Letters sealed for you appear here, locked until their date.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {inbox.map((item) => (
            <InboxCard
              key={item.bundleIdHex}
              item={item}
              wallet={wallet}
              {...(client === undefined ? {} : { client })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
