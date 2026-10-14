import { Link } from 'react-router'

export function NotFound() {
  return (
    <section className="py-16">
      <h1 className="text-2xl">Page not found</h1>
      <p className="mt-3">
        <Link to="/" className="underline underline-offset-4">
          Back to home
        </Link>
      </p>
    </section>
  )
}
