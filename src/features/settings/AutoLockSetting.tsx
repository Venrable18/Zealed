import { AUTO_LOCK_OPTIONS } from '../../app/settingsStore.ts'

interface AutoLockSettingProps {
  minutes: number
  onChange: (minutes: number) => void
  /** True once there is a wallet to lock. */
  walletExists: boolean
}

export function AutoLockSetting({ minutes, onChange, walletExists }: AutoLockSettingProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="auto-lock" className="block text-lg font-semibold">
        Lock after
      </label>
      <select
        id="auto-lock"
        value={minutes}
        onChange={(event) => {
          onChange(Number(event.target.value))
        }}
        className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
      >
        {AUTO_LOCK_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option} {option === 1 ? 'minute' : 'minutes'} of inactivity
          </option>
        ))}
      </select>
      <p className="text-sm text-muted">
        {walletExists
          ? 'The wallet locks and asks for your passphrase after this long without use.'
          : 'Saved now, and used once the wallet exists. There is no “never”: a wallet left open is a risk.'}
      </p>
    </div>
  )
}
