/**
 * `foldkit-remote/maintained`: a value over the rows of a loaded list (a
 * total, a minimum, the rows themselves) kept up to date from the rows that
 * changed rather than worked out from all of them again (#580).
 */
import { Match, Option } from 'effect'
import { hasNext, hasPrevious, isGapped } from '../connection.js'
import type { ModelOfDomain, QueryProjection, Registered, RemoteDomain } from '../index.js'
import type { QueryDescriptor } from '../query.js'
import type { QueryNames } from '../registered.js'
import type { EntityKey } from '../store.js'
import { aggregateKeeper, type AggregateValue, type ListAggregate } from './aggregate.js'
import { join, joinKeeper, type JoinDefinition, type JoinedRows } from './join.js'
import { reduce, reduceKeeper, type ReduceDefinition } from './reduce.js'
import {
  follow,
  readingOf,
  type Keeper,
  type MaintainedWhere,
  type RowDelta,
  type Tracked,
} from './deltas.js'

export { join, reduce }
export type { JoinDefinition, JoinedRows, ReduceDefinition }

type AnyDomain = RemoteDomain<any, any, any, any, any>

/** The counted rows in the loaded connection's order. */
export interface ListDefinition {
  readonly _tag: 'List'
}

/**
 * The counted rows in the loaded connection's order. `where` picks which rows count.
 * The array is the same object while no row of it changed, and each row is
 * the same object while its fields are, so a view over one row is not drawn
 * again when another changes.
 */
export const list: ListDefinition = { _tag: 'List' }

/** What a maintained value keeps: a `metakit/aggregates` value, `reduce`, `join`, or `list`. */
export type Definition<Row> =
  | ListAggregate<Row>
  | ListDefinition
  | ReduceDefinition<Row, unknown>
  | JoinDefinition<Row>

/** What a definition gives over rows of type `Row`. */
export type ValueOf<D, Row> = D extends ListDefinition
  ? ReadonlyArray<Row>
  : D extends ReduceDefinition<Row, infer V>
    ? V
    : D extends JoinDefinition<Row>
      ? JoinedRows<Row>
      : AggregateValue<D>

/**
 * A maintained value over every row the client has loaded for the list's
 * query and input, as `filtered` is: not the rows that exist, and not the
 * window the read given as `over` shows (a read asking `first: 25` of a list
 * holding 50 rows shows 25; the value is over the 50).
 *
 * `complete` is `filtered`'s. It is false when a loaded row could not be
 * judged by `where`, when a counted row lacks a field the list selects, when
 * the server has not said the loaded rows reach the start and the end, or
 * when a gap lies between loaded pages; the value is then over the rows that
 * could be counted.
 */
export interface MaintainedValue<A> {
  readonly value: A
  readonly complete: boolean
}

const listKeeper = <Row>(): Keeper<Row, ReadonlyArray<Row>> => {
  let rows: ReadonlyArray<Row> = []
  let keys: ReadonlyArray<EntityKey> = []
  let at: Map<EntityKey, number> | undefined
  // Rows changed in place since the last read; any other change reads the list's order again.
  let replaced: Array<RowDelta<Row>> = []
  let reorder = true
  return {
    step: delta => {
      if (reorder) return
      if (Option.isSome(delta.before) && Option.isSome(delta.after)) replaced.push(delta)
      else reorder = true
    },
    value: (members, moved, inserted) => {
      if (inserted !== undefined && inserted.at >= 0 && inserted.at <= rows.length) {
        const nextRows = rows.slice()
        nextRows.splice(inserted.at, 0, inserted.row)
        const nextKeys = keys.slice()
        nextKeys.splice(inserted.at, 0, inserted.key)
        rows = nextRows
        keys = nextKeys
        at = undefined
      } else if (moved || reorder) {
        const now = members()
        at = undefined
        let same = now.length === rows.length
        if (same) {
          for (let i = 0; i < now.length; i++) {
            if (now[i]![1] !== rows[i]) {
              same = false
              break
            }
          }
        }
        if (!same) {
          const nextRows = new Array<Row>(now.length)
          const nextKeys = new Array<EntityKey>(now.length)
          for (let i = 0; i < now.length; i++) {
            const pair = now[i]!
            nextKeys[i] = pair[0]
            nextRows[i] = pair[1]
          }
          rows = nextRows
          keys = nextKeys
        }
      } else if (replaced.length > 0) {
        if (at === undefined) {
          const map = new Map<EntityKey, number>()
          for (let i = 0; i < keys.length; i++) map.set(keys[i]!, i)
          at = map
        }
        const next = [...rows]
        for (const { key, after } of replaced) next[at.get(key)!] = Option.getOrThrow(after)
        rows = next
      }
      reorder = false
      replaced = []
      return rows
    },
  }
}

