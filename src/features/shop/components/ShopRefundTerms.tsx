import { Link } from 'react-router-dom'
import { REFUND_TERMS } from '../shopTerms'

export default function ShopRefundTerms() {
  return (
    <>
      <section id="ketentuan-refund" aria-labelledby="ketentuan-refund-title" className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
        <h2 id="ketentuan-refund-title" className="text-lg font-bold text-greenroom-ink">Ketentuan &amp; Refund</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-greenroom-muted">
          {REFUND_TERMS.map((term) => <li key={term}>{term}</li>)}
        </ul>
      </section>
      <footer className="py-3 text-sm">
        <Link to="#ketentuan-refund" className="inline-flex min-h-11 items-center underline">Ketentuan &amp; Refund</Link>
      </footer>
    </>
  )
}
