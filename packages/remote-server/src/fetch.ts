/**
 * `foldkit-remote-server/fetch`: `RemoteServer` over the Fetch API, for
 * Cloudflare Workers and any other runtime that speaks `Request`/`Response`.
 *
 * Reads, queries, and mutations ride one `POST` each, as `Remote.http` sends
 * them and `RemoteServer.answer` answers them. Live requirements ride one
 * `POST` that answers with a `text/event-stream` of `LiveChange` frames, one
 * `data:` frame per change and a terminal `event: error` frame when the
 * stream fails; `httpWithLive` (`foldkit-remote/live`) is the other end. The principal is
 * resolved per request, from whatever the runtime hands over (a header, a
 * binding, a session), and the Sources' requirements are provided per
 * request from the environment (a D1 binding, a connection string).
 */
import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Result,
  Schedule,
  Schema,
  Scope,
  Stream,
} from 'effect'
import {
  DEFAULT_MAX_BODY_BYTES,
  CacheStore,
  Diagnostics,
  LiveRequirement,
  QueryRequest,
  QueryResult,
  ReadBatch,
  ReadBatchResult,
  Remote,
  RemoteJsonRequest,
  RemoteLiveError,
  RemoteMutationError,
  maxAgeSeconds,
  stableStringify,
  type CachePolicy,
  type Diagnostic,
  type RemoteClient,
  type NavigationRequest,
  type RemoteJsonAnswer,
  type RemoteRpcClient,
  type RemoteUnauthenticated,
  type ScriptedRequest,
} from 'foldkit-remote'
import { declaresTooLarge, discardBody, readJson, tooLargeAnswer } from './body.js'
import { cachedReadDiffers, serverDefect } from './diagnostics.js'
import {
  cacheKey,
  notingHandlers,
  queryPolicy,
  queryTags,
  readPolicy,
  readTags,
  writeTags,
} from './edgeCache.js'
import { RemoteServer, type LiveHub, type ServerDefinition } from './index.js'
import { unauthenticatedAnswer } from './refusal.js'

