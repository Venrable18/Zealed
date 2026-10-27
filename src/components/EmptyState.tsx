import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  children?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="rounded-card bg-sunken px-6 py-10 text-center">
      <h2 className="text-lg">{title}</h2>
      {children !== undefined && (
        <div className="mx-auto mt-2 max-w-prose text-muted">{children}</div>
      )}
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
