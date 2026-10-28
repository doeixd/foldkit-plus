/**
 * A service whose code loads on first use. `Resource.lazy` is an entry of
 * the runtime's `resources` Layer that holds no service yet, only how to get
 * one: the dynamic import that is its own chunk, and the Layer that chunk
 * exports. The first Command that asks with `Resource.get` waits for the
 * import and the build, once; every later one shares what was built, until
 * the runtime's scope closes.
 */
import { Context, Data, Deferred, Effect, Layer, Option } from 'effect'

declare const LazyTypeId: unique symbol

/** What a Command that reads `Identifier`'s service through `Resource.get` requires. */
export interface Lazy<Identifier> {
  readonly [LazyTypeId]: Identifier
}

/** The import of a lazy resource's chunk failed. A later `get` tries again. */
export class LoadError extends Data.TaggedError('ResourceLoadError')<{
  /** The service's key. */
  readonly resource: string
  readonly cause: unknown
}> {}

interface Loader<Shape> {
  /** The load in flight or done, started first when there is none (before the first, after a failed one). */
  readonly start: Effect.Effect<Deferred.Deferred<Shape, LoadError>>
}

// The string key is a service's identity, so a loader made per call is the same service.
const loaderOf = <Identifier, Shape>(
  tag: Context.Key<Identifier, Shape>,
): Context.Service<Lazy<Identifier>, Loader<Shape>> =>
  Context.Service<Lazy<Identifier>, Loader<Shape>>(`foldkit-bundle/Resource/${tag.key}`)

/**
 * `tag`'s service, loaded on first use: `load` imports the chunk and returns
 * the Layer that builds the service. The Layer is built into this entry's
 * scope (the runtime's), with whatever else `resources` gives it (`RIn`).
 *
 * The Layer must not fail: a failure it can recover from is the service's
 * to handle, and one it cannot is a defect (`Layer.orDie`), which reaches
 * the Command as one. A test passes a fake the same way:
 * `Resource.lazy(Tag, async () => Layer.succeed(Tag, fake))`.
 */
export const lazy = <Identifier, Shape, RIn = never>(
  tag: Context.Key<Identifier, Shape>,
  load: () => Promise<Layer.Layer<Identifier, never, RIn>>,
): Layer.Layer<Lazy<Identifier>, never, RIn> =>
  Layer.effect(
    loaderOf(tag),
    Effect.gen(function* () {
      const scope = yield* Effect.scope
      const context = yield* Effect.context<RIn>()
      let loading = Option.none<Deferred.Deferred<Shape, LoadError>>()
      const build = Effect.tryPromise({
        try: load,
        catch: cause => new LoadError({ resource: tag.key, cause }),
      }).pipe(
        Effect.flatMap(layer => Layer.buildWithScope(layer, scope)),
        Effect.map(built => Context.get(built, tag)),
        Effect.provideContext(context),
      )
      // Check and claim in one synchronous step, so two Commands asking at
      // once share one load. The load runs in the runtime's scope, not the
      // asking Command's, so interrupting that Command leaves it running for
      // the others.
      const start = Effect.suspend(() =>
        Option.match(loading, {
          onSome: Effect.succeed,
          onNone: () => {
            const deferred = Deferred.makeUnsafe<Shape, LoadError>()
            loading = Option.some(deferred)
            return build.pipe(
              // Forgotten before the waiters wake, so a retry starts a new import.
              Effect.onError(() =>
                Effect.sync(() => {
                  loading = Option.none()
                }),
              ),
              Deferred.into(deferred),
              Effect.forkIn(scope),
              Effect.as(deferred),
            )
          },
        }),
      )
      return { start }
    }),
  )

/**
 * `tag`'s service, loading its chunk first if no Command has yet. Fails with
 * `LoadError` when the import does; a Layer that dies dies here too.
 */
export const get = <Identifier, Shape>(
  tag: Context.Key<Identifier, Shape>,
): Effect.Effect<Shape, LoadError, Lazy<Identifier>> =>
  Effect.flatMap(loaderOf(tag), loader => Effect.flatMap(loader.start, Deferred.await))

/**
 * Starts loading `tag`'s chunk and returns at once, so the `get` after it
 * waits less or not at all. Starting it again, or after it has loaded, does
 * nothing; a failed one is forgotten, and the next `get` tries again.
 */
export const prefetch = <Identifier, Shape>(
  tag: Context.Key<Identifier, Shape>,
): Effect.Effect<void, never, Lazy<Identifier>> =>
  Effect.flatMap(loaderOf(tag), loader => Effect.asVoid(loader.start))
