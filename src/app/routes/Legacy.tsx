import { getTimers } from '../../config/demo.ts'
import { LetterIcon } from '../../components/Icons.tsx'
import { ComposeLetter } from '../../features/legacy/ComposeLetter.tsx'
import { InboxList } from '../../features/legacy/InboxList.tsx'
import { SentList } from '../../features/legacy/SentList.tsx'
import { useLegacyWallet } from '../../features/legacy/walletPort.ts'
import { useSettings } from '../settingsStore.ts'

export function Legacy() {
  const wallet = useLegacyWallet()
  const demoMode = useSettings((state) => state.demoMode)
  const { defaultUnlockDelayMs } = getTimers(demoMode)

  return (
    <div className="space-y-12 py-10">
      <div>
        <div className="flex items-center gap-3 text-seal">
          <LetterIcon width={32} height={32} />
          <h1 className="text-3xl text-ink">Legacy</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          Seal a letter, and funds if you like, for someone. It opens on the date you choose, and
          not before, even if everyone wanted to.
        </p>
      </div>

      {wallet === null && (
        <p role="status" className="rounded-control border border-warn bg-warn-soft px-4 py-3">
          The wallet is still being built, so letters cannot be sent or received yet. You can fill
          in the form to see how it works.
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-xl">Seal a letter</h2>
        <ComposeLetter
          wallet={wallet}
          defaultUnlockDelayMs={defaultUnlockDelayMs}
          demoMode={demoMode}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl">Sealed for you</h2>
        <InboxList wallet={wallet} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl">Sent</h2>
        <SentList wallet={wallet} />
      </section>
    </div>
  )
}
