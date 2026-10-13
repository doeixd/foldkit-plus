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
  Deferred,
  Effect,
  Option,
  Schedule,
  Schema,
  Stream,
  type Duration,
  type Layer,
} from 'effect'
import {
  LiveRequirement,
  type RemoteJsonAnswer,
  type RemoteRpcClient,
  type RemoteUnauthenticated,
} from 'foldkit-remote'
import { RemoteServer, type LiveHub, type ServerDefinition } from './index.js'

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
  /** What the Sources and the resolver need, from the environment. Kept cheap: built per request. */
  readonly layer: (env: Env) => Layer.Layer<R | RP>
  /** The path answered; anything else is a 404. Default `/remote`. */
  readonly path?: string | undefined
  /** A hub whose `changed`/`deleted` signals reach the live streams this serves. */
  readonly live?: LiveHub<P, R> | undefined
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

/** A terminal stream failure, so the client fails with its message instead of hanging. */
const errorFrame = (message: string): string =>
  `event: error\ndata: ${JSON.stringify({ message })}\n\n`

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
const liveBytes = <R>(
  handlers: RemoteRpcClient<R>,
  payload: Schema.Schema.Type<typeof LiveRequirement>,
  heartbeat: Duration.Input,
): Stream.Stream<Uint8Array, never, R> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const ended = yield* Deferred.make<void>()
      const events = handlers.FoldkitRemoteLive(payload).pipe(
        Stream.map(change => `data: ${JSON.stringify(change)}\n\n`),
        Stream.catchTags({
          RemoteLiveError: error => Stream.succeed(errorFrame(error.message)),
          RemoteProtocolError: error => Stream.succeed(errorFrame(error.message)),
        }),
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
const liveResponse = <R>(
  handlers: RemoteRpcClient<R>,
  payload: unknown,
  heartbeat: Duration.Input,
): Effect.Effect<Response, never, R> =>
  Schema.decodeUnknownEffect(LiveRequirement)(payload).pipe(
    Effect.matchEffect({
      onFailure: () =>
        Effect.succeed(
          Response.json({ error: 'The live payload is not a requirement' }, { status: 400 }),
        ),
      onSuccess: requirement =>
        Effect.map(
          Stream.toReadableStreamEffect(liveBytes(handlers, requirement, heartbeat)),
          body =>
            new Response(body, {
              headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            }),
        ),
    }),
  )

/** A refusal of who is asking, as `answer` words a 403: a 401 the client reads. */
const unauthenticated = (refusal: RemoteUnauthenticated): Response =>
  Response.json(
    {
      error: refusal.message,
      unauthenticated: refusal.reason === undefined ? {} : { reason: refusal.reason },
    } satisfies RemoteJsonAnswer,
    { status: 401 },
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
  const respond = (request: Request, env: Env): Effect.Effect<Response, never, R | RP> =>
    Effect.gen(function* () {
      const principal = yield* config.resolvePrincipal(request, env)
      const body = yield* Effect.option(Effect.tryPromise(() => request.json()))
      if (Option.isNone(body)) {
        return Response.json({ error: 'The body is not JSON' }, { status: 400 })
      }
      // Bound per request: the principal is the request's own, as everywhere else.
      const handlers = RemoteServer.handlers(config.server, principal, {
        live: config.live,
        maxIdsPerEntity: config.maxIdsPerEntity,
        maxDepth: config.maxDepth,
      })
      if (isLiveOpen(body.value))
        return yield* liveResponse(handlers, body.value.payload, heartbeat)
      const answered = yield* RemoteServer.answer(handlers, body.value)
      return Response.json(answered.body, { status: answered.status })
    }).pipe(Effect.catchTag('Unauthenticated', refusal => Effect.succeed(unauthenticated(refusal))))
  return async (request, env) => {
    if (request.method !== 'POST' || new URL(request.url).pathname !== path) {
      return Response.json({ error: 'not found' }, { status: 404 })
    }
    try {
      return await Effect.runPromise(respond(request, env).pipe(Effect.provide(config.layer(env))))
    } catch {
      // A failure of the layer, or a defect anywhere: this side broke, and the
      // caller learns that it did, not what. `answer` already maps its own
      // failures and defects to 400/500 answers.
      return Response.json({ error: 'Internal error' }, { status: 500 })
    }
  }
}
