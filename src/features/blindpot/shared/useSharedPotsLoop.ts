import { useEffect } from 'react'
import { useWalletRuntime } from '../../../wallet/runtime.ts'
import { newPot, type PotInput } from '../pot.ts'
import { usePots } from '../potStore.ts'
import { tick } from './engine.ts'
import { runShared, useSharedPots } from './store.ts'

/** How often to look for messages when nothing is happening, and while a pot or a withdrawal is waiting on others. */
const IDLE_MS = 20_000
const BUSY_MS = 8_000

/** True while some pot is being set up, or a withdrawal is waiting on a co-host. */
function somethingPending(): boolean {
  return useSharedPots
    .getState()
    .state.pots.some(
      (pot) =>
        pot.status === 'invited' ||
        pot.status === 'keygen' ||
        pot.withdrawals.some((w) => ['pending', 'approved', 'signing'].includes(w.status)),
    )
}

/** When the host's shared pot has its key, it becomes an ordinary pot with a link to share. */
function promoteReadyPots(): void {
  const { pots, add } = usePots.getState()
  for (const shared of useSharedPots.getState().state.pots) {
    if (shared.role !== 'host' || shared.status !== 'ready' || shared.address === undefined)
      continue
    if (pots.some((p) => p.sharedId === shared.id)) continue
    const details = shared.details ?? {}
    const input = details['input'] as PotInput | undefined
    const batchIntervalMs = details['batchIntervalMs']
    if (input === undefined || typeof batchIntervalMs !== 'number') continue
    add({
      ...newPot(
        input,
        { accountId: shared.accountId ?? '', address: shared.address },
        { nowMs: shared.createdAtMs, batchIntervalMs },
      ),
      sharedId: shared.id,
    })
  }
}

/** Keeps shared pots moving while a wallet is open: reads co-hosts' messages and sends ours. */
export function useSharedPotsLoop(): void {
  const wallet = useWalletRuntime((state) => state.wallet)
  useEffect(() => {
    if (wallet === null) return
    let stopped = false
    const pass = () => {
      if (stopped || document.visibilityState !== 'visible') return
      void runShared((state) => tick(wallet, state, Date.now())).then(
        promoteReadyPots,
        () => undefined,
      )
    }
    // Look more often while others are being waited for, so each step is noticed sooner.
    let timer: ReturnType<typeof setTimeout>
    const loop = () => {
      pass()
      timer = setTimeout(loop, somethingPending() ? BUSY_MS : IDLE_MS)
    }
    loop()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [wallet])
}
