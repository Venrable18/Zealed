import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
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
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-seal text-seal-ink">
            <BubbleIcon width={26} height={26} />
          </span>
          <h1 className="text-4xl text-ink">Unsigned</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          An anonymous contact line. People send you a message with a payment, and you never learn
          who they are. The payment keeps spam out.
        </p>
      </div>

      {wallet === null && <NoWalletNotice to="to publish a card and receive messages" />}

      {card === null ? (
        <div className="max-w-[40rem]">
          <section className="space-y-4">
            <h2 className="text-xl">Create a contact card</h2>
            <CreateCardForm
              onSubmit={async (input) => {
                const result = await createCard(wallet, input)
                if (result.ok) setCard(result.card)
                return result
              }}
            />
          </section>
        </div>
      ) : (
        <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] xl:gap-16">
          <div className="min-w-0 space-y-12">
            <section className="space-y-4">
              <h2 className="text-xl">Your card</h2>
              <ShareCard card={card} />
            </section>
            <section className="space-y-4">
              <h2 className="text-xl">Inbox</h2>
              <InboxPanel card={card} wallet={wallet} />
            </section>
          </div>
          <div className="min-w-0 space-y-12">
            <section className="space-y-4">
              <h2 className="text-xl">Verify a receipt</h2>
              <VerifyReceipt messages={messages} />
            </section>
            <section className="space-y-4">
              <h2 className="text-xl">Replace your contact card</h2>
              <p className="text-sm text-muted">
                A new card gets its own address and an empty inbox. The old card’s link keeps
                working.
              </p>
              <CreateCardForm
                onSubmit={async (input) => {
                  const result = await createCard(wallet, input)
                  if (result.ok) setCard(result.card)
                  return result
                }}
              />
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
