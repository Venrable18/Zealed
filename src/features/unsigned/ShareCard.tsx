import { Button } from '../../components/Button.tsx'
import { QrDisplay } from '../../components/QrDisplay.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { formatZec } from '../../lib/zec.ts'
import type { Card } from './card.ts'
import { cardUrl } from './cardLink.ts'

export function ShareCard({ card }: { card: Card }) {
  const push = useToasts((state) => state.push)
  const link = cardUrl(window.location.origin, card)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      push('success', 'Link copied.')
    } catch {
      push('error', 'Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-5">
        <h3 className="text-xl">{card.name}</h3>
        {card.bio !== '' && (
          <p className="mt-2 whitespace-pre-wrap break-words text-muted">{card.bio}</p>
        )}
        <p className="mt-3 text-sm">
          Minimum payment: <span className="font-medium">{formatZec(card.minimumZat)} ZEC</span>.{' '}
          {card.acceptsReplies ? 'Replies are allowed.' : 'Replies are turned off.'}
        </p>
      </div>
      <p className="text-muted">
        Share this link anywhere. The card travels inside the link itself, so no server ever sees
        it. Deleting a card from this device does not turn the link off: payments to it still reach
        you.
      </p>
      <QrDisplay value={link} label={`QR code for the contact card ${card.name}`} />
      <label className="block text-sm font-medium" htmlFor="card-link">
        Card link
      </label>
      <input
        id="card-link"
        readOnly
        value={link}
        onFocus={(event) => {
          event.target.select()
        }}
        className="block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm"
      />
      <Button
        variant="secondary"
        onClick={() => {
          void copy()
        }}
      >
        Copy link
      </Button>
    </div>
  )
}
