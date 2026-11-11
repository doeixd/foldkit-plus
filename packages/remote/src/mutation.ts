/**
 * What a declared write predicts and refuses on the client (#378): its patch,
 * the derived members it moves, the fields its answer must carry, and the
 * invariants and `may` it breaks. Reached only through the write capability.
 */
import { Effect, Match, Option, Record as Rec, Schema } from 'effect'
import {
  Entity as DomainEntity,
  Write as DomainWrite,
  type AnyWrite,
  type BoundWrite,
  type ContextRead,
  Derivation,
  Held,
  type AnyEntity,
  type EntityDerived,
  type EntityMember,
  type Forbids,
  type HeldRow,
  type WriteSurface,
  type ExprContext,
  type Invariant,
  type MemoryOperators,
  type Predict,
} from 'foldkit-entity'
import { holderOf } from './held.js'
import { own, put } from './record.js'
import { refParts } from './relation.js'
import type { RelationRequirement } from './requirement.js'
import { emptyStore, entityKey, type EntityStore } from './store.js'
import { DerivedBy } from './derived.js'
import type { NormalizedPatch, PendingDelete, PendingPatch } from './ledger.js'

/**
 * A bound write as the store patches it: its fields as they are, and each
 * relation it points as the ref key the store holds (`'User:u1'`), or null.
 */
export const patchOfWrite = (bound: BoundWrite): NormalizedPatch => ({
  entity: bound.entity,
  id: bound.id,
  values: {
    ...bound.values,
    ...Rec.map(bound.links, link =>
      Option.match(link, { onNone: () => null, onSome: ref => entityKey(ref.entity, ref.id) }),
    ),
  },
})

/**
 * One member of a row as `store` holds it, for a path from the viewer: a row
 * known gone reaches no row (null), and a row or a field never read is unheld.
 */
const heldIn =
  (store: EntityStore): ContextRead<never, never> =>
  (row, key) => {
    const entry = store[entityKey(row.entity, row.id)]
    if (entry === undefined)
      return Effect.succeed(Held.unheld(`${row.entity} ${row.id} is not held`))
    if (entry.tombstone) return Effect.succeed(Held.of(null))
    return Effect.succeed(
      entry.present.has(key)
        ? Held.of(entry.values[key])
        : Held.unheld(`${row.entity}.${key} of ${row.id} is not held`),
    )
  }

/**
 * A write bound to its input, with what its Entity sets from the context
 * (`Entity.sets`) as `context` gives it: who asks (`Remote.make`'s viewer),
 * what their row holds (read from `store`), and when the reader acted
 * (`Data.mutate`'s `now`). A member with no value to give is left out of the
 * prediction, and the answer brings it.
 */
const contextBound = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: ExprContext,
  store: EntityStore,
): BoundWrite => {
  const bound = DomainWrite.bind(write, input as never, keys)
  const set = Effect.runSync(DomainWrite.contextValues(write, context, heldIn(store)))
  return {
    ...bound,
    values: { ...bound.values, ...set.values },
    links: { ...bound.links, ...set.links },
  }
}

const nobody: ExprContext = { viewer: Option.none(), now: Option.none() }

/**
 * What a declared write shows before the server answers: an update's or an
 * insert's row as a patch (an update's only for the keys named, when some
 * are), and an update's increments and computed fields, worked out over the
 * row the store holds when it is read. A delete shows its row deleted. What
 * the context sets is filled from `context` and `store`, where it can be.
 */
export const optimisticOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: ExprContext = nobody,
  store: EntityStore = emptyStore,
): ReadonlyArray<PendingPatch | PendingDelete> =>
  Match.value(write).pipe(
    Match.tagsExhaustive({
      Update: () => {
        const bound = contextBound(write, input, keys, context, store)
        const patch = patchOfWrite(bound)
        return [
          {
            ...patch,
            ...(Object.keys(bound.increments).length === 0 ? {} : { adds: bound.increments }),
            ...(Object.keys(bound.assignments).length === 0 ? {} : { computes: bound.assignments }),
          },
        ]
      },
      // A new row is read like any other, so it carries its own id.
      Insert: () => {
        const patch = patchOfWrite(contextBound(write, input, undefined, context, store))
        return [{ ...patch, values: { id: patch.id, ...patch.values } }]
      },
      Delete: (): ReadonlyArray<PendingDelete> => {
        const { entity, id } = DomainWrite.bind(write, input as never)
        return [{ _tag: 'Delete', entity, id }]
      },
    }),
  )

