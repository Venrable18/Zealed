import { BubbleIcon } from '../../components/Icons.tsx'
import { CreateCardForm } from '../../features/unsigned/CreateCardForm.tsx'
import { InboxPanel } from '../../features/unsigned/InboxPanel.tsx'
import { createCard } from '../../features/unsigned/service.ts'
import { VerifyReceipt } from '../../features/unsigned/VerifyReceipt.tsx'
import { ShareCard } from '../../features/unsigned/ShareCard.tsx'
import { useUnsigned } from '../../features/unsigned/stores.ts'
import { useUnsignedWallet } from '../../features/unsigned/walletPort.ts'

export function Unsigned() {
  const wallet = useUnsignedWallet()
  const card = useUnsigned((state) => state.card)
  const setCard = useUnsigned((state) => state.setCard)
  const messages = useUnsigned((state) => state.messages)

  return (
    <div className="space-y-12 py-10">
      <div>
        <div className="flex items-center gap-3 text-seal">
          <BubbleIcon width={32} height={32} />
          <h1 className="text-3xl text-ink">Unsigned</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          An anonymous contact line. People send you a message with a payment, and you never learn
          who they are. The payment keeps spam out.
        </p>
      </div>

      {wallet === null && (
        <p role="status" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          The wallet is still being built, so cards cannot be created and messages cannot arrive
          yet. You can fill in the form to see how it works.
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-xl">
          {card === null ? 'Create a contact card' : 'Replace your contact card'}
        </h2>
        {card !== null && (
          <p className="text-sm text-muted">
            A new card gets its own address and an empty inbox. The old card’s link keeps working.
          </p>
        )}
        <CreateCardForm
          onSubmit={async (input) => {
            const result = await createCard(wallet, input)
            if (result.ok) setCard(result.card)
            return result
          }}
        />
      </section>

      {card !== null && (
        <>
          <section className="space-y-4">
            <h2 className="text-xl">Your card</h2>
            <ShareCard card={card} />
          </section>
          <section className="space-y-4">
            <h2 className="text-xl">Inbox</h2>
            <InboxPanel card={card} wallet={wallet} />
          </section>
          <section className="space-y-4">
            <h2 className="text-xl">Verify a receipt</h2>
            <VerifyReceipt messages={messages} />
          </section>
        </>
      )}
    </div>
  )
}
