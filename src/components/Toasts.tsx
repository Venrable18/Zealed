import { useEffect } from 'react'
import { useToasts, type Toast, type ToastKind } from './toastStore.ts'

const STYLES: Record<ToastKind, string> = {
  info: 'border-line-strong bg-surface text-ink',
  success: 'border-good bg-good-soft text-ink',
  error: 'border-bad bg-bad-soft text-ink',
}

const DISMISS_AFTER_MS = 6000

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((state) => state.dismiss)

  useEffect(() => {
    // Errors stay until dismissed so they are not missed.
    if (toast.kind === 'error') return
    const timer = window.setTimeout(() => {
      dismiss(toast.id)
    }, DISMISS_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [toast.id, toast.kind, dismiss])

  return (
    <li>
      {/* The role is on an inner element: a list item with a role of its own is no longer a list item. */}
      <div
        role={toast.kind === 'error' ? 'alert' : 'status'}
        className={`flex items-start gap-3 rounded-control border px-4 py-3 shadow-lg ${STYLES[toast.kind]}`}
      >
        <span className="flex-1 text-sm">{toast.message}</span>
        <button
          type="button"
          onClick={() => {
            dismiss(toast.id)
          }}
          aria-label="Dismiss message"
          className="-m-2 flex size-11 items-center justify-center rounded-control text-lg hover:bg-sunken"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </li>
  )
}

/** Mount once in the layout. */
export function ToastViewport() {
  const toasts = useToasts((state) => state.toasts)
  return (
    <ul className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-2 *:pointer-events-auto">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </ul>
  )
}
