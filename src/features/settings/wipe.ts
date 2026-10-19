import { useSettings } from '../../app/settingsStore.ts'
import { useToasts } from '../../components/toastStore.ts'
import { memoryContributionStore } from '../blindpot/contributionStore.ts'
import { usePots } from '../blindpot/potStore.ts'
import { useSilent } from '../legacy/silent/stores.ts'
import { useLegacy } from '../legacy/stores.ts'
import { useSentMessages, useUnsigned } from '../unsigned/stores.ts'

/** Empties every in-memory store the app keeps. */
export function resetAllStores(): void {
  usePots.setState({ pots: [] })
  memoryContributionStore.clearAll()
  useLegacy.setState({ sent: [], inbox: [] })
  useSilent.setState({ owned: [], guardians: [], heirs: [] })
  useUnsigned.setState({ card: null, messages: [], repliedIds: [] })
  useSentMessages.setState({ sent: [] })
  useToasts.setState({ toasts: [] })
  const settings = useSettings.getState()
  settings.setDemoMode(false)
  settings.setTheme('system')
}

export interface WipeDeps {
  localStorage: Pick<Storage, 'clear'>
  sessionStorage: Pick<Storage, 'clear'>
  /** Absent in browsers that cannot list databases; those cannot be enumerated and are reported. */
  indexedDB?: Pick<IDBFactory, 'databases' | 'deleteDatabase'> | undefined
  resetStores: () => void
}

export interface WipeResult {
  databasesDeleted: number
  /** True if the browser could not list databases, so some may remain. */
  databasesUnknown: boolean
}

function deleteDatabase(factory: Pick<IDBFactory, 'deleteDatabase'>, name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = factory.deleteDatabase(name)
    // A blocked or failed deletion is not fatal: the page reloads and the database is released.
    request.onsuccess = () => {
      resolve()
    }
    request.onerror = () => {
      resolve()
    }
    request.onblocked = () => {
      resolve()
    }
  })
}

/**
 * Removes everything Zealed keeps on this device: in-memory data, saved settings, session data and
 * every IndexedDB database (where the encrypted wallet will live). The caller reloads the page after.
 */
export async function wipeLocalData(deps: WipeDeps): Promise<WipeResult> {
  deps.resetStores()
  let databasesDeleted = 0
  let databasesUnknown = false
  if (deps.indexedDB === undefined || typeof deps.indexedDB.databases !== 'function')
    databasesUnknown = true
  else {
    for (const database of await deps.indexedDB.databases()) {
      if (database.name === undefined) continue
      await deleteDatabase(deps.indexedDB, database.name)
      databasesDeleted++
    }
  }
  // Last, so nothing written while resetting survives.
  deps.localStorage.clear()
  deps.sessionStorage.clear()
  return { databasesDeleted, databasesUnknown }
}
