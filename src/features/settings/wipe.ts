import { useSettings } from '../../app/settingsStore.ts'
import { useToasts } from '../../components/toastStore.ts'
import { resetSensitiveData } from '../../storage/persistence.ts'

/** Empties every in-memory store the app keeps, and puts the saved settings back to their defaults. */
export function resetAllStores(): void {
  resetSensitiveData()
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
  /** Empties the encrypted vault first, so its database is not held open (and blocked) when deleted. */
  wipeVault?: (() => Promise<void>) | undefined
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
  if (deps.wipeVault !== undefined) await deps.wipeVault()
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
