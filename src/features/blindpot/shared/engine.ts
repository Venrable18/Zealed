import { createInbox, toMemos, MAX_MESSAGE_BYTES, type MessageType } from '../../../zmp/index.ts'
import type { ByIndex, SharedPotPort } from './port.ts'
import type { Member, SharedPot, Withdrawal } from './types.ts'

/** A message waiting to be sent. Kept with the state that produced it, so nothing is lost. */
export interface Outgoing {
  to: string
  type: MessageType
  payload: string
}

export interface SharedState {
  pots: SharedPot[]
  /** Message ids already handled (hex), so a message is never applied twice. */
  seen: string[]
  outbox: Outgoing[]
}

export const EMPTY_SHARED_STATE: SharedState = { pots: [], seen: [], outbox: [] }

/** The most co-hosts a pot can have, including the host. */
export const MAX_MEMBERS = 7
const SEEN_LIMIT = 4000

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16))
const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)))
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const isHex = (value: unknown, max = 20_000): value is string =>
  typeof value === 'string' && value.length <= max && /^(?:[0-9a-f]{2})*$/.test(value)
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)

function message(to: string, type: MessageType, payload: object): Outgoing {
  return { to, type, payload: JSON.stringify(payload) }
}

function others(pot: SharedPot): Member[] {
  return pot.members.filter((m) => m.index !== pot.me)
}

function host(pot: SharedPot): Member {
  const found = pot.members.find((m) => m.index === 1)
  if (found === undefined) throw new Error('A shared pot has no host.')
  return found
}

function update(state: SharedState, pot: SharedPot): SharedState {
  return { ...state, pots: state.pots.map((p) => (p.id === pot.id ? pot : p)) }
}

// --- What people do -----------------------------------------------------------------------------

export interface NewSharedPot {
  name: string
  /** The other co-hosts' addresses. */
  cohosts: string[]
  /** How many co-hosts, the host included, must approve a withdrawal. */
  threshold: number
  /** Kept with the host's pot, for the app. Never sent. */
  details?: Record<string, unknown>
}

/** The addresses a transaction's outputs can be named by: the co-hosts' and the pot's own. */
function knownAddresses(pot: SharedPot): string[] {
  return [...pot.members.map((m) => m.address), ...(pot.address === undefined ? [] : [pot.address])]
}

export function sharedPotProblem({
  cohosts,
  threshold,
}: Omit<NewSharedPot, 'name'>): string | null {
  const total = cohosts.length + 1
  if (cohosts.length < 1) return 'Add at least one co-host.'
  if (total > MAX_MEMBERS)
    return `A shared pot has at most ${String(MAX_MEMBERS)} co-hosts, you included.`
  if (new Set(cohosts.map((a) => a.trim())).size !== cohosts.length)
    return 'Each co-host can be added once.'
  if (!Number.isInteger(threshold) || threshold < 2 || threshold > total)
    return `Approvals needed must be between 2 and ${String(total)}.`
  return null
}

/** The host starts a shared pot: makes their part of the key and invites every co-host. */
export async function createSharedPot(
  port: SharedPotPort,
  state: SharedState,
  input: NewSharedPot,
  nowMs: number,
): Promise<{ state: SharedState; pot: SharedPot }> {
  const problem = sharedPotProblem(input)
  if (problem !== null) throw new Error(problem)
  const me: Member = { index: 1, address: await port.ownAddress() }
  const members = [
    me,
    ...input.cohosts.map((address, i) => ({ index: i + 2, address: address.trim() })),
  ]
  const first = await port.dkgPart1(1, members.length, input.threshold)
  const pot: SharedPot = {
    id: randomHex(16),
    name: input.name,
    role: 'host',
    me: 1,
    threshold: input.threshold,
    members,
    viewingSeed: randomHex(32),
    status: 'keygen',
    declinedBy: [],
    secret1: first.secret,
    round1: { 1: first.public },
    round2: {},
    withdrawals: [],
    createdAtMs: nowMs,
    ...(input.details === undefined ? {} : { details: input.details }),
  }
  const invites = others(pot).map((member) =>
    message(member.address, 'POT_INVITE', {
      p: pot.id,
      n: pot.name,
      t: pot.threshold,
      m: pot.members.map((m) => [m.index, m.address]),
      s: pot.viewingSeed,
      y: member.index,
      r1: first.public,
    }),
  )
  return {
    pot,
    state: { ...state, pots: [...state.pots, pot], outbox: [...state.outbox, ...invites] },
  }
}

