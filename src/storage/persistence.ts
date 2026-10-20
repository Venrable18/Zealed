import { useToasts } from '../components/toastStore.ts'
import { memoryContributionStore } from '../features/blindpot/contributionStore.ts'
import { usePots } from '../features/blindpot/potStore.ts'
import type { Pot } from '../features/blindpot/types.ts'
import { useContacts, type Contact } from '../features/contacts/contacts.ts'
import { useSilent } from '../features/legacy/silent/stores.ts'
import { useLegacy } from '../features/legacy/stores.ts'
import { useSentMessages, useUnsigned } from '../features/unsigned/stores.ts'
import type { Vault } from './vault.ts'
import type { Contribution } from '../features/blindpot/queue.ts'

/**
 * What the app saves into the vault. Each binding says how to read one part of the app's data,
 * restore it, watch it for changes and empty it. Loaded data is checked for the right shape, so a
 * record from an older or odd version is ignored rather than breaking the app.
 */
export interface Binding {
  /** The vault record name. The trailing number is a format version. */
  name: string
  read: () => unknown
  write: (data: unknown) => void
  subscribe: (listener: () => void) => () => void
  reset: () => void
}

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null && !Array.isArray(data)
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

export const BINDINGS: readonly Binding[] = [
  {
    name: 'pots.v1',
    read: () => usePots.getState().pots,
    write: (data) => {
      if (Array.isArray(data)) usePots.setState({ pots: data as Pot[] })
    },
    subscribe: (listener) => usePots.subscribe(listener),
    reset: () => {
      usePots.setState({ pots: [] })
    },
  },
  {
    name: 'contributions.v1',
    read: () => memoryContributionStore.entries(),
    write: (data) => {
      if (Array.isArray(data)) memoryContributionStore.restore(data as Contribution[])
    },
    subscribe: (listener) => memoryContributionStore.subscribe(listener),
    reset: () => {
      memoryContributionStore.restore([])
    },
  },
  {
    name: 'contacts.v1',
    read: () => useContacts.getState().contacts,
    write: (data) => {
      if (Array.isArray(data)) useContacts.getState().setAll(data as Contact[])
    },
    subscribe: (listener) => useContacts.subscribe(listener),
    reset: () => {
      useContacts.getState().setAll([])
    },
  },
  {
    name: 'legacy.v1',
    read: () => ({ sent: useLegacy.getState().sent, inbox: useLegacy.getState().inbox }),
    write: (data) => {
      if (isObject(data))
        useLegacy.setState({ sent: list(data['sent']), inbox: list(data['inbox']) })
    },
    subscribe: (listener) => useLegacy.subscribe(listener),
    reset: () => {
      useLegacy.setState({ sent: [], inbox: [] })
    },
  },
  {
    name: 'silent.v1',
    read: () => ({
      owned: useSilent.getState().owned,
      guardians: useSilent.getState().guardians,
      heirs: useSilent.getState().heirs,
    }),
    write: (data) => {
      if (isObject(data))
        useSilent.setState({
          owned: list(data['owned']),
          guardians: list(data['guardians']),
          heirs: list(data['heirs']),
        })
    },
    subscribe: (listener) => useSilent.subscribe(listener),
    reset: () => {
      useSilent.setState({ owned: [], guardians: [], heirs: [] })
    },
  },
  {
    name: 'unsigned.v1',
    read: () => ({
      card: useUnsigned.getState().card,
      messages: useUnsigned.getState().messages,
      repliedIds: useUnsigned.getState().repliedIds,
    }),
    write: (data) => {
      if (isObject(data)) {
        const card = isObject(data['card'])
          ? (data['card'] as unknown as ReturnType<typeof useUnsigned.getState>['card'])
          : null
        useUnsigned.setState({
          card,
          messages: list(data['messages']),
          repliedIds: list(data['repliedIds']),
        })
      }
    },
    subscribe: (listener) => useUnsigned.subscribe(listener),
    reset: () => {
      useUnsigned.setState({ card: null, messages: [], repliedIds: [] })
    },
  },
  {
    name: 'sentMessages.v1',
    read: () => useSentMessages.getState().sent,
    write: (data) => {
      if (Array.isArray(data))
        useSentMessages.setState({
          sent: data as ReturnType<typeof useSentMessages.getState>['sent'],
        })
    },
    subscribe: (listener) => useSentMessages.subscribe(listener),
    reset: () => {
      useSentMessages.setState({ sent: [] })
    },
  },
]

/**
 * Empties everything the app holds that is private, from memory. Settings are not touched. Messages
 * on screen are cleared too: they can name people ("Ada was saved").
 */
export function resetSensitiveData(bindings: readonly Binding[] = BINDINGS): void {
  for (const binding of bindings) binding.reset()
  useToasts.setState({ toasts: [] })
}

export interface Persistence {
  /** Saves anything changed but not yet written, and waits for it. */
  flush: () => Promise<void>
  /** Stops watching for changes. Call `flush` first if changes must not be lost. */
  stop: () => void
}

/**
 * Starts saving the app's data into an unlocked vault. With `load`, existing saved data is read in
 * first (unlocking); without it, the current in-memory data is written straight away (a vault just
 * created). After that every change is saved, a moment after it happens.
 */
export async function startPersistence(
  vault: Vault,
  options: { load: boolean; bindings?: readonly Binding[]; debounceMs?: number },
): Promise<Persistence> {
  const bindings = options.bindings ?? BINDINGS
  const debounceMs = options.debounceMs ?? 200
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Set<Promise<void>>()

  const save = (binding: Binding): Promise<void> => {
    const job = vault.set(binding.name, binding.read()).catch(() => {
      // A write that fails (for example because the vault just locked) is dropped; the data is still in memory.
    })
    pending.add(job)
    void job.finally(() => pending.delete(job))
    return job
  }

  if (options.load) {
    for (const binding of bindings) binding.write(await vault.get(binding.name))
  } else {
    await Promise.all(bindings.map((binding) => save(binding)))
  }

  const stops = bindings.map((binding) =>
    binding.subscribe(() => {
      clearTimeout(timers.get(binding.name))
      timers.set(
        binding.name,
        setTimeout(() => {
          timers.delete(binding.name)
          void save(binding)
        }, debounceMs),
      )
    }),
  )

  return {
    flush: async () => {
      for (const binding of bindings) {
        if (timers.has(binding.name)) {
          clearTimeout(timers.get(binding.name))
          timers.delete(binding.name)
          void save(binding)
        }
      }
      await Promise.all([...pending])
    },
    stop: () => {
      for (const stop of stops) stop()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}
