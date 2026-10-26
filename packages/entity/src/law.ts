/**
 * Laws an operator declares (expr-operations-DESIGN §10): equations every
 * implementation of it keeps over a domain. A law describes; nothing rewrites a
 * body by one. `Conformance.laws` tests an implementation against them, and
 * what it finds is evidence recorded in that implementation's table.
 */
import { Data, Option, Schema } from 'effect'
import type { Operator } from './expr.js'
import { jsonSchemaOf } from './jsonSchema.js'

/** An operator a law names as a witness: the inverse, or the operator distributed over. */
type AnyOperator = Operator<ReadonlyArray<Schema.Top>, Schema.Top>

/** Which argument a witness stands in. */
export type Side = 'left' | 'right' | 'both'

/**
 * A law, over its domain: by default every non-null value of the operator's
 * input schemas; narrowed by `Law.within`.
 */
export type Law = Data.TaggedEnum<{
  /** `op(op(a, b), c) = op(a, op(b, c))` */
  Associative: { readonly domain: Option.Option<Schema.Top> }
  /** `op(a, b) = op(b, a)` */
  Commutative: { readonly domain: Option.Option<Schema.Top> }
  /** `op(a, a) = a` */
  Idempotent: { readonly domain: Option.Option<Schema.Top> }
  /** `op(e, a) = a` (left), `op(a, e) = a` (right), or both. */
  Identity: {
    readonly domain: Option.Option<Schema.Top>
    readonly value: unknown
    readonly side: Side
  }
  /** `op(z, a) = z` (left), `op(a, z) = z` (right), or both. */
  Absorbing: {
    readonly domain: Option.Option<Schema.Top>
    readonly value: unknown
    readonly side: Side
  }
  /** `op(a, other(a)) = identity` */
  Inverse: {
    readonly domain: Option.Option<Schema.Top>
    readonly other: AnyOperator
    readonly identity: unknown
  }
  /** `op(a, over(b, c)) = over(op(a, b), op(a, c))` */
  Distributes: { readonly domain: Option.Option<Schema.Top>; readonly over: AnyOperator }
  /** `a ≤ b` at `position` implies `op(…a…) ≤ op(…b…)`, or `≥` when decreasing. */
  Monotonic: {
    readonly domain: Option.Option<Schema.Top>
    readonly direction: 'increasing' | 'decreasing'
    readonly position: number
  }
  /** Folding the result equals folding the arguments first: its text keeps their collation (§7). */
  PreservesCollation: { readonly domain: Option.Option<Schema.Top> }
}>

const Laws = Data.taggedEnum<Law>()
const unnarrowed = { domain: Option.none<Schema.Top>() }

/**
 * A law as JSON says it: what `Operators.describe` lists and evidence names.
 * Its witnesses are values as stored and operators by name; its domain is a
 * JSON Schema, or `null` for the operator's whole input.
 */
export const LawDescription = Schema.Struct({
  kind: Schema.String,
  witnesses: Schema.Record(Schema.String, Schema.Unknown),
  domain: Schema.Unknown,
})
export type LawDescription = typeof LawDescription.Type

/** An operator by its id, and its version when that is not the first. */
const nameOf = (operator: AnyOperator): string =>
  operator.descriptor.version === 1
    ? operator.descriptor.id
    : `${operator.descriptor.id}@${operator.descriptor.version}`

export const Law = {
  associative: Laws.Associative(unnarrowed),
  commutative: Laws.Commutative(unnarrowed),
  idempotent: Laws.Idempotent(unnarrowed),
  preservesCollation: Laws.PreservesCollation(unnarrowed),
  /** `value` leaves the other argument as it is, from `side` (both by default). */
  identity: (value: unknown, side: Side = 'both'): Law =>
    Laws.Identity({ ...unnarrowed, value, side }),
  /** `value` is the answer whatever the other argument, from `side` (both by default). */
  absorbing: (value: unknown, side: Side = 'both'): Law =>
    Laws.Absorbing({ ...unnarrowed, value, side }),
  /** `other` undoes the operator: `op(a, other(a))` is `identity`. */
  inverse: <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    other: Operator<In, Out>,
    identity: unknown,
  ): Law => Laws.Inverse({ ...unnarrowed, other, identity }),
  /** The operator distributes over `over`, from the left. */
  distributes: <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    over: Operator<In, Out>,
  ): Law => Laws.Distributes({ ...unnarrowed, over }),
  /** Moving the argument at `position` up moves the result up (or down, decreasing). */
  monotonic: (direction: 'increasing' | 'decreasing', position: number): Law =>
    Laws.Monotonic({ ...unnarrowed, direction, position }),
  /**
   * The law over the values `domain` accepts only: a law that holds of the
   * integers and not of every number, say, narrowed so it is tested where it
   * is claimed.
   */
  within: (law: Law, domain: Schema.Top): Law =>
    Object.freeze({ ...law, domain: Option.some(domain) }),

  $match: Laws.$match,

  /** The law as JSON: its kind, its witnesses (operators by name) and its domain's JSON Schema. */
  describe: (law: Law): LawDescription => {
    const witnesses: Record<string, unknown> = Laws.$match(law, {
      Associative: () => ({}),
      Commutative: () => ({}),
      Idempotent: () => ({}),
      PreservesCollation: () => ({}),
      Identity: ({ value, side }) => ({ value, side }),
      Absorbing: ({ value, side }) => ({ value, side }),
      Inverse: ({ other, identity }) => ({ other: nameOf(other), identity }),
      Distributes: ({ over }) => ({ over: nameOf(over) }),
      Monotonic: ({ direction, position }) => ({ direction, position }),
    })
    return {
      kind: law._tag.charAt(0).toLowerCase() + law._tag.slice(1),
      witnesses,
      domain: Option.match(law.domain, {
        onNone: () => null,
        onSome: jsonSchemaOf,
      }),
    }
  },
}
