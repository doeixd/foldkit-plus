/**
 * Why the server refused an operation, in Remote's vocabulary for "not
 * saved": `Forbidden` is Remote's `Denied.Forbidden`, `Invalid` its
 * `Refusal.invalid`, with the same tags, decoded types and encoding, so one
 * function shows a refusal whichever path made it. Sync keeps its own codec
 * because its core does not depend on `foldkit-remote`.
 */
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

/** Words for a person, bounded where they are decoded: a refusal is not a document. */
const Words = Schema.String.check(Schema.isMaxLength(500))

export const SyncRefusal = defineTaggedUnion({
  /** Who sent it may not make it (`authorize` or `admit` refused), with the rule's words when it gave some. */
  Forbidden: { reason: Schema.OptionFromOptionalKey(Words) },
  /**
   * It breaks a rule, or the server could not apply it. `message` is a fixed
   * sentence of the server's, never an error's message; `entity`, `rule` and
   * `path` name an Entity's invariant where a server knows one.
   */
  Invalid: {
    entity: Schema.OptionFromOptionalNullOr(Words),
    rule: Schema.OptionFromNullOr(Words),
    message: Words,
    path: Schema.Array(Words).check(Schema.isMaxLength(16)),
  },
  /** Written at a Message version the server cannot read. Sent once operations carry a version. */
  Unreadable: { version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)) },
})
export type SyncRefusal = typeof SyncRefusal.Type
