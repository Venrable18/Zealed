import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState.tsx'
import { FEATURES } from '../features.tsx'

/** Placeholder until a feature is built. It says so plainly instead of faking content. */
export function FeaturePage({ path }: { path: string }) {
  const feature = FEATURES.find((candidate) => candidate.path === path)
  if (feature === undefined) throw new Error(`Unknown feature path: ${path}`)
  const { title, tagline, Icon } = feature

  return (
    <div className="py-10">
      <div className="flex items-center gap-3 text-seal">
        <Icon width={32} height={32} />
        <h1 className="text-3xl text-ink">{title}</h1>
      </div>
      <p className="mt-3 max-w-prose text-muted">{tagline}</p>
      <div className="mt-8">
        <EmptyState
          title="Not available yet"
          action={
            <Link to="/" className="underline underline-offset-4">
              Back to home
            </Link>
          }
        >
          This feature needs a working wallet, which is still being built. Nothing on this page
          sends or stores anything.
        </EmptyState>
      </div>
    </div>
  )
}
