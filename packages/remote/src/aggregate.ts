/**
 * `foldkit-remote/aggregate`: a total, a count, a minimum, a maximum, an
 * "every" or an "any" over the rows of a loaded list, kept up to date from the
 * rows that changed rather than worked out from all of them again (#580).
 *
 * The aggregate is a `metakit/aggregates` value; this module reads only its
 * type and calls its methods, so a page pays nothing of metakit for it.
 */
import { Match, Option, Schema } from 'effect'
import { Query as Relational, QueryEvaluateError, type ExprContext } from 'foldkit-entity'
import type { Any, Count, Every, Max, Min, Sum } from 'metakit/aggregates'
import { Capability, visibleOf } from './capability.js'
import { hasNext, hasPrevious, isGapped, items, type Connection } from './connection.js'
import type {
  ModelOfDomain,
  QueryInput,
  QueryProjection,
  Registered,
  RemoteDomain,
} from './index.js'
import { innerOf } from './inner.js'
import { matching } from './matching.js'
import type { RemoteModel } from './model.js'
import type { OptimisticState } from './optimistic.js'
import type { QueryDescriptor } from './query.js'
import { stableStringify } from './query.js'
import { assertRegistered, type QueryNames } from './registered.js'
import { readRow } from './rowRead.js'
import { relationOf } from './selection.js'
import { entityKey, isTombstone, type EntityKey, type EntityStore } from './store.js'
import { watchStoreSteps } from './storeSteps.js'
import { tableOf } from './table.js'

type AnyDomain = RemoteDomain<any, any, any, any, any>

/**
 * The parts of a `metakit/aggregates` value a list's rows are folded with.
 * Only functions of a row, so an aggregate over fewer fields than the list
 * selects is accepted, and one reading a field the list does not select is not.
 */
export type ListAggregate<Row> =
  | Pick<Sum<Row, number>, '_tag' | 'evaluate' | 'insertDelta' | 'deleteDelta' | 'updateDelta'>
  | Pick<Count<Row>, '_tag' | 'evaluate' | 'insertDelta' | 'deleteDelta' | 'updateDelta'>
  | Pick<Min<Row>, '_tag' | 'evaluate' | 'insertStep'>
  | Pick<Max<Row>, '_tag' | 'evaluate' | 'insertStep'>
  | Pick<Every<Row>, '_tag' | 'evaluate' | 'insertStep'>
  | Pick<Any<Row>, '_tag' | 'evaluate' | 'insertStep'>

/** What an aggregate gives: a number for `sum` and `count`, an `Option` for `min` and `max`, a boolean for `every` and `any`. */
export type AggregateValue<Agg> = Agg extends { readonly evaluate: (rows: never) => infer A }
  ? A
  : never

/**
 * An aggregate over the rows of a list the client holds, never over the rows
 * that exist. `complete` is `filtered`'s: every row judged, every counted row
 * held whole, and the list terminal at both ends with no gap. When it is false
 * the value is over the rows that could be counted.
 */
export interface Aggregated<A> {
  readonly value: A
  readonly complete: boolean
}

/** Which rows of the list count: those a registered query's body matches, for its input. */
export interface AggregateWhere<Q> {
  readonly where: Q
  readonly input: QueryInput<Q>
}

// Which rows each store write changed, by store, so a later store can be
// traced back to the one a value was kept for. Only keys are held, never a
// store, and only the latest writes: past them a value is worked out again.
const STEPS_KEPT = 1024
let stores = 0
const storeIds = new WeakMap<EntityStore, number>()
const steps = new Map<number, { readonly from: number; readonly keys: ReadonlyArray<EntityKey> }>()

const idOf = (store: EntityStore): number => {
  let id = storeIds.get(store)
  if (id === undefined) {
    id = ++stores
    storeIds.set(store, id)
  }
  return id
}

const recordStep = (from: EntityStore, to: EntityStore, keys: ReadonlyArray<EntityKey>): void => {
  const fromId = idOf(from)
  const toId = ++stores
  storeIds.set(to, toId)
  steps.set(toId, { from: fromId, keys })
  if (steps.size > STEPS_KEPT) steps.delete(steps.keys().next().value!)
}

/**
 * The keys whose entries differ between `from` and a store written from it;
 * none when `to` was not reached from `from` by writes still recorded. A
 * store's id is larger than those of the stores it was written from, so the
 * walk back ends.
 */
