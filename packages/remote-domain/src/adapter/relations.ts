/**
 * Rows read through their Views, and the `one` relations between them (#544,
 * WP8). A View's state holds a `one` relation as the target's id (or `null`);
 * the adapter answers it as Remote's ref key and reads the target in the same
 * batch through the target Entity's own View binding, so the target's
 * `validate` decides whether who asks sees it, as it does for a read of it.
 */
import * as Domain from '@alchemy.run/domain'
import { Effect, Match, Option, Schema } from 'effect'
import { RpcClientError } from 'effect/rpc/RpcClientError'
import type { AnyEntity } from 'foldkit-entity'
import {
  entityKey,
  MAX_RELATION_DEPTH,
  RemoteReadError,
  RemoteUnauthenticated,
  RemoteUnreachable,
  type RelationRequirement,
  type Requirement,
} from 'foldkit-remote'
import type { Receipt } from '../index.js'
import type { ViewBinding } from './binding.js'

/** What a View's `snapshot` and `watch` answer. */
export interface Snapshot {
  readonly state: Readonly<Record<string, unknown>> | null
  readonly cursor: number
}

/** What a call failed with, as the adapter answers it. */
export type Failure =
  | { readonly _tag: 'Rejected'; readonly rejection: { readonly _tag: string } }
  | { readonly _tag: 'Behind'; readonly message: string }
  | { readonly _tag: 'Unreachable'; readonly message: string }
  | { readonly _tag: 'Denied'; readonly error: unknown }

export const failureOf =
  (rejections: ReadonlyArray<Domain.Rejection.Any>) =>
  (error: unknown): Failure => {
    const rejection = rejections.find(each => Schema.is(each)(error))
    if (rejection !== undefined)
      return { _tag: 'Rejected', rejection: error as { readonly _tag: string } }
    if (Schema.is(RpcClientError)(error))
      return { _tag: 'Unreachable', message: 'The Domain Api did not answer' }
    if (Schema.is(Domain.ConsistencyTimeout)(error))
      return { _tag: 'Behind', message: 'The View did not catch up with the write' }
    return { _tag: 'Denied', error }
  }

/** A row's key in the adapter's maps: unambiguous for any entity name and id. */
export const keyOf = (entity: string, id: string) => JSON.stringify([entity, id])

/** A codec as the adapter runs it: the mutation's and the Entity's need no services. */
export type Codec = Schema.Codec<unknown, unknown>

/** The revision a View state holds, as Remote orders rows by it. */
export const revisionOf = (binding: ViewBinding, state: Readonly<Record<string, unknown>>) => {
  const revision = state[binding.revision]
  return typeof revision === 'number' && Number.isFinite(revision)
    ? { revision }
    : ({} as { readonly revision?: number })
}

/** The Entity a `one` relation of `entity` points at, none for a key that is no such relation. */
const oneRelation = (entity: AnyEntity, key: string): Option.Option<AnyEntity> => {
  const relation = Object.hasOwn(entity.relations, key) ? entity.relations[key] : undefined
  return relation?.cardinality === 'one' ? Option.some(relation.target()) : Option.none()
}

const isRelation = (entity: AnyEntity, key: string) => Object.hasOwn(entity.relations, key)

/** The id a View state holds for a `one` relation: none for `null`, refused for anything not an id. */
const targetIdOf = (entity: AnyEntity, id: string, key: string, value: unknown) =>
  value === null
    ? Effect.succeedNone
    : typeof value === 'string'
      ? Effect.succeedSome(value)
      : Effect.fail(
          new RemoteReadError({
            message: `${key} of ${entity.name} ${id} holds no id of the row it points at`,
          }),
        )

/**
 * A row's values for `fields`, encoded as the Entity stores them (a `one`
 * relation as its target's ref key), and the fields it lacks.
 */