/** What `serveFetch` needs of the host runtime, per request. */
export interface FetchConfig<P, R, Env, RP = never> {
  /** The server definition, as `RemoteServer.make` built it. */
  readonly server: ServerDefinition<P, R>
  /**
   * Who this request is, from the request and the environment. Fails with
   * `RemoteServer.unauthenticated(reason?)` to refuse the caller: a 401.
   * What it needs (a session store, an auth service) comes from `layer`.
   * A resolver taking any `Request` fits; one typed for a navigation
   * (`NavigationRequest`) does not, since `/remote` writes.
   */
  readonly resolvePrincipal: (
    request: ScriptedRequest,
    env: Env,
  ) => Effect.Effect<P, RemoteUnauthenticated, RP>
  /**
   * What the Sources and the resolver need, from the environment. Built per
   * request, so kept cheap, and closed when the answer is sent, or, for a
   * live stream, when the stream ends.
   */
  readonly layer: (env: Env) => Layer.Layer<R | RP>
  /** The path answered; anything else is a 404. Default `/remote`. */
  readonly path?: string | undefined
  /**
   * Headers every answer to `principal` carries, a live stream's included;
   * a refusal has no principal and carries none. Whom the request was
   * answered as, say, for a client to repeat (`foldkit-auth`'s
   * `AuthServer.answered`).
   */
  readonly headers?: ((principal: P) => Readonly<Record<string, string>>) | undefined
  /** A hub whose `changed`/`deleted` signals reach the live streams this serves. */
  readonly live?: LiveHub<P, R> | undefined
  /**
   * Asks `resolvePrincipal` again, of the same request, every `every` while a
   * live stream is open. A refusal ends the stream with `Unauthenticated`,
   * which the client reads as a lost session; a principal whose `key`
   * differs from the one the stream opened with (`Policy.keyOf`, as
   * `liveHub`'s `key`) ends it as a live error, which the client opens again
   * after, as the new principal; without `key` only a refusal ends it.
   * Without `revalidate` a stream serves the principal it opened with until
   * it closes, a revoked session included.
   * `every` must be longer than zero: each pass asks the session store.
   */
  readonly revalidate?:
    | {
        readonly every: Duration.Input
        readonly key?: ((principal: P) => unknown) | undefined
      }
    | undefined
  /** A heartbeat comment every this often, keeping idle streams alive through proxies. Default 15 seconds. */
  readonly liveHeartbeat?: Duration.Input | undefined
  /**
   * Where this request's diagnostics go, with the request: each failure
   * answered "Internal error" or ending a live stream (a `ServerDefect`: a
   * broken layer or resolver, a handler's defect), whose cause the caller is
   * never told, and what the handlers report. The reporter in the Effect
   * context (`Diagnostics.Reporter`) when not given, by default the log.
   */
  readonly diagnostics?:
    | ((diagnostic: Diagnostic, request: Request) => Effect.Effect<void>)
    | undefined
  /** A read batch may not name more ids of one entity than this; default 1000. */
  readonly maxIdsPerEntity?: number | undefined
  /** A nested selection may not reach further than this many levels; default 8. */
  readonly maxDepth?: number | undefined
  /**
   * A request body may not be larger than this many bytes; default 1 MiB. A
   * larger one is a 413 with Remote's `tooLarge` answer, refused before it is
   * decoded: by its `content-length` before the principal is resolved, or
   * once the bytes read pass the limit. Give the client the same number
   * (`Remote.clientLayer(…, { maxBodyBytes })`), so it cuts its reads to fit.
   */
  readonly maxBodyBytes?: number | undefined
  /**
   * Keeps public reads in `store` (#428). A read or query is public where
   * none of the sources it passes through has a rule about who asks
   * (`authorize`, `filter`, `visible`, a member per viewer) and each declares
   * how long it stays fresh (`EdgeCache.of` on its Entity, `cache` on its
   * Query). A public read is answered as `visitor`, whoever asks, so one
   * answer is right for everyone, and kept for the shortest `maxAge` it
   * reaches; it says `cache-control: public, max-age=…`. Every other answer
   * says `private, no-store`. A write answered here purges the kept reads
   * holding a row it names, and every list of that row's entity.
   *
   * `store` is a `CacheStore`, which serves nothing past its `maxAge`: an
   * answer carries no age, so one kept longer would read as fresh. A
   * `PageCacheStore` (`CacheStore.kv` with `keep`) is refused.
   *
   * `visitor` is the principal of someone not signed in: refused when the
   * server's `viewer` names a row for it. With `check`, for development and
   * tests, each public read is also answered as who asks, and a difference
   * is reported (`CachedReadDiffers`) and answered with the asker's own.
   */
  readonly cache?:
    | {
        readonly store: CacheStore
        readonly visitor: P
        readonly check?: boolean | undefined
      }
    | undefined
}

/** A read or query a cache may keep: how long, and the tags of its answer. */
interface Shareable {
  readonly policy: CachePolicy
  readonly tagsOf: (result: unknown) => ReadonlyArray<string>
}

const decodeRequest = Schema.decodeUnknownOption(RemoteJsonRequest)
const decodeBatch = Schema.decodeUnknownOption(ReadBatch)
const decodeQuery = Schema.decodeUnknownOption(QueryRequest)
const decodeReadResult = Schema.decodeUnknownOption(ReadBatchResult)
const decodeQueryResult = Schema.decodeUnknownOption(QueryResult)

