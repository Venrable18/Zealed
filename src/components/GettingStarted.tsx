import { Link } from 'react-router'
import { useVaultStatus } from '../storage/vaultState.ts'
import { useBalance } from '../wallet/useBalance.ts'
import { useWalletData } from '../wallet/walletData.ts'

interface Step {
  title: string
  body: string
  to: string
  action: string
  done: boolean
}

/**
 * The first run, as three steps in order: keep data on this device, set up a wallet, add test
 * money. Shows where someone is, and the one thing to do next. Hidden once all three are done.
 */
export function GettingStarted() {
  const vault = useVaultStatus((state) => state.status)
  const hasSeed = useWalletData((state) => state.seed !== null)
  const balance = useBalance()
  const funded = balance !== undefined && balance.spendableZat + balance.pendingZat > 0n

  const steps: Step[] = [
    {
      title: 'Choose a passphrase',
      body: 'Your letters, pots and wallet are kept on this device, encrypted with it.',
      to: '/settings#vault',
      action: 'Choose a passphrase',
      done: vault === 'unlocked',
    },
    {
      title: 'Set up a wallet',
      body: 'Create a new testnet wallet in this browser, or restore one from its 24 words.',
      to: '/wallet',
      action: 'Set up the wallet',
      done: hasSeed,
    },
    {
      title: 'Add test money',
      body: 'Testnet coins (TAZ) have no value. Send some to your address from a faucet.',
      to: '/receive',
      action: 'Show my address',
      done: funded,
    },
  ]
  if (steps.every((step) => step.done)) return null
  const next = steps.findIndex((step) => !step.done)

  return (
    <section
      aria-labelledby="start-title"
      className="overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="airmail-edge h-1.5" aria-hidden="true" />
      <div className="p-5 sm:p-6">
        <h2 id="start-title" className="text-xl">
          Get started
        </h2>
        <p className="mt-1 text-muted">Three steps, about two minutes, then everything works.</p>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => {
            const current = index === next
            return (
              <li
                key={step.title}
                className={`flex flex-col gap-2 rounded-control border p-4 ${
                  current ? 'border-seal bg-seal-soft' : 'border-line'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className={`flex size-6 items-center justify-center rounded-full text-xs ${
                      step.done
                        ? 'bg-good text-surface'
                        : current
                          ? 'bg-seal text-seal-ink'
                          : 'border border-line-strong text-muted'
                    }`}
                  >
                    {step.done ? '✓' : index + 1}
                  </span>
                  <span className={step.done ? 'text-muted line-through' : ''}>{step.title}</span>
                  {step.done && <span className="sr-only">(done)</span>}
                </span>
                <span className="text-sm text-muted">{step.body}</span>
                {current && (
                  <Link
                    to={step.to}
                    className="mt-auto inline-flex min-h-11 items-center justify-center rounded-control bg-seal px-4 font-medium text-seal-ink hover:bg-seal-hover"
                  >
                    {step.action}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
