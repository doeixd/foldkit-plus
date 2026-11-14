/**
 * The `commandId` the adapter sends a write under, and what a lowered
 * aggregate reads back from it: one format, written and read here alone.
 */
import { Option } from 'effect'

/** One operation the aggregate decided, and the digest of the request it came with. */
export interface Decided {
  readonly operation: string
  readonly digest: string
}

/** A hex digest as the adapter makes one: SHA-256, cut to 128 bits. */
const DIGEST = /^[0-9a-f]{32}$/

/** The id of `mutation`'s command for one operation and request digest. */
export const commandIdOf = (mutation: string, { operation, digest }: Decided): string =>
  `${mutation}:${operation}:${digest}`

/**
 * The operation and request digest a `commandId` names, when `commandIdOf`
 * made it; none for an id made otherwise, such as Domain's own for a command
 * sent without one. An operation may hold `:`; a digest cannot.
 */
export const decidedOf = (mutation: string, commandId: string): Option.Option<Decided> => {
  if (!commandId.startsWith(`${mutation}:`)) return Option.none()
  const rest = commandId.slice(mutation.length + 1)
  const at = rest.lastIndexOf(':')
  const digest = rest.slice(at + 1)
  return at > 0 && DIGEST.test(digest)
    ? Option.some({ operation: rest.slice(0, at), digest })
    : Option.none()
}
