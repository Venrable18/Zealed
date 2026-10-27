import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
import { Link } from 'react-router'
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
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-seal text-seal-ink">
            <LetterIcon width={26} height={26} />
          </span>
          <h1 className="text-4xl text-ink">Legacy</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          Seal a letter, and funds if you like, for someone. It opens on the date you choose, and
          not before, even if everyone wanted to.
        </p>
      </div>

      {wallet === null && <NoWalletNotice to="to seal, send and receive letters" />}

      <p>
        <Link to="/legacy/silent" className="underline underline-offset-4">
          Or seal a letter that opens only if you go silent, with guardians
        </Link>
      </p>

      <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] xl:gap-16">
        <div className="min-w-0 space-y-12">
          <section className="space-y-4">
            <h2 className="text-xl">Seal a letter</h2>
            <ComposeLetter
              wallet={wallet}
              defaultUnlockDelayMs={defaultUnlockDelayMs}
              demoMode={demoMode}
            />
          </section>
        </div>
        <div className="min-w-0 space-y-12">
          <section className="space-y-4">
            <h2 className="text-xl">Sealed for you</h2>
            <InboxList wallet={wallet} />
          </section>

          <section className="space-y-4">
            <h2 className="text-xl">Sent</h2>
            <SentList wallet={wallet} />
          </section>
        </div>
      </div>
    </div>
  )
}
