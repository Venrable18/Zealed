import { formatZec } from '../lib/zec.ts'

interface FeePreviewProps {
  amountZat: bigint
  feeZat: bigint
}

/**
 * Shows what a send will cost. Display only: the fee itself comes from the wallet's proposal
 * (ZIP 317), so it is always passed in and never calculated here.
 */
export function FeePreview({ amountZat, feeZat }: FeePreviewProps) {
  return (
    <dl className="divide-y divide-line rounded-card border border-line bg-surface text-sm">
      <Row label="Amount" value={`${formatZec(amountZat)} ZEC`} />
      <Row label="Network fee" value={`${formatZec(feeZat)} ZEC`} />
      <Row label="Total" value={`${formatZec(amountZat + feeZat)} ZEC`} strong />
    </dl>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}
