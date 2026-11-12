/**
 * Why the server refused an operation, in Remote's vocabulary for "not
 * saved": `Forbidden` is Remote's `Denied.Forbidden`, `Invalid` its
 * `Refusal.invalid`, with the same tags, decoded types and encoding, so one
 * function shows a refusal whichever path made it. Sync keeps its own codec
 * because its core does not depend on `foldkit-remote`.
 */
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

/** The most UTF-16 units a refusal's words may hold: a refusal is not a document. */
const WORDS = 500
const Words = Schema.String.check(Schema.isMaxLength(WORDS))

/**
 * `words` cut to fit a refusal, marked with an ellipsis where cut, and never
 * between the halves of a surrogate pair. A rule's reason is the
 * application's, with no bound of its own; an unfit one would fail every
 * exchange that carries it.
 */
export const fitWords = (words: string): string => {
  if (words.length <= WORDS) return words
  const end = words.charCodeAt(WORDS - 2)
  const cut = end >= 0xd800 && end <= 0xdbff ? WORDS - 2 : WORDS - 1
  return `${words.slice(0, cut)}…`
}

/** Why the server refused an operation, on `Rejection.refusal`: read it with `SyncRefusal.match`. */
export const SyncRefusal = defineTaggedUnion({
  /** Who sent it may not make it (`authorize` or `admit` refused), with the rule's words when it gave some. */
  Forbidden: { reason: Schema.OptionFromOptionalKey(Words) },
  /**
   * It breaks a rule, or the server could not apply it. `message` is a fixed
   * sentence of the server's, never an error's message. `entity`, `rule` and
   * `path` name an Entity's invariant, as Remote's do; `journalExchange`
   * knows none, so it sends them empty.
   */
  Invalid: {
    entity: Schema.OptionFromOptionalNullOr(Words),
    rule: Schema.OptionFromNullOr(Words),
    message: Words,
    path: Schema.Array(Words).check(Schema.isMaxLength(16)),
  },
  /** Written at a Message version no step of the document's history reads. Sent once operations carry a version. */
  Unreadable: { version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)) },
})
export type SyncRefusal = typeof SyncRefusal.Type
