/**
 * Row deltas for `foldkit-remote/maintained` (#580): which rows of a loaded
 * list changed between two Models, as the list decodes them, the row before
 * and after.
 *
 * A delta is read off the visible store (server values with every pending
 * write and overlay over them), so a live echo of a pending write, which
 * changes the server value and leaves what is shown as it was, gives none:
 * the write counted once, when it was shown. Deltas are worked out when a
 * maintained value is read, from the keys each store write reported
 * (`storeSteps.ts`); the reducer emits nothing and a page that maintains
 * nothing runs none of this.
 */
import { Match, Option, Schema } from 'effect'
import { Query as Relational, QueryEvaluateError, type ExprContext } from 'foldkit-entity'
import { Capability, visibleOf } from '../capability.js'
import { items, type Connection } from '../connection.js'
import type { QueryInput, QueryProjection, RemoteDomain } from '../index.js'
import { innerOf } from '../inner.js'
import { matching } from '../matching.js'
import type { RemoteModel } from '../model.js'
import type { OptimisticState } from '../optimistic.js'
import type { QueryDescriptor } from '../query.js'
import { stableStringify } from '../query.js'
import { assertRegistered } from '../registered.js'
import { readRow } from '../rowRead.js'
import { relationOf } from '../selection.js'
import { entityKey, isTombstone, type EntityKey, type EntityStore } from '../store.js'
import { watchStoreSteps } from '../storeSteps.js'
import { tableOf } from '../table.js'

type AnyDomain = RemoteDomain<any, any, any, any, any>

/**
 * Where a delta came from. `server`: the step wrote the row's server value.
 * `optimistic`: only what is shown over it moved (a pending write shown,
 * rolled back or settled to another value than predicted; an overlay).
 * `restored`: found by comparing every row of the list again, not traced to a
 * write: the first read, a snapshot or restore, a change of who is viewing,
 * more writes than are remembered.
 */
export type DeltaSource = 'server' | 'optimistic' | 'restored'

/** One row of the list changed: absent before when it entered, absent after when it left. */
export interface RowDelta<Row> {
  readonly key: EntityKey
  readonly before: Option.Option<Row>
  readonly after: Option.Option<Row>
  readonly source: DeltaSource
}

/**
 * What a definition keeps: changed one delta at a time, read for its value.
 * `members` gives the counted rows in the list's order, for a value that must
 * look at all of them; `moved` says that order may have changed.
 */
export interface Keeper<Row, A> {
  readonly step: (delta: RowDelta<Row>) => void
  readonly value: (members: () => ReadonlyArray<readonly [EntityKey, Row]>, moved: boolean) => A
}

/** Which rows of the list count: those a registered query's body matches, for its input. */
export interface MaintainedWhere<Q> {
  readonly where: Q
  readonly input: QueryInput<Q>
}

// Which rows each store write changed, by store, so a later store can be
// traced back to the one a value was kept for. Only keys are held, never a
// store, and only the latest writes: past them the list is compared whole.
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

/** The rows a layer writes or deletes, and those an overlay of the list places or hides. */
const pendingKeys = (optimistic: OptimisticState, list: string, into: Set<EntityKey>): void => {
  for (const layer of optimistic.layers) {
    for (const patch of layer.patches) into.add(entityKey(patch.entity, patch.id))
    for (const gone of layer.deletes) into.add(entityKey(gone.entity, gone.id))
  }
  for (const overlay of optimistic.overlays)
    if (overlay.connection === list)
      for (const edge of overlay.edges) into.add(entityKey(edge.ref.entity, edge.ref.id))
}

const pending = (optimistic: OptimisticState): boolean =>
  optimistic.layers.length > 0 || optimistic.overlays.length > 0

const sameViewer = Option.makeEquivalence<{ readonly entity: string; readonly id: string }>(
  (x, y) => x.entity === y.entity && x.id === y.id,
)
const sameNow = Option.makeEquivalence<number>((x, y) => x === y)

const sameContext = (a: ExprContext, b: ExprContext): boolean =>
  sameViewer(a.viewer, b.viewer) && sameNow(a.now, b.now)