type ExistsBy = Extract<DerivedBy, { readonly _tag: 'Exists' }>

/**
 * The derived members a declared write moves, as pending patches of the rows
 * its row points at. A count: an insert adds one where it points, a delete
 * takes one away where the row pointed, and a relink does both. An exists:
 * a row now pointing here and at `viewer` is found (its id), and a row the
 * store shows as found by this one is no longer, once the write deletes it or
 * points it elsewhere.
 *
 * Where the row pointed before is read from `store`: the row as held, or,
 * when the store holds an exists found by this row, the row it is found on
 * and the viewer. When neither says, nothing is predicted and the answer
 * decides. A member is moved only on a row that `store` holds it on.
 */
export const derivedOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  derived: ReadonlyArray<DerivedBy>,
  store: EntityStore,
  context: ExprContext,
): ReadonlyArray<PendingPatch> =>
  derived.length === 0
    ? []
    : movedBy(
        write._tag,
        // A link the context sets (whoever asks) moves what it points at as an input's would.
        contextBound(
          write,
          input,
          Match.value(write).pipe(
            Match.tag('Update', () => keys),
            Match.orElse(() => undefined),
          ),
          context,
          store,
        ),
        derived,
        store,
        context,
      )

/** The derived members a write of `kind`, bound as `bound`, moves on the rows its row points at. */
const movedBy = (
  kind: AnyWrite['_tag'],
  bound: BoundWrite,
  derived: ReadonlyArray<DerivedBy>,
  store: EntityStore,
  context: ExprContext,
): ReadonlyArray<PendingPatch> => {
  const row = store[entityKey(bound.entity, bound.id)]
  const held = row === undefined || row.tombstone ? undefined : row
  const viewerKey = Option.map(context.viewer, ref => entityKey(ref.entity, ref.id))
  /** What a live row holds in `field`, as the store has it; none for a row gone or not held. */
  const holding = (key: string, field: string): Option.Option<unknown> =>
    Option.flatMap(Option.fromUndefinedOr(store[key]), entry =>
      entry.tombstone ? Option.none() : Option.some(entry.values[field]),
    )
  // The rows each exists shows as found by this row: a new row is found on none yet.
  const found = new Map<ExistsBy, ReadonlyArray<string>>()
  if (kind !== 'Insert')
    for (const member of derived.filter(DerivedBy.$is('Exists')))
      found.set(
        member,
        Object.keys(store).filter(
          key =>
            key.startsWith(`${member.owner}:`) &&
            Option.contains(holding(key, member.field), bound.id),
        ),
      )
  // Where the row points through `relation`: a ref key, null for nowhere, none when unknown.
  const before = (relation: string): Option.Option<unknown> => {
    if (held !== undefined && held.present.has(relation)) return Option.some(held.values[relation])
    for (const [member, rows] of found) {
      if (rows.length === 0) continue
      if (member.relation === relation) return Option.some(rows[0])
      if (member.viewer === relation && Option.isSome(viewerKey)) return viewerKey
    }
    // A row not there points nowhere, unless an update or a delete expected one.
    return Match.value(kind).pipe(
      Match.when('Insert', () => Option.some(null)),
      Match.orElse(() => Option.none()),
    )
  }
  const patched = patchOfWrite(bound).values
  const after = (relation: string): Option.Option<unknown> =>
    Match.value(kind).pipe(
      Match.when('Delete', () => Option.some<unknown>(null)),
      Match.when('Insert', () =>
        Option.some(Object.hasOwn(bound.links, relation) ? patched[relation] : null),
      ),
      Match.when('Update', () =>
        Object.hasOwn(bound.links, relation) ? Option.some(patched[relation]) : before(relation),
      ),
      Match.exhaustive,
    )
  const moves = new Map<
    string,
    { owner: string; values: Record<string, unknown>; adds: Record<string, number> }
  >()
  const at = (ref: string, owner: string) => {
    const move = moves.get(ref) ?? { owner, values: {}, adds: {} }
    moves.set(ref, move)
    return move
  }
  const count = (ref: unknown, owner: string, field: string, by: number): void => {
    if (typeof ref !== 'string') return
    if (!Option.exists(holding(ref, field), value => typeof value === 'number')) return
    const move = at(ref, owner)
    put(move.adds, field, (own(move.adds, field) ?? 0) + by)
  }
  for (const member of derived)
    DerivedBy.$match(member, {
      Count: ({ relation, owner, field }) => {
        const from = before(relation)
        const to = after(relation)
        if (Option.isNone(from) || Option.isNone(to) || from.value === to.value) return
        count(from.value, owner, field, -1)
        count(to.value, owner, field, 1)
      },
      Exists: exists => {
        const { relation, viewer: by, owner, field } = exists
        const pointed = after(relation)
        // Whether the row points at the viewer after the write: none when either is unknown.
        const viewing = Option.flatMap(after(by), ref => Option.map(viewerKey, key => ref === key))
        for (const ref of found.get(exists) ?? []) {
          // A delete points it nowhere, so it leaves every row it was found on.
          if (Option.exists(pointed, to => to !== ref) || Option.contains(viewing, false))
            put(at(ref, owner).values, field, null)
        }
        if (!Option.contains(viewing, true) || Option.isNone(pointed)) return
        const to = pointed.value
        if (typeof to === 'string' && Option.contains(holding(to, field), null))
          put(at(to, owner).values, field, bound.id)
      },
    })
  return [...moves].flatMap(([ref, { owner, values, adds }]) => {
    const moved = Object.fromEntries(Object.entries(adds).filter(([, by]) => by !== 0))
    return Object.keys(values).length === 0 && Object.keys(moved).length === 0
      ? []
      : [
          {
            entity: owner,
            id: refParts(ref).id,
            values,
            ...(Object.keys(moved).length === 0 ? {} : { adds: moved }),
            ...Match.value(kind).pipe(
              Match.when('Insert', () =>
                Object.keys(moved).length > 0
                  ? { creates: { entity: bound.entity, id: bound.id } }
                  : {},
              ),
              Match.orElse(() => ({})),
            ),
          },
        ]
  })
}

