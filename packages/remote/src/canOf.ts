/**
 * What `Data.can` computes (#533), kept apart from `can.ts` so only a domain
 * that registers a Mutation loads the write judges (the write capability).
 */
import { Match, Option, Schema } from 'effect'
import { Write as DomainWrite, type AnyWrite, type ExprContext } from 'foldkit-entity'
import type { HeldRow, MemoryOperators } from 'foldkit-entity'
import { Verdict } from 'metakit'
import { Can, CanRefusal, type CapabilityChecks, type CapabilityRequest } from './can.js'
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
  if (own(input, write.id.key) === undefined) return Can.undecided([`${write.id.key} is not given`])
  const operators = tableOf(given)
  const entity = write.input.entity
  const { id } = DomainWrite.bind(write, input as never)
  // An insert finds no row; any other write needs the one it changes.
  const found = Match.valueTags(write, {
    Insert: () => Option.some(Option.none<HeldRow>()),
    Update: () => Option.map(holderOf(store).rows.row(entity, id), Option.some),
    Delete: () => Option.map(holderOf(store).rows.row(entity, id), Option.some),
  })
  if (Option.isNone(found)) return Can.undecided([`${entity.name} ${id} is not held`])
  const row = found.value
  const forbidden = forbiddenByWrite(write, input, undefined, store)
  if (Option.isSome(forbidden))
    return Verdict.False(Option.some(CanRefusal.Forbidden(forbidden.value)))
  const unheld = unheldByWrite(write, input, undefined, store)
  const reasons: Array<string> =
    unheld.length === 0
      ? []
      : [`the client holds no ${unheld.join(', ')}, which a rule may refuse the write by`]
  if (Option.isSome(row)) {
    const met = metByWrite(write, row.value, encodedGiven(write, input), context, store, operators)
    if (Verdict.isFalse(met)) return Verdict.False(Option.some(CanRefusal.Unmet({})))
    if (Verdict.isUnknown(met)) reasons.push(met.reason)
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
      return Verdict.False(
        Option.some(
          CanRefusal.Invalid({
            entity: refusal.value.entity,
            rule: refusal.value.id,
            message: refusal.value.message,
            path: refusal.value.path,
          }),
        ),
      )
  }
  return reasons.length === 0 ? Verdict.True() : Can.undecided(reasons)
}

/** `Data.can` for one write, bound to the domain: a Model and the keys given. */
export type Ask<Model> = (model: Model, input: Readonly<Record<string, unknown>>) => Can

/**
 * `Data.capability`: `authorize` refuses a `No(Forbidden)`, `applies` a
 * `No(Unmet)` or `No(Invalid)`, and both allow `Undecided`, which the server
 * decides. Each hook asks again, over the Model its call carries.
 */
export const capabilityOf = <Model>(
  mutation: { readonly name: string; readonly write: AnyWrite },
  ask: Ask<Model>,
  toInput: (request: CapabilityRequest<Model, any, any>) => Readonly<Record<string, unknown>>,
): CapabilityChecks<Model, any, any> => {
  const answer = (request: CapabilityRequest<Model, any, any>) => {
    const input = toInput(request)
    return { input, can: ask(request.model, input) }
  }
  const allowed = (): true => true
  return {
    authorize: request =>
      Verdict.match(answer(request).can, {
        False: ({ witness }) =>
          Option.match(witness, {
            onNone: () => false,
            onSome: refusal =>
              CanRefusal.match(refusal, {
                Forbidden: ({ reason }) =>
                  Option.match(reason, {
                    onNone: () => false,
                    onSome: words => ({ allowed: false as const, reason: words }),
                  }),
                Unmet: allowed,
                Invalid: allowed,
              }),
          }),
        True: allowed,
        Unknown: allowed,
      }),
    applies: request => {
      const { input, can } = answer(request)
      return Verdict.match(can, {
        False: ({ witness }) =>
          Option.match(witness, {
            onNone: () => false,
            onSome: refusal =>
              CanRefusal.match(refusal, {
                // `authorize` refused it before `applies` is asked.
                Forbidden: allowed,
                Unmet: () => ({
                  applies: false as const,
                  reason: `${mutation.write.input.entity.name} ${String(own(input, mutation.write.id.key))} does not hold what ${mutation.name} asks of it`,
                }),
                Invalid: ({ message }) => ({ applies: false as const, reason: message }),
              }),
          }),
        True: allowed,
        Unknown: allowed,
      })
    },
  }
}

/** `Data.available`: false while no row is named, or `Data.can` answers `No` for the one named. */
export const availableOf =
  <Model>(
    ask: Ask<Model>,
    inputOf: (model: Model) => Option.Option<Readonly<Record<string, unknown>>>,
  ) =>
  (model: Model): boolean =>
    Option.match(inputOf(model), {
      onNone: () => false,
      onSome: input =>
        Verdict.match(ask(model, input), {
          False: () => false,
          True: () => true,
          Unknown: () => true,
        }),
    })
