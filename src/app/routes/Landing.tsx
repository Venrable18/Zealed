import {
  Fragment,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react'
import { Link } from 'react-router'
import { ArrowIcon, BubbleIcon, LetterIcon, PotIcon, ShieldIcon } from '../../components/Icons.tsx'
import { Mark } from '../../components/Mark.tsx'
import { useLanguage, useT, type MessageKey } from '../../i18n/index.ts'

/** Characters a sealed letter turns into: what an encrypted letter looks like to anyone else. */
const CIPHER = 'ab0c1d2e3f4a5b6c7d8e9f+/=QxRzVkWnTjLpHsYmGdBu'

function useReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  return reduced
}

/**
 * The one moving thing on the page: the letter's words turn into ciphertext from left to right,
 * then the wax seal lands. With reduced motion, it is shown already sealed.
 */
function SealingLetter() {
  const t = useT()
  const reduced = useReducedMotion()
  const text = t('landing.letterBody')
  const [sealedChars, setSealedChars] = useState(reduced ? text.length : 0)
  const done = sealedChars >= text.length

  useEffect(() => {
    if (reduced) return
    let frame = 0
    let start: number | undefined
    const delay = 1100
    const duration = 1600
    const step = (now: number) => {
      start ??= now
      const elapsed = now - start - delay
      if (elapsed >= 0)
        setSealedChars(Math.min(text.length, Math.ceil((elapsed / duration) * text.length)))
      if (elapsed < duration) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [reduced, text])

  const shown = Array.from(text, (char, index) =>
    index < sealedChars && char !== ' '
      ? (CIPHER[(index * 7 + char.charCodeAt(0)) % CIPHER.length] ?? '')
      : char,
  ).join('')

  return (
    <figure
      className="relative mx-auto w-full max-w-lg lg:mx-0"
      role="img"
      aria-label={t('landing.letterLabel')}
    >
      <div
        aria-hidden="true"
        className="airmail-frame rounded-card px-7 pb-16 pt-8 shadow-[0_24px_48px_-28px_rgba(20,28,51,0.45)] sm:px-9"
      >
        <p className="font-display text-xl">{t('landing.letterTo')}</p>
        <p
          className={`mt-5 min-h-[7.5rem] font-display text-[1.375rem] leading-[1.45] break-words ${done ? 'text-muted' : 'text-ink'}`}
        >
          {shown}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={`absolute -bottom-7 right-8 flex size-24 items-center justify-center rounded-full bg-stamp text-surface shadow-[inset_0_-6px_0_rgba(0,0,0,0.18),0_10px_20px_-8px_rgba(196,38,56,0.55)] transition-[opacity,transform] duration-500 ease-out ${done ? 'scale-100 opacity-100' : 'scale-125 opacity-0'}`}
      >
        <span className="font-display text-4xl font-bold">Z</span>
      </div>
      <figcaption
        aria-hidden="true"
        className={`mt-6 max-w-[calc(100%-9rem)] text-sm text-muted transition-opacity duration-500 ${done ? 'opacity-100' : 'opacity-0'}`}
      >
        {t('landing.letterSealed')}
      </figcaption>
    </figure>
  )
}

type Cell = 'yes' | 'no' | MessageKey

const ROWS: readonly { what: MessageKey; cells: readonly [Cell, Cell, Cell, Cell, Cell] }[] = [
  { what: 'landing.rowText', cells: ['yes', 'landing.afterDate', 'no', 'no', 'no'] },
  { what: 'landing.rowGiver', cells: ['landing.ownGift', 'no', 'no', 'no', 'no'] },
  { what: 'landing.rowAmount', cells: ['yes', 'landing.whatTheyGot', 'no', 'no', 'no'] },
  { what: 'landing.rowUse', cells: ['yes', 'no', 'no', 'yes', 'no'] },
]
const COLUMNS: readonly MessageKey[] = [
  'landing.colYou',
  'landing.colOther',
  'landing.colNetwork',
  'landing.colServer',
  'landing.colZealed',
]

function PrivacyTable() {
  const t = useT()
  return (
    <>
      {/* Phones: one block per question. */}
      <div className="mt-8 space-y-3 md:hidden">
        {ROWS.map(({ what, cells }) => (
          <section key={what} className="rounded-card border border-line bg-surface p-5">
            <h3 className="font-sans text-base font-semibold">{t(what)}</h3>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              {cells.map((cell, index) => (
                <div key={index} className="contents">
                  <dt className="text-muted">{t(COLUMNS[index] ?? 'landing.colYou')}</dt>
                  <dd className={cell === 'no' ? 'text-muted' : 'font-medium'}>
                    {cell === 'yes' ? t('landing.yes') : cell === 'no' ? t('landing.no') : t(cell)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-8 hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-[30%] px-5 py-4 font-semibold">
                {t('landing.colWhat')}
              </th>
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className="px-4 py-4 text-sm font-semibold">
                  {t(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ what, cells }) => (
              <tr key={what} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-5 py-4 font-normal">
                  {t(what)}
                </th>
                {cells.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-4 py-4 text-sm ${cell === 'no' ? 'text-muted' : 'font-medium text-ink'}`}
                  >
                    {cell === 'yes' ? t('landing.yes') : cell === 'no' ? t('landing.no') : t(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const STEPS: readonly [MessageKey, MessageKey][] = [
  ['landing.step1', 'landing.step1Body'],
  ['landing.step2', 'landing.step2Body'],
  ['landing.step3', 'landing.step3Body'],
  ['landing.step4', 'landing.step4Body'],
]

const EXPLORER = 'https://testnet.zcashexplorer.app/transactions/'

/** Real transactions from the end-to-end runs on the NU7 testnet. */
const PROOF: readonly { title: MessageKey; body: MessageKey; txid: string; height: number }[] = [
  {
    title: 'landing.proofMemos',
    body: 'landing.proofMemosBody',
    txid: '7cee099c0dfffc9137a331562a217231e7d971e5a6c3e0acba04198350392026',
    height: 4_536_932,
  },
  {
    title: 'landing.proofZero',
    body: 'landing.proofZeroBody',
    txid: '9e81283d11c54a2ef773c5ba5034c269dc5b115e95e038888fac30899f7e489b',
    height: 4_536_966,
  },
  {
    title: 'landing.proofReceived',
    body: 'landing.proofReceivedBody',
    txid: '98659b05a6e276f6a97f07b84a459d7e1082dc656988a35626134266b712ba4f',
    height: 4_536_826,
  },
]

const FAQ: readonly [MessageKey, MessageKey][] = [
  ['landing.q1', 'landing.a1'],
  ['landing.q2', 'landing.a2'],
  ['landing.q3', 'landing.a3'],
  ['landing.q4', 'landing.a4'],
  ['landing.q5', 'landing.a5'],
]

const PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-control bg-seal px-6 font-semibold text-seal-ink hover:bg-seal-hover'
const H2 =
  'font-display text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em]'

/** A frame that reads as a screen of the app, around a mock of that screen. */
function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-card border border-line bg-surface shadow-[0_30px_60px_-36px_rgba(20,28,51,0.5)]"
    >
      <div className="flex items-center gap-3 border-b border-line bg-sunken px-5 py-3">
        <span className="font-display text-base font-semibold">Zealed</span>
        <span className="text-sm text-muted">{title}</span>
      </div>
      <div className="space-y-4 p-5 sm:p-6">{children}</div>
    </div>
  )
}

function LegacyScreen() {
  const t = useT()
  return (
    <Screen title="Legacy">
      <p className="font-display text-lg">{t('landing.mockSealedFor')}</p>
      <div className="flex items-center gap-4 rounded-control border border-line p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-seal font-display font-semibold text-seal-ink">
          Z
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('landing.letterTo')}</p>
          <p className="text-sm text-muted">{t('landing.mockOpensIn')}</p>
        </div>
        <span className="rounded-control border border-line px-3 py-1.5 text-sm text-muted">
          {t('landing.mockOpen')}
        </span>
      </div>
      <div className="flex items-center gap-4 rounded-control border border-line p-4">
        <span className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className={`size-3 rounded-full ${index < 3 ? 'bg-seal' : 'border border-line-strong'}`}
            />
          ))}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{t('landing.previewTo2')}</p>
          <p className="text-sm text-muted">{t('landing.mockGuardians')}</p>
        </div>
      </div>
    </Screen>
  )
}

function PotScreen() {
  const t = useT()
  const pieces = ['0.2', '0.1', '0.05', '0.2', '0.1', '0.1', '0.05', '0.05']
  return (
    <Screen title="Blind Pot">
      <p className="font-display text-lg">Ada and Tunde</p>
      <div className="rounded-control bg-sunken p-4">
        <p className="text-sm text-muted">{t('landing.potTotal')}</p>
        <p className="font-display text-4xl">0.85 TAZ</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pieces.map((piece, index) => (
            <span
              key={index}
              className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm"
            >
              {piece}
            </span>
          ))}
        </div>
      </div>
      <p className="inline-block rounded-full bg-good-soft px-3 py-1 text-sm font-medium text-good">
        {t('landing.mockStrength')}
      </p>
      <div>
        <p className="text-sm font-semibold">{t('landing.mockWishes')}</p>
        <ul className="mt-2 space-y-2">
          {(['landing.mockWish1', 'landing.mockWish2'] as const).map((wish) => (
            <li key={wish} className="rounded-control border border-line px-3 py-2 font-display">
              {t(wish)}
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  )
}

function UnsignedScreen() {
  const t = useT()
  return (
    <Screen title="Unsigned">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg">{t('landing.mockInbox')}</p>
        <span className="rounded-full border border-line px-3 py-1 text-sm text-muted">
          {t('landing.mockMinimum')}
        </span>
      </div>
      <div className="rounded-control border border-line p-4">
        <p className="text-sm text-muted">{t('landing.unsignedFrom')}</p>
        <p className="mt-2">{t('landing.unsignedMessage')}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-good">{t('landing.unsignedPaid')}</span>
          <span className="rounded-control bg-seal px-3 py-1.5 text-sm font-semibold text-seal-ink">
            {t('landing.mockReply')}
          </span>
        </div>
      </div>
      <div className="rounded-control border border-dashed border-line p-4 text-sm text-muted">
        {t('landing.unsignedFrom')}
      </div>
    </Screen>
  )
}

interface DeepDiveProps {
  id: string
  name: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  lead: MessageKey
  body: MessageKey
  points: readonly [MessageKey, MessageKey][]
  cta: MessageKey
  to: string
  screen: ReactNode
  flip?: boolean
}

function DeepDive({
  id,
  name,
  Icon,
  lead,
  body,
  points,
  cta,
  to,
  screen,
  flip = false,
}: DeepDiveProps) {
  const t = useT()
  return (
    <article
      aria-labelledby={id}
      className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-20 lg:py-20"
    >
      <div className={flip ? 'lg:order-2' : ''}>
        <div className="flex items-center gap-3 text-seal">
          <Icon width={28} height={28} />
          <h3 id={id} className="text-3xl text-ink">
            {name}
          </h3>
        </div>
        <p className="mt-4 font-display text-2xl leading-snug">{t(lead)}</p>
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">{t(body)}</p>
        <dl className="mt-8 space-y-5">
          {points.map(([title, text]) => (
            <div key={title} className="border-l-2 border-seal pl-4">
              <dt className="font-semibold">{t(title)}</dt>
              <dd className="mt-1 text-muted">{t(text)}</dd>
            </div>
          ))}
        </dl>
        <Link to={to} className={`${PRIMARY} mt-9`}>
          {t(cta)}
        </Link>
      </div>
      <div className={flip ? 'lg:order-1' : ''}>{screen}</div>
    </article>
  )
}

const FLOW: readonly { title: MessageKey; points: readonly MessageKey[]; carrier?: boolean }[] = [
  {
    title: 'landing.flowYou',
    points: ['landing.flowYou1', 'landing.flowYou2', 'landing.flowYou3'],
  },
  {
    title: 'landing.flowZcash',
    points: ['landing.flowZcash1', 'landing.flowZcash2', 'landing.flowZcash3'],
    carrier: true,
  },
  {
    title: 'landing.flowThem',
    points: ['landing.flowThem1', 'landing.flowThem2', 'landing.flowThem3'],
  },
]

/** You, Zcash, them: who does what, with nobody in the middle. The carrier is the envelope. */
function Flow() {
  const t = useT()
  return (
    <div className="mt-12 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
      {FLOW.map(({ title, points, carrier = false }, index) => (
        <Fragment key={title}>
          {index > 0 && (
            <div aria-hidden="true" className="flex items-center justify-center text-seal">
              <ArrowIcon width={28} height={28} className="rotate-90 lg:rotate-0" />
            </div>
          )}
          <section
            aria-labelledby={`flow-${title}`}
            className={`rounded-card p-6 ${carrier ? 'airmail-frame' : 'border border-line bg-surface'}`}
          >
            <h3 id={`flow-${title}`} className="text-2xl">
              {t(title)}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex gap-2.5 text-muted">
                  <span
                    aria-hidden="true"
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-seal"
                  />
                  {t(point)}
                </li>
              ))}
            </ul>
          </section>
        </Fragment>
      ))}
    </div>
  )
}

const MOMENTS: readonly {
  name: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  cells: readonly (readonly [MessageKey, MessageKey])[]
}[] = [
  {
    name: 'Legacy',
    Icon: LetterIcon,
    cells: [
      ['landing.exLegacy1', 'landing.exLegacy1b'],
      ['landing.exLegacy2', 'landing.exLegacy2b'],
      ['landing.exLegacy3', 'landing.exLegacy3b'],
      ['landing.exLegacy4', 'landing.exLegacy4b'],
    ],
  },
  {
    name: 'Blind Pot',
    Icon: PotIcon,
    cells: [
      ['landing.exPot1', 'landing.exPot1b'],
      ['landing.exPot2', 'landing.exPot2b'],
      ['landing.exPot3', 'landing.exPot3b'],
      ['landing.exPot4', 'landing.exPot4b'],
    ],
  },
  {
    name: 'Unsigned',
    Icon: BubbleIcon,
    cells: [
      ['landing.exUnsigned1', 'landing.exUnsigned1b'],
      ['landing.exUnsigned2', 'landing.exUnsigned2b'],
      ['landing.exUnsigned3', 'landing.exUnsigned3b'],
      ['landing.exUnsigned4', 'landing.exUnsigned4b'],
    ],
  },
]

/** Pick a feature, see what it keeps private: the privacy model as four plain answers. */
function Explainer() {
  const t = useT()
  const [chosen, setChosen] = useState(0)
  const moment = MOMENTS[chosen] ?? MOMENTS[0]
  return (
    <div className="mt-10 grid gap-8 rounded-card border border-line bg-surface p-5 sm:p-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-12">
      <div className="flex flex-wrap gap-1 self-start rounded-card bg-sunken p-1.5 lg:flex-col">
        {MOMENTS.map(({ name, Icon }, index) => (
          <button
            key={name}
            type="button"
            aria-pressed={index === chosen}
            onClick={() => {
              setChosen(index)
            }}
            className={`flex min-h-11 flex-1 items-center gap-2.5 rounded-control px-4 font-semibold transition-colors ${
              index === chosen
                ? 'bg-seal text-seal-ink'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <Icon width={20} height={20} />
            {name}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        <p className="text-sm font-semibold text-muted">
          {moment?.name}: {t('landing.explainLabel')}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {moment?.cells.map(([value, caption]) => (
            <div key={value} className="rounded-control border border-line bg-page p-5">
              <dt className="text-3xl font-bold tracking-[-0.03em]">{t(value)}</dt>
              <dd className="mt-1 text-muted">{t(caption)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

/** The public front page: what Zealed is, proof that it works, what it keeps private, and how to start. */
export function Landing() {
  const t = useT()
  const language = useLanguage()
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  const number = new Intl.NumberFormat(language)

  return (
    <div className="min-h-dvh overflow-x-clip bg-page text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('shell.skip')}
      </a>
      <div className="airmail-edge h-1.5" aria-hidden="true" />
      <header className="sticky top-3 z-40 mt-3 px-3 sm:px-5">
        <div className="mx-auto flex max-w-7xl items-center gap-8 rounded-full border border-line bg-surface/85 py-2 pl-5 pr-2 shadow-[0_16px_40px_-24px_rgba(20,28,51,0.45)] backdrop-blur">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-[-0.03em]"
          >
            <Mark width={30} height={30} />
            Zealed
          </Link>
          <nav aria-label={t('shell.nav')} className="hidden gap-7 text-[0.9375rem] md:flex">
            {(
              [
                ['#features', 'landing.navFeatures'],
                ['#proof', 'landing.navProof'],
                ['#privacy', 'landing.navPrivacy'],
                ['#faq', 'landing.navFaq'],
              ] as const
            ).map(([href, key]) => (
              <a key={href} href={href} className="text-muted hover:text-ink">
                {t(key)}
              </a>
            ))}
          </nav>
          <Link
            to="/app"
            className="ml-auto inline-flex min-h-11 items-center rounded-full bg-seal px-5 font-semibold text-seal-ink hover:bg-seal-hover"
          >
            {t('landing.open')}
          </Link>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pb-28 lg:pt-24">
          <div>
            <a
              href="#proof"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium hover:border-line-strong"
            >
              <span className="size-2 rounded-full bg-good" aria-hidden="true" />
              {t('landing.live')}
            </a>
            <h1 className="mt-7 max-w-[17ch] font-display text-[clamp(2.75rem,6vw,5rem)] font-bold leading-[0.98] tracking-[-0.045em]">
              {t('landing.title')}
            </h1>
            <p className="mt-7 max-w-[36rem] text-lg leading-relaxed text-muted sm:text-xl">
              {t('landing.intro')}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link to="/app" className={PRIMARY}>
                {t('landing.open')}
              </Link>
              <a
                href="#proof"
                className="inline-flex min-h-12 items-center rounded-control border border-line-strong px-5 font-medium hover:bg-sunken"
              >
                {t('landing.seeProof')}
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {(['landing.trust1', 'landing.trust2', 'landing.trust3'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <ShieldIcon width={18} height={18} className="text-good" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative lg:pl-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-16 -z-0 rounded-full bg-[radial-gradient(closest-side,var(--seal-soft),transparent)] opacity-90"
            />
            <SealingLetter />
            <div
              aria-hidden="true"
              className="absolute -bottom-36 -left-8 hidden w-72 rounded-card border border-line bg-surface p-4 shadow-[0_20px_40px_-24px_rgba(20,28,51,0.45)] xl:block"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-seal">
                <PotIcon width={16} height={16} />
                {t('landing.floatPot')}
              </p>
              <p className="mt-1 text-sm text-muted">{t('landing.floatPotBody')}</p>
            </div>
            <div
              aria-hidden="true"
              className="absolute -right-4 -top-10 hidden w-64 rounded-card border border-line bg-surface p-4 shadow-[0_20px_40px_-24px_rgba(20,28,51,0.45)] xl:block"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-seal">
                <BubbleIcon width={16} height={16} />
                Unsigned
              </p>
              <p className="mt-1 text-sm text-muted">{t('landing.unsignedFrom')}</p>
              <p className="mt-1 text-sm font-medium text-good">{t('landing.unsignedPaid')}</p>
            </div>
          </div>
        </section>

        {/* How it travels */}
        <section
          id="travel"
          aria-labelledby="travel-title"
          className="mx-auto max-w-7xl px-5 pb-20 pt-6 sm:px-8 lg:pb-28"
        >
          <h2 id="travel-title" className={`${H2} max-w-[22ch]`}>
            {t('landing.flowTitle')}
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            {t('landing.flowIntro')}
          </p>
          <Flow />
        </section>

        {/* Proof */}
        <section
          id="proof"
          aria-labelledby="proof-title"
          className="border-y border-line bg-surface"
        >
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
              <h2 id="proof-title" className={H2}>
                {t('landing.proofTitle')}
              </h2>
              <p className="text-lg leading-relaxed text-muted lg:pt-2">
                {t('landing.proofIntro')}
              </p>
            </div>
            <ul className="mt-12 grid gap-5 md:grid-cols-3">
              {PROOF.map(({ title, body, txid, height }) => (
                <li
                  key={txid}
                  className="flex flex-col rounded-card border border-line bg-page p-6"
                >
                  <p className="text-sm text-muted">
                    {t('landing.proofBlock', { height: number.format(height) })}
                  </p>
                  <h3 className="mt-2 text-xl">{t(title)}</h3>
                  <p className="mt-2 text-muted">{t(body)}</p>
                  <p className="mt-5 break-all font-mono text-sm" title={txid}>
                    {txid.slice(0, 12)}…{txid.slice(-8)}
                  </p>
                  <a
                    href={`${EXPLORER}${txid}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-auto pt-4 font-medium underline underline-offset-4"
                  >
                    {t('landing.proofView')}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          aria-labelledby="features-title"
          className="border-t border-line bg-sunken"
        >
          <div className="mx-auto max-w-7xl px-5 pt-20 sm:px-8">
            <h2 id="features-title" className={H2}>
              {t('landing.featuresTitle')}
            </h2>
          </div>
          <div className="mx-auto max-w-7xl divide-y divide-line px-5 pb-6 sm:px-8">
            <DeepDive
              id="feature-legacy"
              name="Legacy"
              Icon={LetterIcon}
              lead="feature.legacy"
              body="landing.legacyBody"
              points={[
                ['landing.legacyDate', 'landing.legacyDateBody'],
                ['landing.legacySilent', 'landing.legacySilentBody'],
                ['landing.legacyGift', 'landing.legacyGiftBody'],
              ]}
              cta="landing.legacyCta"
              to="/legacy"
              screen={<LegacyScreen />}
            />
            <DeepDive
              id="feature-pot"
              name="Blind Pot"
              Icon={PotIcon}
              lead="feature.blindPot"
              body="landing.potBody"
              points={[
                ['landing.potPoint1', 'landing.potPoint1Body'],
                ['landing.potPoint2', 'landing.potPoint2Body'],
                ['landing.potPoint3', 'landing.potPoint3Body'],
              ]}
              cta="landing.potCta"
              to="/blind-pot"
              screen={<PotScreen />}
              flip
            />
            <DeepDive
              id="feature-unsigned"
              name="Unsigned"
              Icon={BubbleIcon}
              lead="feature.unsigned"
              body="landing.unsignedBody"
              points={[
                ['landing.unsignedPoint1', 'landing.unsignedPoint1Body'],
                ['landing.unsignedPoint2', 'landing.unsignedPoint2Body'],
                ['landing.unsignedPoint3', 'landing.unsignedPoint3Body'],
              ]}
              cta="landing.unsignedCta"
              to="/unsigned"
              screen={<UnsignedScreen />}
            />
          </div>
        </section>

        {/* Privacy */}
        <section
          id="privacy"
          aria-labelledby="privacy-title"
          className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28"
        >
          <h2 id="privacy-title" className={H2}>
            {t('landing.explainTitle')}
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            {t('landing.explainIntro')}
          </p>
          <Explainer />
          <details className="group mt-6">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-seal underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                ›
              </span>
              {t('landing.fullTable')}
            </summary>
            <p className="mt-3 max-w-2xl text-muted">{t('landing.privacyIntro')}</p>
            <PrivacyTable />
          </details>
          <p className="mt-5 max-w-2xl text-muted">{t('landing.privacyNote')}</p>
        </section>

        {/* Getting started */}
        <section id="how" aria-labelledby="how-title" className="border-t border-line">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <h2 id="how-title" className={H2}>
              {t('landing.howTitle')}
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([title, body], index) => (
                <li key={title} className="border-t-2 border-seal pt-5">
                  <p className="font-display text-3xl text-seal" aria-hidden="true">
                    {index + 1}
                  </p>
                  <h3 className="mt-2 text-xl">{t(title)}</h3>
                  <p className="mt-2 text-muted">{t(body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Questions */}
        <section id="faq" aria-labelledby="faq-title" className="border-t border-line">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_2fr] lg:gap-20">
            <h2 id="faq-title" className={H2}>
              {t('landing.faqTitle')}
            </h2>
            <div className="space-y-3">
              {FAQ.map(([question, answer]) => (
                <details
                  key={question}
                  className="group rounded-card border border-line bg-surface open:border-seal"
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {t(question)}
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-xl leading-none text-seal transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-prose px-5 pb-5 leading-relaxed text-muted">{t(answer)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call */}
        <section aria-labelledby="cta-title" className="px-3 pb-16 sm:px-5">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 rounded-[1.75rem] bg-seal px-6 py-16 text-seal-ink sm:px-12 lg:flex-row lg:items-end lg:justify-between lg:py-20">
            <div>
              <h2
                id="cta-title"
                className="max-w-[18ch] font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05]"
              >
                {t('landing.ctaTitle')}
              </h2>
              <p className="mt-4 max-w-xl text-lg opacity-90">{t('landing.ctaBody')}</p>
            </div>
            <Link
              to="/app"
              className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-surface px-7 font-semibold text-ink hover:bg-sunken"
            >
              {t('landing.open')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="overflow-hidden border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-sm text-muted sm:px-8">
          <span className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Mark width={22} height={22} />
            Zealed
          </span>
          <span>{t('landing.footer')}</span>
        </div>
        <p
          aria-hidden="true"
          className="pointer-events-none -mb-[0.18em] select-none text-center font-display text-[clamp(6rem,24vw,22rem)] font-bold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1.5px_var(--line-strong)] opacity-40"
        >
          Zealed
        </p>
      </footer>
    </div>
  )
}
