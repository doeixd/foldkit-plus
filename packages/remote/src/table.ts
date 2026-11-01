/**
 * The operator table a domain judges bodies by on the client: the one
 * `Remote.make` was given, else the kernel's. The read core only carries what
 * it was given; what judges (pending placement, placing a read's news, a live
 * insert's policy, `filtered`, a write's invariant check, `Law.check`, `why`)
 * resolves it here, so a page that only reads keeps none of the expression
 * code the kernel's operator is built with (#397).
 */
import { Option } from 'effect'
import { Operators, type MemoryOperators } from 'foldkit-entity'

export const tableOf = (given: Option.Option<MemoryOperators>): MemoryOperators =>
  Option.getOrElse(given, () => Operators.kernel)
