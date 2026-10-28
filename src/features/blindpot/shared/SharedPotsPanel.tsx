import { useEffect, useState } from 'react'
import { Button } from '../../../components/Button.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { formatZec } from '../../../lib/zec.ts'
import { findContact, useContacts } from '../../contacts/contacts.ts'
import { summarizeWithdrawal } from './describe.ts'
import { acceptInvite, approveWithdrawal, declineInvite, declineWithdrawal } from './engine.ts'
import { actShared, useSharedPotPort, useSharedPots } from './store.ts'
import type { SharedPot, Withdrawal } from './types.ts'

const short = (address: string) => `${address.slice(0, 10)}…${address.slice(-6)}`

function Who({ address, pot }: { address?: string | undefined; pot: SharedPot }) {
  const contacts = useContacts((state) => state.contacts)
  if (address === undefined)
    return <span className="text-muted">an address the transaction does not show</span>
  if (address === pot.address) return <span>back to the pot (change)</span>
  const contact = findContact(contacts, address)
  const member = pot.members.find((m) => m.address === address)
  if (member?.index === 1) return <span>the host’s wallet ({contact?.name ?? short(address)})</span>
  return <span className="break-all">{contact?.name ?? short(address)}</span>
}

function Request({ pot, w }: { pot: SharedPot; w: Withdrawal }) {
  const port = useSharedPotPort()
  const push = useToasts((state) => state.push)
  const [busy, setBusy] = useState(false)
  const paid = w.request.outputs.filter((o) => o.address !== pot.address)
  const summary = summarizeWithdrawal(w.request.outputs, pot.address)
  const act = async (approve: boolean) => {
    if (port === null) return
    setBusy(true)
    try {
      await actShared(port, (s) =>
        approve ? approveWithdrawal(port, s, pot.id, w.id) : declineWithdrawal(s, pot.id, w.id),
      )
      push(
        'success',
        approve
          ? 'Approved. Your signature goes to the host once enough co-hosts agree.'
          : 'Declined.',
      )
    } catch {
      push('error', 'That could not be sent. Try again.')
    }
    setBusy(false)
  }
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      <p className="font-medium">The host asks to move money out of “{pot.name}”.</p>
      <p>
        <span
          className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
            summary.kind === 'all' ? 'bg-bad-soft text-bad' : 'bg-seal-soft text-seal'
          }`}
        >
          {summary.kind === 'all'
            ? 'Withdraws everything in the pot'
            : `Withdraws part of the pot: ${formatZec(summary.staysZat)} TAZ stays in it`}
        </span>
      </p>
      <ul className="space-y-1 text-sm">
        {paid.map((o, i) => (
          <li key={i}>
            {o.zat === undefined ? 'An amount' : `${formatZec(BigInt(o.zat))} TAZ`} to{' '}
            <Who address={o.address} pot={pot} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Your wallet read this from the transaction itself: this is exactly what you would sign.
      </p>
      {w.status === 'pending' ? (
        <div className="flex flex-wrap gap-3">
          <Button busy={busy} onClick={() => void act(true)}>
            Approve
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void act(false)}>
            Decline
          </Button>
        </div>
      ) : (
        <p className="text-sm font-medium">
          {w.status === 'approved'
            ? 'Approved. Waiting for the host.'
            : w.status === 'signed'
              ? 'Signed.'
              : 'Declined.'}
        </p>
      )}
    </li>
  )
}

function Total({ pot }: { pot: SharedPot }) {
  const port = useSharedPotPort()
  const [zat, setZat] = useState<bigint>()
  useEffect(() => {
    if (port === null || pot.accountId === undefined) return
    let cancelled = false
    port.potSpendableZat(pot.accountId).then(
      (value) => {
        if (!cancelled) setZat(value)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [port, pot.accountId])
  return <span>{zat === undefined ? '…' : `${formatZec(zat)} TAZ`}</span>
}

function Invitation({ pot }: { pot: SharedPot }) {
  const port = useSharedPotPort()
  const push = useToasts((state) => state.push)
  const contacts = useContacts((state) => state.contacts)
  const [busy, setBusy] = useState(false)
  const hostAddress = pot.members.find((m) => m.index === 1)?.address ?? ''
  const hostName = findContact(contacts, hostAddress)?.name ?? short(hostAddress)
  const act = async (accept: boolean) => {
    if (port === null) return
    setBusy(true)
    try {
      await actShared(port, (s) =>
        accept ? acceptInvite(port, s, pot.id) : declineInvite(s, pot.id),
      )
      push(
        'success',
        accept ? 'Accepted. The pot is ready once every co-host has accepted.' : 'Declined.',
      )
    } catch {
      push('error', 'That could not be sent. Try again.')
    }
    setBusy(false)
  }
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      <p className="font-medium">
        {hostName} invites you to co-host “{pot.name}”.
      </p>
      <p className="text-sm text-muted">
        Any {pot.threshold} of the {pot.members.length} co-hosts together can move its money; no one
        can alone. You will see the pot’s total, never who gave. Accepting sends a few short
        messages, a tiny fee each.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button busy={busy} onClick={() => void act(true)}>
          Accept
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void act(false)}>
          Decline
        </Button>
      </div>
    </li>
  )
}

/** Where making the pot's key is up to. Each step is a Zcash transaction that must be mined. */
function KeygenProgress({ pot }: { pot: SharedPot }) {
  const members = pot.members.length
  const accepted = Math.min(members, Object.keys(pot.round1).length)
  const exchanged = Math.min(members - 1, Object.keys(pot.round2).length)
  const steps = [
    { label: 'Invitations sent', done: true },
    {
      label: `Everyone accepts (${String(accepted)} of ${String(members)})`,
      done: accepted >= members,
    },
    {
      label: `Swapping key pieces (${String(exchanged)} of ${String(members - 1)})`,
      done: pot.keyPackage !== undefined,
    },
    { label: 'Pot ready', done: false },
  ]
  const current = steps.findIndex((step) => !step.done)
  return (
    <div className="space-y-2 pt-1">
      <ol className="flex flex-wrap gap-2 text-sm">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={index === current ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${
              step.done
                ? 'border-line text-muted'
                : index === current
                  ? 'border-seal bg-seal-soft font-semibold text-seal'
                  : 'border-line text-muted'
            }`}
          >
            {step.done ? '✓ ' : ''}
            {step.label}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        Each step is a private Zcash transaction, so this takes a few minutes. You can leave this
        page open or come back; it carries on while Zealed is open.
      </p>
    </div>
  )
}

