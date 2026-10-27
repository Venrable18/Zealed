import { useId, type SVGProps } from 'react'

const PERFORATIONS = [4, 10, 16, 22, 28]

/**
 * Zealed's mark: a postage stamp, perforated edge and all, carrying a Z. It takes the theme's
 * airmail blue and red, so it works in both themes.
 */
export function Mark(props: SVGProps<SVGSVGElement>) {
  const mask = useId()
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <mask id={mask}>
          <rect width="32" height="32" fill="#fff" />
          {PERFORATIONS.map((at) => (
            <g key={at} fill="#000">
              <circle cx={at} cy="0" r="1.7" />
              <circle cx={at} cy="32" r="1.7" />
              <circle cx="0" cy={at} r="1.7" />
              <circle cx="32" cy={at} r="1.7" />
            </g>
          ))}
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect width="32" height="32" fill="var(--seal)" />
        <rect
          x="4.5"
          y="4.5"
          width="23"
          height="23"
          fill="none"
          stroke="var(--seal-ink)"
          strokeOpacity="0.4"
        />
        <path
          d="M10.5 10.5h11l-11 11h11"
          fill="none"
          stroke="var(--seal-ink)"
          strokeWidth="2.6"
          strokeLinecap="square"
        />
        <rect x="20.5" y="6.5" width="5" height="2" fill="var(--stamp)" />
      </g>
    </svg>
  )
}