/**
 * A new row's derived members over relations: each count 0 and each exists
 * none, since no row points at a row not yet made. A later pending write that
 * points at it moves them as it would any held row's.
 */
const freshDerived = (
  write: AnyWrite,
  input: unknown,
  derived: ReadonlyMap<string, ReadonlyArray<DerivedBy>>,
): ReadonlyArray<PendingPatch> => {
  const entity = write.input.entity.name
  const values: Record<string, unknown> = {}
  for (const members of derived.values())
    for (const member of members)
      if (member.owner === entity)
        put(values, member.field, DerivedBy.$match(member, { Count: () => 0, Exists: () => null }))
  if (Object.keys(values).length === 0) return []
  const { id } = DomainWrite.bind(write, input as never)
  return [{ entity, id, values }]
}

/** Each supplied member of `entity` that says how a client foresees it, by key. */
const predicted = new WeakMap<AnyEntity, ReadonlyArray<readonly [string, Predict]>>()
const predictorsOf = (entity: AnyEntity): ReadonlyArray<readonly [string, Predict]> => {
  const known = predicted.get(entity)
  if (known !== undefined) return known
  const derived: Readonly<Record<string, EntityDerived<string, string, Schema.Constraint>>> =
    entity.derived
  const found = Object.entries(derived).flatMap(([key, member]) =>
    Derivation.$match(member.derives, {
      Supplied: ({ predict }) =>
        Option.match(predict, { onNone: () => [], onSome: run => [[key, run] as const] }),
      Count: () => [],
      Exists: () => [],
    }),
  )
  predicted.set(entity, found)
  return found
}

/**
 * The supplied members a write's row foresees (`Derived.make`'s `predict`),
 * judged over the row it leaves, held over the store with the write's values:
 * a member foreseen as none is left out, so the row waits for the answer.
 */
const suppliedOfWrite = (
  write: AnyWrite,
  own: PendingPatch,
  by: ExprContext,
  store: EntityStore,
): ReadonlyArray<PendingPatch> => {
  const entity = write.input.entity
  const predictors = predictorsOf(entity)
  if (predictors.length === 0) return []
  const holder = holderOf(store)
  const row = holder.written(entity, own.id, own.values, [
    ...Object.keys(own.adds ?? {}),
    ...Object.keys(own.computes ?? {}),
  ])
  const values: Record<string, unknown> = {}
  for (const [key, predict] of predictors) {
    Option.map(predict({ entity, row, rows: holder.rows, context: by }), value => {
      put(values, key, value)
    })
  }
  return Object.keys(values).length === 0 ? [] : [{ entity: entity.name, id: own.id, values }]
}