const STATUS: Record<SharedPot['status'], string> = {
  invited: 'Invitation',
  keygen: 'Making the pot’s key with the co-hosts…',
  ready: 'Ready',
  declined: 'You declined',
  failed: 'A co-host declined, so the pot was not made',
}

/** Shared pots this wallet takes part in: invitations, approval requests, and pots being set up. */
export function SharedPotsPanel() {
  const pots = useSharedPots((state) => state.state.pots)
  const port = useSharedPotPort()
  if (port === null || pots.length === 0) return null
  const invitations = pots.filter((p) => p.status === 'invited')
  const requests = pots.flatMap((p) =>
    p.role === 'cohost'
      ? p.withdrawals
          .filter((w) => ['pending', 'approved'].includes(w.status))
          .map((w) => ({ p, w }))
      : [],
  )
  const others = pots.filter(
    (p) => p.status !== 'invited' && !(p.role === 'host' && p.status === 'ready'),
  )
  return (
    <section className="space-y-4" aria-labelledby="shared-title">
      <h2 id="shared-title" className="text-xl">
        Shared pots
      </h2>
      <ul className="space-y-3">
        {invitations.map((pot) => (
          <Invitation key={pot.id} pot={pot} />
        ))}
        {requests.map(({ p, w }) => (
          <Request key={w.id} pot={p} w={w} />
        ))}
        {others.map((pot) => (
          <li key={pot.id} className="space-y-1 rounded-card border border-line bg-surface p-4">
            <p className="font-medium">{pot.name}</p>
            <p className="text-sm text-muted">
              {pot.role === 'cohost' ? 'You co-host this pot. ' : ''}
              {STATUS[pot.status]}
            </p>
            {pot.status === 'keygen' && <KeygenProgress pot={pot} />}
            {pot.status === 'ready' && (
              <p className="text-sm">
                In the pot: <Total pot={pot} />. Any {pot.threshold} of {pot.members.length} must
                approve a withdrawal.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