/** A co-host accepts: makes their part of the key and sends it to everyone. */
export async function acceptInvite(
  port: SharedPotPort,
  state: SharedState,
  potId: string,
): Promise<SharedState> {
  const pot = state.pots.find((p) => p.id === potId)
  if (pot?.status !== 'invited') return state
  const first = await port.dkgPart1(pot.me, pot.members.length, pot.threshold)
  const accepted: SharedPot = {
    ...pot,
    status: 'keygen',
    secret1: first.secret,
    round1: { ...pot.round1, [pot.me]: first.public },
  }
  const sends = others(pot).map((m) =>
    message(m.address, 'POT_DKG1', { p: pot.id, f: pot.me, r: first.public }),
  )
  return { ...update(state, accepted), outbox: [...state.outbox, ...sends] }
}

export function declineInvite(state: SharedState, potId: string): SharedState {
  const pot = state.pots.find((p) => p.id === potId)
  if (pot?.status !== 'invited') return state
  const declined: SharedPot = { ...pot, status: 'declined' }
  return {
    ...update(state, declined),
    outbox: [
      ...state.outbox,
      ...others(pot).map((m) => message(m.address, 'POT_DECLINE', { p: pot.id, f: pot.me })),
    ],
  }
}

/**
 * The host asks to withdraw `zat` to `to`. The host builds the transaction, approves it themselves
 * and sends co-hosts the version they need to check it. If it is too big for one round of
 * messages, a smaller amount is tried: the rest is withdrawn in another round.
 */
export async function startWithdrawal(
  port: SharedPotPort,
  state: SharedState,
  potId: string,
  to: string,
  zat: bigint,
  nowMs: number,
): Promise<{ state: SharedState; zat: bigint }> {
  const pot = state.pots.find((p) => p.id === potId)
  if (
    pot?.role !== 'host' ||
    pot.status !== 'ready' ||
    pot.accountId === undefined ||
    pot.keyPackage === undefined
  )
    throw new Error('Only the host of a ready shared pot can withdraw.')
  if (pot.withdrawals.some((w) => ['pending', 'approved', 'signing'].includes(w.status)))
    throw new Error('A withdrawal is already waiting for approval.')
  let amount = zat
  for (let attempt = 0; attempt < 6 && amount > 0n; attempt++) {
    const full = await port.potWithdrawalPczt(pot.accountId, to, amount)
    const forSigners = await port.pcztForSigners(full)
    const id = randomHex(16)
    const request = message('', 'POT_SIGN_REQUEST', { p: pot.id, w: id, x: toBase64(forSigners) })
    if (new TextEncoder().encode(request.payload).length > MAX_MESSAGE_BYTES) {
      amount = (amount * 6n) / 10n
      continue
    }
    const checked = await port.signingRequest(forSigners, knownAddresses(pot))
    const nonces: ByIndex = {}
    const mine: ByIndex = {}
    for (const spend of checked.spends) {
      const round = await port.signRound1(pot.keyPackage)
      nonces[spend.index] = round.secret
      mine[spend.index] = round.public
    }
    const withdrawal: Withdrawal = {
      id,
      signerPczt: hex(forSigners),
      request: checked,
      status: 'pending',
      fullPczt: hex(full),
      commitments: { [pot.me]: mine },
      nonces,
      shares: {},
      declinedBy: [],
      createdAtMs: nowMs,
    }
    const sends = others(pot).map((m) => ({ ...request, to: m.address }))
    return {
      zat: amount,
      state: {
        ...update(state, { ...pot, withdrawals: [...pot.withdrawals, withdrawal] }),
        outbox: [...state.outbox, ...sends],
      },
    }
  }
  throw new Error('The pot holds too many small gifts to withdraw in one round.')
}

