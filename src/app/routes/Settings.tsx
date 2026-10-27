import { Link } from 'react-router'
import { LANGUAGES, useT, type LanguagePreference, type MessageKey } from '../../i18n/index.ts'
import { ZCASH_NETWORK } from '../../config/network.ts'
import { AutoLockSetting } from '../../features/settings/AutoLockSetting.tsx'
import { EndpointSettings } from '../../features/settings/EndpointSettings.tsx'
import { SeedExport } from '../../features/settings/SeedExport.tsx'
import { useSeedPort } from '../../features/settings/seedPort.ts'
import { VaultSettings } from '../../features/settings/VaultSettings.tsx'
import { WipeData } from '../../features/settings/WipeData.tsx'
import { useSettings, type ThemePreference } from '../settingsStore.ts'

const THEMES = [
  { value: 'system', key: 'settings.theme.system' },
  { value: 'light', key: 'settings.theme.light' },
  { value: 'dark', key: 'settings.theme.dark' },
] as const satisfies readonly { value: ThemePreference; key: MessageKey }[]

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
  const language = useSettings((state) => state.language)
  const setLanguage = useSettings((state) => state.setLanguage)
  const t = useT()
  const languageChoices: readonly { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.language.system') },
    ...LANGUAGES.map(({ code, label }) => ({ value: code, label })),
  ]

  return (
    <div className="max-w-3xl space-y-10 py-10">
      <h1 className="text-4xl">{t('settings.title')}</h1>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">{t('settings.appearance')}</legend>
        {THEMES.map(({ value, key }) => (
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
            {t(key)}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">{t('settings.language')}</legend>
        {languageChoices.map(({ value, label }) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="language"
              value={value}
              checked={language === value}
              onChange={() => {
                setLanguage(value)
              }}
              className="size-5 accent-seal"
            />
            <span lang={value === 'system' ? undefined : value}>{label}</span>
          </label>
        ))}
        <p className="text-sm text-muted">{t('settings.language.note')}</p>
      </fieldset>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('settings.demo')}</h2>
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
            {t('settings.demo.label')}
            <span className="block text-sm text-muted">{t('settings.demo.note')}</span>
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
        <h2 className="text-lg font-semibold">{t('settings.about')}</h2>
        <p className="text-muted">{t('settings.about.network', { network: ZCASH_NETWORK })}</p>
        <p>
          <Link to="/components" className="underline underline-offset-4">
            {t('settings.about.gallery')}
          </Link>
        </p>
      </section>
    </div>
  )
}