export const encodeRow = (
  entity: AnyEntity,
  id: string,
  state: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const values: Record<string, unknown> = Object.create(null)
    const lacking: Array<string> = []
    for (const field of fields) {
      const member: { readonly schema: Codec } | undefined = Object.hasOwn(entity.fields, field)
        ? entity.fields[field]
        : undefined
      const target = oneRelation(entity, field)
      if (field === 'id') values[field] = id
      else if (isRelation(entity, field) && Option.isNone(target))
        return yield* new RemoteReadError({
          message: `${entity.name}.${field} is a list of rows, which a View's state cannot hold`,
        })
      else if (!Object.hasOwn(state, field) || (member === undefined && Option.isNone(target)))
        lacking.push(field)
      else if (Option.isSome(target))
        values[field] = Option.match(yield* targetIdOf(entity, id, field, state[field]), {
          onNone: () => null,
          onSome: to => entityKey(target.value.name, to),
        })
      else
        values[field] = yield* Schema.encodeUnknownEffect(member!.schema)(state[field]).pipe(
          Effect.mapError(
            () =>
              new RemoteReadError({
                message: `${field} of ${entity.name} ${id} does not encode as ${entity.name} declares it`,
              }),
          ),
        )
    }
    return { values, lacking }
  })

/** What reading rows needs of the layer: the View bindings and how a snapshot is asked. */
export interface Rows {
  readonly views: ReadonlyMap<string, ViewBinding>
  /** The key's snapshot, at the receipt when one is given; none when the View did not answer in time. */
  readonly snapshotAt: (
    binding: ViewBinding,
    id: string,
    receipt: Option.Option<Receipt>,
  ) => Effect.Effect<Option.Option<Snapshot>, unknown>
}

export interface RowsRead {
  readonly entities: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly values: Readonly<Record<string, unknown>>
    readonly revision?: number
  }>
  readonly settled: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly fields: ReadonlyArray<string>
  }>
  /** Rows read at a receipt their View has not reached. */
  readonly behind: ReadonlyArray<{ readonly entity: string; readonly id: string }>
  /** Rows absent to who asks: none, or hidden by their View's `validate`. */
  readonly absent: ReadonlySet<string>
}

/** How many View snapshots one read asks for at once. */
const SNAPSHOTS_AT_ONCE = 16

type Answer =
  | { readonly _tag: 'Row'; readonly state: Readonly<Record<string, unknown>> }
  | { readonly _tag: 'Absent' }
  | { readonly _tag: 'Behind' }

/**
 * Reads each requested row through its Entity's View, at its receipt when
 * `receipts` holds one, and each `one` relation's target the request selects,
 * through the target's own View, level by level. A row is read once however
 * many requests reach it, with the union of the fields they ask.
 */
export const readRows = (
  rows: Rows,
  requests: ReadonlyArray<Requirement>,
  receipts: ReadonlyMap<string, Receipt>,
): Effect.Effect<RowsRead, RemoteReadError | RemoteUnreachable | RemoteUnauthenticated> =>
  Effect.gen(function* () {
    const fieldsOf = new Map<string, Set<string>>()
    const answers = new Map<string, Answer>()
    const order: Array<{ readonly entity: string; readonly id: string }> = []
    let level: ReadonlyArray<Requirement> = requests
    for (let depth = 0; level.length > 0; depth++) {
      if (depth > MAX_RELATION_DEPTH)
        return yield* new RemoteReadError({
          message: `A read may follow relations at most ${MAX_RELATION_DEPTH} deep`,
        })
      const asked = new Map<string, Requirement>()
      for (const request of level) {
        const key = keyOf(request.entity, request.id)
        const fields = fieldsOf.get(key)
        if (fields === undefined) {
          fieldsOf.set(key, new Set(request.fields))
          order.push(request)
        } else for (const field of request.fields) fields.add(field)
        if (!answers.has(key)) asked.set(key, request)
      }
      const read = yield* Effect.forEach(
        [...asked.values()],
        request =>
          Effect.map(answerOf(rows, request, receipts), answer => [request, answer] as const),
        { concurrency: SNAPSHOTS_AT_ONCE },
      )
      for (const [request, answer] of read) answers.set(keyOf(request.entity, request.id), answer)
      level = yield* Effect.map(
        Effect.forEach(level, request => targetsOf(rows, request, answers)),
        targets => targets.flat(),
      )
    }

    const entities: Array<RowsRead['entities'][number]> = []
    const settled: Array<RowsRead['settled'][number]> = []
    const behind: Array<RowsRead['behind'][number]> = []
    const absent = new Set<string>()
    for (const { entity, id } of order) {
      const key = keyOf(entity, id)
      const binding = rows.views.get(entity)!
      yield* Match.valueTags(answers.get(key)!, {
        Behind: () => Effect.sync(() => behind.push({ entity, id })),
        Absent: () => Effect.sync(() => absent.add(key)),
        Row: ({ state }) =>
          Effect.map(encodeRow(binding.entity, id, state, [...fieldsOf.get(key)!]), row => {
            entities.push({ entity, id, values: row.values, ...revisionOf(binding, state) })
            if (row.lacking.length > 0) settled.push({ entity, id, fields: row.lacking })
          }),
      })
    }
    return { entities, settled, behind, absent }
  })