/** A co-host approves a withdrawal they checked: commits to nonces for each spend. */
export async function approveWithdrawal(
  port: SharedPotPort,
  state: SharedState,
  potId: string,
  withdrawalId: string,
): Promise<SharedState> {
  const pot = state.pots.find((p) => p.id === potId)
  const withdrawal = pot?.withdrawals.find((w) => w.id === withdrawalId)
  if (pot?.keyPackage === undefined || withdrawal?.status !== 'pending' || pot.role !== 'cohost')
    return state
  const nonces: ByIndex = {}
  const commitments: ByIndex = {}
  for (const spend of withdrawal.request.spends) {
    const round = await port.signRound1(pot.keyPackage)
    nonces[spend.index] = round.secret
    commitments[spend.index] = round.public
  }
  const approved: Withdrawal = { ...withdrawal, status: 'approved', nonces }
  return {
    ...update(state, {
      ...pot,
      withdrawals: pot.withdrawals.map((w) => (w.id === withdrawalId ? approved : w)),
    }),
    outbox: [
      ...state.outbox,
      message(host(pot).address, 'POT_COMMIT', {
        p: pot.id,
        w: withdrawalId,
        f: pot.me,
        c: commitments,
      }),
    ],
  }
}

export function declineWithdrawal(
  state: SharedState,
  potId: string,
  withdrawalId: string,
): SharedState {
  const pot = state.pots.find((p) => p.id === potId)
  const withdrawal = pot?.withdrawals.find((w) => w.id === withdrawalId)
  if (pot === undefined || withdrawal?.status !== 'pending' || pot.role !== 'cohost') return state
  const declined: Withdrawal = { ...withdrawal, status: 'declined' }
  return {
    ...update(state, {
      ...pot,
      withdrawals: pot.withdrawals.map((w) => (w.id === withdrawalId ? declined : w)),
    }),
    outbox: [
      ...state.outbox,
      message(host(pot).address, 'POT_DECLINE', { p: pot.id, f: pot.me, w: withdrawalId }),
    ],
  }
}

// --- Messages ------------------------------------------------------------------------------------

type Payload = Record<string, unknown>

function memberOf(pot: SharedPot, from: unknown): number | null {
  return typeof from === 'number' && from !== pot.me && pot.members.some((m) => m.index === from)
    ? from
    : null
}

