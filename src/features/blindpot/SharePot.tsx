import { Button } from '../../components/Button.tsx'
import { QrDisplay } from '../../components/QrDisplay.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { buildZip321, shareUrl } from './shareLink.ts'
import type { Pot } from './types.ts'

export function SharePot({ pot }: { pot: Pot }) {
  const push = useToasts((state) => state.push)
  const link = shareUrl(window.location.origin, pot)
  const zip321 = buildZip321({ address: pot.address, label: pot.name })

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      push('success', 'Link copied.')
    } catch {
      push('error', 'Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xl">Share with guests</h2>
        <p className="text-muted">
          Guests open this link in their browser. Their gift is split into standard pieces and sent
          a little at a time, so no single gift can be picked out.
        </p>
        <QrDisplay value={link} label={`QR code for the ${pot.name} pot link`} />
        <label className="block text-sm font-medium" htmlFor="pot-link">
          Pot link
        </label>
        <input
          id="pot-link"
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
            void copyLink()
          }}
        >
          Copy link
        </Button>
      </section>

      <section className="space-y-3 rounded-card border border-warn bg-warn-soft p-4">
        <h2 className="text-xl">Guests with another Zcash wallet</h2>
        <p>
          <strong>Weaker privacy.</strong> A guest who pays this way sends one payment that is not
          split, so you could tell it apart from other gifts. Prefer the pot link above.
        </p>
        <QrDisplay value={zip321} label={`Payment request QR code for the ${pot.name} pot`} />
      </section>
    </div>
  )
}
