/**
 * Queries and connections. A connection's identity is its descriptor plus the
 * canonical encoded filter/sort input — **never** the pagination window, so
 * `first(25)` and `after(cursor).first(25)` address the same logical connection.
 */
import { Schema } from 'effect'
import {
  Expr,
  Query as RelationalQuery,
  type AnyEntity,
  type AnyQuery,
  type InputExpr,
} from 'foldkit-entity'
import type { Cursor } from './connection.js'
import { schemaOf, type SchemaOrFields, type TypeOf } from './mutation.js'

export type LiveInsertion = 'visible' | 'boundary' | 'invalidate' | 'ignore'

export interface LivePolicy {
  readonly prepend?: LiveInsertion
  readonly append?: LiveInsertion
}

export interface ConnectionSpec<Entity extends string = string> {
  readonly entity: Entity
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
  /**
   * What the query means, when it was declared with `Query.define`: the rows it
   * is about, as a value an interpreter can compile. A descriptor from
   * `Query.make` has none — its meaning lives in whatever the server registered
   * to answer it — and a source is free to answer either.
   */
  readonly body?: AnyQuery | undefined
}

/**
 * The inputs of a definition's body: one placeholder per key of `Input`, typed
 * as that key's value. A body is built once, so these stand for what the query
 * will be given rather than being it.
 */
export type QueryInputs<Input> = {
  readonly [K in keyof Input & string]: InputExpr<Input[K]>
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

/**
 * `Result: Project` (or anything with the entity's `name`, as `Query.connection`
 * takes) means a connection over it; a `ConnectionSpec` names its `entity`
 * instead and is the result as given.
 */
export type ResultOf<Result> = Result extends { readonly name: infer Entity extends string }
  ? ConnectionSpec<Entity>
  : Result

const isEntityName = (result: unknown): result is { readonly name: string } =>
  typeof result === 'object' &&
  result !== null &&
  typeof (result as { readonly name?: unknown }).name === 'string'

/**
 * The relational half comes from `foldkit-entity`, so one `Query` namespace
 * holds both what a query means (`from`, `where`, `orderBy`) and how this
 * client addresses it (`make`, `connection`, the window steps). They are one
 * vocabulary in use — a definition's body is composed and then named — and two
 * namespaces of the same name in one file would be a trap.
 */
/**
 * One placeholder per key of the input's schema, each carrying that key's own
 * codec so a comparison against it is checked. A codec that is not a Struct has
 * no keys to stand for, and a body over it reads no inputs.
 */
const inputsOf = (schema: Schema.Codec<unknown>): Record<string, InputExpr<unknown>> => {
  const fields = (schema as { readonly fields?: Schema.Struct.Fields }).fields
  if (fields === undefined) return {}
  const inputs: Record<string, InputExpr<unknown>> = {}
  for (const key of Object.keys(fields)) {
    inputs[key] = Expr.input(key, fields[key] as unknown as Schema.Codec<unknown, unknown>)
  }
  return Object.freeze(inputs)
}

/** A relational `Query` over one Entity, as `Query.define`'s body returns. */
type RelationalQueryOf<E extends AnyEntity> = ReturnType<typeof RelationalQuery.from<E>>

export const Query = {
  ...RelationalQuery,

  /** Declares the entity and options a query's result is a connection over. */
  connection: <Entity extends string>(
    entity: { readonly name: Entity },
    options?: { readonly edgeKey?: Schema.Schema<unknown>; readonly live?: LivePolicy },
  ): ConnectionSpec<Entity> => ({
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

  /**
   * Declares a query by what it means. The body is built once, here, and the
   * `input` it is given holds placeholders rather than values — there is
   * nothing yet to branch on, so a condition that depends on what was passed is
   * a comparison over the placeholder:
   *
   * ```ts
   * const PostsBySlug = Query.define('PostsBySlug', { slug: Schema.String }, ({ input }) =>
   *   Query.from(Post).pipe(
   *     Query.where(Expr.eq(Post.fields.slug, input.slug)),
   *     Query.orderBy(Order.asc(Post.fields.id)),
   *   ),
   * )
   * ```
   *
   * What comes back is an ordinary `QueryDescriptor` — the same name, `Input`,
   * `ref` and connection identity `Query.make` gives — carrying its `body`
   * besides. A server can compile that body instead of being told the same
   * thing again in its own dialect, and one that would rather answer the query
   * its own way still can.
   *
   * The result is a connection over the Entity the body reads, so it is not
   * named twice.
   */
  define: <const Name extends string, Input extends SchemaOrFields, E extends AnyEntity>(
    name: Name,
    Input: Input,
    body: (context: { readonly input: QueryInputs<TypeOf<Input>> }) => RelationalQueryOf<E>,
    options?: { readonly edgeKey?: Schema.Schema<unknown>; readonly live?: LivePolicy },
  ): QueryDescriptor<Name, TypeOf<Input>, ConnectionSpec<E['name']>> => {
    const schema = schemaOf(Input)
    const built = body({ input: inputsOf(schema) as QueryInputs<TypeOf<Input>> })
    const descriptor = Query.make(name, {
      Input,
      Result: Query.connection(built.entity, options) as ConnectionSpec<E['name']>,
    })
    return { ...descriptor, body: built }
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