/**
 * The supplied members a write's row foresees (`Derived.make`'s `predict`,
 * Guard's `may`), for its answer to carry whatever this write foresaw: one
 * foreseen as none leaves the row waiting for the answer, and a page opened
 * on the row meanwhile reads it, though no Surface did when it was sent
 * (#370). A delete leaves no row.
 */
export const foreseenOfWrite = (write: AnyWrite): ReadonlyArray<RelationRequirement> => {
  const foreseen = (): ReadonlyArray<RelationRequirement> => {
    const keys = predictorsOf(write.input.entity).map(([key]) => key)
    return keys.length === 0 ? [] : [{ entity: write.input.entity.name, fields: keys }]
  }
  return Match.value(write).pipe(
    Match.tagsExhaustive({ Insert: foreseen, Update: foreseen, Delete: () => [] }),
  )
}

/**
 * Everything a declared write shows before the server answers, from its
 * declarations alone: its own row (`optimisticOfWrite`), with what the
 * context sets filled from `viewer` and `now`, a new row's
 * derived members (`freshDerived`), what its supplied members foresee
 * (`suppliedOfWrite`, Guard's `may`), and the derived members it moves on
 * the rows it points at (`derivedOfWrite`). `derived` is the registry's, by
 * the pointing Entity; `store` is the store as shown, layers and all.
 */
export const predictionOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: {
    readonly derived: ReadonlyMap<string, ReadonlyArray<DerivedBy>>
    readonly store: EntityStore
    readonly viewer: Option.Option<{ readonly entity: string; readonly id: string }>
    readonly now: Option.Option<number>
  },
): ReadonlyArray<PendingPatch | PendingDelete> => {
  const by: ExprContext = { viewer: context.viewer, now: context.now }
  const own = optimisticOfWrite(write, input, keys, by, context.store)
  // The rows a delete takes with it, as the store holds them, each removed as a delete of its own.
  const cascaded = Match.value(write).pipe(
    Match.tagsExhaustive({
      Insert: () => [],
      Update: () => [],
      Delete: () => {
        const { id } = DomainWrite.bind(write, input as never)
        return cascadedBy(write.input.entity, id, context.store).flatMap(
          (row): ReadonlyArray<PendingPatch | PendingDelete> => [
            { _tag: 'Delete', entity: row.entity, id: row.id },
            ...movedBy(
              'Delete',
              {
                entity: row.entity,
                id: row.id,
                values: {},
                links: {},
                increments: {},
                assignments: {},
              },
              context.derived.get(row.entity) ?? [],
              context.store,
              by,
            ),
          ],
        )
      },
    }),
  )
  // Each held row whose link a delete clears (`onDelete: 'setNull'`), shown pointing nowhere.
  const cleared = Match.value(write).pipe(
    Match.tagsExhaustive({
      Insert: () => [],
      Update: () => [],
      Delete: () => {
        const { id } = DomainWrite.bind(write, input as never)
        return clearedBy(write.input.entity, id, context.store).map((row): PendingPatch => ({
          entity: row.owner.name,
          id: row.id,
          values: { [row.relation]: null },
        }))
      },
    }),
  )
  return [
    ...Match.value(write).pipe(
      Match.tagsExhaustive({
        Insert: () => freshDerived(write, input, context.derived),
        Update: () => [],
        Delete: () => [],
      }),
    ),
    ...own,
    ...own.flatMap(patch =>
      '_tag' in patch ? [] : suppliedOfWrite(write, patch, by, context.store),
    ),
    ...derivedOfWrite(
      write,
      input,
      keys,
      context.derived.get(write.input.entity.name) ?? [],
      context.store,
      by,
    ),
    ...cascaded,
    ...cleared,
  ]
}

/**
 * Each row the store holds whose link a delete of `entity`'s row `id` clears
 * (`Entity.clearing`), with the relation it clears. A row the store does not
 * hold is the server's to clear, and its answer reads it again.
 */
const clearedBy = (
  entity: AnyEntity,
  id: string,
  store: EntityStore,
): ReadonlyArray<{ readonly owner: AnyEntity; readonly id: string; readonly relation: string }> => {
  const at = entityKey(entity.name, id)
  return DomainEntity.clearing(entity).flatMap(({ relation, owner }) =>
    Object.entries(store).flatMap(([held, entry]) =>
      entry.tombstone || !held.startsWith(`${owner.name}:`) || entry.values[relation.key] !== at
        ? []
        : [{ owner, id: refParts(held).id, relation: relation.key }],
    ),
  )
}

