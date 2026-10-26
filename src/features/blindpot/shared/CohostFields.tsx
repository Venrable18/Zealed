import { AddressInput } from '../../../components/AddressInput.tsx'
import { Button } from '../../../components/Button.tsx'
import { MAX_MEMBERS } from './engine.ts'

export interface CohostChoice {
  on: boolean
  cohosts: string[]
  threshold: number
}

/** Optional co-hosts for a new pot: who they are, and how many must approve a withdrawal. */
export function CohostFields({
  value,
  onChange,
  error,
}: {
  value: CohostChoice
  onChange: (next: CohostChoice) => void
  error?: string | undefined
}) {
  const total = value.cohosts.length + 1
  return (
    <fieldset className="space-y-4 rounded-card border border-line p-4">
      <legend className="px-1 text-sm font-medium">Co-hosts (optional)</legend>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(event) => {
            onChange({
              ...value,
              on: event.target.checked,
              cohosts: value.cohosts.length === 0 ? [''] : value.cohosts,
            })
          }}
          className="mt-1 size-5 accent-seal"
        />
        <span>
          Require co-hosts to approve withdrawals
          <span className="block text-sm text-muted">
            The money can only move when enough of you sign together. No one, you included, can take
            it alone.
          </span>
        </span>
      </label>
      {value.on && (
        <div className="space-y-4">
          {value.cohosts.map((address, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <AddressInput
                  label={`Co-host ${String(index + 1)} address`}
                  value={address}
                  onChange={(next) => {
                    onChange({
                      ...value,
                      cohosts: value.cohosts.map((a, i) => (i === index ? next : a)),
                    })
                  }}
                />
              </div>
              {value.cohosts.length > 1 && (
                <Button
                  variant="ghost"
                  aria-label={`Remove co-host ${String(index + 1)}`}
                  onClick={() => {
                    const cohosts = value.cohosts.filter((_, i) => i !== index)
                    onChange({
                      ...value,
                      cohosts,
                      threshold: Math.min(value.threshold, cohosts.length + 1),
                    })
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {total < MAX_MEMBERS && (
            <Button
              variant="secondary"
              onClick={() => {
                onChange({ ...value, cohosts: [...value.cohosts, ''] })
              }}
            >
              Add a co-host
            </Button>
          )}
          <div className="space-y-1.5">
            <label htmlFor="threshold" className="block text-sm font-medium">
              Approvals needed to move the money
            </label>
            <select
              id="threshold"
              value={value.threshold}
              onChange={(event) => {
                onChange({ ...value, threshold: Number(event.target.value) })
              }}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
            >
              {Array.from({ length: total - 1 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} of {total}, you included
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted">
            Every co-host must accept before the pot exists; each needs a Zealed wallet with a
            little test money for the messages. Co-hosts see the pot’s total and each piece that
            arrives, never who gave it.
          </p>
          {error !== undefined && <p className="text-sm font-medium text-bad">{error}</p>}
        </div>
      )}
    </fieldset>
  )
}
