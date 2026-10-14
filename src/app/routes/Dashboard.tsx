import { EmptyState } from '../../components/EmptyState.tsx'

export function Dashboard() {
  return (
    <div className="py-10">
      <h1 className="text-3xl">Dashboard</h1>
      <p className="mt-3 max-w-prose text-muted">
        Your own numbers, worked out on this device. Nothing about them leaves your browser.
      </p>
      <div className="mt-8">
        <EmptyState title="No activity yet">
          Once the wallet is built, your balance and recent activity will show up here.
        </EmptyState>
      </div>
    </div>
  )
}
