/**
 * What `Data.can` computes (#533), kept apart from `can.ts` so only a domain
 * that registers a Mutation loads the write judges (the write capability).
 */
import { Match, Option, Result, Schema } from 'effect'
import { Write as DomainWrite, type AnyWrite, type ExprContext } from 'foldkit-entity'
import type { HeldRow, MemoryOperators } from 'foldkit-entity'
import { Can, CanRefusal } from './can.js'
import { forbiddenByWrite, judgedByWrite, metByWrite, unheldByWrite } from './mutation.js'
import { holderOf } from './held.js'
import { own } from './record.js'
import type { EntityStore } from './store.js'
import { tableOf } from './table.js'

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
  given: Option.Option<MemoryOperators>,
): Can => {
  if (own(input, write.id.key) === undefined)
    return Can.Undecided({ reasons: [`${write.id.key} is not given`] })
  const operators = tableOf(given)
  const entity = write.input.entity
  const { id } = DomainWrite.bind(write, input as never)
  // An insert finds no row; any other write needs the one it changes.
  const found = Match.valueTags(write, {
    Insert: () => Option.some(Option.none<HeldRow>()),
    Update: () => Option.map(holderOf(store).rows.row(entity, id), Option.some),
    Delete: () => Option.map(holderOf(store).rows.row(entity, id), Option.some),
  })
  if (Option.isNone(found)) return Can.Undecided({ reasons: [`${entity.name} ${id} is not held`] })
  const row = found.value
  const forbidden = forbiddenByWrite(write, input, undefined, store)
  if (Option.isSome(forbidden)) return Can.No({ refusal: CanRefusal.Forbidden(forbidden.value) })
  const unheld = unheldByWrite(write, input, undefined, store)
  const reasons: Array<string> =
    unheld.length === 0
      ? []
      : [`the client holds no ${unheld.join(', ')}, which a rule may refuse the write by`]
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
