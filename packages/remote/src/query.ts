/**
 * Queries and connections. A connection's identity is its descriptor plus the
 * canonical encoded filter/sort input — **never** the pagination window, so
 * `first(25)` and `after(cursor).first(25)` address the same logical connection.
 */
import { Schema } from 'effect'
import type { Cursor } from './connection.js'
import { schemaOf, type SchemaOrFields, type TypeOf } from './mutation.js'

export type LiveInsertion = 'visible' | 'boundary' | 'invalidate' | 'ignore'

export interface LivePolicy {
  readonly prepend?: LiveInsertion
  readonly append?: LiveInsertion
}

export interface ConnectionSpec {
  readonly entity: string
  readonly edgeKey?: Schema.Schema<unknown>
  readonly live?: LivePolicy
}

export interface QueryWindow {
  readonly first?: number | undefined
  readonly last?: number | undefined
  readonly after?: Cursor | undefined
  readonly before?: Cursor | undefined
}

export interface QueryRef<Name extends string, Input> {
  readonly query: Name
  readonly input: Input
  /** The input codec, so a `QueryRef` can encode itself without its descriptor. */
  readonly Input: Schema.Codec<Input>
  readonly window: QueryWindow
  /** Connection identity: descriptor + canonical input, excluding the window. */
  readonly identity: string
}

export interface QueryDescriptor<Name extends string, Input, Result> {
  readonly name: Name
  readonly Input: Schema.Codec<Input>
  readonly Result: Result
  readonly ref: (input: Input) => QueryRef<Name, Input>
}

/** Stable stringify: object keys sorted, undefined-valued keys dropped, so equal inputs encode equally. */
export const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

/** `Result: Project` means a connection over `Project`; anything else is the result as given. */
export type ResultOf<Result> = Result extends { readonly name: string; readonly ref: unknown }
  ? ConnectionSpec
  : Result

const isEntityName = (result: unknown): result is { readonly name: string } =>
  typeof result === 'object' &&
  result !== null &&
  'ref' in result &&
  typeof (result as { readonly name?: unknown }).name === 'string'

export const Query = {
  /** Declares the entity and options a query's result is a connection over. */
  connection: (
    entity: { readonly name: string },
    options?: { readonly edgeKey?: Schema.Schema<unknown>; readonly live?: LivePolicy },
  ): ConnectionSpec => ({
    entity: entity.name,
    ...(options?.edgeKey === undefined ? {} : { edgeKey: options.edgeKey }),
    ...(options?.live === undefined ? {} : { live: options.live }),
  }),

  /**
   * Declares a query. `Input` is a codec or the fields of the `Schema.Struct` it
   * would be; `Result` is a `Query.connection(...)`, or the entity the result is
   * a connection over.
   */
  make: <const Name extends string, Input extends SchemaOrFields, Result>(
    name: Name,
    config: { readonly Input: Input; readonly Result: Result },
  ): QueryDescriptor<Name, TypeOf<Input>, ResultOf<Result>> => {
    const Input = schemaOf(config.Input)
    const encode = Schema.encodeSync(Input)
    return {
      name,
      Input,
      Result: (isEntityName(config.Result)
        ? Query.connection(config.Result)
        : config.Result) as ResultOf<Result>,
      ref: input => ({
        query: name,
        input,
        Input,
        window: {},
        identity: `${name}\u0000${stableStringify(encode(input))}`,
      }),
    }
  },

  first:
    (count: number) =>
    <R extends QueryRef<string, unknown>>(ref: R): R => ({
      ...ref,
      window: { ...ref.window, first: count },
    }),

  last:
    (count: number) =>
    <R extends QueryRef<string, unknown>>(ref: R): R => ({
      ...ref,
      window: { ...ref.window, last: count },
    }),

  after:
    (cursor: Cursor) =>
    <R extends QueryRef<string, unknown>>(ref: R): R => ({
      ...ref,
      window: { ...ref.window, after: cursor },
    }),

  before:
    (cursor: Cursor) =>
    <R extends QueryRef<string, unknown>>(ref: R): R => ({
      ...ref,
      window: { ...ref.window, before: cursor },
    }),
}
