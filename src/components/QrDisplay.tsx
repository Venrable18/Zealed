import QRCode from 'qrcode'
import { useMemo } from 'react'

interface QrDisplayProps {
  /** Text to encode. Stays in the browser; nothing is sent anywhere. */
  value: string
  /** What the code is for, read aloud by screen readers. Do not put the value in it. */
  label: string
}

const QUIET_ZONE = 4

/**
 * QR code drawn as SVG from the code's module grid. It is always dark-on-white, whatever the
 * theme, because scanners need that contrast.
 */
export function QrDisplay({ value, label }: QrDisplayProps) {
  const grid = useMemo(() => {
    try {
      const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
      return { size: modules.size, dark: modules.data }
    } catch {
      return null
    }
  }, [value])

  if (grid === null) {
    return <p className="text-bad">This is too long to show as a QR code.</p>
  }

  const total = grid.size + QUIET_ZONE * 2
  const rects: React.ReactElement[] = []
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (grid.dark[row * grid.size + col] === 1) {
        rects.push(
          <rect
            key={`${String(row)}-${String(col)}`}
            x={col + QUIET_ZONE}
            y={row + QUIET_ZONE}
            width="1"
            height="1"
          />,
        )
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(total)} ${String(total)}`}
      shapeRendering="crispEdges"
      className="aspect-square w-full max-w-64 rounded-control bg-white"
    >
      <g fill="#000000">{rects}</g>
    </svg>
  )
}
