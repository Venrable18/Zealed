import { NotSavedNotice } from '../../storage/NotSavedNotice.tsx'
import { DashboardView } from '../../features/dashboard/DashboardView.tsx'
import { useDashboard } from '../../features/dashboard/useDashboard.ts'

export function Dashboard() {
  const data = useDashboard()
  return (
    <div className="space-y-6 py-10">
      <div>
        <h1 className="text-4xl">Dashboard</h1>
        <p className="mt-2 max-w-prose text-muted">Your own numbers, worked out on this device.</p>
      </div>
      <NotSavedNotice />
      <DashboardView data={data} />
    </div>
  )
}