/** One row's snapshot through its View, as the read answers it. */
const answerOf = (rows: Rows, request: Requirement, receipts: ReadonlyMap<string, Receipt>) =>
  Effect.gen(function* () {
    const binding = yield* bindingOf(rows, request.entity)
    if (request.windows !== undefined && Object.keys(request.windows).length > 0)
      return yield* new RemoteReadError({
        message: `${request.entity} is read through ${binding.view}, which pages no relation`,
      })
    const receipt = Option.fromUndefinedOr(receipts.get(keyOf(request.entity, request.id)))
    const answered = yield* rows.snapshotAt(binding, request.id, receipt).pipe(
      Effect.catch(error =>
        Match.valueTags(failureOf(binding.rejections)(error), {
          // Hidden reads as missing, as a guarded Source's does.
          Rejected: () => Effect.succeedSome<Snapshot>({ state: null, cursor: 0 }),
          Behind: () => Effect.succeedNone,
          Unreachable: ({ message }) => Effect.fail(new RemoteUnreachable({ message })),
          Denied: () =>
            Effect.fail(new RemoteUnauthenticated({ message: 'The Domain Api refused who asks' })),
        }),
      ),
    )
    // A read at a receipt the View has not reached is behind, not unanswered.
    if (Option.isNone(answered))
      return Option.isSome(receipt)
        ? ({ _tag: 'Behind' } as const)
        : yield* new RemoteUnreachable({ message: `${binding.view} did not answer in time` })
    const state = answered.value.state
    return state === null ? ({ _tag: 'Absent' } as const) : ({ _tag: 'Row', state } as const)
  })

/** The requests for the targets a row's `one` relations point at, as its request selects them. */
const targetsOf = (rows: Rows, request: Requirement, answers: ReadonlyMap<string, Answer>) =>
  Effect.gen(function* () {
    const answer = answers.get(keyOf(request.entity, request.id))
    if (answer?._tag !== 'Row' || request.relations === undefined) return []
    const binding = yield* bindingOf(rows, request.entity)
    const targets: Array<Requirement> = []
    for (const [key, slice] of Object.entries(request.relations) as Array<
      [string, RelationRequirement]
    >) {
      const target = oneRelation(binding.entity, key)
      if (Option.isNone(target) || !Object.hasOwn(answer.state, key)) continue
      if (slice.entity !== target.value.name)
        return yield* new RemoteReadError({
          message: `${request.entity}.${key} points at ${target.value.name}, not ${slice.entity}`,
        })
      const to = yield* targetIdOf(binding.entity, request.id, key, answer.state[key])
      if (Option.isSome(to)) targets.push({ ...slice, id: to.value })
    }
    return targets
  })

const bindingOf = (rows: Rows, entity: string) =>
  Option.match(Option.fromUndefinedOr(rows.views.get(entity)), {
    onNone: () => Effect.fail(new RemoteReadError({ message: `No View is bound to ${entity}` })),
    onSome: Effect.succeed,
  })
