import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextArea, TextInput } from '../../components/Field.tsx'
import { formatZec } from '../../lib/zec.ts'
import { useT } from '../../i18n/index.ts'
import { useVaultStatus } from '../../storage/vaultState.ts'
import { loadWasm } from '../../wallet/loadWasm.ts'
import { syncNow, useWalletRuntime } from '../../wallet/runtime.ts'
import { useWalletData } from '../../wallet/walletData.ts'
import { useBalance } from '../../wallet/useBalance.ts'

const WORDS = 24

function Start() {
  const t = useT()
  const [writing, setWriting] = useState<string | undefined>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [birthday, setBirthday] = useState('')
  const [errors, setErrors] = useState<{ phrase?: string; birthday?: string }>({})

  async function create() {
    setBusy(true)
    setFailed(false)
    try {
      setWriting((await loadWasm()).generate_seed_phrase())
      setConfirmed(false)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  if (writing !== undefined) {
    return (
      <section aria-labelledby="write-title" className="space-y-4">
        <h2 id="write-title" className="text-xl">
          {t('wallet.writeTitle')}
        </h2>
        <p className="max-w-prose text-muted">{t('wallet.writeBody')}</p>
        <ol
          className="grid grid-cols-2 gap-2 rounded-card border border-line bg-surface p-4 font-mono text-sm sm:grid-cols-3"
          data-testid="seed-words"
        >
          {writing.split(' ').map((word, index) => (
            <li key={index} className="list-inside list-decimal">
              {word}
            </li>
          ))}
        </ol>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked)
            }}
            className="size-5 accent-seal"
          />
          {t('wallet.written')}
        </label>
        <div className="flex gap-3">
          <Button
            disabled={!confirmed}
            onClick={() => {
              // Birthday 0 means "brand new": the wallet starts just behind the chain tip.
              useWalletData.getState().set({ seed: writing, birthday: 0, accounts: [] })
              setWriting(undefined)
            }}
          >
            {t('wallet.continue')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setWriting(undefined)
            }}
          >
            {t('wallet.cancel')}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="create-title" className="space-y-3">
        <h2 id="create-title" className="text-xl">
          {t('wallet.createTitle')}
        </h2>
        <p className="max-w-prose text-muted">{t('wallet.createBody')}</p>
        <Button
          busy={busy}
          onClick={() => {
            void create()
          }}
        >
          {t('wallet.create')}
        </Button>
        {failed && (
          <p role="alert" className="text-sm font-medium text-bad">
            {t('wallet.failed')}
          </p>
        )}
      </section>

      <section aria-labelledby="restore-title" className="space-y-3">
        <h2 id="restore-title" className="text-xl">
          {t('wallet.restoreTitle')}
        </h2>
        <p className="max-w-prose text-muted">{t('wallet.restoreBody')}</p>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const words = phrase.trim().toLowerCase().split(/\s+/)
            const next: { phrase?: string; birthday?: string } = {}
            if (words.length !== WORDS || words.some((word) => !/^[a-z]+$/.test(word)))
              next.phrase = t('wallet.badPhrase')
            const height = birthday.trim()
            if (height !== '' && !/^\d{1,9}$/.test(height)) next.birthday = t('wallet.badBirthday')
            setErrors(next)
            if (Object.keys(next).length > 0) return
            useWalletData.getState().set({
              seed: words.join(' '),
              birthday: height === '' ? null : Number(height),
              accounts: [],
            })
            setPhrase('')
          }}
        >
          <TextArea
            label={t('wallet.phrase')}
            rows={3}
            value={phrase}
            onChange={(event) => {
              setPhrase(event.target.value)
            }}
            autoComplete="off"
            spellCheck={false}
            {...(errors.phrase === undefined ? {} : { error: errors.phrase })}
          />
          <TextInput
            label={t('wallet.birthday')}
            inputMode="numeric"
            value={birthday}
            onChange={(event) => {
              setBirthday(event.target.value)
            }}
            autoComplete="off"
            hint={t('wallet.birthdayHint')}
            {...(errors.birthday === undefined ? {} : { error: errors.birthday })}
          />
          <Button type="submit">{t('wallet.restore')}</Button>
        </form>
      </section>
    </div>
  )
}

