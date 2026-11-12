/**
 * A bundle's helpers as a record, given its args: the record a spec gave, or
 * what its args function returns. Internal; the placements and combinators
 * share it so the two forms resolve one way.
 */
import type { Helper } from './bundle.js'

type HelperSet = Readonly<Record<string, Helper<any, any, any, any>>>

/** Whether `helpers` is the form that reads the placement's args. */
export const readsArgs = (helpers: unknown): helpers is (args: unknown) => HelperSet =>
  typeof helpers === 'function'

/** The record for `args`; an absent `helpers` is no helpers. */
export const helpersFor = <Helpers extends HelperSet, Args>(
  helpers: Helpers | ((args: Args) => Helpers) | undefined,
  args: Args,
): Helpers => (typeof helpers === 'function' ? helpers(args) : (helpers ?? ({} as Helpers)))