/** Applies one message. Anything malformed, unknown or out of turn is ignored. */
async function apply(
  port: SharedPotPort,
  state: SharedState,
  type: MessageType,
  data: Payload,
  myAddress: string,
  nowMs: number,
): Promise<SharedState> {
  if (type === 'POT_INVITE') {
    if (!isId(data['p']) || state.pots.some((p) => p.id === data['p'])) return state
    const raw = data['m']
    const you = data['y']
    if (!Array.isArray(raw) || typeof you !== 'number' || typeof data['t'] !== 'number')
      return state
    const members: Member[] = raw
      .filter(
        (m): m is [number, string] =>
          Array.isArray(m) && typeof m[0] === 'number' && typeof m[1] === 'string',
      )
      .map(([index, address]) => ({ index, address }))
    if (members.length !== raw.length || members.length > MAX_MEMBERS) return state
    if (members.find((m) => m.index === you)?.address !== myAddress) return state
    if (!isHex(data['s'], 64) || !isHex(data['r1']) || typeof data['n'] !== 'string') return state
    const pot: SharedPot = {
      id: data['p'],
      name: data['n'].slice(0, 120),
      role: 'cohost',
      me: you,
      threshold: data['t'],
      members,
      viewingSeed: data['s'],
      status: 'invited',
      declinedBy: [],
      round1: { 1: data['r1'] },
      round2: {},
      withdrawals: [],
      createdAtMs: nowMs,
    }
    return { ...state, pots: [...state.pots, pot] }
  }

  const pot = state.pots.find((p) => p.id === data['p'])
  if (pot === undefined) return state
  const from = memberOf(pot, data['f'])

  switch (type) {
    case 'POT_DKG1':
      if (from === null || !isHex(data['r']) || pot.round1[from] !== undefined) return state
      return update(state, { ...pot, round1: { ...pot.round1, [from]: data['r'] } })
    case 'POT_DKG2':
      if (from === null || !isHex(data['r']) || pot.round2[from] !== undefined) return state
      return update(state, { ...pot, round2: { ...pot.round2, [from]: data['r'] } })
    case 'POT_DECLINE': {
      if (from === null) return state
      if (typeof data['w'] === 'string') {
        const withdrawals = pot.withdrawals.map((w) =>
          w.id === data['w'] && !w.declinedBy.includes(from)
            ? { ...w, declinedBy: [...w.declinedBy, from] }
            : w,
        )
        return update(state, { ...pot, withdrawals })
      }
      // Every co-host must take part in making the key, so one refusal ends it.
      return update(state, {
        ...pot,
        status: pot.status === 'ready' ? pot.status : 'failed',
        declinedBy: [...pot.declinedBy, from],
      })
    }
    case 'POT_SIGN_REQUEST': {
      if (
        pot.role !== 'cohost' ||
        pot.status !== 'ready' ||
        !isId(data['w']) ||
        typeof data['x'] !== 'string'
      )
        return state
      if (pot.withdrawals.some((w) => w.id === data['w'])) return state
      // The co-host reads the transaction themselves: what it pays, and what they will sign.
      const bytes = fromBase64(data['x'])
      const request = await port.signingRequest(bytes, knownAddresses(pot))
      const withdrawal: Withdrawal = {
        id: data['w'],
        signerPczt: hex(bytes),
        request,
        status: 'pending',
        commitments: {},
        shares: {},
        declinedBy: [],
        createdAtMs: nowMs,
      }
      return update(state, { ...pot, withdrawals: [...pot.withdrawals, withdrawal] })
    }
    case 'POT_COMMIT': {
      const w = pot.withdrawals.find((x) => x.id === data['w'])
      const c = data['c']
      if (
        pot.role !== 'host' ||
        from === null ||
        w?.status !== 'pending' ||
        typeof c !== 'object' ||
        c === null
      )
        return state
      if (w.commitments[from] !== undefined) return state
      const commitments = Object.fromEntries(
        Object.entries(c as Record<string, unknown>).filter(([, v]) => isHex(v)),
      ) as ByIndex
      if (w.request.spends.some((s) => commitments[s.index] === undefined)) return state
      return update(state, {
        ...pot,
        withdrawals: pot.withdrawals.map((x) =>
          x.id === w.id ? { ...w, commitments: { ...w.commitments, [from]: commitments } } : x,
        ),
      })
    }
    case 'POT_PACKAGE': {
      const w = pot.withdrawals.find((x) => x.id === data['w'])
      const k = data['k']
      if (pot.role !== 'cohost' || w?.status !== 'approved' || typeof k !== 'object' || k === null)
        return state
      const packages = Object.fromEntries(
        Object.entries(k as Record<string, unknown>).filter(([, v]) => isHex(v)),
      ) as ByIndex
      if (w.request.spends.some((s) => packages[s.index] === undefined)) return state
      return update(state, {
        ...pot,
        withdrawals: pot.withdrawals.map((x) => (x.id === w.id ? { ...w, packages } : x)),
      })
    }
    case 'POT_SHARE': {
      const w = pot.withdrawals.find((x) => x.id === data['w'])
      const s = data['s']
      if (
        pot.role !== 'host' ||
        from === null ||
        w?.status !== 'signing' ||
        !w.signers?.includes(from)
      )
        return state
      if (typeof s !== 'object' || s === null || w.shares[from] !== undefined) return state
      const shares = Object.fromEntries(
        Object.entries(s as Record<string, unknown>).filter(([, v]) => isHex(v)),
      ) as ByIndex
      return update(state, {
        ...pot,
        withdrawals: pot.withdrawals.map((x) =>
          x.id === w.id ? { ...w, shares: { ...w.shares, [from]: shares } } : x,
        ),
      })
    }
    default:
      return state
  }
}

// --- Moving each pot on ------------------------------------------------------------------------