function Ready() {
  const t = useT()
  const syncing = useWalletRuntime((state) => state.syncing)
  const syncedAt = useWalletRuntime((state) => state.syncedAt)
  const problem = useWalletRuntime((state) => state.problem)
  const detail = useWalletRuntime((state) => state.detail)
  const balance = useBalance()
  return (
    <div className="space-y-8">
      <section aria-labelledby="balance-title" className="space-y-3">
        <h2 id="balance-title" className="text-xl">
          {t('wallet.balance')}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{t('wallet.spendable')}</dt>
            <dd className="text-2xl font-semibold" data-testid="spendable">
              {balance === undefined ? '…' : `${formatZec(balance.spendableZat)} TAZ`}
            </dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{t('wallet.pending')}</dt>
            <dd className="text-2xl font-semibold" data-testid="pending">
              {balance === undefined ? '…' : `${formatZec(balance.pendingZat)} TAZ`}
            </dd>
          </div>
        </dl>
        <p role="status" className="text-sm text-muted">
          {syncing
            ? t('wallet.syncing')
            : problem === 'sync'
              ? t('wallet.syncFailed')
              : syncedAt === null
                ? ''
                : t('wallet.syncedAt', { time: new Date(syncedAt).toLocaleTimeString() })}
        </p>
        {problem === 'sync' && detail !== null && (
          <details className="text-sm text-muted">
            <summary className="min-h-11 cursor-pointer py-2">{t('wallet.details')}</summary>
            <p className="break-all font-mono" data-testid="sync-detail">
              {detail}
            </p>
          </details>
        )}
        <Button
          variant="secondary"
          disabled={syncing}
          onClick={() => {
            void syncNow()
          }}
        >
          {t('wallet.syncNow')}
        </Button>
      </section>

      <section aria-labelledby="fund-title" className="space-y-3">
        <h2 id="fund-title" className="text-xl">
          {t('wallet.fundTitle')}
        </h2>
        <p className="max-w-prose text-muted">{t('wallet.fundBody')}</p>
        <p className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/receive" className="underline underline-offset-4">
            {t('wallet.receiveLink')}
          </Link>
          <Link to="/settings" className="underline underline-offset-4">
            {t('wallet.backupLink')}
          </Link>
        </p>
      </section>
    </div>
  )
}

export function Wallet() {
  const t = useT()
  const vault = useVaultStatus((state) => state.status)
  const hasSeed = useWalletData((state) => state.seed !== null)
  const status = useWalletRuntime((state) => state.status)
  const detail = useWalletRuntime((state) => state.detail)

  let body
  if (vault !== 'unlocked') {
    body = (
      <EmptyState
        title={t('wallet.title')}
        action={
          <Link to="/settings#vault" className="underline underline-offset-4">
            {t('wallet.needVaultLink')}
          </Link>
        }
      >
        {t('wallet.needVault')}
      </EmptyState>
    )
  } else if (!hasSeed) body = <Start />
  else if (status === 'error')
    body = (
      <div className="space-y-4">
        <p role="alert" className="rounded-control border border-bad bg-bad-soft px-4 py-3">
          {t('wallet.failed')}
        </p>
        {detail !== null && (
          <details className="text-sm text-muted">
            <summary className="min-h-11 cursor-pointer py-2">{t('wallet.details')}</summary>
            <p className="break-all font-mono" data-testid="open-detail">
              {detail}
            </p>
          </details>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              const seed = useWalletData.getState().seed
              // Setting the seed again makes the wallet try to open once more.
              useWalletData.getState().set({ seed: null })
              useWalletData.getState().set({ seed })
            }}
          >
            {t('wallet.retry')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              useWalletData.getState().reset()
            }}
          >
            {t('wallet.remove')}
          </Button>
        </div>
      </div>
    )
  else if (status !== 'ready')
    body = (
      <p role="status" className="text-muted">
        {t('wallet.loading')}
      </p>
    )
  else body = <Ready />

  return (
    <div className="max-w-3xl space-y-8 py-10">
      <div>
        <h1 className="text-4xl">{t('wallet.title')}</h1>
        <p className="mt-3 max-w-prose text-muted">{t('wallet.intro')}</p>
      </div>
      {body}
    </div>
  )
}