/** `body`, when it is a read or query every source of which is public. */
const shareableOf = <P, R>(
  server: ServerDefinition<P, R>,
  body: unknown,
): Option.Option<Shareable> =>
  Option.flatMap(decodeRequest(body), ({ operation, payload }) =>
    ({
      read: () =>
        Option.flatMap(decodeBatch(payload), batch =>
          Option.map(readPolicy(server, batch), policy => ({
            policy,
            tagsOf: (result: unknown) =>
              Option.match(decodeReadResult(result), {
                onNone: () => [],
                onSome: read => readTags(batch, read),
              }),
          })),
        ),
      query: () =>
        Option.flatMap(decodeQuery(payload), request =>
          Option.map(queryPolicy(server, request), policy => ({
            policy,
            tagsOf: (result: unknown) =>
              Option.match(decodeQueryResult(result), {
                onNone: () => [],
                onSome: page => queryTags(server, request, page),
              }),
          })),
        ),
      mutate: () => Option.none<Shareable>(),
    })[operation](),
  )

/** An answer as anyone may be given it: its result without whom it was for. */
const unaddressedAnswer = (answer: RemoteJsonAnswer): RemoteJsonAnswer => {
  if (!('result' in answer) || typeof answer.result !== 'object' || answer.result === null)
    return answer
  const { principal: _, ...result } = answer.result as Readonly<Record<string, unknown>>
  return { result }
}

/** Whether `body` is a write: what it names, a cache purges. */
const isWrite = (body: unknown): boolean =>
  Option.exists(decodeRequest(body), request => request.operation === 'mutate')

/** A visitor the server's `viewer` names a row for is someone: their reads are their own. */
const refuseSomeone = <P, R>(
  server: ServerDefinition<P, R>,
  cache: { readonly visitor: P } | undefined,
): void => {
  if (
    cache !== undefined &&
    server.viewer !== undefined &&
    Option.isSome(server.viewer(cache.visitor))
  )
    throw new Error(
      'foldkit-remote-server: cache.visitor must be no one, but the server viewer names a row for it',
    )
}

/** A live open over fetch: the requirements and the cursor it resumes after. */
const LiveFetchRequest = Schema.Struct({
  operation: Schema.Literal('live'),
  payload: Schema.Unknown,
})

/**
 * A terminal stream failure, so the client fails with its message instead of
 * hanging; a refusal of who is asking says so, as a 401's body does.
 */
const errorFrame = (
  message: string,
  refusal: Partial<RemoteJsonAnswer> | { readonly refused: true } = {},
): string => `event: error\ndata: ${JSON.stringify({ message, ...refusal })}\n\n`

/**
 * The live stream as SSE bytes: one `data:` frame per change, then a
 * terminal `event: error` frame when the stream fails rather than ends. A
 * `: ping` comment opens the stream, so headers and a first byte reach the
 * client at once, and rides along every `heartbeat` so a stream with nothing
 * to say still moves: workers cancel responses that go quiet, and proxies
 * drop idle connections. The heartbeat ends with the events, so a stream
 * with nothing to serve still ends. A client that disconnects interrupts
 * the subscription, as closing the RPC stream would.
 */
const liveBytes = <R, RC>(
  handlers: RemoteRpcClient<R>,
  payload: Schema.Schema.Type<typeof LiveRequirement>,
  heartbeat: Duration.Input,
  checked: Stream.Stream<never, RemoteUnauthenticated | RemoteLiveError, RC>,
): Stream.Stream<Uint8Array, never, R | RC> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const ended = yield* Deferred.make<void>()
      // The checks fail the stream, or stop with it.
      const events = Stream.merge(handlers.FoldkitRemoteLive(payload), checked, {
        haltStrategy: 'left',
      }).pipe(
        Stream.map(change => `data: ${JSON.stringify(change)}\n\n`),
        Stream.catchTags({
          RemoteLiveError: error => Stream.succeed(errorFrame(error.message)),
          // The client reads `refused` as asking again being refused again.
          RemoteLiveRefused: error => Stream.succeed(errorFrame(error.message, { refused: true })),
          RemoteProtocolError: error => Stream.succeed(errorFrame(error.message)),
          Unauthenticated: error =>
            Stream.succeed(
              errorFrame(error.message, {
                unauthenticated: unauthenticatedAnswer(error).body.unauthenticated,
              }),
            ),
        }),
        // A defect says nothing of itself to the client, as a 500 does, and is
        // reported; an interruption is the client leaving, with no one to tell.
        Stream.catchCause(cause =>
          Cause.hasInterruptsOnly(cause)
            ? Stream.failCause(cause)
            : Stream.fromEffect(
                Effect.as(Diagnostics.report(serverDefect(cause)), errorFrame('Internal error')),
              ),
        ),
        Stream.ensuring(Deferred.succeed(ended, undefined)),
      )
      const beats = Stream.concat(
        Stream.succeed(': ping\n\n'),
        Stream.fromSchedule(Schedule.spaced(heartbeat)).pipe(Stream.map(() => ': ping\n\n')),
      ).pipe(Stream.interruptWhen(Deferred.await(ended)))
      return Stream.merge(events, beats)
    }),
  ).pipe(Stream.encodeText)

