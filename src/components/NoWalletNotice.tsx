import { Link } from 'react-router'

/**
 * Shown where something needs the wallet and there is none open yet: what the wallet is needed
 * for, and the way to get one. The form stays usable, so people can see how it works first.
 */
export function NoWalletNotice({ to }: { to: string }) {
  return (
    <p
      role="status"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control border border-seal/30 bg-seal-soft px-4 py-3"
    >
      <span>You need a wallet {to}. You can fill in the form now to see how it works.</span>
      <Link to="/wallet" className="font-semibold text-seal underline underline-offset-4">
        Set up a wallet
      </Link>
    </p>
  )
}
