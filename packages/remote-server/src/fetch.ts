/**
 * `foldkit-remote-server/fetch`: `RemoteServer` over the Fetch API, for
 * Cloudflare Workers and any other runtime that speaks `Request`/`Response`.
 *
 * Reads, queries, and mutations ride one `POST` each, as `Remote.http` sends
 * them and `RemoteServer.answer` answers them. The principal is resolved per
 * request, from whatever the runtime hands over (a header, a binding, a
 * session), and the Sources' requirements are provided per request from the
 * environment (a D1 binding, a connection string). There is no live stream
 * over it; `Remote.json`'s client reads nothing live either.
 */
import { Effect, type Layer } from 'effect'
import { RemoteServer, type ServerDefinition } from './index.js'

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
  /** A read batch may not name more ids of one entity than this; default 1000. */
  readonly maxIdsPerEntity?: number | undefined
  /** A nested selection may not reach further than this many levels; default 8. */
  readonly maxDepth?: number | undefined
}

/**
 * Answers Remote `POST`s with `Response`s: what a Worker's `fetch` hands to
 * the route. A body that is not JSON, or not a request, is a 400 that reaches
 * no handler; a handler's failure a 500 with its message; anything this side
 * breaks, including principal resolution and layer provision, a 500 that says
 * nothing of it.
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
      maxIdsPerEntity: config.maxIdsPerEntity,
      maxDepth: config.maxDepth,
    })
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
