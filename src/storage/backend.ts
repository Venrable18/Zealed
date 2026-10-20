/** What the vault stores besides the encrypted records: how to derive the key and check the passphrase. */
export interface VaultMeta {
  version: 1
  salt: Uint8Array
  iterations: number
  /** A known text encrypted with the key. Decrypting it proves the passphrase is right. */
  verifier: Uint8Array
}

/**
 * Where the vault keeps its bytes. Everything it stores is ciphertext, except `meta` (a salt, an
 * iteration count and a verifier), which reveals nothing about the passphrase or the data.
 */
export interface VaultBackend {
  getMeta(): Promise<VaultMeta | undefined>
  putMeta(meta: VaultMeta): Promise<void>
  getRecord(name: string): Promise<Uint8Array | undefined>
  getAllRecords(): Promise<[string, Uint8Array][]>
  putRecord(name: string, data: Uint8Array): Promise<void>
  deleteRecord(name: string): Promise<void>
  /** Replaces the meta and every record in one step, so a passphrase change cannot be half done. */
  replaceAll(meta: VaultMeta, records: [string, Uint8Array][]): Promise<void>
  clear(): Promise<void>
  /** Releases the connection, so the database itself can be deleted. */
  close(): Promise<void>
}

/** For tests and for browsers with no IndexedDB. Keeps everything in memory. */
export function createMemoryBackend(): VaultBackend & {
  readonly records: Map<string, Uint8Array>
} {
  let meta: VaultMeta | undefined
  const records = new Map<string, Uint8Array>()
  return {
    records,
    getMeta: () => Promise.resolve(meta),
    putMeta: (next) => {
      meta = next
      return Promise.resolve()
    },
    getRecord: (name) => Promise.resolve(records.get(name)),
    getAllRecords: () => Promise.resolve([...records.entries()]),
    putRecord: (name, data) => {
      records.set(name, data)
      return Promise.resolve()
    },
    deleteRecord: (name) => {
      records.delete(name)
      return Promise.resolve()
    },
    replaceAll: (nextMeta, next) => {
      meta = nextMeta
      records.clear()
      for (const [name, data] of next) records.set(name, data)
      return Promise.resolve()
    },
    clear: () => {
      meta = undefined
      records.clear()
      return Promise.resolve()
    },
    close: () => Promise.resolve(),
  }
}

const DB_NAME = 'zealed-vault'
const META = 'meta'
const RECORDS = 'records'
const META_KEY = 'meta'

/** Waits for a request. IndexedDB values are untyped, so the caller says what it stored. */
function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result as T)
    }
    req.onerror = () => {
      reject(new Error('storage request failed', { cause: req.error }))
    }
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(new Error('storage transaction failed', { cause: tx.error }))
    }
    tx.onabort = () => {
      reject(new Error('storage transaction aborted', { cause: tx.error }))
    }
  })
}

/** The browser's IndexedDB. Throws if it is not available (some private-browsing modes). */
export function createIndexedDbBackend(factory: IDBFactory = indexedDB): VaultBackend {
  let opened: Promise<IDBDatabase> | undefined
  const open = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(META)
        req.result.createObjectStore(RECORDS)
      }
      req.onsuccess = () => {
        resolve(req.result)
      }
      req.onerror = () => {
        reject(new Error('storage is not available', { cause: req.error }))
      }
      req.onblocked = () => {
        reject(new Error('storage is blocked'))
      }
    })
    return opened
  }
  /**
   * Whether the database exists, without creating it. Opening a database that is not there would
   * make an empty one, leaving a trace even when nothing is saved. Where the browser cannot list
   * databases this assumes it may exist.
   */
  const mayExist = async (): Promise<boolean> => {
    if (opened !== undefined || typeof factory.databases !== 'function') return true
    return (await factory.databases()).some((database) => database.name === DB_NAME)
  }
  const store = async (name: string, mode: IDBTransactionMode) => {
    const tx = (await open()).transaction(name, mode)
    return { tx, store: tx.objectStore(name) }
  }
  return {
    getMeta: async () => {
      if (!(await mayExist())) return undefined
      return request<VaultMeta | undefined>((await store(META, 'readonly')).store.get(META_KEY))
    },
    putMeta: async (meta) => {
      const { tx, store: s } = await store(META, 'readwrite')
      s.put(meta, META_KEY)
      await done(tx)
    },
    getRecord: async (name) =>
      request<Uint8Array | undefined>((await store(RECORDS, 'readonly')).store.get(name)),
    getAllRecords: async () => {
      const { store: s } = await store(RECORDS, 'readonly')
      const [keys, values] = await Promise.all([
        request<IDBValidKey[]>(s.getAllKeys()),
        request<Uint8Array[]>(s.getAll()),
      ])
      return keys.map((key, i): [string, Uint8Array] => [
        typeof key === 'string' ? key : '',
        values[i] ?? new Uint8Array(0),
      ])
    },
    putRecord: async (name, data) => {
      const { tx, store: s } = await store(RECORDS, 'readwrite')
      s.put(data, name)
      await done(tx)
    },
    deleteRecord: async (name) => {
      const { tx, store: s } = await store(RECORDS, 'readwrite')
      s.delete(name)
      await done(tx)
    },
    replaceAll: async (meta, records) => {
      const tx = (await open()).transaction([META, RECORDS], 'readwrite')
      tx.objectStore(META).put(meta, META_KEY)
      const recordStore = tx.objectStore(RECORDS)
      recordStore.clear()
      for (const [name, data] of records) recordStore.put(data, name)
      await done(tx)
    },
    clear: async () => {
      const tx = (await open()).transaction([META, RECORDS], 'readwrite')
      tx.objectStore(META).clear()
      tx.objectStore(RECORDS).clear()
      await done(tx)
    },
    close: async () => {
      if (opened === undefined) return
      const db = await opened
      opened = undefined
      db.close()
    },
  }
}
