import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { CountdownTimer } from '../../components/CountdownTimer.tsx'
import { formatZec } from '../../lib/zec.ts'
import { STRENGTH_TEXT } from '../blindpot/strength.ts'
import { formatDateTime } from '../legacy/format.ts'
import type { DashboardData } from './useDashboard.ts'

function Card({
  id,
  title,
  to,
  children,
}: {
  id: string
  title: string
  to: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 rounded-card border border-line bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-xl">
          {title}
        </h2>
        <Link to={to} className="text-sm underline underline-offset-4">
          Open
        </Link>
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

const zec = (zat: bigint) => `${formatZec(zat)} ZEC`

/** Renders numbers already worked out on this device. It fetches nothing. */
export function DashboardView({ data }: { data: DashboardData }) {
  const { stats, balance, pots: potsState } = data
  const { wallet, pots, legacy, unsigned } = stats

  return (
    <div className="space-y-6">
      <p role="note" className="flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className="inline-block size-2 rounded-full bg-good" />
        Your dashboard is computed on this device. We can’t see it.
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <Card id="dash-wallet" title="Wallet" to="/wallet">
          {balance === 'unavailable' && (
            <p className="text-muted">
              There is no wallet yet, so there is no balance to show. Set one up on the Wallet page.
            </p>
          )}
          {balance === 'loading' && <p role="status">Reading your balance…</p>}
          {balance === 'error' && <p role="alert">The balance could not be read.</p>}
          {wallet !== null && (
            <>
              <p className="font-display text-3xl font-semibold">{zec(wallet.spendableZat)}</p>
              <dl>
                <Stat label="Spendable now" value={zec(wallet.spendableZat)} />
                <Stat label="Pending" value={zec(wallet.pendingZat)} />
              </dl>
            </>
          )}
        </Card>

        <Card id="dash-pots" title="Blind Pot" to="/blind-pot">
          <dl>
            <Stat
              label="Pots"
              value={`${String(pots.count)} (${String(pots.open)} open, ${String(pots.closed)} closed)`}
            />
            {pots.count > 0 && potsState === 'ready' && pots.counted > 0 && (
              <Stat label="Total across pots" value={zec(pots.totalZat)} />
            )}
          </dl>
          {pots.count === 0 && <p className="text-sm text-muted">No pots yet.</p>}
          {pots.count > 0 && potsState === 'unavailable' && (
            <p className="text-sm text-muted">
              Totals need a wallet. Set one up on the Wallet page.
            </p>
          )}
          {potsState === 'error' && (
            <p role="alert" className="text-sm">
              Some pot totals could not be read.
            </p>
          )}
          {pots.lines.length > 0 && (
            <ul className="space-y-2">
              {pots.lines.map((line) => (
                <li key={line.id} className="rounded-control border border-line p-3 text-sm">
                  <p className="font-medium">
                    {line.cover} {line.name}{' '}
                    {line.closed && <span className="text-muted">(closed)</span>}
                  </p>
                  {line.totalZat !== null && line.strength !== null && (
                    <p className="text-muted">
                      {line.strength === 'none'
                        ? STRENGTH_TEXT.none.label
                        : `${zec(line.totalZat)} in the pot, ${STRENGTH_TEXT[line.strength].label.toLowerCase()} privacy`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Totals refresh in batches, so no single gift can be picked out.
          </p>
        </Card>

        <Card id="dash-legacy" title="Legacy" to="/legacy">
          <dl>
            <Stat label="Letters sealed and sent" value={legacy.sent} />
            {legacy.notDelivered > 0 && (
              <Stat label="Not delivered yet" value={legacy.notDelivered} />
            )}
            <Stat
              label="Sealed for you"
              value={`${String(legacy.sealedForYou.total)} (${String(legacy.sealedForYou.ready)} ready, ${String(legacy.sealedForYou.locked)} locked, ${String(legacy.sealedForYou.unlocked)} unlocked)`}
            />
            <Stat label="Letters if you go silent" value={legacy.silent.active} />
            <Stat label="People you guard" value={legacy.guarding.total} />
            <Stat
              label="Waiting for you"
              value={`${String(legacy.waitingForYou.total)} (${String(legacy.waitingForYou.ready)} ready to open)`}
            />
          </dl>
          {legacy.silent.nextCheckInMs !== null && (
            <div
              className={
                legacy.silent.overdue
                  ? 'rounded-control border border-bad bg-bad-soft p-3'
                  : 'rounded-control border border-line p-3'
              }
            >
              {legacy.silent.overdue ? (
                <p role="alert" className="font-medium">
                  A check-in is overdue. Open “If I go silent” and check in.
                </p>
              ) : (
                <div className="text-sm">
                  Next check-in due in{' '}
                  <CountdownTimer targetMs={legacy.silent.nextCheckInMs} doneLabel="Due now" />
                  <p className="text-muted">{formatDateTime(legacy.silent.nextCheckInMs)}</p>
                </div>
              )}
            </div>
          )}
          {(legacy.guarding.overdue > 0 || legacy.guarding.releasing > 0) && (
            <p role="alert" className="rounded-control border border-warn bg-warn-soft p-3 text-sm">
              {String(legacy.guarding.overdue + legacy.guarding.releasing)} of the people you guard{' '}
              {legacy.guarding.overdue + legacy.guarding.releasing === 1 ? 'has' : 'have'} missed a
              check-in.
            </p>
          )}
        </Card>

        <Card id="dash-unsigned" title="Unsigned" to="/unsigned">
          <dl>
            <Stat label="Contact card" value={unsigned.hasCard ? 'Active' : 'None yet'} />
            <Stat label="Messages received" value={unsigned.received} />
            {unsigned.belowMinimum > 0 && (
              <Stat label="Below your minimum" value={unsigned.belowMinimum} />
            )}
            <Stat label="Earned" value={zec(unsigned.earnedZat)} />
            <Stat label="Messages you sent" value={unsigned.sent} />
          </dl>
        </Card>
      </div>

      <div>
        <Button variant="secondary" onClick={data.refresh}>
          Refresh
        </Button>
      </div>
    </div>
  )
}