/** One row of the list as it was last read. */
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
const unassembled: Member<never> = { counted: Option.none(), unjudged: false, unassembled: true }

/** What a reading was worked out from, compared by identity on the next read. */
interface Inputs {
  readonly entities: EntityStore
  readonly optimistic: OptimisticState
  readonly kept: RemoteModel['kept']
  readonly connections: RemoteModel['connections']
  readonly connection: Connection | undefined
  readonly context: ExprContext
}

/** The list as last read: each shown row's reading, and the counts `complete` needs. */
export interface Tracked<Row> {
  inputs: Inputs
  readonly members: Map<EntityKey, Member<Row>>
  /** Every edge of the connection, shown or not: made when nothing is pending and first needed. */
  edges: ReadonlySet<EntityKey> | undefined
  unjudged: number
  unassembled: number
  /** The input is one no interpreter answers (text holding NUL): nothing can be said. */
  refused: boolean
}

/** What a call's list and query say before any Model is read: worked out once per list and `where` object. */
interface Declared {
  readonly relation: ReturnType<typeof relationOf>
  readonly relationKey: string
  /** Names the kept value among a definition's: the list, what it selects, the query and its input. */
  readonly key: string
  /**
   * A row is read through other rows when the body follows a path or an
   * exists, or the Selection joins a relation: a write to any row may move it.
   */
  readonly reachesOthers: boolean
}

// By domain, list and `where` object (the list itself standing for no `where`),
// so a view that passes the same objects each render derives nothing again.
const declarations = new WeakMap<object, WeakMap<object, WeakMap<object, Declared>>>()

const declaredOf = (
  domain: AnyDomain,
  over: QueryProjection<any, any, string, unknown>,
  where: MaintainedWhere<QueryDescriptor<any, any, any>> | undefined,
): Declared => {
  let byList = declarations.get(domain)
  if (byList === undefined) declarations.set(domain, (byList = new WeakMap()))
  let byWhere = byList.get(over)
  if (byWhere === undefined) byList.set(over, (byWhere = new WeakMap()))
  const known = byWhere.get(where ?? over)
  if (known !== undefined) return known
  const by = where?.where
  if (by !== undefined) {
    assertRegistered(domain, 'Query', domain.registry.queries, by.name)
    // A body over another Entity matches none of the list's rows, and would
    // otherwise answer "the whole list, and nothing in it".
    const filters = by.body?.entity.name
    if (filters !== undefined && filters !== over.selection.entity)
      throw new Error(
        `[foldkit-remote] maintained: query "${by.name}" is over "${filters}", but the list is of "${over.selection.entity}", so it cannot pick the list's rows. Pass a query over "${over.selection.entity}" as \`where\`.`,
      )
  }
  const relation = relationOf(over.selection)
  const relationKey = stableStringify(relation)
  const declared: Declared = {
    relation,
    relationKey,
    key: `${over.ref.identity}\u0000${relationKey}\u0000${by?.name ?? ''}\u0000${
      by === undefined ? '' : stableStringify(Schema.encodeSync(by.Input)(where?.input))
    }`,
    reachesOthers:
      (by?.body !== undefined && Relational.dependencies(by.body).reaches.length > 0) ||
      relation.relations !== undefined ||
      relation.windows !== undefined,
  }
  byWhere.set(where ?? over, declared)
  return declared
}

/** One read of a list in one Model: what `follow` moves a tracked list to. */
export interface Reading<Row> {
  readonly inputs: Inputs
  /** Names the tracked list among a definition's. */
  readonly key: string
  /** The rows the list shows, in its order, as last tracked. */
  readonly members: (tracked: Tracked<Row>) => ReadonlyArray<readonly [EntityKey, Row]>
  readonly rescan: () => Tracked<Row>
  readonly advance: (
    tracked: Tracked<Row>,
    emit: (delta: RowDelta<Row>) => void,
  ) => Option.Option<{ readonly moved: boolean }>
}

