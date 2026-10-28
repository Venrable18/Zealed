import { describe, expect, it } from 'vitest'
import {
  EMPTY_SHARED_STATE,
  acceptInvite,
  approveWithdrawal,
  createSharedPot,
  declineInvite,
  declineWithdrawal,
  sharedPotProblem,
  startWithdrawal,
  tick,
  type SharedState,
} from './engine.ts'
import type { ByIndex, SharedPotPort, SigningRequest } from './port.ts'

const hex = (text: string) =>
  Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (h: string) =>
  new TextDecoder().decode(Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16)))

/** Memos in flight between fake wallets, by recipient address. */
class Network {
  inboxes = new Map<string, Uint8Array[]>()
  sent: { from: string; to: string[] }[] = []
  broadcast: { to: string; zat: bigint; signatures: number }[] = []
}

/**
 * A fake wallet with fake FROST that keeps the rules that matter: every member must reach the same
 * group key; a signer refuses a package for another sighash; a signature needs `threshold` shares.
 */
class FakeMember implements SharedPotPort {
  nonceUses = new Map<string, number>()
  failSends = false
  readonly address: string
  readonly net: Network
  readonly threshold: () => number
  constructor(address: string, net: Network, threshold: () => number) {
    this.address = address
    this.net = net
    this.threshold = threshold
    net.inboxes.set(address, [])
  }
  ownAddress = () => Promise.resolve(this.address)
  receivedMemos = () => Promise.resolve([...(this.net.inboxes.get(this.address) ?? [])])
  sendMemosTo(batch: { to: string; memos: Uint8Array[] }[]) {
    if (this.failSends) return Promise.reject(new Error('offline'))
    for (const { to, memos } of batch) this.net.inboxes.get(to)?.push(...memos)
    this.net.sent.push({ from: this.address, to: batch.map((b) => b.to) })
    return Promise.resolve({ txid: 'tx' })
  }
  dkgPart1 = (me: number) =>
    Promise.resolve({ secret: hex(`s1-${String(me)}`), public: hex(`p1-${String(me)}`) })
  dkgPart2(secret: string, round1: ByIndex) {
    const me = unhex(secret).slice(3)
    const packages: ByIndex = {}
    for (const k of Object.keys(round1)) packages[Number(k)] = hex(`p2-${me}-to-${k}`)
    return Promise.resolve({ secret: hex(`s2-${me}`), packages })
  }
  dkgPart3(secret: string, round1: ByIndex, round2: ByIndex) {
    const me = unhex(secret).slice(3)
    for (const [from, pkg] of Object.entries(round2)) {
      if (unhex(pkg) !== `p2-${from}-to-${me}`) throw new Error('a part 2 package for someone else')
    }
    const all = [me, ...Object.keys(round1)].sort().join(',')
    return Promise.resolve({ secret: hex(`key-${me}`), public: hex(`group-${all}`) })
  }
  potUfvk = (pub: string, seed: string) =>
    Promise.resolve(`uview-${unhex(pub)}-${seed.slice(0, 8)}`)
  importPot = (_name: string, ufvk: string) =>
    Promise.resolve({ accountId: 'pot', address: `utest1pot-${ufvk}` })
  potSpendableZat = () => Promise.resolve(1_000_000n)
  potWithdrawalPczt = (_a: string, to: string, zat: bigint) =>
    Promise.resolve(new TextEncoder().encode(JSON.stringify({ to, zat: zat.toString() })))
  pcztForSigners = (p: Uint8Array) => Promise.resolve(p)
  signingRequest(p: Uint8Array): Promise<SigningRequest> {
    const { to, zat } = JSON.parse(new TextDecoder().decode(p)) as { to: string; zat: string }
    return Promise.resolve({
      sighash: hex(`sighash:${to}:${zat}`),
      spends: [{ index: 1, alpha: hex('alpha') }],
      outputs: [{ address: to, zat }],
    })
  }
  signRound1(key: string) {
    const nonce = hex(`nonce-${unhex(key)}-${String(Math.random())}`)
    return Promise.resolve({ secret: nonce, public: hex(`commit-${unhex(key)}`) })
  }
  signingPackage = (commitments: ByIndex, sighash: string) =>
    Promise.resolve(hex(JSON.stringify({ commitments: Object.keys(commitments), sighash })))
  signRound2(key: string, nonces: string, pkg: string, _alpha: string, sighash: string) {
    const parsed = JSON.parse(unhex(pkg)) as { sighash: string }
    if (parsed.sighash !== sighash)
      return Promise.reject(new Error('not the transaction that was checked'))
    this.nonceUses.set(nonces, (this.nonceUses.get(nonces) ?? 0) + 1)
    return Promise.resolve(hex(`share-${unhex(key)}`))
  }
  aggregate(_pkg: string, shares: ByIndex) {
    if (Object.keys(shares).length !== this.threshold())
      return Promise.reject(new Error('wrong number of shares'))
    return Promise.resolve(hex(`sig-${Object.keys(shares).sort().join(',')}`))
  }
  applySignature(p: Uint8Array, _i: number, sig: string) {
    const tx = JSON.parse(new TextDecoder().decode(p)) as Record<string, unknown>
    return Promise.resolve(new TextEncoder().encode(JSON.stringify({ ...tx, sig: unhex(sig) })))
  }
  proveAndSend(p: Uint8Array) {
    const tx = JSON.parse(new TextDecoder().decode(p)) as { to: string; zat: string; sig?: string }
    if (tx.sig === undefined) return Promise.reject(new Error('unsigned'))
    this.net.broadcast.push({
      to: tx.to,
      zat: BigInt(tx.zat),
      signatures: tx.sig.split(',').length,
    })
    return Promise.resolve()
  }
}

