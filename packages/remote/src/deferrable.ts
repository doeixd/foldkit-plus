// Apart from the resume part, so a page that never resumes keeps none of it (#396).
/**
 * Marks a Subscription entry Remote built as one that may start late under
 * `foldkit-ssr`'s deferred boot (its decision 10): a read with resumed data
 * plans nothing, a live subscription resumes from the cursor the envelope
 * carries, and retention running late collects late. Non-enumerable, so the
 * runtime's iteration of an entry never sees it.
 */
export const DEFERRABLE: unique symbol = Symbol.for('foldkit-remote/deferrable')

/** Marks every entry of a record Remote built, lifted or not. */
export const markAll = <Entries extends object>(entries: Entries): Entries => {
  for (const entry of Object.values(entries)) {
    Object.defineProperty(entry, DEFERRABLE, { value: true, enumerable: false })
  }
  return entries
}
