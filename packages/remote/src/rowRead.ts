/**
 * A row's read, kept while the store entries it was read from are the same
 * objects (#384).
 *
 * A row reads only the entries at the keys it reaches: its own, and through
 * each relation it selects, its targets'. The store is immutable and keeps an
 * entry's object while nothing writes it, so comparing those entries by
 * identity tells whether the read can change. A render reads every row in
 * view after every Message; most of them changed nothing a row reaches.
 */
import { Option, Result, Schema } from 'effect'
import { sameData } from './data.js'
import { recent, type Recent } from './recent.js'
import { own } from './record.js'
import { targetsOf } from './relation.js'
import type { RemoteData, RemoteError } from './remoteData.js'
import type { RelationRequirement } from './requirement.js'
import { assemble, unavailableOf } from './selection.js'
import { entityKey, readField, type EntityEntry, type EntityStore } from './store.js'

/**
 * What a row's own data reads as, before the Model's in-flight marks and
 * failures are laid over it; `undefined` while the store lacks a field it
 * selects.
 */
export type RowRead<Value> =
  | { readonly _tag: 'Ready'; readonly value: Value }
  | { readonly _tag: 'Refreshing'; readonly value: Value }
  | { readonly _tag: 'Failed'; readonly error: RemoteError }
  | undefined

interface RowMemo {
  /** The keys the read reached, and the entry each held (`undefined`: none). */
  readonly keys: ReadonlyArray<string>
  readonly entries: ReadonlyArray<EntityEntry | undefined>
  readonly read: RowRead<unknown>
}

/** A row's assembled data and its decoding, kept while equal data is assembled again. */
interface Decoded {
  readonly assembled: unknown
  readonly decoded: Result.Result<unknown, Schema.SchemaError>
}

/**
 * How many rows each Selection keeps by entity key: `recent`'s two
 * generations of this. Bounded, not per store, so a row whose entry was made
 * again with equal data (an evicted row read again, an optimistic row the
 * visible store writes again on every base write) keeps its value.
 */
const ROWS_KEPT = 4096

const memos = new WeakMap<
  object,
  {
    readonly decode: (values: unknown) => Result.Result<unknown, Schema.SchemaError>
    /**
     * The decoding by entity key, shared by every relation the schema is read
     * through (a row and the list holding it), and by the row's own `values`
     * object as well, which the store keeps across equal writes: the key holds
     * one version, and a Model read again after a later one (an earlier state,
     * a confirmed read beside the visible one) would decode afresh without it.
     */
    readonly byKey: Recent<string, Decoded>
    readonly byValues: WeakMap<object, Decoded>
    readonly byRelation: Map<string, Recent<string, RowMemo>>
  }
>()

const memoOf = (schema: Schema.Codec<unknown, unknown>, relationKey: string) => {
  let bySchema = memos.get(schema)
  if (bySchema === undefined) {
    bySchema = {
      decode: Schema.decodeUnknownResult(schema as never),
      byKey: recent(ROWS_KEPT),
      byValues: new WeakMap(),
      byRelation: new Map(),
    }
    memos.set(schema, bySchema)
  }
  let rows = bySchema.byRelation.get(relationKey)
  if (rows === undefined) {
    rows = recent(ROWS_KEPT)
    bySchema.byRelation.set(relationKey, rows)
  }
  return { ...bySchema, rows }
}

/** The keys `assemble` and `unavailableOf` reach from `key`, with the entry each holds. */
const touch = (
  store: EntityStore,
  key: string,
  requirement: RelationRequirement,
  keys: string[],
  entries: (EntityEntry | undefined)[],
): void => {
  keys.push(key)
  entries.push(store[key])
  if (requirement.relations === undefined) return
  for (const field of requirement.fields) {
    const nested = own(requirement.relations, field)
    if (nested === undefined) continue
    const value = readField(store, key, field)
    if (Option.isNone(value) || value.value === null || value.value === undefined) continue
    for (const ref of targetsOf(value.value, nested)) {
      touch(store, entityKey(ref.entity, ref.id), nested, keys, entries)
    }
  }
}

const unchanged = (store: EntityStore, memo: RowMemo): boolean => {
  for (let index = 0; index < memo.keys.length; index++) {
    if (store[memo.keys[index]!] !== memo.entries[index]) return false
  }
  return true
}