function setup(n: number, threshold: number) {
  const net = new Network()
  const members = Array.from(
    { length: n },
    (_, i) => new FakeMember(`utest1member${String(i + 1)}`, net, () => threshold),
  )
  const states: SharedState[] = members.map(() => EMPTY_SHARED_STATE)
  const run = async (rounds = 6) => {
    for (let r = 0; r < rounds; r++)
      for (let i = 0; i < n; i++) states[i] = await tick(members[i]!, states[i]!, 1000)
  }
  return { net, members, states, run }
}

async function readyPot(n = 3, threshold = 2) {
  const s = setup(n, threshold)
  const created = await createSharedPot(
    s.members[0]!,
    s.states[0]!,
    {
      name: 'Wedding',
      cohosts: s.members.slice(1).map((m) => m.address),
      threshold,
    },
    1000,
  )
  s.states[0] = created.state
  await s.run(1)
  for (let i = 1; i < n; i++)
    s.states[i] = await acceptInvite(s.members[i]!, s.states[i]!, created.pot.id)
  await s.run()
  return { ...s, potId: created.pot.id }
}

describe('shared pots: making the key', () => {
  it('needs at least one co-host and a sensible threshold', () => {
    expect(sharedPotProblem({ cohosts: [], threshold: 2 })).toMatch(/at least one/)
    expect(sharedPotProblem({ cohosts: ['a'], threshold: 3 })).toMatch(/between 2 and 2/)
    expect(sharedPotProblem({ cohosts: ['a', 'a'], threshold: 2 })).toMatch(/once/)
    expect(sharedPotProblem({ cohosts: ['a', 'b'], threshold: 2 })).toBeNull()
  })

  it('every co-host ends with the same pot address, and no secret from making it is kept', async () => {
    const { states, potId } = await readyPot(3, 2)
    const pots = states.map((s) => s.pots.find((p) => p.id === potId))
    expect(pots.map((p) => p?.status)).toEqual(['ready', 'ready', 'ready'])
    expect(new Set(pots.map((p) => p?.address)).size).toBe(1)
    expect(pots.map((p) => p?.role)).toEqual(['host', 'cohost', 'cohost'])
    for (const p of pots) {
      expect(p?.secret1).toBeUndefined()
      expect(p?.secret2).toBeUndefined()
      expect(p?.keyPackage).toBeDefined()
    }
    expect(states.every((s) => s.outbox.length === 0)).toBe(true)
  })

  it('a co-host sees an invitation and decides; one refusal ends the pot for the host', async () => {
    const s = setup(3, 2)
    const created = await createSharedPot(
      s.members[0]!,
      s.states[0]!,
      { name: 'P', cohosts: [s.members[1]!.address, s.members[2]!.address], threshold: 2 },
      1,
    )
    s.states[0] = created.state
    await s.run(1)
    expect(s.states[1]!.pots[0]).toMatchObject({
      status: 'invited',
      name: 'P',
      me: 2,
      threshold: 2,
    })
    s.states[1] = declineInvite(s.states[1]!, created.pot.id)
    await s.run()
    expect(s.states[0].pots[0]?.status).toBe('failed')
  })

  it('ignores an invitation not addressed to this wallet, and messages for unknown pots', async () => {
    const s = setup(3, 2)
    const created = await createSharedPot(
      s.members[0]!,
      s.states[0]!,
      { name: 'P', cohosts: [s.members[1]!.address], threshold: 2 },
      1,
    )
    s.states[0] = created.state
    // Member 3 receives the memos meant for member 2 (copied), but is not in the pot.
    s.net.inboxes.set(s.members[2]!.address, [])
    await s.run(1)
    s.net.inboxes.set(s.members[2]!.address, [...(s.net.inboxes.get(s.members[1]!.address) ?? [])])
    s.states[2] = await tick(s.members[2]!, s.states[2]!, 1)
    expect(s.states[2].pots).toEqual([])
  })

  it('keeps unsent messages until they go out', async () => {
    const s = setup(2, 2)
    s.members[0]!.failSends = true
    const created = await createSharedPot(
      s.members[0]!,
      s.states[0]!,
      { name: 'P', cohosts: [s.members[1]!.address], threshold: 2 },
      1,
    )
    s.states[0] = await tick(s.members[0]!, created.state, 1)
    expect(s.states[0].outbox).toHaveLength(1)
    s.members[0]!.failSends = false
    s.states[0] = await tick(s.members[0]!, s.states[0], 1)
    expect(s.states[0].outbox).toHaveLength(0)
    expect(s.net.inboxes.get(s.members[1]!.address)?.length).toBeGreaterThan(0)
  })
})