/**
 * The rows the store holds that a delete of `entity`'s row `id` takes with it:
 * each pointing at a removed row through a relation declared `onDelete:
 * 'cascade'` (`Entity.cascading`), and so on from those. A row the store does
 * not hold, or holds without the link, is the server's to remove, and its
 * answer names it. `judged`: a row reached through a relation that holds it to
 * its own `Delete` rule (`authorizedBy: 'child'`), as the server judges it.
 */
const cascadedBy = (
  entity: AnyEntity,
  id: string,
  store: EntityStore,
): ReadonlyArray<{
  readonly entity: string
  readonly id: string
  readonly owner: AnyEntity
  readonly judged: boolean
}> => {
  // Each cascading relation's rows by the ref they point at, built once per relation.
  const pointing = new Map<string, Map<string, Array<string>>>()
  const rowsPointing = (owner: string, key: string, at: string): ReadonlyArray<string> => {
    const name = `${owner}.${key}`
    let index = pointing.get(name)
    if (index === undefined) {
      index = new Map()
      for (const [held, entry] of Object.entries(store)) {
        if (entry.tombstone || !held.startsWith(`${owner}:`)) continue
        const ref = entry.values[key]
        if (typeof ref !== 'string') continue
        index.set(ref, [...(index.get(ref) ?? []), held])
      }
      pointing.set(name, index)
    }
    return index.get(at) ?? []
  }
  const removed = new Map<
    string,
    { entity: string; id: string; owner: AnyEntity; judged: boolean }
  >()
  const queue: Array<{ readonly entity: AnyEntity; readonly id: string }> = [{ entity, id }]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const at = entityKey(next.entity.name, next.id)
    for (const { relation, owner } of DomainEntity.cascading(next.entity)) {
      const judged = Option.getOrElse(relation.authorizedBy, () => 'child') === 'child'
      for (const held of rowsPointing(owner.name, relation.key, at)) {
        const known = removed.get(held)
        // Reached again: judged where any relation reaching it judges it, as the server does.
        if (known !== undefined || held === entityKey(entity.name, id)) {
          if (known !== undefined) known.judged ||= judged
          continue
        }
        const row = { entity: owner.name, id: refParts(held).id, owner, judged }
        removed.set(held, row)
        queue.push({ entity: owner, id: row.id })
      }
    }
  }
  return [...removed.values()]
}

/**
 * The held fields of `row`, plain and encoded, and each `one` relation as the id
 * it points at, as an invariant is judged over them.
 */
const plainRow = (entity: AnyEntity, row: HeldRow): Record<string, unknown> => {
  const plain: Record<string, unknown> = {}
  const relations: Readonly<Record<string, EntityMember>> = entity.relations
  const links = Object.values(relations).flatMap(member => {
    if (member._tag !== 'Relation' || member.cardinality !== 'one') return []
    return [member.key]
  })
  for (const key of [...Object.keys(entity.fields), ...links])
    Held.match(row.field(key), {
      onHeld: value => {
        put(plain, key, value)
      },
      onUnheld: () => undefined,
    })
  return plain
}

/**
 * The invariant a declared write's row would break, as the client holds it:
 * the store's row with the write's values over it, a field the write moves
 * (an increment, a computed value) not held, and for an update the row
 * before. Only a definite failure counts: an invariant over a field the
 * client lacks is undecided, and refuses nothing. A delete leaves no row.
 */
export const brokenByWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: ExprContext,
  store: EntityStore,
  operators: MemoryOperators,
): Option.Option<Invariant> => {
  const entity = write.input.entity
  const patch = optimisticOfWrite(write, input, keys, context, store).find(
    (each): each is PendingPatch => !('_tag' in each),
  )
  if (patch === undefined) return Option.none()
  const holder = holderOf(store)
  const after = plainRow(
    entity,
    holder.written(entity, patch.id, patch.values, [
      ...Object.keys(patch.adds ?? {}),
      ...Object.keys(patch.computes ?? {}),
    ]),
  )
  const before = Option.getOrUndefined(
    Option.map(holder.rows.row(entity, patch.id), row => plainRow(entity, row)),
  )
  const judged = DomainEntity.judge(
    entity,
    Match.value(write).pipe(
      Match.tag('Insert', () => ({ after })),
      Match.orElse(() => (before === undefined ? { after } : { after, before })),
    ),
    operators,
  )
  if (judged._tag !== 'Invalid') return Option.none()
  return Option.fromUndefinedOr(judged.failures[0])
}

