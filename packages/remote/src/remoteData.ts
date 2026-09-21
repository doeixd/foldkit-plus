/** `RemoteData`: the state of a value the store may not hold yet. */
import { Option, Schema } from 'effect'

export interface RemoteError {
  readonly _tag: string
  readonly message: string
}

export type RemoteData<A> =
  | { readonly _tag: 'Initial' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Ready'; readonly value: A }
  | { readonly _tag: 'Refreshing'; readonly value: A }
  | { readonly _tag: 'Failed'; readonly error: RemoteError; readonly previous?: A }
  | { readonly _tag: 'NotFound' }

/**
 * What `RemoteData.render` tells the `data` branch about the value it is
 * given: whether a newer answer is on its way, and whether this one is what
 * was last known good before a read failed. It is one tag rather than two
 * booleans because a value cannot be both at once, and a type that can say so
 * invites a view to handle a state that never arrives.
 */
export type Freshness =
  | { readonly _tag: 'Fresh' }
  | { readonly _tag: 'Refreshing' }
  | { readonly _tag: 'Stale'; readonly error: RemoteError }

const fresh: Freshness = { _tag: 'Fresh' }
const refreshing: Freshness = { _tag: 'Refreshing' }

export const remoteErrorSchema = Schema.Struct({ _tag: Schema.String, message: Schema.String })

/** A `RemoteData` schema, so a projection that reads remote state is typed. */
// A projection is rebuilt on every Model change (a Surface's `model` callback
// runs per dependency computation), so the schema for a value schema is built
// once and shared: the value schema is a module-level constant in practice.
const remoteDataSchemas = new WeakMap<object, Schema.Schema<unknown>>()

export const remoteDataSchema = <A>(
  value: Schema.Schema<A>,
): Schema.Codec<RemoteData<A>, unknown> => {
  const cached = remoteDataSchemas.get(value)
  if (cached !== undefined) return cached as Schema.Codec<RemoteData<A>, unknown>
  const built = Schema.Union([
    Schema.Struct({ _tag: Schema.Literal('Initial') }),
    Schema.Struct({ _tag: Schema.Literal('Loading') }),
    Schema.Struct({ _tag: Schema.Literal('Ready'), value }),
    Schema.Struct({ _tag: Schema.Literal('Refreshing'), value }),
    Schema.Struct({
      _tag: Schema.Literal('Failed'),
      error: remoteErrorSchema,
      previous: Schema.optional(value),
    }),
    Schema.Struct({ _tag: Schema.Literal('NotFound') }),
  ]) as unknown as Schema.Codec<RemoteData<A>, unknown>
  remoteDataSchemas.set(value, built as Schema.Schema<unknown>)
  return built
}

export const RemoteData = {
  /**
   * The `RemoteData` schema for a value schema. Exposed so a `RemoteData` can
   * be embedded in a hand-written Model schema, not only through `Remote.select`.
   */
  schema: <A>(value: Schema.Schema<A>): Schema.Schema<RemoteData<A>> => remoteDataSchema(value),

  /** Exhaustive: omitting a state is a compile error. */
  match: <A, R>(
    data: RemoteData<A>,
    cases: {
      readonly Initial: () => R
      readonly Loading: () => R
      readonly Ready: (value: A) => R
      readonly Refreshing: (value: A) => R
      readonly Failed: (error: RemoteError, previous: Option.Option<A>) => R
      readonly NotFound: () => R
    },
  ): R => {
    switch (data._tag) {
      case 'Initial':
        return cases.Initial()
      case 'Loading':
        return cases.Loading()
      case 'Ready':
        return cases.Ready(data.value)
      case 'Refreshing':
        return cases.Refreshing(data.value)
      case 'Failed':
        return cases.Failed(
          data.error,
          data.previous === undefined ? Option.none() : Option.some(data.previous),
        )
      case 'NotFound':
        return cases.NotFound()
    }
  },

  /**
   * The view-oriented fold: the six states as the three things a view actually
   * draws, under the policy that useful data stays on screen. A value that is
   * being refetched, or that a later read failed to replace, still reaches
   * `data` — with `freshness` saying which — instead of being replaced by a
   * spinner or an error the reader cannot act on.
   *
   * ```ts
   * RemoteData.render(model.user, {
   *   loading: () => UserSkeleton(),
   *   notFound: () => NoSuchUser(),
   *   failed: error => ErrorView(error),
   *   data: (user, freshness) => UserView({ user, dimmed: freshness._tag !== 'Fresh' }),
   * })
   * ```
   *
   * `notFound` is its own branch and not optional: a row the server answered
   * for and does not have is neither loading nor a failure, and drawing it as
   * either is a spinner that never ends or an error nobody can fix.
   *
   * This does not replace `match`, which is the exhaustive fold over the states
   * themselves. Reach for `match` when the six states really do draw
   * differently, and for this when they draw the usual three ways.
   */
  render: <A, R>(
    data: RemoteData<A>,
    cases: {
      readonly loading: () => R
      readonly notFound: () => R
      readonly failed: (error: RemoteError) => R
      readonly data: (value: A, freshness: Freshness) => R
    },
  ): R => {
    switch (data._tag) {
      case 'Initial':
      case 'Loading':
        return cases.loading()
      case 'NotFound':
        return cases.notFound()
      case 'Ready':
        return cases.data(data.value, fresh)
      case 'Refreshing':
        return cases.data(data.value, refreshing)
      case 'Failed':
        return data.previous === undefined
          ? cases.failed(data.error)
          : cases.data(data.previous, { _tag: 'Stale', error: data.error })
    }
  },

  map: <A, B>(data: RemoteData<A>, f: (value: A) => B): RemoteData<B> => {
    switch (data._tag) {
      case 'Ready':
        return { _tag: 'Ready', value: f(data.value) }
      case 'Refreshing':
        return { _tag: 'Refreshing', value: f(data.value) }
      case 'Failed':
        return data.previous === undefined
          ? { _tag: 'Failed', error: data.error }
          : { _tag: 'Failed', error: data.error, previous: f(data.previous) }
      default:
        return data
    }
  },
}
