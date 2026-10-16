import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/Button.tsx'
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx'
import { CountdownTimer } from '../../../components/CountdownTimer.tsx'
import { EmptyState } from '../../../components/EmptyState.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { formatDateTime, shortAddress } from '../format.ts'
import type { LegacyWalletPort } from '../walletPort.ts'
import {
  dueMs,
  guardStatus,
  markReleased,
  nudgeAction,
  releaseAction,
  releaseMs,
  type GuardStatus,
  type GuardianRecord,
} from './guardian.ts'
import { useSilent } from './stores.ts'
import { currentTime, useNow } from './useNow.ts'

const STATUS_TEXT: Record<GuardStatus, string> = {
  ok: 'OK',
  overdue: 'Overdue',
  releasing: 'Ready to release',
  released: 'Released',
  revoked: 'Revoked',
}

interface GuardianPanelProps {
  wallet: LegacyWalletPort | null
  /** In demo mode shares are released without asking, as soon as they are due. */
  autoRelease: boolean
}

export function GuardianPanel({ wallet, autoRelease }: GuardianPanelProps) {
  const guardians = useSilent((state) => state.guardians)
  const setGuardians = useSilent((state) => state.setGuardians)
  const push = useToasts((state) => state.push)
  const now = useNow()
  const [confirming, setConfirming] = useState<string | undefined>()
  const [busy, setBusy] = useState<string | undefined>()
  const releasing = useRef(new Set<string>())

  async function release(record: GuardianRecord) {
    const action = releaseAction(record, currentTime())
    if (wallet === null || action === null || releasing.current.has(record.bundleIdHex)) return
    releasing.current.add(record.bundleIdHex)
    setBusy(record.bundleIdHex)
    try {
      await wallet.sendMemos(action)
      const latest = useSilent.getState().guardians
      setGuardians(latest.map((r) => (r.bundleIdHex === record.bundleIdHex ? markReleased(r) : r)))
      push('success', 'The key share was sent to the heir.')
    } catch {
      releasing.current.delete(record.bundleIdHex)
      push('error', 'The share could not be sent. It will be tried again.')
    }
    setBusy(undefined)
  }

  async function remind(record: GuardianRecord) {
    const action = nudgeAction(record, currentTime())
    if (wallet === null || action === null) return
    setBusy(record.bundleIdHex)
    try {
      await wallet.sendMemos(action)
      push('success', 'A reminder was sent.')
    } catch {
      push('error', 'The reminder could not be sent. Try again.')
    }
    setBusy(undefined)
  }

  // Demo mode: release as soon as it is due.
  useEffect(() => {
    if (!autoRelease || wallet === null) return
    for (const record of guardians) {
      if (releaseAction(record, now) !== null) void release(record)
    }
    // release is recreated every render; its inputs are the ones listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRelease, wallet, guardians, now])

  if (guardians.length === 0) {
    return (
      <EmptyState title="You are not guarding anyone">
        When someone chooses you as a guardian, they appear here after you check for messages.
      </EmptyState>
    )
  }

  const target = guardians.find((r) => r.bundleIdHex === confirming)

  return (
    <>
      <ul className="space-y-4">
        {guardians.map((record) => {
          const status = guardStatus(record, now)
          return (
            <li
              key={record.bundleIdHex}
              className="space-y-3 rounded-card border border-line bg-surface p-5"
            >
              <h3 className="text-lg">
                Guarding a letter from {shortAddress(record.ownerAddress)}
              </h3>
              <p>
                Status: <span className="font-semibold">{STATUS_TEXT[status]}</span>
              </p>
              <p className="text-sm text-muted">
                {record.lastCheckInMs === null
                  ? 'No check-in yet.'
                  : `Last check-in ${formatDateTime(record.lastCheckInMs)}.`}
              </p>
              {status === 'ok' && (
                <div className="text-sm">
                  Check-in due in <CountdownTimer targetMs={dueMs(record)} doneLabel="Due now" />
                </div>
              )}
              {status === 'overdue' && (
                <div
                  role="alert"
                  className="space-y-2 rounded-control border border-warn bg-warn-soft p-4 text-sm"
                >
                  <p>The owner has missed their check-in. The share is released in:</p>
                  <CountdownTimer targetMs={releaseMs(record)} doneLabel="Ready to release" />
                  <Button
                    variant="secondary"
                    busy={busy === record.bundleIdHex}
                    disabled={wallet === null}
                    onClick={() => {
                      void remind(record)
                    }}
                  >
                    Remind the owner
                  </Button>
                </div>
              )}
              {status === 'releasing' && (
                <div
                  role="alert"
                  className="space-y-2 rounded-control border border-bad bg-bad-soft p-4 text-sm"
                >
                  <p>
                    The owner is still silent after the grace period. Send your share to the heir.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="danger"
                      busy={busy === record.bundleIdHex}
                      disabled={wallet === null}
                      onClick={() => {
                        setConfirming(record.bundleIdHex)
                      }}
                    >
                      Release to the heir
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={wallet === null}
                      onClick={() => {
                        void remind(record)
                      }}
                    >
                      Remind the owner
                    </Button>
                  </div>
                </div>
              )}
              {status === 'released' && (
                <p className="text-sm">
                  Your share was sent to the heir and erased from this device.
                </p>
              )}
              {status === 'revoked' && (
                <p className="text-sm">The owner revoked this letter. Your share was erased.</p>
              )}
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={target !== undefined}
        title="Release your share?"
        confirmLabel="Release"
        danger
        onCancel={() => {
          setConfirming(undefined)
        }}
        onConfirm={() => {
          setConfirming(undefined)
          if (target !== undefined) void release(target)
        }}
      >
        Your key share goes to the heir. With enough other guardians doing the same, they can open
        the letter. Only do this if you believe the owner cannot check in.
      </ConfirmDialog>
    </>
  )
}
