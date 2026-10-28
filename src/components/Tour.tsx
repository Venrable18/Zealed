import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT, type MessageKey } from '../i18n/index.ts'
import { useTour } from './tourStore.ts'

interface TourStep {
  /** The `data-tour` value of the part of the screen to point at, or null to show in the middle. */
  target: string | null
  title: MessageKey
  body: MessageKey
}

const TOUR_STEPS: readonly TourStep[] = [
  { target: null, title: 'tour.welcomeTitle', body: 'tour.welcomeBody' },
  { target: 'nav-/app', title: 'tour.dashTitle', body: 'tour.dashBody' },
  { target: 'nav-/legacy', title: 'tour.legacyTitle', body: 'tour.legacyBody' },
  { target: 'nav-/blind-pot', title: 'tour.potTitle', body: 'tour.potBody' },
  { target: 'nav-/unsigned', title: 'tour.unsignedTitle', body: 'tour.unsignedBody' },
  { target: 'wallet-glance', title: 'tour.walletTitle', body: 'tour.walletBody' },
  { target: 'nav-/settings', title: 'tour.settingsTitle', body: 'tour.settingsBody' },
  { target: null, title: 'tour.endTitle', body: 'tour.endBody' },
]

const GAP = 16
const PAD = 6
/** Below this width the sidebar is a menu, so the tour talks from the middle instead of pointing. */
const WIDE = 1024

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Where a part of the screen is, or null if it is not showing (for example, a closed phone menu). */
function measure(target: string | null): Box | null {
  if (target === null) return null
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  if (element === null) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

/**
 * A short guided tour: a dimmed screen with one part lit up and a card that says what it is.
 * Back, Next and Escape work from the keyboard; focus stays inside the card while it is open and
 * goes back to where it was when the tour closes.
 */
export function Tour() {
  const t = useT()
  const { open, step, stop, go } = useTour()
  const [box, setBox] = useState<Box | null>(null)
  const [wide, setWide] = useState(true)
  const card = useRef<HTMLDivElement>(null)
  const returnTo = useRef<Element | null>(null)
  const current = TOUR_STEPS[step]
  const last = step === TOUR_STEPS.length - 1

  // Remember what had focus, and give it back when the tour closes.
  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement
    return () => {
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus()
    }
  }, [open])

  // Find the part of the screen this step points at, and keep up with scrolling and resizing.
  useLayoutEffect(() => {
    if (!open || current === undefined) return
    const update = () => {
      setWide(window.innerWidth >= WIDE)
      setBox(window.innerWidth >= WIDE ? measure(current.target) : null)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, current])

  // Move focus to the card on every step, so a screen reader reads it.
  useEffect(() => {
    if (open) card.current?.focus()
  }, [open, step])

  if (!open || current === undefined) return null

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      stop()
    } else if (event.key === 'ArrowRight' && !last) go(step + 1)
    else if (event.key === 'ArrowLeft' && step > 0) go(step - 1)
    else if (event.key === 'Tab' && card.current !== null) {
      // Keep Tab inside the card.
      const items = card.current.querySelectorAll<HTMLElement>('button')
      const first = items[0]
      const final = items[items.length - 1]
      if (first === undefined || final === undefined) return
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === card.current)
      ) {
        event.preventDefault()
        final.focus()
      } else if (!event.shiftKey && document.activeElement === final) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  // Beside the lit part when there is room; otherwise in the middle of the screen.
  const style: React.CSSProperties =
    box !== null && wide
      ? {
          position: 'fixed',
          left: box.left + box.width + GAP + PAD,
          top: Math.max(GAP, Math.min(box.top - PAD, window.innerHeight - 340)),
          width: 360,
        }
      : {
          position: 'fixed',
          left: '50%',
          top: '50%',
          width: 'min(26rem, calc(100vw - 2rem))',
          transform: 'translate(-50%, -50%)',
        }

  return (
    <div className="fixed inset-0 z-[60]" onKeyDown={onKeyDown}>
      {box !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-card shadow-[0_0_0_9999px_rgba(10,15,30,0.62)] ring-2 ring-seal"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[rgba(10,15,30,0.62)]" />
      )}
      {/* Clicking the dimmed area does nothing: the tour is closed with its own buttons or Escape. */}
      <div aria-hidden="true" className="fixed inset-0" />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.aria')}
        tabIndex={-1}
        style={style}
        className="rounded-card border border-line bg-surface p-5 text-ink shadow-2xl outline-none"
      >
        <p className="text-sm text-muted">
          {t('tour.step', { n: step + 1, total: TOUR_STEPS.length })}
        </p>
        <h2 className="mt-1 text-xl">{t(current.title)}</h2>
        <p className="mt-2 text-muted">{t(current.body)}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => {
                go(step - 1)
              }}
              className="min-h-11 rounded-full border border-line-strong px-4 font-medium hover:bg-sunken"
            >
              {t('tour.back')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (last) stop()
              else go(step + 1)
            }}
            className="min-h-11 rounded-full bg-seal px-5 font-semibold text-seal-ink hover:bg-seal-hover"
          >
            {last ? t('tour.done') : t('tour.next')}
          </button>
          {!last && (
            <button
              type="button"
              onClick={stop}
              className="ml-auto min-h-11 rounded-full px-3 text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              {t('tour.skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
