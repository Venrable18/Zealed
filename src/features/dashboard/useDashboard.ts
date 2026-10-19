import { useEffect, useState } from 'react'
import { batchWindow } from '../blindpot/batching.ts'
import { buildHostView } from '../blindpot/hostView.ts'
import { usePots } from '../blindpot/potStore.ts'
import type { HostView } from '../blindpot/types.ts'
import { usePotWallet } from '../blindpot/walletPort.ts'
import { useLegacy } from '../legacy/stores.ts'
import { useSilent } from '../legacy/silent/stores.ts'
import { useNow } from '../legacy/silent/useNow.ts'
import { useSentMessages, useUnsigned } from '../unsigned/stores.ts'
import { computeDashboard, type DashboardStats } from './stats.ts'
import { useDashboardWallet } from './walletPort.ts'

export type LoadState = 'unavailable' | 'loading' | 'ready' | 'error'

export interface DashboardData {
  stats: DashboardStats
  balance: LoadState
  pots: LoadState
  refresh: () => void
}

/**
 * Gathers what the dashboard shows from data already on this device. It reads the app's own stores
 * and the wallet's local data (balance, pot totals as of the last batch). It makes no network
 * requests: nothing here calls the network, and a test checks that.
 */
export function useDashboard(): DashboardData {
  const now = useNow()
  const dashboardWallet = useDashboardWallet()
  const potWallet = usePotWallet()
  const pots = usePots((s) => s.pots)
  const { sent: legacySent, inbox: legacyInbox } = useLegacy()
  const { owned, guardians, heirs } = useSilent()
  const { card, messages } = useUnsigned()
  const sentMessages = useSentMessages((s) => s.sent)

  const [balance, setBalance] = useState<{ spendableZat: bigint; pendingZat: bigint } | null>(null)
  const [balanceState, setBalanceState] = useState<LoadState>(
    dashboardWallet === null ? 'unavailable' : 'loading',
  )
  const [views, setViews] = useState<Record<string, HostView>>({})
  const [potsState, setPotsState] = useState<LoadState>(
    potWallet === null ? 'unavailable' : 'loading',
  )
  const [refreshes, setRefreshes] = useState(0)

  useEffect(() => {
    if (dashboardWallet === null) return
    let cancelled = false
    dashboardWallet.balance().then(
      (value) => {
        if (cancelled) return
        setBalance(value)
        setBalanceState('ready')
      },
      () => {
        if (!cancelled) setBalanceState('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [dashboardWallet, refreshes])

  // A pot's total only changes at its batch boundaries, so reload when any boundary passes.
  const boundaryKey = pots
    .map((pot) => batchWindow(now, pot.createdAtMs, pot.batchIntervalMs).lastMs)
    .join(',')
  useEffect(() => {
    if (potWallet === null) return
    let cancelled = false
    void Promise.all(
      pots.map(async (pot) => [pot.id, await buildHostView(potWallet, pot, Date.now())] as const),
    ).then(
      (entries) => {
        if (cancelled) return
        setViews(Object.fromEntries(entries))
        setPotsState('ready')
      },
      () => {
        if (!cancelled) setPotsState('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [potWallet, pots, boundaryKey, refreshes])

  const stats = computeDashboard({
    nowMs: now,
    balance: balanceState === 'ready' ? balance : null,
    pots,
    potViews: potsState === 'ready' ? views : {},
    legacySent,
    legacyInbox,
    owned,
    guardians,
    heirs,
    card,
    messages,
    sentMessages,
  })

  return {
    stats,
    balance: balanceState,
    pots: pots.length === 0 && potsState === 'loading' ? 'ready' : potsState,
    refresh: () => {
      setRefreshes((n) => n + 1)
    },
  }
}
