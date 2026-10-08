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
import { Effect, Schema, Stream, type Layer } from 'effect'
import { LiveRequirement, type RemoteRpcClient } from 'foldkit-remote'
import { RemoteServer, type LiveHub, type ServerDefinition } from './index.js'

/** What `serveFetch` needs of the host runtime, per request. */
export interface FetchConfig<P, R, Env> {
  /** The server definition, as `RemoteServer.make` built it. */
  readonly server: ServerDefinition<P, R>
  /** Who this request is, from the request and the environment. May throw. */
  readonly resolvePrincipal: (request: Request, env: Env) => P | Promise<P>
  /** What the Sources need, from the environment. Kept cheap: built per request. */
  readonly layer: (env: Env) => Layer.Layer<R>
  /** The path answered; anything else is a 404. Default `/remote`. */
  readonly path?: string | undefined
  /** A hub whose `changed`/`deleted` signals reach the live streams this serves. */
  readonly live?: LiveHub<P, R> | undefined
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
 * client that disconnects interrupts the subscription, as closing the RPC
 * stream would.
 */
const liveBytes = <R>(
  handlers: RemoteRpcClient<R>,
  payload: Schema.Schema.Type<typeof LiveRequirement>,
): Stream.Stream<Uint8Array, never, R> =>
  handlers.FoldkitRemoteLive(payload).pipe(
    Stream.map(change => `data: ${JSON.stringify(change)}\n\n`),
    Stream.catchTags({
      RemoteLiveError: error => Stream.succeed(errorFrame(error.message)),
      RemoteProtocolError: error => Stream.succeed(errorFrame(error.message)),
    }),
    Stream.encodeText,
  )

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

/**
 * Answers a live open with the stream as `text/event-stream`. A payload no
 * live stream speaks is a 400 that subscribes to nothing; anything this side
 * breaks building the stream is a 500 that says nothing of it. Once the
 * stream runs, its own failures are its terminal `event: error` frame.
 */
const liveResponse = <R>(
  handlers: RemoteRpcClient<R>,
  payload: unknown,
  layer: Layer.Layer<R>,
): Promise<Response> => {
  let requirement: Schema.Schema.Type<typeof LiveRequirement>
  try {
    requirement = Schema.decodeUnknownSync(LiveRequirement)(payload)
  } catch {
    return Promise.resolve(
      Response.json({ error: 'The live payload is not a requirement' }, { status: 400 }),
    )
  }
  return Effect.runPromise(
    Stream.toReadableStreamEffect(liveBytes(handlers, requirement)).pipe(
      Effect.provide(layer),
      Effect.map(
        body =>
          new Response(body, {
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          }),
      ),
    ),
  ).catch(() => Response.json({ error: 'Internal error' }, { status: 500 }))
}
/**
 * Answers Remote `POST`s with `Response`s: what a Worker's `fetch` hands to
 * the route. A body that is not JSON, or not a request, is a 400 that reaches
 * no handler; a handler's failure a 500 with its message; anything this side
 * breaks, including principal resolution and layer provision, a 500 that says
 * nothing of it. A live open is answered with the stream instead.
 *
 * ```ts
 * export default {
 *   fetch: serveFetch({
 *     server,
 *     resolvePrincipal: request => ({ actorId: request.headers.get('x-actor') ?? 'anon' }),
 *     layer: env => databaseLayer(drizzle(env.DB)),
 *   }),
 * }
 * ```
 */
export const serveFetch = <P, R, Env>(
  config: FetchConfig<P, R, Env>,
): ((request: Request, env: Env) => Promise<Response>) => {
  const path = config.path ?? '/remote'
  return async (request, env) => {
    if (request.method !== 'POST' || new URL(request.url).pathname !== path) {
      return Response.json({ error: 'not found' }, { status: 404 })
    }
    let principal: P
    try {
      principal = await config.resolvePrincipal(request, env)
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 401 },
      )
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'The body is not JSON' }, { status: 400 })
    }
    // Bound per request: the principal is the request's own, as everywhere else.
    const handlers = RemoteServer.handlers(config.server, principal, {
      live: config.live,
      maxIdsPerEntity: config.maxIdsPerEntity,
      maxDepth: config.maxDepth,
    })
    if (isLiveOpen(body)) {
      return liveResponse(handlers, body.payload, config.layer(env))
    }
    try {
      const answered = await Effect.runPromise(
        RemoteServer.answer(handlers, body).pipe(Effect.provide(config.layer(env))),
      )
      return Response.json(answered.body, { status: answered.status })
    } catch {
      // A failure of the layer, or a defect anywhere: this side broke, and the
      // caller learns that it did, not what. `answer` already maps its own
      // failures and defects to 400/500 answers above this.
      return Response.json({ error: 'Internal error' }, { status: 500 })
    }
  }
}
