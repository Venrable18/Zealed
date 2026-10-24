import { NoWalletNotice } from '../../components/NoWalletNotice.tsx'
import { Link, useNavigate } from 'react-router'
import { EmptyState } from '../../components/EmptyState.tsx'
import { PotIcon } from '../../components/Icons.tsx'
import { CreatePotForm } from '../../features/blindpot/CreatePotForm.tsx'
import { usePots } from '../../features/blindpot/potStore.ts'
import { createPot } from '../../features/blindpot/service.ts'
import { usePotWallet } from '../../features/blindpot/walletPort.ts'
import { getTimers } from '../../config/demo.ts'
import { useSettings } from '../settingsStore.ts'

export function BlindPot() {
  const wallet = usePotWallet()
  const demoMode = useSettings((state) => state.demoMode)
  const pots = usePots((state) => state.pots)
  const addPot = usePots((state) => state.add)
  const navigate = useNavigate()
  const { potBatchIntervalMs } = getTimers(demoMode)

  return (
    <div className="space-y-10 py-10">
      <div>
        <div className="flex items-center gap-3 text-seal">
          <PotIcon width={32} height={32} />
          <h1 className="text-3xl text-ink">Blind Pot</h1>
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
              onCreated={(pot) => {
                addPot(pot)
                void navigate(`/blind-pot/${pot.id}`)
              }}
            />
          </section>
        </div>
        <div className="min-w-0 space-y-12">
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
