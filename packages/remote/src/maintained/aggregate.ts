/**
 * The aggregates a maintained value folds: a total, a count, a minimum, a
 * maximum, an "every" or an "any" over the counted rows, each changed by one
 * row delta at a time.
 *
 * The aggregate is a `metakit/aggregates` value supplied by the caller.
 * This module calls its methods without loading that subpath.
 */
import { Match, Option } from 'effect'
import { Node } from 'metakit'
import type { Any, Count, Every, Max, Min, Sum } from 'metakit/aggregates'
import type { Keeper } from './deltas.js'

/**
 * The parts of a `metakit/aggregates` value a list's rows are folded with.
 * Only functions of a row, so an aggregate over fewer fields than the list
 * selects is accepted, and one reading a field the list does not select is not.
 */
export type ListAggregate<Row> =
  | Pick<
      Sum<Row, number>,
      '_tag' | 'evaluate' | 'apply' | 'insertDelta' | 'deleteDelta' | 'replaceTotal'
    >
  | Pick<Count<Row>, '_tag' | 'evaluate' | 'apply' | 'insertDelta' | 'deleteDelta' | 'replaceTotal'>
  | Pick<Min<Row>, '_tag' | 'evaluate' | 'insertStep'>
  | Pick<Max<Row>, '_tag' | 'evaluate' | 'insertStep'>
  | Pick<Every<Row>, '_tag' | 'evaluate' | 'insertStep'>
  | Pick<Any<Row>, '_tag' | 'evaluate' | 'insertStep'>

/** What an aggregate gives: a number for `sum` and `count`, an `Option` for `min` and `max`, a boolean for `every` and `any`. */
export type AggregateValue<Agg> = Agg extends { readonly evaluate: (rows: never) => infer A }
  ? A
  : never

/** Two extremes are the same value; `===` takes `-0` for `0`, which only costs a rescan. */
const sameNumber = (a: number, b: number): boolean =>
  a === b || (Number.isNaN(a) && Number.isNaN(b))

/**
 * A running value over rows, changed one row at a time. `value` may look at
 * every counted row: `min` and `max` do when the row that held the extreme
 * left (their folds are not invertible in metakit's `foldProperties`), and
 * only then.
 */
interface Fold<Row> {
  readonly add: (row: Row) => void
  readonly remove: (row: Row) => void
  readonly replace: (before: Row, after: Row) => void
  readonly value: (rows: () => ReadonlyArray<Row>) => unknown
}

/** `sum` and `count`: each change moves the total by its exact delta. */
const groupFold = <Row>(
  aggregate: Pick<
    Sum<Row, number>,
    'evaluate' | 'apply' | 'insertDelta' | 'deleteDelta' | 'replaceTotal'
  >,
): Fold<Row> => {
  let total = aggregate.evaluate([])
  let dirty = false
  const change = (next: () => number): void => {
    if (dirty) return
    try {
      total = next()
    } catch (error) {
      if (!Node.isRefusal(error) || error.reason !== 'unsafe-integer') throw error
      // A later row can cancel an intermediate overflow in the same read.
      dirty = true
    }
  }
  return {
    add: row => change(() => aggregate.apply(total, aggregate.insertDelta(row))),
    remove: row => change(() => aggregate.apply(total, aggregate.deleteDelta(row))),
    replace: (before, after) => change(() => aggregate.replaceTotal(total, before, after)),
    value: rows => {
      if (dirty) {
        total = aggregate.evaluate(rows())
        dirty = false
      }
      return total
    },
  }
}

/**
 * `min` and `max`: a row in is folded in; a row out that held the extreme
 * leaves it unknown until the counted rows are read again. A row changed in
 * place is a row out and a row in, except that a changed extreme that still
 * wins (or ties) is the new extreme without a rescan.
 */
const extremeFold = <Row>(aggregate: Pick<Min<Row>, 'evaluate' | 'insertStep'>): Fold<Row> => {
  const none = Option.none<number>()
  let current = aggregate.evaluate([])
  let dirty = false
  const valueOf = (row: Row) => aggregate.insertStep(none, row)
  const heldExtreme = (row: Row): boolean => {
    const value = valueOf(row)
    return Option.isSome(value) && Option.isSome(current) && sameNumber(value.value, current.value)
  }
  return {
    add: row => {
      if (!dirty) current = aggregate.insertStep(current, row)
    },
    remove: row => {
      if (!dirty && heldExtreme(row)) dirty = true
    },
    replace: (before, after) => {
      if (dirty) return
      if (!heldExtreme(before)) {
        current = aggregate.insertStep(current, after)
        return
      }
      const next = valueOf(after)
      const stepped = aggregate.insertStep(current, after)
      if (Option.isSome(next) && Option.isSome(stepped) && sameNumber(stepped.value, next.value))
        current = stepped
      else dirty = true
    },
    value: rows => {
      if (dirty) {
        current = aggregate.evaluate(rows())
        dirty = false
      }
      return current
    },
  }
}

/**
 * `every` and `any`: how many counted rows hold the predicate, so a row out
 * is as cheap as a row in. Whether a row holds is metakit's fold of it into
 * the empty value: `every` from `true`, `any` from `false`.
 */
const predicateFold = <Row>(
  aggregate: Pick<Every<Row>, 'evaluate' | 'insertStep'>,
  answer: (holding: number, rows: number) => boolean,
): Fold<Row> => {
  const empty = aggregate.evaluate([])
  const holds = (row: Row): number => (aggregate.insertStep(empty, row) ? 1 : 0)
  let holding = 0
  let rows = 0
  return {
    add: row => {
      holding += holds(row)
      rows += 1
    },
    remove: row => {
      holding -= holds(row)
      rows -= 1
    },
    replace: (before, after) => void (holding += holds(after) - holds(before)),
    value: () => answer(holding, rows),
  }
}

/** Keeps an aggregate over the counted rows from their deltas. */
export const aggregateKeeper = <Row>(aggregate: ListAggregate<Row>): Keeper<Row, unknown> => {
  const fold: Fold<Row> = Match.valueTags(aggregate, {
    Sum: sum => groupFold<Row>(sum),
    Count: count => groupFold<Row>(count),
    Min: min => extremeFold<Row>(min),
    Max: max => extremeFold<Row>(max),
    Every: every => predicateFold<Row>(every, (holding, rows) => holding === rows),
    Any: any => predicateFold<Row>(any, holding => holding > 0),
  })
  return {
    step: ({ before, after }) => {
      if (Option.isNone(before)) {
        if (Option.isSome(after)) fold.add(after.value)
      } else if (Option.isSome(after)) fold.replace(before.value, after.value)
      else fold.remove(before.value)
    },
    value: members => fold.value(() => members().map(([, row]) => row)),
  }
}
