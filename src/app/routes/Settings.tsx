import { Link } from 'react-router'
import { ZCASH_NETWORK } from '../../config/network.ts'
import { AutoLockSetting } from '../../features/settings/AutoLockSetting.tsx'
import { EndpointSettings } from '../../features/settings/EndpointSettings.tsx'
import { SeedExport } from '../../features/settings/SeedExport.tsx'
import { useSeedPort } from '../../features/settings/seedPort.ts'
import { VaultSettings } from '../../features/settings/VaultSettings.tsx'
import { WipeData } from '../../features/settings/WipeData.tsx'
import { useSettings, type ThemePreference } from '../settingsStore.ts'

const THEMES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function Settings() {
  const theme = useSettings((state) => state.theme)
  const setTheme = useSettings((state) => state.setTheme)
  const demoMode = useSettings((state) => state.demoMode)
  const setDemoMode = useSettings((state) => state.setDemoMode)
  const endpointUrl = useSettings((state) => state.endpointUrl)
  const setEndpointUrl = useSettings((state) => state.setEndpointUrl)
  const autoLockMinutes = useSettings((state) => state.autoLockMinutes)
  const setAutoLockMinutes = useSettings((state) => state.setAutoLockMinutes)
  const seedPort = useSeedPort()

  return (
    <div className="space-y-10 py-10">
      <h1 className="text-3xl">Settings</h1>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">Appearance</legend>
        {THEMES.map(({ value, label }) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => {
                setTheme(value)
              }}
              className="size-5 accent-seal"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Demo mode</h2>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={demoMode}
            onChange={(event) => {
              setDemoMode(event.target.checked)
            }}
            className="mt-1 size-5 accent-seal"
          />
          <span>
            Shorten timers (unlock dates, check-in periods) so a feature can be tried in minutes.
            <span className="block text-sm text-muted">
              Only for demonstrations. Shortened timers are not suitable for real use.
            </span>
          </span>
        </label>
      </section>

      <VaultSettings />

      <EndpointSettings selectedUrl={endpointUrl} onSelect={setEndpointUrl} />

      <AutoLockSetting
        minutes={autoLockMinutes}
        onChange={setAutoLockMinutes}
        walletExists={seedPort !== null}
      />

      <SeedExport port={seedPort} />

      <WipeData />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">About</h2>
        <p className="text-muted">
          Network: <span className="font-medium text-ink">{ZCASH_NETWORK}</span>. Zealed is a
          testnet prototype and does not handle real money.
        </p>
        <p>
          <Link to="/components" className="underline underline-offset-4">
            Component gallery
          </Link>
        </p>
      </section>
    </div>
  )
}
