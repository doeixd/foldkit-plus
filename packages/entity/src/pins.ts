/**
 * What a conjunction fixes by field (`Judge.pins`): how a holder knows it
 * holds every row an exists' filter counts.
 */
import { Match, Option } from 'effect'
import { contextValue, type ExprContext } from './context.js'
import type { Operandish, Predicate } from './expr.js'
import type { Pinned } from './held.js'
import { own } from './record.js'

/** What a conjunction fixes by field, and whether that is all it says (`Judge.pins`). */
export interface Pins {
  readonly pins: Pinned
  readonly whole: boolean
}

/** A value two `eq`s agree on exactly, on both sides of the wire: never null, NaN or a structure. */
const pinnable = (value: unknown): boolean =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  typeof value === 'bigint' ||
  (typeof value === 'number' && !Number.isNaN(value))

const fieldOf = Match.type<Operandish>().pipe(
  Match.tag('Field', field => Option.some(field)),
  Match.orElse((): Option.Option<{ readonly key: string }> => Option.none()),
)

/** An `eq` of a field of the row and something else, the field first. */
const fieldAndSide = Match.type<Predicate>().pipe(
  Match.tag(
    'Eq',
    ({ left, right }): Option.Option<readonly [{ readonly key: string }, Operandish]> =>
      Option.orElse(
        Option.map(fieldOf(left), field => [field, right] as const),
        () => Option.map(fieldOf(right), field => [field, left] as const),
      ),
  ),
  Match.orElse((): Option.Option<readonly [{ readonly key: string }, Operandish]> => Option.none()),
)

/** A filter's conjuncts. */
export const conjuncts = Match.type<Predicate>().pipe(
  Match.tag('And', ({ operands }): ReadonlyArray<Predicate> => operands),
  Match.orElse(single => [single]),
)

export const pinsOf = (
  predicates: ReadonlyArray<Predicate>,
  input: Readonly<Record<string, unknown>>,
  context: ExprContext | undefined,
): Pins => {
  const pins = new Map<string, unknown>()
  let whole = true
  const given = (node: Operandish): Option.Option<unknown> =>
    Match.value(node).pipe(
      Match.tags({
        Literal: ({ value }) => Option.some<unknown>(value),
        Input: ({ key }) => Option.some<unknown>(own(input, key)),
        Viewer: viewer => (context === undefined ? Option.none() : contextValue(viewer, context)),
      }),
      Match.orElse(() => Option.none()),
    )
  for (const predicate of predicates) {
    const pin = Option.flatMap(fieldAndSide(predicate), ([field, side]) =>
      Option.map(Option.filter(given(side), pinnable), value => [field.key, value] as const),
    )
    if (Option.isNone(pin)) {
      whole = false
      continue
    }
    const [key, value] = pin.value
    if (pins.has(key) && pins.get(key) !== value) whole = false
    pins.set(key, value)
  }
  return { pins, whole }
}