/** Each supplied member of `entity` that says which write its value refuses, by key. */
const forbidding = new WeakMap<AnyEntity, ReadonlyArray<readonly [string, Forbids]>>()
const forbiddersOf = (entity: AnyEntity): ReadonlyArray<readonly [string, Forbids]> => {
  const known = forbidding.get(entity)
  if (known !== undefined) return known
  const derived: Readonly<Record<string, EntityDerived<string, string, Schema.Constraint>>> =
    entity.derived
  const found = Object.entries(derived).flatMap(([key, member]) =>
    Derivation.$match(member.derives, {
      Supplied: ({ forbids }) =>
        Option.match(forbids, { onNone: () => [], onSome: run => [[key, run] as const] }),
      Count: () => [],
      Exists: () => [],
    }),
  )
  forbidding.set(entity, found)
  return found
}

/** What a held row's supplied members (Guard's `may`) say of `surface` done to it; none unheld. */
const forbiddenOf = (
  entity: AnyEntity,
  id: string,
  surface: WriteSurface,
  store: EntityStore,
): Option.Option<{ readonly reason: Option.Option<string> }> => {
  const held = store[entityKey(entity.name, id)]
  if (held === undefined) return Option.none()
  return Option.firstSomeOf(
    forbiddersOf(entity).map(([key, forbids]) =>
      held.present.has(key) ? forbids(held.values[key], surface) : Option.none(),
    ),
  )
}

const deleting: WriteSurface = { kind: 'Delete', members: [], relations: [] }

/**
 * Why a declared write is refused by what the client holds: a supplied member
 * (Guard's `may`) whose value, as the store shows it, forbids what the write
 * does to the row, or, for a delete, to a row it takes with it under that
 * row's own rule (#348), in the words the server refuses it with. None where
 * nothing held says so: an insert, a row not held, or a member not held or
 * not refusing. A row the client does not hold it cannot judge, and leaves
 * to the server, whose refusal rolls the prediction back.
 */
export const forbiddenByWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  store: EntityStore,
): Option.Option<{ readonly reason: Option.Option<string> }> => {
  const entity = write.input.entity
  const bound = () => DomainWrite.bind(write, input as never, keys)
  return Match.valueTags(write, {
    // An insert finds no row, so nothing held of one can refuse it.
    Insert: () => Option.none(),
    Delete: () => {
      const { id } = bound()
      // A held row whose link it clears, refused that unlink by its own rules (#467).
      const clearing = () =>
        Option.firstSomeOf(
          clearedBy(entity, id, store).map(row =>
            Option.map(
              forbiddenOf(
                row.owner,
                row.id,
                {
                  kind: 'Update',
                  members: [],
                  relations: [{ relation: row.relation, interaction: 'Unlink' }],
                },
                store,
              ),
              ({ reason }) => ({
                reason: Option.some(
                  Option.match(reason, {
                    onNone: () =>
                      `It would clear the link of a ${row.owner.name} you may not change`,
                    onSome: said =>
                      `It would clear the link of a ${row.owner.name} you may not change: ${said}`,
                  }),
                ),
              }),
            ),
          ),
        )
      return Option.orElse(forbiddenOf(entity, id, deleting, store), () =>
        Option.firstSomeOf(
          cascadedBy(entity, id, store)
            .filter(row => row.judged)
            .map(row =>
              Option.map(forbiddenOf(row.owner, row.id, deleting, store), ({ reason }) => ({
                reason: Option.some(
                  Option.match(reason, {
                    onNone: () => `It would delete a ${row.entity} you may not delete`,
                    onSome: said => `It would delete a ${row.entity} you may not delete: ${said}`,
                  }),
                ),
              })),
            ),
        ),
      ).pipe(Option.orElse(clearing))
    },
    Update: () => {
      const { id, values, increments, assignments, links } = bound()
      return forbiddenOf(
        entity,
        id,
        {
          kind: 'Update',
          members: [
            ...Object.keys(values),
            ...Object.keys(increments),
            ...Object.keys(assignments),
          ],
          relations: Object.entries(links).map(([relation, link]) => ({
            relation,
            interaction: Option.isSome(link) ? 'Link' : 'Unlink',
          })),
        },
        store,
      )
    },
  })
}
