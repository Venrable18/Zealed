import { Link } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { BellIcon } from '../../components/Icons.tsx'
import { formatDateTime } from '../../features/legacy/format.ts'
import { useNotificationsSeen } from '../../features/notifications/notifications.ts'
import { useNotifications } from '../../features/notifications/useNotifications.ts'
import { useWalletRuntime } from '../../wallet/runtime.ts'

export function Notifications() {
  const { items, unread } = useNotifications()
  const markSeen = useNotificationsSeen((state) => state.markSeen)
  const hasWallet = useWalletRuntime((state) => state.wallet !== null)

  return (
    <div className="space-y-8 py-10">
      <div>
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-seal text-seal-ink">
            <BellIcon width={26} height={26} />
          </span>
          <h1 className="text-4xl text-ink">Notifications</h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          Invitations, letters and messages that arrived for you. Your wallet checks for new ones
          while Zealed is open; nothing is sent to anyone to do this.
        </p>
      </div>

      {!hasWallet && (
        <p
          role="status"
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control border border-seal/30 bg-seal-soft px-4 py-3"
        >
          <span>Open a wallet to receive invitations, letters and messages.</span>
          <Link to="/wallet" className="font-semibold text-seal underline underline-offset-4">
            Set up a wallet
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState title="Nothing new">
          Co-host invitations, sealed letters and anonymous messages show up here.
        </EmptyState>
      ) : (
        <section className="space-y-4" aria-labelledby="list-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="list-title" className="text-xl">
              {unread.size === 0 ? 'All read' : `${String(unread.size)} unread`}
            </h2>
            {unread.size > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  markSeen([...unread])
                }}
              >
                Mark all as read
              </Button>
            )}
          </div>
          <ul className="space-y-3">
            {items.map((n) => {
              const isUnread = unread.has(n.id)
              return (
                <li
                  key={n.id}
                  className={`space-y-2 rounded-card border bg-surface p-4 ${
                    isUnread ? 'border-seal' : 'border-line'
                  }`}
                >
                  <p className="flex items-start gap-2 font-medium">
                    {isUnread && (
                      <span
                        className="mt-2 size-2 shrink-0 rounded-full bg-seal"
                        aria-label="Unread"
                      />
                    )}
                    <span>{n.title}</span>
                  </p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      to={n.to}
                      className="text-sm font-medium underline underline-offset-4"
                      onClick={() => {
                        markSeen([n.id])
                      }}
                    >
                      {n.action}
                    </Link>
                    <span className="text-xs text-muted">{formatDateTime(n.atMs)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