const changedSince = (from: EntityStore, to: EntityStore): Option.Option<Set<EntityKey>> => {
  const changed = new Set<EntityKey>()
  if (from === to) return Option.some(changed)
  const target = storeIds.get(from)
  const start = storeIds.get(to)
  if (target === undefined || start === undefined) return Option.none()
  for (let at = start; at !== target;) {
    const step = at > target ? steps.get(at) : undefined
    if (step === undefined) return Option.none()
    for (const key of step.keys) changed.add(key)
    at = step.from
  }
  return Option.some(changed)
}

/** The rows a layer writes or deletes. */
const layerKeys = (optimistic: OptimisticState, into: Set<EntityKey>): void => {
  for (const layer of optimistic.layers) {
    for (const patch of layer.patches) into.add(entityKey(patch.entity, patch.id))
    for (const gone of layer.deletes) into.add(entityKey(gone.entity, gone.id))
  }
}

const pending = (optimistic: OptimisticState): boolean =>
  optimistic.layers.length > 0 || optimistic.overlays.length > 0

const sameViewer = Option.makeEquivalence<{ readonly entity: string; readonly id: string }>(
  (x, y) => x.entity === y.entity && x.id === y.id,
)
const sameNow = Option.makeEquivalence<number>((x, y) => x === y)

const sameContext = (a: ExprContext, b: ExprContext): boolean =>
  sameViewer(a.viewer, b.viewer) && sameNow(a.now, b.now)

/** Two extremes are the same value; `===` takes `-0` for `0`, which only costs a rescan. */
const sameNumber = (a: number, b: number): boolean =>
  a === b || (Number.isNaN(a) && Number.isNaN(b))

/**
 * A running value over rows, changed one row at a time. `value` may look at
 * every counted row: `min` and `max` do when the row that held the extreme
 * left (metakit's `requiresRescanOnDelete`), and only then.
 */
interface Fold<Row> {
  readonly add: (row: Row) => void
  readonly remove: (row: Row) => void
  readonly replace: (before: Row, after: Row) => void
  readonly value: (rows: () => ReadonlyArray<Row>) => unknown
}

