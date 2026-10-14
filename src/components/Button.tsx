import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-seal text-seal-ink hover:bg-seal-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  danger: 'bg-bad text-page hover:opacity-90',
  ghost: 'text-ink hover:bg-sunken',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Shows a busy state and blocks clicks. */
  busy?: boolean
}

/** 44px minimum height keeps it easy to tap on a phone. */
export function Button({
  variant = 'primary',
  busy = false,
  disabled = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
}
