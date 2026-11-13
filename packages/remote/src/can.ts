/**
 * `Data.can` (#533): whether a declared write would be refused, told from what
 * the client holds, in the order the server refuses: a held `may`, then the
 * write's `when`, then the invariants of the row it leaves.
 */
import { Match, Option, Result, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { Write as DomainWrite, type AnyWrite, type ExprContext } from 'foldkit-entity'
import type { MemoryOperators } from 'foldkit-entity'
import { forbiddenByWrite, judgedByWrite, metByWrite } from './mutation.js'
import { holderOf } from './held.js'
import { own } from './record.js'
import type { EntityStore } from './store.js'

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

/** The keys given, each encoded as the server reads the input. */
const encodedGiven = (
  write: AnyWrite,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(write.input.schema.fields).flatMap(([key, field]) => {
      const given = own(input, key)
      return given === undefined
        ? []
        : [
            [
              key,
              Schema.encodeUnknownSync(field as unknown as Schema.Codec<unknown, unknown>)(given),
            ],
          ]
    }),
  )

export const canOf = (
  write: AnyWrite,
  input: Readonly<Record<string, unknown>>,
  context: ExprContext,
  store: EntityStore,
  operators: MemoryOperators,
): Can => {
  if (own(input, write.id.key) === undefined)
    return Can.Undecided({ reasons: [`${write.id.key} is not given`] })
  const entity = write.input.entity
  const { id } = DomainWrite.bind(write, input as never)
  const row = write._tag === 'Insert' ? Option.none() : holderOf(store).rows.row(entity, id)
  if (write._tag !== 'Insert' && Option.isNone(row))
    return Can.Undecided({ reasons: [`${entity.name} ${id} is not held`] })
  const forbidden = forbiddenByWrite(write, input, undefined, store)
  if (Option.isSome(forbidden)) return Can.No({ refusal: CanRefusal.Forbidden(forbidden.value) })
  const reasons: Array<string> = []
  if (Option.isSome(row)) {
    const met = metByWrite(write, row.value, encodedGiven(write, input), context, store, operators)
    if (Result.isSuccess(met) && !met.success) return Can.No({ refusal: CanRefusal.Unmet({}) })
    if (Result.isFailure(met)) reasons.push(met.failure)
  }
  const judged = judgedByWrite(write, input, undefined, context, store, operators)
  if (Option.isSome(judged)) {
    const refusal = Match.valueTags(judged.value, {
      Invalid: ({ failures }) => Option.fromUndefinedOr(failures[0]),
      Valid: () => Option.none(),
      Undecided: ({ fields, operators: unrun }) => {
        reasons.push(
          `the invariants of ${entity.name} need ${[...fields, ...unrun].join(', ')}, which the client lacks`,
        )
        return Option.none()
      },
    })
    if (Option.isSome(refusal))
      return Can.No({
        refusal: CanRefusal.Invalid({
          entity: refusal.value.entity,
          rule: refusal.value.id,
          message: refusal.value.message,
          path: refusal.value.path,
        }),
      })
  }
  return reasons.length === 0 ? Can.Yes({}) : Can.Undecided({ reasons })
}
