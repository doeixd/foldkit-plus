/**
 * A document's Message history: the Schemas its durable Messages have been
 * stored in, oldest first, and how each becomes the next. An operation keeps
 * the version it was written at, in its outbox and on the wire; every reader
 * of its meaning sees it upcast to the current version.
 */
import { Schema } from 'effect'

/**
 * The Message history a document's operations may be stored in. Version 1 is
 * the first Schema; each `next` adds one. Steps are written once and never
 * changed: a later change adds a step after them. Made by `Sync.migrations`.
 */
export interface Migrations<Type, Encoded> {
  /** The current version: 1 for the first Schema, one more for each `next`. */
  readonly version: number
  /** The current Schema: the document's Message. */
  readonly current: Schema.Codec<Type, Encoded, never, never>
  /**
   * The next version: its Schema, and how a Message of the version before,
   * encoded, becomes one of this version, encoded. `up` must be pure and
   * deterministic: the server reads an entry more than once (its `admit`, then
   * the journal), so a clock or a random id in it would let `admit` judge one
   * Message and the journal commit another.
   */
  readonly next: <T, E>(
    schema: Schema.Codec<T, E, never, never>,
    up: (previous: Encoded) => NoInfer<E>,
  ) => Migrations<T, E>
}

interface Step {
  /** Checks an encoded Message of this version strictly, and returns it normalized. */
  readonly normalize: (encoded: unknown) => unknown
  /** From the version before, encoded, to this one, encoded. Absent for version 1. */
  readonly up: ((previous: unknown) => unknown) | undefined
}

/** What Sync reads a history with. Kept off the public interface: a step is not an API. */
export interface History {
  readonly version: number
  /** An encoded Message of `version` (from 1 to `version - 1`), upcast to the current version, encoded and unchecked. Throws when a step refuses it. */
  readonly upcast: (version: number, encoded: unknown) => unknown
  /** An encoded Message of `version`, checked and encoded again by that version's own Schema. Throws when it refuses it. */
  readonly normalize: (version: number, encoded: unknown) => unknown
}

const histories = new WeakMap<object, History>()

const stepOf = (schema: Schema.Codec<unknown, unknown, never, never>): Step['normalize'] => {
  const decode = Schema.decodeUnknownSync(schema, { onExcessProperty: 'error' })
  const encode = Schema.encodeSync(schema)
  return encoded => encode(decode(encoded))
}

const chain = <Type, Encoded>(
  schemas: ReadonlyArray<Schema.Codec<unknown, unknown, never, never>>,
  steps: ReadonlyArray<Step>,
): Migrations<Type, Encoded> => {
  const history: History = {
    version: steps.length,
    upcast: (version, encoded) => {
      let value = encoded
      // Each step is given its version's value checked and normalized, the
      // form the payload is compared by, so what is hashed and what is read
      // cannot differ under one operation id.
      for (let at = version; at < steps.length; at++)
        value = steps[at]!.up!(steps[at - 1]!.normalize(value))
      return value
    },
    normalize: (version, encoded) => steps[version - 1]!.normalize(encoded),
  }
  const migrations: Migrations<Type, Encoded> = {
    version: steps.length,
    current: schemas[schemas.length - 1] as Schema.Codec<Type, Encoded, never, never>,
    next: (schema, up) =>
      chain(
        [...schemas, schema as Schema.Codec<unknown, unknown, never, never>],
        [
          ...steps,
          {
            normalize: stepOf(schema as Schema.Codec<unknown, unknown, never, never>),
            up: up as (previous: unknown) => unknown,
          },
        ],
      ),
  }
  histories.set(migrations, history)
  return migrations
}

/**
 * Starts a document's Message history at its first Schema:
 * `Sync.migrations(V1).next(V2, up)`. Pass it to `Sync.define` in place of
 * `message`, or to `Sync.forApplication(App).make` as `migrations`.
 */
export const migrations = <T, E>(first: Schema.Codec<T, E, never, never>): Migrations<T, E> => {
  const schema = first as Schema.Codec<unknown, unknown, never, never>
  return chain([schema], [{ normalize: stepOf(schema), up: undefined }])
}

/** The history behind a `Migrations`; one made by hand has none, and is refused. */
export const historyOf = (value: Migrations<unknown, unknown>): History => {
  const history = histories.get(value)
  if (history === undefined) throw new Error('Sync: a Message history comes from Sync.migrations')
  return history
}