const keeperOf = <Row>(definition: Definition<Row>): Keeper<Row, unknown> =>
  Match.valueTags(definition, {
    List: () => listKeeper<Row>(),
    Reduce: reduceKeeper<Row, unknown>,
    Join: joinKeeper<Row>,
    Sum: aggregateKeeper<Row>,
    Count: aggregateKeeper<Row>,
    Min: aggregateKeeper<Row>,
    Max: aggregateKeeper<Row>,
    Every: aggregateKeeper<Row>,
    Any: aggregateKeeper<Row>,
  })

interface State<Row> {
  tracked: Tracked<Row>
  readonly keeper: Keeper<Row, unknown>
  result: MaintainedValue<unknown> | undefined
}

/** Kept values per definition, domain and read; a few reads each, the latest kept. */
const READS_KEPT = 16
const states = new WeakMap<object, WeakMap<object, Map<string, State<unknown>>>>()

const keptFor = <Row>(definition: Definition<Row>, domain: object): Map<string, State<Row>> => {
  let byDomain = states.get(definition)
  if (byDomain === undefined) states.set(definition, (byDomain = new WeakMap()))
  let reads = byDomain.get(domain)
  if (reads === undefined) byDomain.set(domain, (reads = new Map()))
  // A state is the value it keeps for this definition's rows; `unknown` is how
  // the map holds states of every row type.
  return reads as Map<string, State<Row>>
}

/**
 * A value over the rows of a loaded list, decoded as the list decodes them:
 * the rows `where` matches, or every row without it. Pass a definition made
 * once at module scope to keep its value between reads.
 *
 * The value is kept between calls and changed by the rows that changed since
 * the last: a row written, a pending write shown or rolled back, a row
 * entering or leaving `where`. A live echo of a pending write changes nothing
 * shown, so it changes nothing kept. `sum` and `count` update the total
 * from each change and recompute if an intermediate total overflows.
 * `every` and `any` keep a count of the rows holding. `min` and `max`
 * fold a row in, and read the counted rows again only when the row holding
 * the extreme leaves or loses it. What cannot be traced to writes (a hydrated
 * snapshot, a change of who is viewing, any store change when `where` or the
 * Selection reads other rows) reads every row again and compares each with
 * what was kept. A change to the list itself (a page merged, a refetch) or a
 * pending write over it compares the list's keys, and judges only rows not
 * judged before.
 *
 * Asks the server nothing and creates no connection: `complete` says whether
 * the answer is about the whole list.
 */
export function value<
  Domain extends AnyDomain,
  Row,
  Name extends string,
  Input,
  D extends Definition<Row>,
>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  over: QueryProjection<ModelOfDomain<Domain>, Row, Name, Input>,
  definition: D,
): MaintainedValue<ValueOf<D, Row>>
export function value<
  Domain extends AnyDomain,
  Row,
  Name extends string,
  Input,
  D extends Definition<Row>,
  Q extends QueryDescriptor<any, any, any>,
>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  over: QueryProjection<ModelOfDomain<Domain>, Row, Name, Input>,
  definition: D,
  where: MaintainedWhere<Q & Registered<Q['name'], QueryNames<Domain>, 'Query'>>,
): MaintainedValue<ValueOf<D, Row>>
export function value<Row>(
  domain: AnyDomain,
  model: unknown,
  over: QueryProjection<any, Row, string, unknown>,
  definition: Definition<Row>,
  where?: MaintainedWhere<QueryDescriptor<any, any, any>>,
): MaintainedValue<never> {
  const reading = readingOf(domain, model, over, where)
  const kept = keptFor(definition, domain)
  // Taken out while it moves: when a read throws, a keeper stepped part of
  // the way agrees with no list, and the next call starts again.
  const known = kept.get(reading.key)
  kept.delete(reading.key)
  const keeper = known?.keeper ?? keeperOf(definition)
  const { tracked, moved, inserted } = follow(reading, known?.tracked, keeper.step)
  const state: State<Row> = known ?? { tracked, keeper, result: undefined }
  state.tracked = tracked
  const complete =
    !tracked.refused &&
    tracked.unjudged === 0 &&
    tracked.unassembled === 0 &&
    tracked.inputs.connection !== undefined &&
    !isGapped(tracked.inputs.connection) &&
    !hasNext(tracked.inputs.connection) &&
    !hasPrevious(tracked.inputs.connection)
  const next = state.keeper.value(() => reading.members(tracked), moved, inserted)
  if (
    state.result === undefined ||
    state.result.complete !== complete ||
    !sameValue(state.result.value, next)
  )
    state.result = { value: next, complete }
  kept.set(reading.key, state as State<Row>)
  if (kept.size > READS_KEPT) kept.delete(kept.keys().next().value!)
  // `next` is what the definition gives, which `ValueOf` reads.
  return state.result as MaintainedValue<never>
}

const sameValue = (a: unknown, b: unknown): boolean =>
  Option.isOption(a) && Option.isOption(b)
    ? Option.makeEquivalence<unknown>(Object.is)(a, b)
    : Object.is(a, b)
