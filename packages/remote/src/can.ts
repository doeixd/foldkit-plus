/**
 * `Data.can` (#533): whether a declared write would be refused, told from what
 * the client holds, in the order the server refuses: a held `may`, then the
 * write's `when`, then the invariants of the row it leaves.
 */
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

/** What the client can tell the server would refuse a write with. */
export const CanRefusal = defineTaggedUnion({
  /** A held `may` forbids it, with its words when it gave any. */
  Forbidden: { reason: Schema.Option(Schema.String) },
  /** The row does not hold what the write's `when` asks. */
  Unmet: {},
  /** The row the write would leave breaks this invariant of its Entity. */
  Invalid: {
    entity: Schema.String,
    rule: Schema.String,
    message: Schema.String,
    path: Schema.Array(Schema.String),
  },
})
export type CanRefusal = typeof CanRefusal.Type

/**
 * What `Data.can` answers, read with `Can.match`. `No` is a hint the server
 * would refuse, not a refusal: the write is still sent when it is made.
 * `Undecided` says why the client cannot tell: the row is not held, a field
 * or operator is missing, or an input key was not given.
 */
export const Can = defineTaggedUnion({
  Yes: {},
  No: { refusal: CanRefusal },
  Undecided: { reasons: Schema.Array(Schema.String) },
})
export type Can = typeof Can.Type