const sameRead = (left: RowRead<unknown>, right: RowRead<unknown>): boolean => {
  if (left === undefined || right === undefined) return left === right
  if (left._tag === 'Failed' || right._tag === 'Failed') {
    return (
      left._tag === right._tag &&
      'error' in left &&
      'error' in right &&
      left.error._tag === right.error._tag &&
      left.error.message === right.error.message
    )
  }
  return left._tag === right._tag && left.value === right.value
}

/** `known` when it was decoded from data equal to `values`. */
const alike = (known: Decoded | undefined, values: unknown): Decoded | undefined =>
  known !== undefined && sameData(known.assembled, values) ? known : undefined

/**
 * `Failed` naming a field the server settled without a value, when one is
 * among what `relation` reads of the entity; otherwise nothing, and the store
 * merely lacks the value. The reason stays with the server, so a view shows
 * the field it cannot have, not why.
 */
const unavailableFailure = (
  store: EntityStore,
  key: string,
  relation: RelationRequirement,
): RowRead<never> => {
  const field = unavailableOf(store, key, relation)
  return field === undefined
    ? undefined
    : {
        _tag: 'Failed',
        error: {
          _tag: 'Unavailable',
          message: `The server answered without ${field}, and will not answer with it: the field is not available to this client.`,
        },
      }
}

/**
 * The row at `key` as `relation` selects it, decoded against `schema`. The
 * same object while what it reads is the same; when that changed, the
 * decoded value it held while the assembled data is equal, and the read it
 * gave while it reads the same.
 */
export const readRow = <Value>(
  store: EntityStore,
  key: string,
  relation: RelationRequirement,
  relationKey: string,
  schema: Schema.Codec<Value, unknown>,
): RowRead<Value> => {
  const { decode, byKey, byValues, rows } = memoOf(
    schema as Schema.Codec<unknown, unknown>,
    relationKey,
  )
  const memo = rows.get(key)
  if (memo !== undefined && unchanged(store, memo)) return memo.read as RowRead<Value>
  const keys: string[] = []
  const entries: (EntityEntry | undefined)[] = []
  touch(store, key, relation, keys, entries)
  const assembled = assemble(store, key, relation)
  let read: RowRead<unknown>
  if (assembled === undefined) {
    read = unavailableFailure(store, key, relation)
  } else {
    // `assemble` found the entry, so it is there.
    const source = store[key]!.values
    const last = alike(byKey.get(key), assembled.values) ??
      alike(byValues.get(source), assembled.values) ?? {
        assembled: assembled.values,
        decoded: decode(assembled.values),
      }
    byKey.set(key, last)
    byValues.set(source, last)
    const { decoded } = last
    read = Result.isFailure(decoded)
      ? { _tag: 'Failed', error: { _tag: 'DecodeError', message: decoded.failure.message } }
      : { _tag: assembled.refreshing ? 'Refreshing' : 'Ready', value: decoded.success }
  }
  const kept = memo !== undefined && sameRead(memo.read, read) ? memo.read : read
  rows.set(key, { keys, entries, read: kept })
  return kept as RowRead<Value>
}

/** The reads that hold no value, one object each, so a read of one is the same object every time. */
export const INITIAL: { readonly _tag: 'Initial' } = Object.freeze({ _tag: 'Initial' })
export const LOADING: { readonly _tag: 'Loading' } = Object.freeze({ _tag: 'Loading' })
export const NOT_FOUND: { readonly _tag: 'NotFound' } = Object.freeze({ _tag: 'NotFound' })

const failedOver = new WeakMap<object, { readonly error: RemoteError; readonly read: object }>()

/**
 * A value on screen whose refresh failed, kept with the error: the same
 * object while the read under it and the error are.
 */
export const failedWith = <Value>(
  shown: { readonly value: Value },
  error: RemoteError,
): RemoteData<Value> => {
  const kept = failedOver.get(shown)
  if (kept !== undefined && kept.error === error) return kept.read as RemoteData<Value>
  const read: RemoteData<Value> = { _tag: 'Failed', error, previous: shown.value }
  failedOver.set(shown, { error, read })
  return read
}