/**
 * Whether the body opens a live stream rather than asking `answer`. Anything
 * else, including a body that is not a request at all, is `answer`'s to
 * refuse with a 400.
 */
const isLiveOpen = (body: unknown): body is Schema.Schema.Type<typeof LiveFetchRequest> => {
  try {
    return Schema.decodeUnknownSync(LiveFetchRequest)(body).operation === 'live'
  } catch {
    return false
  }
}

/** Heartbeats when the caller names none: under proxy idle timeouts. */
const DEFAULT_HEARTBEAT: Duration.Input = '15 seconds'

/**
 * Answers a live open with the stream as `text/event-stream`. A payload no
 * live stream speaks is a 400 that subscribes to nothing. Once the stream
 * runs, its own failures are its terminal `event: error` frame.
 */
const liveResponse = <R, RC>(
  handlers: RemoteRpcClient<R>,
  payload: unknown,
  heartbeat: Duration.Input,
  checked: Stream.Stream<never, RemoteUnauthenticated | RemoteLiveError, RC>,
  release: Effect.Effect<void>,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<Response, never, R | RC> =>
  Schema.decodeUnknownEffect(LiveRequirement)(payload).pipe(
    Effect.matchEffect({
      onFailure: () =>
        Effect.succeed(
          Response.json(
            { error: 'The live payload is not a requirement' },
            { status: 400, headers },
          ),
        ),
      onSuccess: requirement =>
        Effect.map(
          Stream.toReadableStreamEffect(
            liveBytes(handlers, requirement, heartbeat, checked).pipe(Stream.ensuring(release)),
          ),
          body =>
            new Response(body, {
              headers: {
                ...headers,
                'content-type': 'text/event-stream',
              },
            }),
        ),
    }),
  )

/**
 * Answers Remote `POST`s with `Response`s: what a Worker's `fetch` hands to
 * the route. Each request is one Effect, with `layer` built once for it:
 * `resolvePrincipal` first, which refuses with `RemoteServer.unauthenticated`
 * (a 401, its `reason` the only words the caller reads); then the body. A
 * body that is not JSON, or not a request, is a 400 that reaches no handler;
 * a handler's failure a 500 with its message; anything else this side
 * breaks, the resolver's defects and the layer included, a 500 that says
 * nothing of it. A live open is answered with the stream instead. Each
 * answer is one principal's, so every response says `cache-control:
 * no-store`, unless `headers` gives a `cache-control` of its own.
 *
 * ```ts
 * export default {
 *   fetch: serveFetch({
 *     server,
 *     resolvePrincipal: request =>
 *       Effect.succeed({ actorId: request.headers.get('x-actor') ?? 'anon' }),
 *     layer: env => databaseLayer(drizzle(env.DB)),
 *   }),
 * }
 * ```
 */
export const serveFetch = <P, R, Env, RP = never>(
  config: FetchConfig<P, R, Env, RP>,
): ((request: Request, env: Env) => Promise<Response>) => {
  const path = config.path ?? '/remote'
  refuseSomeone(config.server, config.cache)
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const heartbeat = config.liveHeartbeat ?? DEFAULT_HEARTBEAT
  if (
    config.revalidate !== undefined &&
    !Duration.isGreaterThan(Duration.fromInputUnsafe(config.revalidate.every), Duration.zero)
  )
    throw new Error('serveFetch: revalidate.every must be longer than zero')
  // Every request answered here is a `ScriptedRequest`: the brand is only what keeps a navigation's resolver out.
  const resolvePrincipal = config.resolvePrincipal as (
    request: Request,
    env: Env,
  ) => Effect.Effect<P, RemoteUnauthenticated, RP>
  /** `effect` reporting to `config.diagnostics` with `request`, when it is given. */
  const reportingFor =
    (request: Request) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
      const { diagnostics } = config
      return diagnostics === undefined
        ? effect
        : Effect.provideService(effect, Diagnostics.Reporter, diagnostic =>
            diagnostics(diagnostic, request),
          )
    }
  /** The live stream's principal, asked again of its request while it runs. */
  const revalidation = (
    request: Request,
    env: Env,
    opened: P,
  ): Stream.Stream<never, RemoteUnauthenticated | RemoteLiveError, RP> => {
    const { revalidate } = config
    if (revalidate === undefined) return Stream.empty
    return Stream.fromSchedule(Schedule.spaced(revalidate.every)).pipe(
      Stream.mapEffect(() => resolvePrincipal(request, env)),
      Stream.mapEffect(now =>
        revalidate.key === undefined || revalidate.key(opened) === revalidate.key(now)
          ? Effect.void
          : Effect.fail(
              new RemoteLiveError({ message: 'Who is asking changed: open the stream again' }),
            ),
      ),
      Stream.drain,
    )
  }
  /**
   * A public read: the visitor's answer, from the store or answered and kept.
   * Under `check`, also the asker's own, which is given instead where they differ.
   */
  const answerShared = (
    request: Request,
    body: unknown,
    cache: NonNullable<FetchConfig<P, R, Env, RP>['cache']>,
    shareable: Shareable,
    own: RemoteRpcClient<R>,
    headers: Readonly<Record<string, string>>,
  ): Effect.Effect<Response, never, R> =>
    Effect.gen(function* () {
      const asked = stableStringify(body)
      const key = yield* cacheKey(request.url, 'remote', asked)
      const kept = yield* cache.store.match(key)
      let text: string
      if (Option.isSome(kept)) {
        text = kept.value
      } else {
        const visitor = RemoteServer.handlers(config.server, cache.visitor, {
          maxIdsPerEntity: config.maxIdsPerEntity,
          maxDepth: config.maxDepth,
        })
        const answered = yield* RemoteServer.answer(visitor, body)
        // A refusal or a failure is nobody's to keep.
        if (answered.status !== 200) {
          return Response.json(answered.body, { status: answered.status, headers })
        }
        text = JSON.stringify(unaddressedAnswer(answered.body))
        yield* cache.store.put(key, text, {
          maxAge: shareable.policy.maxAge,
          tags: shareable.tagsOf('result' in answered.body ? answered.body.result : {}),
        })
      }
      if (cache.check === true) {
        const mine = yield* RemoteServer.answer(own, body)
        if (stableStringify(unaddressedAnswer(mine.body)) !== stableStringify(JSON.parse(text))) {
          yield* Diagnostics.report(cachedReadDiffers(asked))
          return Response.json(mine.body, { status: mine.status, headers })
        }
      }
      return new Response(text, {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${maxAgeSeconds(shareable.policy)}`,
          ...headers,
        },
      })
    })
  /** `live` is whether the response streams, and so owns `scope` until it ends. */
  const respond = (
    request: Request,
    env: Env,
    scope: Scope.Closeable,
  ): Effect.Effect<{ readonly response: Response; readonly live: boolean }, never, R | RP> =>
    Effect.gen(function* () {
      const principal = yield* resolvePrincipal(request, env)
      const headers = config.headers?.(principal) ?? {}
      const body = yield* Effect.result(readJson(request, maxBodyBytes))
      if (Result.isFailure(body)) {
        const { status, answer } = body.failure
        return { response: Response.json(answer, { status, headers }), live: false }
      }
      // Bound per request: the principal is the request's own, as everywhere else.
      const handlers = RemoteServer.handlers(config.server, principal, {
        live: config.live,
        maxIdsPerEntity: config.maxIdsPerEntity,
        maxDepth: config.maxDepth,
      })
      if (isLiveOpen(body.success)) {
        const response = yield* liveResponse(
          handlers,
          body.success.payload,
          heartbeat,
          revalidation(request, env, principal),
          Scope.close(scope, Exit.void),
          headers,
        )
        // A 400 for a payload no stream speaks has no stream to close it.
        return { response, live: response.status === 200 }
      }
      const { cache } = config
      const shareable =
        cache === undefined ? Option.none<Shareable>() : shareableOf(config.server, body.success)
      if (cache !== undefined && Option.isSome(shareable)) {
        const response = yield* answerShared(
          request,
          body.success,
          cache,
          shareable.value,
          handlers,
          headers,
        )
        return { response, live: false }
      }
      const answered = yield* RemoteServer.answer(handlers, body.success)
      if (cache !== undefined && answered.status === 200 && isWrite(body.success)) {
        yield* cache.store.purge(writeTags('result' in answered.body ? answered.body.result : {}))
      }
      return {
        response: Response.json(answered.body, { status: answered.status, headers }),
        live: false,
      }
    }).pipe(
      Effect.catchTag('Unauthenticated', refusal => {
        const { status, body } = unauthenticatedAnswer(refusal)
        return Effect.succeed({ response: Response.json(body, { status }), live: false })
      }),
    )
  const served = async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== 'POST' || new URL(request.url).pathname !== path) {
      return Response.json({ error: 'not found' }, { status: 404 })
    }
    // Refused on what it says of itself: no layer built, no principal asked, nothing read.
    if (declaresTooLarge(request, maxBodyBytes)) {
      return Response.json(tooLargeAnswer(maxBodyBytes), { status: 413 })
    }
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        // Not Effect.provide(layer), which closes it when `respond` returns,
        // before a live stream has served a frame: the stream's re-reads and
        // revalidation would run on released resources.
        const scope = yield* Scope.make()
        const answered = yield* Layer.buildWithScope(config.layer(env), scope).pipe(
          Effect.flatMap(context => Effect.provide(respond(request, env, scope), context)),
          Effect.onExit(exit =>
            Exit.isSuccess(exit) && exit.value.live ? Effect.void : Scope.close(scope, exit),
          ),
        )
        return answered.response
      }).pipe(reportingFor(request)),
    )
    if (Exit.isSuccess(exit)) return exit.value
    // A failure of the layer, or a defect anywhere: this side broke, and the
    // caller learns that it did, not what; the diagnostics learn what. `answer`
    // already maps its own failures and defects to 400/500 answers.
    await Effect.runPromise(
      Diagnostics.report(serverDefect(exit.cause)).pipe(reportingFor(request)),
    )
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
  // Every answer but a public read's is read as one principal: no cache may
  // keep it for another. A `cache-control` of the application's own (`headers`) stands.
  return async (request, env) => {
    const response = await served(request, env)
    await discardBody(request, maxBodyBytes)
    if (!response.headers.has('cache-control')) {
      response.headers.set('cache-control', 'private, no-store')
    }
    return response
  }
}

/**
 * The cache's checker, for a test: serves each request twice through
 * `serveFetch` with `cache.check` and a store in memory, so every public read
 * is answered both as the visitor (kept, then from the store) and as whoever
 * the request resolves to. Rejects naming each read whose answers differ, and
 * when no read was public, which would check nothing. Give requests from at
 * least two principals, a visitor's and someone's; each is a function, since
 * a body is read once.
 */
export const checkCache = async <P, R, Env, RP = never>(
  config: Omit<FetchConfig<P, R, Env, RP>, 'cache' | 'diagnostics'> & {
    readonly cache: { readonly visitor: P }
  },
  requests: ReadonlyArray<() => Request>,
  env: Env,
): Promise<void> => {
  const store = CacheStore.memory()
  const differs: Array<string> = []
  const serve = serveFetch({
    ...config,
    cache: { ...config.cache, store, check: true },
    diagnostics: diagnostic =>
      Effect.sync(() => {
        // tag-check: open -- a Diagnostic's tag is any package's; this one is ours.
        if (diagnostic._tag === 'CachedReadDiffers') differs.push(diagnostic.message)
      }),
  })
  for (const _round of [1, 2]) {
    for (const make of requests) await serve(make(), env)
  }
  if (differs.length > 0) throw new Error(differs.join('\n'))
  if (store.size() === 0) {
    throw new Error('checkCache: no request was a public read, so nothing was checked')
  }
}

/**
 * What `pageReader` reads of a `serveFetch` config: the server, its Sources'
 * layer, its limits, and the cache's `visitor`.
 */
export type PageReaderConfig<P, R, Env, RP = never> = Pick<
  FetchConfig<P, R, Env, RP>,
  'server' | 'layer' | 'maxIdsPerEntity' | 'maxDepth' | 'cache'
> & {
  /**
   * Who a page request is. A resolver taking any `Request` fits; one typed
   * for a script's request (`ScriptedRequest`) does not, since a navigation
   * carries no header a script adds and that resolver would refuse every
   * signed-in reader.
   */
  readonly resolvePrincipal: (
    request: NavigationRequest,
    env: Env,
  ) => Effect.Effect<P, RemoteUnauthenticated, RP>
}

/**
 * The reader a page render reads through, in the same process: the request's
 * `RemoteClient`, answered by the server's own handlers with no HTTP between
 * them. Give it `serveFetch`'s config with the resolver a page's request
 * needs: a page `GET` is a navigation, which carries no header a script adds
 * (`AuthServer.resolver({ …, requests: 'navigation' })`).
 *
 * The principal is resolved, and `layer` built, when the reader is provided,
 * and `layer` closes when the Effect it was provided to ends, so provide it to
 * the pre-read itself (`Data.satisfy(…).pipe(Effect.provide(reader))`). A
 * refusal fails that Effect with `Unauthenticated`, as a 401 would. It only
 * reads: a mutation fails with `RemoteMutationError` and a live open with
 * `RemoteLiveError`, since a navigation can be started from another site.
 *
 * Each read is noted for a render `foldkit-ssr` may cache (`PageReads`):
 * with `cache`, one proved public as `serveFetch` proves it is answered as
 * `cache.visitor` and noted public; every other read, and every read without
 * `cache`, is noted private, which keeps the page from being cached.
 */
export const pageReader = <P, R, Env, RP = never>(config: PageReaderConfig<P, R, Env, RP>) => {
  refuseSomeone(config.server, config.cache)
  const limits = { maxIdsPerEntity: config.maxIdsPerEntity, maxDepth: config.maxDepth }
  const visitor = Option.map(Option.fromUndefinedOr(config.cache), cache =>
    RemoteServer.handlers(config.server, cache.visitor, limits),
  )
  // Every request read for is a page's: the brand is only what keeps a script's resolver out.
  const resolvePrincipal = config.resolvePrincipal as (
    request: Request,
    env: Env,
  ) => Effect.Effect<P, RemoteUnauthenticated, RP>
  return (request: Request, env: Env): Layer.Layer<RemoteClient, RemoteUnauthenticated> =>
    Layer.unwrap(
      Effect.map(resolvePrincipal(request, env), principal => {
        const handlers = notingHandlers(
          config.server,
          RemoteServer.handlers(config.server, principal, limits),
          visitor,
        )
        return Remote.clientLayer<R>({
          ...handlers,
          FoldkitRemoteMutate: () =>
            Effect.fail(
              new RemoteMutationError({ message: 'A page render reads; it does not write' }),
            ),
          FoldkitRemoteLive: () =>
            Stream.fail(new RemoteLiveError({ message: 'A page render keeps no live stream' })),
        })
      }),
    ).pipe(Layer.provide(config.layer(env)))
}
