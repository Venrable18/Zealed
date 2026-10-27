import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
import { Link, useLocation } from 'react-router'
import { BubbleIcon } from '../../components/Icons.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { readCardFromHash } from '../../features/unsigned/cardLink.ts'
import { PrivacyGuidance } from '../../features/unsigned/PrivacyGuidance.tsx'
import { SendForm } from '../../features/unsigned/SendForm.tsx'
import { SentMessages } from '../../features/unsigned/SentMessages.tsx'
import { useUnsignedWallet } from '../../features/unsigned/walletPort.ts'
import { formatZec } from '../../lib/zec.ts'

/** The page a contact card link opens. The card is read from the URL fragment, which servers never see. */
export function Send() {
  const { hash } = useLocation()
  const wallet = useUnsignedWallet()
  const card = readCardFromHash(hash)

  if (card === null) {
    return (
      <div className="py-10">
        <EmptyState
          title="This link does not look right"
          action={
            <Link to="/app" className="underline underline-offset-4">
              Back to home
            </Link>
          }
        >
          Ask for the contact link again, and make sure the whole link was copied.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-10 py-10">
      <div>
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-seal text-seal-ink">
            <BubbleIcon width={26} height={26} />
          </span>
          <h1 className="text-4xl text-ink">{card.name}</h1>
        </div>
        {card.bio !== '' && (
          <p className="mt-3 max-w-prose whitespace-pre-wrap break-words text-muted">{card.bio}</p>
        )}
        <p className="mt-3 text-sm">
          Messages need a payment of at least{' '}
          <span className="font-medium">{formatZec(card.minimumZat)} ZEC</span>.{' '}
          {card.acceptsReplies ? 'They may reply.' : 'They do not accept replies.'}
        </p>
      </div>

      {wallet === null && <NoWalletNotice to="to send a message" />}

      <PrivacyGuidance />

      <section className="space-y-4">
        <h2 className="text-xl">Write a message</h2>
        <SendForm card={card} wallet={wallet} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl">Sent from this device</h2>
        <SentMessages wallet={wallet} />
      </section>
    </div>
  )
}