async function advance(
  port: SharedPotPort,
  state: SharedState,
  pot: SharedPot,
): Promise<SharedState> {
  let current = pot
  const outbox: Outgoing[] = []
  const n = current.members.length

  // Key generation, part 2: once every co-host's part 1 is in.
  if (
    current.status === 'keygen' &&
    current.secret1 !== undefined &&
    !current.sentRound2 &&
    Object.keys(current.round1).length === n
  ) {
    const theirs = Object.fromEntries(
      Object.entries(current.round1).filter(([k]) => Number(k) !== current.me),
    )
    const second = await port.dkgPart2(current.secret1, theirs)
    for (const member of others(current)) {
      const pkg = second.packages[member.index]
      if (pkg !== undefined)
        outbox.push(message(member.address, 'POT_DKG2', { p: current.id, f: current.me, r: pkg }))
    }
    current = { ...current, secret2: second.secret, sentRound2: true }
    delete current.secret1
  }

  // Part 3: once every other co-host's part 2 for us is in. The pot then exists.
  if (
    current.status === 'keygen' &&
    current.secret2 !== undefined &&
    Object.keys(current.round2).length === n - 1
  ) {
    const theirs = Object.fromEntries(
      Object.entries(current.round1).filter(([k]) => Number(k) !== current.me),
    )
    const third = await port.dkgPart3(current.secret2, theirs, current.round2)
    const ufvk = await port.potUfvk(third.public, current.viewingSeed)
    const account = await port.importPot(current.name, ufvk)
    current = {
      ...current,
      status: 'ready',
      keyPackage: third.secret,
      publicKeyPackage: third.public,
      ufvk,
      accountId: account.accountId,
      address: account.address,
      round1: {},
      round2: {},
    }
    delete current.secret2
  }

  // Signing.
  const withdrawals: Withdrawal[] = []
  for (const w of current.withdrawals) {
    let next = w
    if (
      current.role === 'host' &&
      current.keyPackage !== undefined &&
      current.publicKeyPackage !== undefined
    ) {
      // Enough approvals: choose the signers (the host and the first who approved) and send packages.
      const approvals = Object.keys(next.commitments).map(Number)
      if (next.status === 'pending' && approvals.length >= current.threshold) {
        const signers = [current.me, ...approvals.filter((i) => i !== current.me)].slice(
          0,
          current.threshold,
        )
        const packages: ByIndex = {}
        for (const spend of next.request.spends) {
          const commitments: ByIndex = {}
          for (const i of signers) {
            const c = next.commitments[i]?.[spend.index]
            if (c !== undefined) commitments[i] = c
          }
          packages[spend.index] = await port.signingPackage(commitments, next.request.sighash)
        }
        // The host signs too, then forgets its nonces: they must never be used twice.
        const mine: ByIndex = {}
        for (const spend of next.request.spends) {
          const nonce = next.nonces?.[spend.index]
          const pkg = packages[spend.index]
          if (nonce === undefined || pkg === undefined) throw new Error('missing signing data')
          mine[spend.index] = await port.signRound2(
            current.keyPackage,
            nonce,
            pkg,
            spend.alpha,
            next.request.sighash,
          )
        }
        for (const i of signers.filter((s) => s !== current.me)) {
          const member = current.members.find((m) => m.index === i)
          if (member !== undefined)
            outbox.push(
              message(member.address, 'POT_PACKAGE', { p: current.id, w: next.id, k: packages }),
            )
        }
        next = { ...next, status: 'signing', signers, packages, shares: { [current.me]: mine } }
        delete next.nonces
      }
      // Every signer's share in: combine, sign the transaction, prove and send it.
      if (
        next.status === 'signing' &&
        next.signers?.every((i) => next.shares[i] !== undefined) &&
        next.fullPczt !== undefined
      ) {
        let pczt: Uint8Array = unhex(next.fullPczt)
        for (const spend of next.request.spends) {
          const shares: ByIndex = {}
          for (const i of next.signers) {
            const share = next.shares[i]?.[spend.index]
            if (share !== undefined) shares[i] = share
          }
          const pkg = next.packages?.[spend.index]
          if (pkg === undefined) throw new Error('missing signing package')
          const signature = await port.aggregate(pkg, shares, current.publicKeyPackage, spend.alpha)
          pczt = await port.applySignature(pczt, spend.index, signature)
        }
        await port.proveAndSend(pczt)
        next = { ...next, status: 'sent' }
        delete next.fullPczt
      }
      // Too many refusals to ever reach the threshold.
      if (
        ['pending', 'approved'].includes(next.status) &&
        next.declinedBy.length > current.members.length - current.threshold
      )
        next = { ...next, status: 'declined' }
    }
    if (
      current.role === 'cohost' &&
      current.keyPackage !== undefined &&
      next.status === 'approved' &&
      next.packages !== undefined
    ) {
      const shares: ByIndex = {}
      for (const spend of next.request.spends) {
        const nonce = next.nonces?.[spend.index]
        const pkg = next.packages[spend.index]
        if (nonce === undefined || pkg === undefined) throw new Error('missing signing data')
        shares[spend.index] = await port.signRound2(
          current.keyPackage,
          nonce,
          pkg,
          spend.alpha,
          next.request.sighash,
        )
      }
      outbox.push(
        message(host(current).address, 'POT_SHARE', {
          p: current.id,
          w: next.id,
          f: current.me,
          s: shares,
        }),
      )
      next = { ...next, status: 'signed' }
      delete next.nonces
    }
    withdrawals.push(next)
  }
  current = { ...current, withdrawals }
  return { ...update(state, current), outbox: [...state.outbox, ...outbox] }
}

