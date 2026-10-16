import { useState } from 'react'
import { Button } from '../../../components/Button.tsx'
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx'
import { CountdownTimer } from '../../../components/CountdownTimer.tsx'
import { EmptyState } from '../../../components/EmptyState.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { formatDateTime, shortAddress } from '../format.ts'
import type { LegacyWalletPort } from '../walletPort.ts'
import { describeDuration } from './duration.ts'
import { nextDueMs, ownerCheckIn, ownerRevoke, runPending, type OwnerRecord } from './owner.ts'
import { useSilent } from './stores.ts'
import { currentTime, useNow } from './useNow.ts'

function OwnerCard({ record, wallet }: { record: OwnerRecord; wallet: LegacyWalletPort | null }) {
  const push = useToasts((state) => state.push)
  const upsertOwned = useSilent((state) => state.upsertOwned)
  const now = useNow()
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const due = nextDueMs(record)
  const overdue = now >= due

  async function act(
    run: (w: LegacyWalletPort) => Promise<{ record: OwnerRecord; ok: boolean }>,
    success: string,
    failure: string,
  ) {
    if (wallet === null) return
    setBusy(true)
    const result = await run(wallet)
    setBusy(false)
    upsertOwned(result.record)
    push(result.ok ? 'success' : 'error', result.ok ? success : failure)
  }

  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-5">
      <h3 className="text-lg">Letter for {shortAddress(record.heirAddress)}</h3>
      <p className="text-sm text-muted">
        {String(record.threshold)} of {String(record.guardianAddresses.length)} guardians needed.
        Check in every {describeDuration(record.periodMs)}.
      </p>

      {record.revoked ? (
        <p role="status" className="font-medium">
          Revoked. Guardians were told to discard their shares, so this letter can no longer be
          opened.
        </p>
      ) : (
        <>
          <div>
            <p className="text-sm text-muted">
              Last check-in {formatDateTime(record.lastCheckInMs)}
            </p>
            {overdue ? (
              <p role="alert" className="font-medium text-bad">
                Check-in overdue. Check in now.
              </p>
            ) : (
              <div className="text-sm">
                Next check-in due in <CountdownTimer targetMs={due} doneLabel="Due now" />
              </div>
            )}
          </div>
          {record.nudgeIds.length > 0 && (
            <p className="text-sm">
              Guardians have reminded you {String(record.nudgeIds.length)}{' '}
              {record.nudgeIds.length === 1 ? 'time' : 'times'}.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              busy={busy}
              disabled={wallet === null}
              onClick={() => {
                void act(
                  (w) => ownerCheckIn(w, record, currentTime()),
                  'Checked in.',
                  'Some guardians were not reached. Use Retry.',
                )
              }}
            >
              Check in
            </Button>
            <Button
              variant="danger"
              disabled={wallet === null || busy}
              onClick={() => {
                setRevoking(true)
              }}
            >
              Revoke letter
            </Button>
          </div>
        </>
      )}

      {record.pending.length > 0 && (
        <div
          role="alert"
          className="space-y-2 rounded-control border border-warn bg-warn-soft p-4 text-sm"
        >
          <p>
            {String(record.pending.length)} message(s) have not been delivered yet. Your funds are
            safe.
          </p>
          <Button
            variant="secondary"
            busy={busy}
            disabled={wallet === null}
            onClick={() => {
              void act(
                (w) => runPending(w, record),
                'Everything was delivered.',
                'Still could not deliver. Try again later.',
              )
            }}
          >
            Retry
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={revoking}
        title="Revoke this letter?"
        confirmLabel="Revoke"
        danger
        onCancel={() => {
          setRevoking(false)
        }}
        onConfirm={() => {
          setRevoking(false)
          void act(
            (w) => ownerRevoke(w, record, currentTime()),
            'Revoked.',
            'Some guardians were not told. Use Retry.',
          )
        }}
      >
        Guardians discard their shares and the heir can never open this letter. To change it, seal a
        new letter afterwards. This cannot be undone.
      </ConfirmDialog>
    </li>
  )
}

export function OwnerPanel({ wallet }: { wallet: LegacyWalletPort | null }) {
  const owned = useSilent((state) => state.owned)
  if (owned.length === 0) {
    return (
      <EmptyState title="No letters yet">
        Letters you seal appear here, with your next check-in date.
      </EmptyState>
    )
  }
  return (
    <ul className="space-y-4">
      {owned.map((record) => (
        <OwnerCard key={record.bundleIdHex} record={record} wallet={wallet} />
      ))}
    </ul>
  )
}
