import { Link, useLocation } from 'react-router'
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
 * money. A bar at the top of every app page until all three are done: where someone is, and the
 * one thing to do next.
 */
export function GettingStarted() {
  const vault = useVaultStatus((state) => state.status)
  const hasSeed = useWalletData((state) => state.seed !== null)
  const balance = useBalance()
  const { pathname, hash } = useLocation()
  const funded = balance !== undefined && balance.spendableZat + balance.pendingZat > 0n

  const steps: Step[] = [
    {
      title: 'Passphrase',
      body: 'Choose a passphrase. Your letters, pots and wallet are kept on this device, encrypted with it.',
      to: '/settings#vault',
      action: 'Choose a passphrase',
      done: vault === 'unlocked',
    },
    {
      title: 'Wallet',
      body: 'Create a testnet wallet in this browser, or restore one from its 24 words.',
      to: '/wallet',
      action: 'Set up the wallet',
      done: hasSeed,
    },
    {
      title: 'Test money',
      body: 'Testnet coins (TAZ) have no value. Send some to your address from a faucet.',
      to: '/receive',
      action: 'Show my address',
      done: funded,
    },
  ]
  // Before the wallet has reported a balance, the last step is not known yet: say nothing.
  if (hasSeed && balance === undefined && steps[0]?.done === true) return null
  if (steps.every((step) => step.done)) return null
  const next = steps.findIndex((step) => !step.done)
  const current = steps[next]
  const here = current !== undefined && `${pathname}${hash}`.startsWith(current.to)

  return (
    <section
      aria-labelledby="start-title"
      className="mt-6 overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="airmail-edge h-1" aria-hidden="true" />
      <div className="flex flex-col gap-4 p-3 sm:p-4 xl:flex-row xl:items-center">
        <h2 id="start-title" className="sr-only">
          Get started
        </h2>
        <ol className="flex shrink-0 gap-1.5">
          {steps.map((step, index) => {
            const isCurrent = index === next
            return (
              <li
                key={step.title}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-full border px-2.5 text-sm font-semibold sm:pr-4 ${
                  isCurrent ? 'border-seal bg-seal-soft text-seal' : 'border-line text-muted'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    step.done
                      ? 'bg-good text-surface'
                      : isCurrent
                        ? 'bg-seal text-seal-ink'
                        : 'border border-line-strong'
                  }`}
                >
                  {step.done ? '✓' : index + 1}
                </span>
                <span className={isCurrent ? '' : 'hidden sm:inline'}>{step.title}</span>
                {step.done && <span className="sr-only">(done)</span>}
              </li>
            )
          })}
        </ol>
        {current !== undefined && (
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">{current.body}</p>
            {!here && (
              <Link
                to={current.to}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-seal px-5 text-sm font-semibold text-seal-ink hover:bg-seal-hover"
              >
                {current.action}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