/** `sum` and `count`: each change moves the total by its exact delta. */
const groupFold = <Row>(
  aggregate: Pick<Sum<Row, number>, 'evaluate' | 'insertDelta' | 'deleteDelta' | 'updateDelta'>,
): Fold<Row> => {
  let total = aggregate.evaluate([])
  return {
    add: row => void (total += aggregate.insertDelta(row)),
    remove: row => void (total += aggregate.deleteDelta(row)),
    replace: (before, after) => void (total += aggregate.updateDelta(before, after)),
    value: () => total,
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

const foldOf = <Row>(aggregate: ListAggregate<Row>): Fold<Row> =>
  Match.valueTags(aggregate, {
    Sum: sum => groupFold<Row>(sum),
    Count: count => groupFold<Row>(count),
    Min: min => extremeFold<Row>(min),
    Max: max => extremeFold<Row>(max),
    Every: every => predicateFold<Row>(every, (holding, rows) => holding === rows),
    Any: any => predicateFold<Row>(any, holding => holding > 0),
  })

/** One row of the list as the aggregate last saw it. */
interface Member<Row> {
  /** The row as the list decodes it, when the body matched it and every field it selects is held. */
  readonly counted: Option.Option<Row>
  /** Held but not judged either way: a field the body reads is missing. */
  readonly unjudged: boolean
  /** Matched, but not every field the list selects is held. */
  readonly unassembled: boolean
}

const out: Member<never> = { counted: Option.none(), unjudged: false, unassembled: false }
const unjudged: Member<never> = { counted: Option.none(), unjudged: true, unassembled: false }

/** What a kept value was worked out from, compared by identity on the next read. */
interface Inputs {
  readonly entities: EntityStore
  readonly optimistic: OptimisticState
  readonly kept: RemoteModel['kept']
  readonly connections: RemoteModel['connections']
  readonly connection: Connection | undefined
  readonly context: ExprContext
}

interface State<Row> {
  inputs: Inputs
  readonly members: Map<EntityKey, Member<Row>>
  /** Every edge of the connection, shown or not: made when nothing is pending and first needed. */
  edges: ReadonlySet<EntityKey> | undefined
  readonly fold: Fold<Row>
  unjudged: number
  unassembled: number
  /** The input is one no interpreter answers (text holding NUL): nothing can be said. */
  refused: boolean
  result: Aggregated<unknown> | undefined
}

/** Aggregated lists kept per aggregate, domain and read; a few reads each, the latest kept. */
const READS_KEPT = 16
const states = new WeakMap<object, WeakMap<object, Map<string, State<unknown>>>>()

const stateFor = <Row>(
  aggregate: ListAggregate<Row>,
  domain: object,
  key: string,
): {
  readonly get: () => State<Row> | undefined
  readonly set: (state: State<Row> | undefined) => void
} => {
  let byDomain = states.get(aggregate)
  if (byDomain === undefined) {
    byDomain = new WeakMap()
    states.set(aggregate, byDomain)
  }
  let reads = byDomain.get(domain)
  if (reads === undefined) {
    reads = new Map()
    byDomain.set(domain, reads)
  }
  const kept = reads
  return {
    // A state is the value it keeps for this aggregate's rows; `unknown` is how
    // the map holds states of every row type.
    get: () => kept.get(key) as State<Row> | undefined,
    set: state => {
      kept.delete(key)
      if (state === undefined) return
      kept.set(key, state as State<unknown>)
      if (kept.size > READS_KEPT) kept.delete(kept.keys().next().value!)
    },
  }
}

/**
 * An aggregate over the rows of a loaded list, decoded as the list decodes
 * them: the rows `where` matches, or every row without it. The same rows
 * `filtered` gives for the same list and query, folded by a `metakit`
 * aggregate defined once:
 *
 * ```ts
 * const Open = Rows.sum(Invoice, $ => $.cents)
 * const { value, complete } = aggregated(Data, model, invoices, Open, { where: Unpaid, input: {} })
 * ```
 *
 * The value is kept between calls and changed by the rows that changed since
 * the last: a row written, a pending write shown or rolled back, a row
 * entering or leaving `where`. `sum` and `count` move by an exact delta;
 * `every` and `any` by a count of the rows holding; `min` and `max` fold a
 * row in, and read the counted rows again only when the row holding the
 * extreme leaves or loses it. What cannot be followed row by row is worked out
 * from every row again: a store not reached by recorded writes (a hydrated
 * snapshot, a change of principal), a change of who is viewing, and any store
 * change when `where` or the Selection reads other rows. A change to the list
 * itself (a page merged, a refetch) or a pending write over it compares the
 * list's keys, and judges only rows not judged before.
 *
 * Asks the server nothing and creates no connection: `complete` says whether
 * the answer is about the whole list.
 */
export function aggregated<
  Domain extends AnyDomain,
  Value,
  Name extends string,
  Input,
  Agg extends ListAggregate<Value>,
>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  over: QueryProjection<ModelOfDomain<Domain>, Value, Name, Input>,
  aggregate: Agg,
): Aggregated<AggregateValue<Agg>>
export function aggregated<
  Domain extends AnyDomain,
  Value,
  Name extends string,
  Input,
  Agg extends ListAggregate<Value>,
  Q extends QueryDescriptor<any, any, any>,
>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  over: QueryProjection<ModelOfDomain<Domain>, Value, Name, Input>,
  aggregate: Agg,
  where: AggregateWhere<Q & Registered<Q['name'], QueryNames<Domain>, 'Query'>>,
): Aggregated<AggregateValue<Agg>>
export function aggregated<Value>(
  domain: AnyDomain,
  model: unknown,
  over: QueryProjection<any, Value, string, unknown>,
  aggregate: ListAggregate<Value>,
  where?: AggregateWhere<QueryDescriptor<any, any, any>>,
): Aggregated<never> {
  const by = where?.where
  if (by !== undefined) {
    assertRegistered(domain, 'Query', domain.registry.queries, by.name)
    // A body over another Entity matches none of the list's rows, and would
    // otherwise answer "the whole list, and nothing in it".
    const filters = by.body?.entity.name
    if (filters !== undefined && filters !== over.selection.entity)
      throw new Error(
        `Remote: query "${by.name}" is over "${filters}", but the list is of "${over.selection.entity}", so it cannot pick its rows`,
      )
  }
  watchStoreSteps(recordStep)
  const inner = innerOf<unknown>(domain)
  const remote: RemoteModel = domain.store.get(model)
  const identity = over.ref.identity
  const relation = relationOf(over.selection)
  const relationKey = stableStringify(relation)
  const operators = tableOf(domain.operators)
  const input = where?.input
  const memo = stateFor(
    aggregate,
    domain,
    `${identity}\u0000${relationKey}\u0000${by?.name ?? ''}\u0000${
      by === undefined ? '' : stableStringify(Schema.encodeSync(by.Input)(input))
    }`,
  )
  // A row is read through other rows when the body follows a path or an
  // exists, or the Selection joins a relation: a write to any row may move it.
  const reachesOthers =
    (by?.body !== undefined && reaches(by.body)) ||
    relation.relations !== undefined ||
    relation.windows !== undefined

  const inputs: Inputs = {
    entities: remote.entities,
    optimistic: remote.optimistic,
    kept: remote.kept,
    connections: remote.connections,
    connection: remote.connections[identity],
    context: inner.context(model),
  }
  const visible = visibleOf(domain[Capability], remote, domain.operators)

  /** How `where` judges one row, as `filtered` would among the rest. */
  const memberOf = (key: EntityKey, judged: 'in' | 'out' | 'unjudged'): Member<Value> => {
    if (judged === 'out') return out
    if (judged === 'unjudged') return unjudged
    const row = readRow(visible, key, relation, relationKey, over.selection.schema)
    return row === undefined || row._tag === 'Failed'
      ? { counted: Option.none(), unjudged: false, unassembled: true }
      : { counted: Option.some(row.value), unjudged: false, unassembled: false }
  }
  const judgedAmong = (
    keys: ReadonlyArray<EntityKey>,
  ): ((key: EntityKey) => 'in' | 'out' | 'unjudged') => {
    if (by === undefined) return () => 'in'
    const judged = matching(visible, by, input, {
      among: keys,
      operators,
      context: inputs.context,
    })
    const matched = new Set(judged.matched)
    const skipped = new Set(judged.skipped)
    return key => {
      if (matched.has(key)) return 'in'
      if (skipped.has(key)) return 'unjudged'
      return 'out'
    }
  }
  const shownKeys = (): ReadonlyArray<EntityKey> =>
    inputs.connection === undefined
      ? []
      : inner
          .shown(remote, identity, inputs.connection)
          .map(edge => entityKey(edge.ref.entity, edge.ref.id))
  const edgesOf = (): ReadonlySet<EntityKey> =>
    new Set(
      inputs.connection === undefined
        ? []
        : items(inputs.connection).map(edge => entityKey(edge.ref.entity, edge.ref.id)),
    )

  const rescan = (): State<Value> => {
    const state: State<Value> = {
      inputs,
      members: new Map(),
      edges: undefined,
      fold: foldOf(aggregate),
      unjudged: 0,
      unassembled: 0,
      refused: false,
      result: undefined,
    }
    const keys = shownKeys()
    let judge: (key: EntityKey) => 'in' | 'out' | 'unjudged'
    try {
      judge = judgedAmong(keys)
    } catch (error) {
      // An input the reference interpreter refuses is one the server refuses
      // too: nothing can be said about the list, as `filtered` says.
      if (!(error instanceof QueryEvaluateError)) throw error
      state.refused = true
      return state
    }
    for (const key of keys) swap(state, key, memberOf(key, judge(key)))
    return state
  }

  /** Puts `after` where the row's last reading was, moving the counts and the fold by the difference. */
  const swap = (state: State<Value>, key: EntityKey, after: Member<Value> | undefined): void => {
    const before = state.members.get(key)
    if (before === after) return
    state.unjudged += Number(after?.unjudged ?? false) - Number(before?.unjudged ?? false)
    state.unassembled += Number(after?.unassembled ?? false) - Number(before?.unassembled ?? false)
    const was = before?.counted ?? Option.none()
    const is = after?.counted ?? Option.none()
    if (Option.isSome(was) && Option.isSome(is)) {
      // The row read keeps a row's value while its entries are the same.
      if (was.value !== is.value) state.fold.replace(was.value, is.value)
    } else if (Option.isSome(was)) state.fold.remove(was.value)
    else if (Option.isSome(is)) state.fold.add(is.value)
    if (after === undefined) state.members.delete(key)
    else state.members.set(key, after)
  }

  /** The kept state moved to these inputs row by row; none where that cannot be trusted. */
  const advance = (state: State<Value>): Option.Option<State<Value>> => {
    const was = state.inputs
    if (!sameContext(was.context, inputs.context)) return Option.none()
    const storeMoved =
      was.entities !== inputs.entities ||
      was.optimistic.layers !== inputs.optimistic.layers ||
      was.kept !== inputs.kept
    if (storeMoved && reachesOthers) return Option.none()
    const rows = changedSince(was.entities, inputs.entities)
    if (Option.isNone(rows)) return Option.none()
    const changed = rows.value
    // A layer's row reads through the base under it and every layer of that
    // row, so while any is pending a change to either may show on any of them.
    if (storeMoved && (was.optimistic.layers.length > 0 || inputs.optimistic.layers.length > 0)) {
      layerKeys(was.optimistic, changed)
      layerKeys(inputs.optimistic, changed)
    }
    if (state.refused) {
      state.inputs = inputs
      return Option.some(state)
    }
    const quiet =
      !pending(was.optimistic) &&
      !pending(inputs.optimistic) &&
      was.connection === inputs.connection
    const rejudge: EntityKey[] = []
    if (quiet) {
      // Nothing pending and the same pages: a row is shown unless deleted, so
      // a row not shown before is a deleted row of the list or no row of it.
      for (const key of changed) {
        if (state.members.has(key)) {
          if (isTombstone(visible, key)) swap(state, key, undefined)
          else rejudge.push(key)
        } else if (isTombstone(was.entities, key) && !isTombstone(visible, key)) {
          if ((state.edges ??= edgesOf()).has(key)) rejudge.push(key)
        }
      }
    } else {
      // A list shows a row once, so when every member is still shown none left,
      // and the common case (a pending write over a row) builds no set.
      const shown = shownKeys()
      let stayed = 0
      for (const key of shown) {
        const member = state.members.has(key)
        if (member) stayed += 1
        if (!member || changed.has(key)) rejudge.push(key)
      }
      if (stayed < state.members.size) {
        const now = new Set(shown)
        for (const key of [...state.members.keys()]) if (!now.has(key)) swap(state, key, undefined)
      }
      // Made again when the quiet path next needs it, from the pages it will read.
      state.edges = undefined
    }
    if (rejudge.length > 0) {
      const judge = judgedAmong(rejudge)
      for (const key of rejudge) swap(state, key, memberOf(key, judge(key)))
    }
    state.inputs = inputs
    return Option.some(state)
  }

  const kept = memo.get()
  let state: State<Value>
  try {
    state = Option.getOrElse(
      kept === undefined || samePlace(kept.inputs, inputs)
        ? Option.fromNullishOr(kept)
        : advance(kept),
      rescan,
    )
  } catch (error) {
    memo.set(undefined)
    throw error
  }
  const complete =
    !state.refused &&
    state.unjudged === 0 &&
    state.unassembled === 0 &&
    inputs.connection !== undefined &&
    !isGapped(inputs.connection) &&
    !hasNext(inputs.connection) &&
    !hasPrevious(inputs.connection)
  const value = state.refused
    ? aggregate.evaluate([])
    : state.fold.value(() =>
        [...state.members.values()].flatMap(member => Option.toArray(member.counted)),
      )
  if (
    state.result === undefined ||
    state.result.complete !== complete ||
    !sameValue(state.result.value, value)
  )
    state.result = { value, complete }
  memo.set(state)
  // `value` is what `aggregate.evaluate` returns, which `AggregateValue` reads.
  return state.result as Aggregated<never>
}

const reachingBodies = new WeakMap<object, boolean>()

/** Whether a body reads other rows: a path, an exists, a path from the viewer. */
const reaches = (body: Parameters<typeof Relational.dependencies>[0]): boolean => {
  let known = reachingBodies.get(body)
  if (known === undefined) {
    known = Relational.dependencies(body).reaches.length > 0
    reachingBodies.set(body, known)
  }
  return known
}

/** Nothing the value is worked out from changed. */
const samePlace = (a: Inputs, b: Inputs): boolean =>
  a.entities === b.entities &&
  a.optimistic === b.optimistic &&
  a.kept === b.kept &&
  a.connection === b.connection &&
  (a.connections === b.connections || !pending(a.optimistic)) &&
  sameContext(a.context, b.context)

const sameValue = (a: unknown, b: unknown): boolean =>
  Option.isOption(a) && Option.isOption(b)
    ? Option.makeEquivalence<unknown>(Object.is)(a, b)
    : Object.is(a, b)
