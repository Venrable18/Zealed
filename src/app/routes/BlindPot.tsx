import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
import { Link, useNavigate } from 'react-router'
import { EmptyState } from '../../components/EmptyState.tsx'
import { PotIcon } from '../../components/Icons.tsx'
import { CreatePotForm } from '../../features/blindpot/CreatePotForm.tsx'
import { usePots } from '../../features/blindpot/potStore.ts'
import { createPot } from '../../features/blindpot/service.ts'
import { todayString, validatePotInput } from '../../features/blindpot/pot.ts'
import { createSharedPot } from '../../features/blindpot/shared/engine.ts'
import { SharedPotsPanel } from '../../features/blindpot/shared/SharedPotsPanel.tsx'
import { actShared, useSharedPotPort } from '../../features/blindpot/shared/store.ts'
import { usePotWallet } from '../../features/blindpot/walletPort.ts'
import { getTimers } from '../../config/demo.ts'
import { useSettings } from '../settingsStore.ts'

export function BlindPot() {
  const wallet = usePotWallet()
  const demoMode = useSettings((state) => state.demoMode)
  const pots = usePots((state) => state.pots)
  const addPot = usePots((state) => state.add)
  const navigate = useNavigate()
  const sharedPort = useSharedPotPort()
  const { potBatchIntervalMs } = getTimers(demoMode)

  return (
    <div className="space-y-10 py-10">
      <div>
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-seal text-seal-ink">
            <PotIcon width={26} height={26} />
          </span>
          <h1 className="text-4xl text-ink">Blind Pot</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          A shared gift pot. You see the total, never who gave what.
        </p>
      </div>

      {wallet === null && <NoWalletNotice to="to create a pot" />}

      <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] xl:gap-16">
        <div className="min-w-0 space-y-12">
          <section className="space-y-4">
            <h2 className="text-xl">Create a pot</h2>
            <CreatePotForm
              batchIntervalMs={potBatchIntervalMs}
              onSubmit={(input) =>
                createPot(wallet, input, { nowMs: Date.now(), batchIntervalMs: potBatchIntervalMs })
              }
              onSubmitShared={async (input, choice) => {
                const nowMs = Date.now()
                const checked = validatePotInput(input, todayString(nowMs))
                if (!checked.ok) return { errors: checked.errors }
                if (sharedPort === null)
                  return { problem: 'You need a wallet first. Set one up on the Wallet page.' }
                try {
                  await actShared(sharedPort, async (s) => {
                    const made = await createSharedPot(
                      sharedPort,
                      s,
                      {
                        name: checked.value.name,
                        cohosts: choice.cohosts,
                        threshold: choice.threshold,
                        details: { input: checked.value, batchIntervalMs: potBatchIntervalMs },
                      },
                      nowMs,
                    )
                    return made.state
                  })
                  return null
                } catch {
                  return {
                    problem:
                      'The invitations could not be sent. Check the addresses and your balance, then try again.',
                  }
                }
              }}
              onCreated={(pot) => {
                addPot(pot)
                void navigate(`/blind-pot/${pot.id}`)
              }}
            />
          </section>
        </div>
        <div className="min-w-0 space-y-12">
          <SharedPotsPanel />
          <section className="space-y-4">
            <h2 className="text-xl">Your pots</h2>
            {pots.length === 0 ? (
              <EmptyState title="No pots yet">Pots you create appear here.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {pots.map((pot) => (
                  <li key={pot.id}>
                    <Link
                      to={`/blind-pot/${pot.id}`}
                      className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 hover:border-seal"
                    >
                      <span className="font-medium">
                        {pot.cover} {pot.name}
                      </span>
                      {pot.closed && <span className="text-sm text-muted">Closed</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
