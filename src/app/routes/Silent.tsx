import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { LetterIcon } from '../../components/Icons.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { getTimers } from '../../config/demo.ts'
import { GuardianPanel } from '../../features/legacy/silent/GuardianPanel.tsx'
import { HeirPanel } from '../../features/legacy/silent/HeirPanel.tsx'
import { checkIncoming } from '../../features/legacy/silent/incoming.ts'
import { OwnerPanel } from '../../features/legacy/silent/OwnerPanel.tsx'
import { SetupSilent } from '../../features/legacy/silent/SetupSilent.tsx'
import { useSilent } from '../../features/legacy/silent/stores.ts'
import { currentTime } from '../../features/legacy/silent/useNow.ts'
import { useLegacyWallet } from '../../features/legacy/walletPort.ts'
import { useSettings } from '../settingsStore.ts'

export function Silent() {
  const wallet = useLegacyWallet()
  const demoMode = useSettings((state) => state.demoMode)
  const { checkInPeriodMs, gracePeriodMs } = getTimers(demoMode)
  const push = useToasts((state) => state.push)
  const [checking, setChecking] = useState(false)

  async function check() {
    if (wallet === null) return
    setChecking(true)
    try {
      const state = useSilent.getState()
      const result = await checkIncoming(wallet, state, currentTime())
      state.setOwned(result.owned)
      state.setGuardians(result.guardians)
      state.setHeirs(result.heirs)
      push('info', 'Checked for messages.')
    } catch {
      push('error', 'Could not check for messages. Try again.')
    }
    setChecking(false)
  }

  return (
    <div className="space-y-12 py-10">
      <div>
        <p className="text-sm">
          <Link to="/legacy" className="underline underline-offset-4">
            Legacy
          </Link>
        </p>
        <div className="mt-2 flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-seal text-seal-ink">
            <LetterIcon width={26} height={26} />
          </span>
          <h1 className="text-4xl text-ink">If I go silent</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          A letter for your heir that opens only if you stop checking in. Trusted guardians each
          hold part of the key. Early opening needs your heir and enough guardians to act together.
        </p>
      </div>

      {wallet === null && <NoWalletNotice to="to seal and send a letter" />}

      <div>
        <Button
          variant="secondary"
          busy={checking}
          disabled={wallet === null}
          onClick={() => {
            void check()
          }}
        >
          Check for messages
        </Button>
      </div>

      <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] xl:gap-16">
        <div className="min-w-0 space-y-12">
          <section className="space-y-4">
            <h2 className="text-xl">Set up a letter</h2>
            <SetupSilent
              wallet={wallet}
              defaultPeriodMs={checkInPeriodMs}
              defaultGraceMs={gracePeriodMs}
            />
          </section>
        </div>
        <div className="min-w-0 space-y-12">
          <section className="space-y-4">
            <h2 className="text-xl">Your letters</h2>
            <OwnerPanel wallet={wallet} />
          </section>

          <section className="space-y-4">
            <h2 className="text-xl">People you guard</h2>
            <p className="max-w-prose text-sm text-muted">
              Guardians act only when Zealed is open. Browsers cannot run it in the background, so
              open it now and then.
            </p>
            <GuardianPanel wallet={wallet} autoRelease={demoMode} />
          </section>

          <section className="space-y-4">
            <h2 className="text-xl">Waiting for you</h2>
            <HeirPanel wallet={wallet} />
          </section>
        </div>
      </div>
    </div>
  )
}
