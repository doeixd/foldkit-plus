/**
 * The checks `A11y.conform` left on a view, so the views `detach` and
 * `replace` derive from it are checked again. Kept apart from `a11y.ts` so a
 * page that never conforms carries none of the check.
 */
import type { Pattern } from './a11y.js'

export interface Conformance {
  readonly pattern: Pattern
  /** Throws a `DiagnosticError` when `view` no longer conforms to `pattern`. */
  readonly check: (view: object) => void
}

const recorded = new WeakMap<object, ReadonlyArray<Conformance>>()

export const conformancesOf = (view: object): ReadonlyArray<Conformance> => recorded.get(view) ?? []

export const record = (view: object, conformances: ReadonlyArray<Conformance>): void => {
  if (conformances.length > 0) recorded.set(view, conformances)
}

/** Carries what `from` was checked against onto `to`, checking `to` when `again`. */
export const carry = (from: object, to: object, again: boolean): void => {
  const conformances = conformancesOf(from)
  if (again) for (const { check } of conformances) check(to)
  record(to, conformances)
}
