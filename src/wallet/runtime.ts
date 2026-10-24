import { useEffect } from 'react'
import { create } from 'zustand'
import { useSettings } from '../app/settingsStore.ts'
import { useVaultStatus } from '../storage/vaultState.ts'
import { CONFIRMATIONS_TRUSTED, CONFIRMATIONS_UNTRUSTED } from './constants.ts'
import { loadWasm } from './loadWasm.ts'
import { RealWallet } from './realWallet.ts'
import { useWalletData } from './walletData.ts'

export type WalletStatus = 'none' | 'opening' | 'ready' | 'error'

interface WalletRuntime {
  status: WalletStatus
  wallet: RealWallet | null
  /** True while the wallet is catching up with the chain. */
  syncing: boolean
  /** When the last sync finished (Unix ms), or null. */
  syncedAt: number | null
  /** Set when opening or syncing fails; shown without details. */
  problem: 'open' | 'sync' | null
  /** The library's own words for the last failure, for the person who has to report it. */
  detail: string | null
}

export const useWalletRuntime = create<WalletRuntime>()(() => ({
  status: 'none',
  wallet: null,
  syncing: false,
  syncedAt: null,
  problem: null,
  detail: null,
}))

let opening = false

function describe(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300)
  return typeof error === 'string' ? error.slice(0, 300) : 'unknown error'
}

/** Opens the wallet once the vault is unlocked and a seed is known; closes it when the seed is gone (lock, wipe). */
async function open(): Promise<void> {
  if (opening || useWalletRuntime.getState().wallet !== null) return
  opening = true
  useWalletRuntime.setState({ status: 'opening', problem: null })
  try {
    const wasm = await loadWasm()
    const wallet = await RealWallet.open(wasm, useSettings.getState().endpointUrl, [
      CONFIRMATIONS_TRUSTED,
      CONFIRMATIONS_UNTRUSTED,
    ])
    if (useWalletData.getState().seed === null) {
      // The app locked while the wallet was opening.
      wallet.dispose()
      useWalletRuntime.setState({ status: 'none', wallet: null })
      return
    }
    useWalletRuntime.setState({ status: 'ready', wallet })
    void syncNow()
  } catch (error) {
    useWalletRuntime.setState({ status: 'error', problem: 'open', detail: describe(error) })
  } finally {
    opening = false
  }
}

function close(): void {
  const { wallet } = useWalletRuntime.getState()
  wallet?.dispose()
  useWalletRuntime.setState({
    status: 'none',
    wallet: null,
    syncing: false,
    syncedAt: null,
    problem: null,
    detail: null,
  })
}

/** Catches the wallet up with the chain. Does nothing if it is already doing so. */
export async function syncNow(): Promise<void> {
  const { wallet, syncing } = useWalletRuntime.getState()
  if (wallet === null || syncing) return
  useWalletRuntime.setState({ syncing: true })
  try {
    await wallet.sync()
    useWalletRuntime.setState({ syncedAt: Date.now(), problem: null, detail: null })
  } catch (error) {
    useWalletRuntime.setState({ problem: 'sync', detail: describe(error) })
  } finally {
    useWalletRuntime.setState({ syncing: false })
  }
}

const SYNC_EVERY_MS = 30_000

/** Keeps the wallet open while it should be, and in sync. Mount once, in the app's layout. */
export function useWalletBoot(): void {
  const vault = useVaultStatus((state) => state.status)
  const hasSeed = useWalletData((state) => state.seed !== null)
  const ready = useWalletRuntime((state) => state.status === 'ready')

  useEffect(() => {
    if (hasSeed && vault === 'unlocked') void open()
    else if (useWalletRuntime.getState().wallet !== null) close()
  }, [hasSeed, vault])

  useEffect(() => {
    if (!ready) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow()
    }, SYNC_EVERY_MS)
    return () => {
      clearInterval(timer)
    }
  }, [ready])
}