/** Reads a list (and the query picking its rows) in one Model, deriving nothing per call that the list fixes. */
export const readingOf = <Row>(
  domain: AnyDomain,
  model: unknown,
  over: QueryProjection<any, Row, string, unknown>,
  where: MaintainedWhere<QueryDescriptor<any, any, any>> | undefined,
): Reading<Row> => {
  const by = where?.where
  const input = where?.input
  watchStoreSteps(recordStep)
  const inner = innerOf<unknown>(domain)
  const remote: RemoteModel = domain.store.get(model)
  const identity = over.ref.identity
  const operators = tableOf(domain.operators)
  const { relation, relationKey, key, reachesOthers } = declaredOf(domain, over, where)
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
  const memberOf = (key: EntityKey, judged: 'in' | 'out' | 'unjudged'): Member<Row> => {
    if (judged === 'out') return out
    if (judged === 'unjudged') return unjudged
    const row = readRow(visible, key, relation, relationKey, over.selection.schema)
    if (row === undefined) return unassembled
    const counted = ({ value }: { readonly value: Row }): Member<Row> => ({
      counted: Option.some(value),
      unjudged: false,
      unassembled: false,
    })
    return Match.valueTags(row, {
      Ready: counted,
      Refreshing: counted,
      Failed: () => unassembled,
    })
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

  const rescan = (): Tracked<Row> => {
    const tracked: Tracked<Row> = {
      inputs,
      members: new Map(),
      edges: undefined,
      unjudged: 0,
      unassembled: 0,
      refused: false,
    }
    const keys = shownKeys()
    let judge: (key: EntityKey) => 'in' | 'out' | 'unjudged'
    try {
      judge = judgedAmong(keys)
    } catch (error) {
      // An input the reference interpreter refuses is one the server refuses
      // too: nothing can be said about the list, as `filtered` says.
      if (!(error instanceof QueryEvaluateError)) throw error
      tracked.refused = true
      return tracked
    }
    for (const key of keys) swap(tracked, key, memberOf(key, judge(key)), ignore)
    return tracked
  }

  /** The kept list moved to these inputs row by row; none where that cannot be trusted. */
  const advance = (
    tracked: Tracked<Row>,
    emit: (delta: RowDelta<Row>) => void,
  ): Option.Option<{ readonly moved: boolean }> => {
    const was = tracked.inputs
    if (!sameContext(was.context, inputs.context)) return Option.none()
    const storeMoved =
      was.entities !== inputs.entities ||
      was.optimistic.layers !== inputs.optimistic.layers ||
      was.kept !== inputs.kept
    if (storeMoved && reachesOthers) return Option.none()
    const written = changedSince(was.entities, inputs.entities)
    if (Option.isNone(written)) return Option.none()
    const server = written.value
    const isPending = pending(was.optimistic) || pending(inputs.optimistic)
    // A layer's row reads through the base under it and every layer of that
    // row, so while any is pending a change to either may show on any of them.
    const shownOver = new Set<EntityKey>()
    if (isPending) {
      pendingKeys(was.optimistic, identity, shownOver)
      pendingKeys(inputs.optimistic, identity, shownOver)
    }
    const changed = storeMoved && isPending ? new Set([...server, ...shownOver]) : server
    const sourceOf = (key: EntityKey): DeltaSource =>
      server.has(key) || !shownOver.has(key) ? 'server' : 'optimistic'
    const swapFrom = (key: EntityKey, after: Member<Row> | undefined) =>
      swap(tracked, key, after, delta => emit({ ...delta, source: sourceOf(key) }))
    if (tracked.refused) {
      tracked.inputs = inputs
      return Option.some({ moved: false })
    }
    const steady = !isPending && was.connection === inputs.connection
    const rejudge: EntityKey[] = []
    if (steady) {
      // Nothing pending and the same pages: a row is shown unless deleted, so
      // a row not shown before is a deleted row of the list or no row of it.
      for (const key of changed) {
        if (tracked.members.has(key)) {
          if (isTombstone(visible, key)) swapFrom(key, undefined)
          else rejudge.push(key)
        } else if (isTombstone(was.entities, key) && !isTombstone(visible, key)) {
          if ((tracked.edges ??= edgesOf()).has(key)) rejudge.push(key)
        }
      }
    } else {
      // A list shows a row once, so when every member is still shown none left,
      // and the common case (a pending write over a row) builds no set.
      const shown = shownKeys()
      let stayed = 0
      for (const key of shown) {
        const member = tracked.members.has(key)
        if (member) stayed += 1
        if (!member || changed.has(key)) rejudge.push(key)
      }
      if (stayed < tracked.members.size) {
        const now = new Set(shown)
        for (const key of [...tracked.members.keys()]) if (!now.has(key)) swapFrom(key, undefined)
      }
      // Made again when the steady path next needs it, from the pages it will read.
      tracked.edges = undefined
    }
    if (rejudge.length > 0) {
      const judge = judgedAmong(rejudge)
      for (const key of rejudge) swapFrom(key, memberOf(key, judge(key)))
    }
    tracked.inputs = inputs
    return Option.some({ moved: !steady })
  }

  const members = (tracked: Tracked<Row>): ReadonlyArray<readonly [EntityKey, Row]> =>
    shownKeys().flatMap(key => {
      const counted = tracked.members.get(key)?.counted ?? Option.none()
      return Option.isSome(counted) ? [[key, counted.value] as const] : []
    })

  return { inputs, key, members, rescan, advance }
}

const ignore = (): void => {}

/** Puts `after` where the row's last reading was, moving the counts, and emits the change of its counted row. */
const swap = <Row>(
  tracked: Tracked<Row>,
  key: EntityKey,
  after: Member<Row> | undefined,
  emit: (delta: Omit<RowDelta<Row>, 'source'>) => void,
): void => {
  const before = tracked.members.get(key)
  if (before === after) return
  tracked.unjudged += Number(after?.unjudged ?? false) - Number(before?.unjudged ?? false)
  tracked.unassembled += Number(after?.unassembled ?? false) - Number(before?.unassembled ?? false)
  const was = before?.counted ?? Option.none()
  const is = after?.counted ?? Option.none()
  if (after === undefined) tracked.members.delete(key)
  else tracked.members.set(key, after)
  // The row read keeps a row's value while its entries are the same.
  if (Option.isSome(was) && Option.isSome(is) && was.value === is.value) return
  if (Option.isNone(was) && Option.isNone(is)) return
  emit({ key, before: was, after: is })
}

/**
 * Moves a tracked list (none on the first read) to the reading, emitting each
 * row whose counted value changed. Where the change cannot be traced to
 * writes, the list is read whole and compared with what was tracked, row by
 * row, as `restored` deltas. `moved` says the rows' order may have changed.
 */
export const follow = <Row>(
  reading: Reading<Row>,
  tracked: Tracked<Row> | undefined,
  emit: (delta: RowDelta<Row>) => void,
): { readonly tracked: Tracked<Row>; readonly moved: boolean } => {
  if (tracked !== undefined) {
    if (samePlace(tracked.inputs, reading.inputs)) return { tracked, moved: false }
    const traced = reading.advance(tracked, emit)
    if (Option.isSome(traced)) return { tracked, moved: traced.value.moved }
  }
  const fresh = reading.rescan()
  const old = tracked?.members ?? new Map<EntityKey, Member<Row>>()
  for (const [key, member] of fresh.members) {
    const was = old.get(key)?.counted ?? Option.none()
    const is = member.counted
    if (Option.isSome(was) && Option.isSome(is) && was.value === is.value) continue
    if (Option.isNone(was) && Option.isNone(is)) continue
    emit({ key, before: was, after: is, source: 'restored' })
  }
  for (const [key, member] of old)
    if (!fresh.members.has(key) && Option.isSome(member.counted))
      emit({ key, before: member.counted, after: Option.none(), source: 'restored' })
  return { tracked: fresh, moved: true }
}

/** Nothing the reading is worked out from changed. */
const samePlace = (a: Inputs, b: Inputs): boolean =>
  a.entities === b.entities &&
  a.optimistic === b.optimistic &&
  a.kept === b.kept &&
  a.connection === b.connection &&
  (a.connections === b.connections || !pending(a.optimistic)) &&
  sameContext(a.context, b.context)