describe('shared pots: withdrawing', () => {
  it('with 2 of 3: the host and one co-host sign; the third need do nothing', async () => {
    const r = await readyPot(3, 2)
    const started = await startWithdrawal(
      r.members[0]!,
      r.states[0]!,
      r.potId,
      'utest1host',
      990_000n,
      2,
    )
    r.states[0] = started.state
    await r.run(1)
    // Each co-host reads the transaction themselves and sees where the money goes.
    const seen = r.states[1]!.pots[0]?.withdrawals[0]
    expect(seen).toMatchObject({ status: 'pending' })
    expect(seen?.request.outputs).toEqual([{ address: 'utest1host', zat: '990000' }])
    r.states[1] = await approveWithdrawal(r.members[1]!, r.states[1]!, r.potId, seen?.id ?? '')
    await r.run()
    expect(r.net.broadcast).toEqual([{ to: 'utest1host', zat: 990_000n, signatures: 2 }])
    expect(r.states[0].pots[0]?.withdrawals[0]?.status).toBe('sent')
    expect(r.states[1].pots[0]?.withdrawals[0]?.status).toBe('signed')
    expect(r.states[2]!.pots[0]?.withdrawals[0]?.status).toBe('pending')
    // Nonces are forgotten once used, and never used twice.
    expect(r.states[0].pots[0]?.withdrawals[0]?.nonces).toBeUndefined()
    expect(r.states[1].pots[0]?.withdrawals[0]?.nonces).toBeUndefined()
    for (const m of r.members) for (const uses of m.nonceUses.values()) expect(uses).toBe(1)
  })

  it('an exact amount is never lowered; the default lowers it until the request fits', async () => {
    const r = await readyPot(3, 2)
    const host = r.members[0]!
    // A transaction that spends many pieces is too large to send as a message; smaller ones fit.
    const small = host.potWithdrawalPczt.bind(host)
    host.potWithdrawalPczt = (account: string, to: string, zat: bigint) =>
      zat > 500_000n ? Promise.resolve(new Uint8Array(100_000)) : small(account, to, zat)

    await expect(
      startWithdrawal(host, r.states[0]!, r.potId, 'utest1host', 900_000n, 2, { exact: true }),
    ).rejects.toThrow(/too large/)

    const lowered = await startWithdrawal(host, r.states[0]!, r.potId, 'utest1host', 900_000n, 2)
    expect(lowered.zat).toBeLessThan(900_000n)

    const exact = await startWithdrawal(host, r.states[0]!, r.potId, 'utest1host', 400_000n, 2, {
      exact: true,
    })
    expect(exact.zat).toBe(400_000n)
  })

  it('nothing is sent without enough approvals, and enough refusals end the request', async () => {
    const r = await readyPot(3, 3)
    r.states[0] = (
      await startWithdrawal(r.members[0]!, r.states[0]!, r.potId, 'utest1host', 1n, 2)
    ).state
    await r.run(1)
    const id = r.states[1]!.pots[0]?.withdrawals[0]?.id ?? ''
    r.states[1] = await approveWithdrawal(r.members[1]!, r.states[1]!, r.potId, id)
    await r.run()
    expect(r.net.broadcast).toEqual([])
    r.states[2] = declineWithdrawal(r.states[2]!, r.potId, id)
    await r.run()
    expect(r.states[0].pots[0]?.withdrawals[0]?.status).toBe('declined')
    expect(r.net.broadcast).toEqual([])
  })

  it('a co-host will not sign a package for a different transaction than the one they checked', async () => {
    const r = await readyPot(2, 2)
    r.states[0] = (
      await startWithdrawal(r.members[0]!, r.states[0]!, r.potId, 'utest1host', 5n, 2)
    ).state
    await r.run(1)
    const id = r.states[1]!.pots[0]?.withdrawals[0]?.id ?? ''
    r.states[1] = await approveWithdrawal(r.members[1]!, r.states[1]!, r.potId, id)
    // The host is dishonest: its packages sign another sighash.
    const host = r.members[0]!
    host.signingPackage = (c: ByIndex) =>
      Promise.resolve(
        hex(JSON.stringify({ commitments: Object.keys(c), sighash: hex('sighash:utest1thief:5') })),
      )
    await r.run()
    expect(r.net.broadcast).toEqual([])
    expect(r.states[1].pots[0]?.withdrawals[0]?.status).toBe('approved')
  })

  it('only one withdrawal waits at a time', async () => {
    const r = await readyPot(2, 2)
    r.states[0] = (
      await startWithdrawal(r.members[0]!, r.states[0]!, r.potId, 'utest1host', 5n, 2)
    ).state
    await expect(
      startWithdrawal(r.members[0]!, r.states[0], r.potId, 'utest1host', 5n, 2),
    ).rejects.toThrow(/already waiting/)
  })
})
