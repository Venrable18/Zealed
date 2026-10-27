import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

const CONTROL =
  'block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-line-strong focus:border-seal'

interface FieldFrameProps {
  label: string
  hint?: string | undefined
  error?: string | undefined
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/** Label, hint and error message wired to a control with the right ARIA attributes. */
function FieldFrame({ label, hint, error, children }: FieldFrameProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((part) => part !== null)
    .join(' ')
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        describedBy: describedBy === '' ? undefined : describedBy,
        invalid: error !== undefined,
      })}
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: string
  error?: string
}

export function TextInput({ label, hint, error, className = '', ...rest }: TextInputProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} min-h-11 ${invalid ? 'border-bad' : ''} ${className}`}
          {...rest}
        />
      )}
    </FieldFrame>
  )
}

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  hint?: string
  error?: string
}

export function TextArea({ label, hint, error, className = '', rows = 4, ...rest }: TextAreaProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? 'border-bad' : ''} ${className}`}
          {...rest}
        />
      )}
    </FieldFrame>
  )
}