/**
 * One pass: read new messages, apply them, move every pot on, and send what is waiting. The new
 * state is returned even if sending failed; what was not sent stays in the outbox for next time.
 */
export async function tick(
  port: SharedPotPort,
  state: SharedState,
  nowMs: number,
): Promise<SharedState> {
  const myAddress = await port.ownAddress()
  const incoming: { id: string; type: MessageType; payload: Uint8Array }[] = []
  const inbox = createInbox(
    Object.fromEntries(
      (
        [
          'POT_INVITE',
          'POT_DKG1',
          'POT_DKG2',
          'POT_DECLINE',
          'POT_SIGN_REQUEST',
          'POT_COMMIT',
          'POT_PACKAGE',
          'POT_SHARE',
        ] as const
      ).map((type) => [
        type,
        (m: { messageId: Uint8Array; payload: Uint8Array }) => {
          incoming.push({ id: hex(m.messageId), type, payload: m.payload })
        },
      ]),
    ),
  )
  for (const memo of await port.receivedMemos()) await inbox.ingest(memo)

  let next = state
  const seen = new Set(state.seen)
  for (const m of incoming) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    let data: Payload
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(m.payload))
      if (typeof parsed !== 'object' || parsed === null) continue
      data = parsed as Payload
    } catch {
      continue
    }
    try {
      next = await apply(port, next, m.type, data, myAddress, nowMs)
    } catch {
      // A message the wallet cannot read (a malformed transaction, say) is dropped.
    }
  }
  next = { ...next, seen: [...seen].slice(-SEEN_LIMIT) }

  for (const pot of next.pots) {
    try {
      const current = next.pots.find((p) => p.id === pot.id)
      if (current !== undefined) next = await advance(port, next, current)
    } catch {
      // Tried again on the next pass.
    }
  }
  return flush(port, next)
}

/** Sends everything in the outbox in one transaction. On failure it stays queued. */
export async function flush(port: SharedPotPort, state: SharedState): Promise<SharedState> {
  if (state.outbox.length === 0) return state
  const byAddress = new Map<string, Uint8Array[]>()
  for (const m of state.outbox) {
    const memos = toMemos(m.type, new TextEncoder().encode(m.payload))
    byAddress.set(m.to, [...(byAddress.get(m.to) ?? []), ...memos])
  }
  try {
    await port.sendMemosTo([...byAddress].map(([to, memos]) => ({ to, memos })))
    return { ...state, outbox: [] }
  } catch {
    return state
  }
}
