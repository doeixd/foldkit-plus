/**
 * `foldkit-remote-server/fetch`: `RemoteServer` over the Fetch API, for
 * Cloudflare Workers and any other runtime that speaks `Request`/`Response`.
 *
 * Reads, queries, and mutations ride one `POST` each, as `Remote.http` sends
 * them and `RemoteServer.answer` answers them. Live requirements ride one
 * `POST` that answers with a `text/event-stream` of `LiveChange` frames, one
 * `data:` frame per change and a terminal `event: error` frame when the
 * stream fails; `Remote.httpWithLive` is the other end. The principal is
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
  Schedule,
  Schema,
  Scope,
  Stream,
} from 'effect'
import {
  LiveRequirement,
  RemoteLiveError,
  type RemoteJsonAnswer,
  type RemoteRpcClient,
  type RemoteUnauthenticated,
} from 'foldkit-remote'
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
   */
  readonly resolvePrincipal: (
    request: Request,
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
  /** A read batch may not name more ids of one entity than this; default 1000. */
  readonly maxIdsPerEntity?: number | undefined
  /** A nested selection may not reach further than this many levels; default 8. */
  readonly maxDepth?: number | undefined
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
const errorFrame = (message: string, refusal: Partial<RemoteJsonAnswer> = {}): string =>
  `event: error\ndata: ${JSON.stringify({ message, ...refusal })}\n\n`

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
          RemoteProtocolError: error => Stream.succeed(errorFrame(error.message)),
          Unauthenticated: error =>
            Stream.succeed(
              errorFrame(error.message, {
                unauthenticated: unauthenticatedAnswer(error).body.unauthenticated,
              }),
            ),
        }),
        // A defect says nothing of itself, as a 500 does; an interruption is
        // the client leaving, with no one to tell.
        Stream.catchCause(cause =>
          Cause.hasInterruptsOnly(cause)
            ? Stream.failCause(cause)
            : Stream.succeed(errorFrame('Internal error')),
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
                'cache-control': 'no-cache',
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
 * nothing of it. A live open is answered with the stream instead.
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
  const heartbeat = config.liveHeartbeat ?? DEFAULT_HEARTBEAT
  if (
    config.revalidate !== undefined &&
    !Duration.isGreaterThan(Duration.fromInputUnsafe(config.revalidate.every), Duration.zero)
  )
    throw new Error('serveFetch: revalidate.every must be longer than zero')
  /** The live stream's principal, asked again of its request while it runs. */
  const revalidation = (
    request: Request,
    env: Env,
    opened: P,
  ): Stream.Stream<never, RemoteUnauthenticated | RemoteLiveError, RP> => {
    const { revalidate } = config
    if (revalidate === undefined) return Stream.empty
    return Stream.fromSchedule(Schedule.spaced(revalidate.every)).pipe(
      Stream.mapEffect(() => config.resolvePrincipal(request, env)),
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
  /** `live` is whether the response streams, and so owns `scope` until it ends. */
  const respond = (
    request: Request,
    env: Env,
    scope: Scope.Closeable,
  ): Effect.Effect<{ readonly response: Response; readonly live: boolean }, never, R | RP> =>
    Effect.gen(function* () {
      const principal = yield* config.resolvePrincipal(request, env)
      const headers = config.headers?.(principal) ?? {}
      const body = yield* Effect.option(Effect.tryPromise(() => request.json()))
      if (Option.isNone(body)) {
        return {
          response: Response.json({ error: 'The body is not JSON' }, { status: 400, headers }),
          live: false,
        }
      }
      // Bound per request: the principal is the request's own, as everywhere else.
      const handlers = RemoteServer.handlers(config.server, principal, {
        live: config.live,
        maxIdsPerEntity: config.maxIdsPerEntity,
        maxDepth: config.maxDepth,
      })
      if (isLiveOpen(body.value)) {
        const response = yield* liveResponse(
          handlers,
          body.value.payload,
          heartbeat,
          revalidation(request, env, principal),
          Scope.close(scope, Exit.void),
          headers,
        )
        // A 400 for a payload no stream speaks has no stream to close it.
        return { response, live: response.status === 200 }
      }
      const answered = yield* RemoteServer.answer(handlers, body.value)
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
  return async (request, env) => {
    if (request.method !== 'POST' || new URL(request.url).pathname !== path) {
      return Response.json({ error: 'not found' }, { status: 404 })
    }
    try {
      return await Effect.runPromise(
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
        }),
      )
    } catch {
      // A failure of the layer, or a defect anywhere: this side broke, and the
      // caller learns that it did, not what. `answer` already maps its own
      // failures and defects to 400/500 answers.
      return Response.json({ error: 'Internal error' }, { status: 500 })
    }
  }
}
