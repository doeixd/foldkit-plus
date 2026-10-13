/**
 * `foldkit-sync/do`: serve one document's Sync exchange from a Cloudflare
 * Durable Object, the single writer its journal wants. Each socket the
 * object accepts exchanges against the same journal through `serveJournal`;
 * the replica side already exists as `Sync.transport.socket` over the
 * object's `wss://…` URL, which hears other writers' commits as notices.
 *
 * The class takes its `DurableObject` base as a parameter, so this module
 * imports no worker runtime and loads anywhere:
 *
 * ```ts
 * import { DurableObject } from 'cloudflare:workers'
 *
 * export class SyncHost extends defineDocumentHost(DurableObject, {
 *   sync: Todos,
 *   openJournal: (_ctx, env) => openTodosJournal(env.DB),
 *   resolvePrincipal: request =>
 *     Effect.succeed({ actorId: request.headers.get('x-actor') ?? 'anon' }),
 * }) {}
 * ```
 *
 * Open the journal once per object: on the first upgrade, so probes never
 * provision storage. Route one object per document (`idFromName(sync
 * .documentId)`); its in-memory cache and change stream are then exact
 * because nothing else writes.
 */
import { Cause, Context, Duration, Effect, Exit, Fiber, Layer, Option, Result, Scope } from 'effect'
import type { RemoteUnauthenticated } from 'foldkit-remote'
import type { Journal } from 'foldkit-durable/core'
import { serveJournal } from './journal.js'
import type { AuthorizeDecision } from './make.js'
import type { Operation, Sync } from './sync.js'
import { workerSocket } from './transport.js'

/** The sliver of a Durable Object the host uses: state for the journal to open with. */
export interface DocumentHostContext {
  readonly storage?: unknown
}

/** What `defineDocumentHost` needs of the application, per document. */
export interface DocumentHostConfig<Message, Shared, Principal, Env, RP = never> {
  /** The document's contract: its codecs and journal shape. */
  readonly sync: Sync<Message, Shared>
  /**
   * Opens the document's journal, once: on the first upgrade, not on
   * construction, so probes never provision storage. Over D1 (`d1: true`),
   * or the object's SQLite storage through `ctx`. May build with Effect and
   * unwrap; a rejection answers the upgrade with a 500, and the next upgrade
   * tries again.
   */
  readonly openJournal: (
    ctx: DocumentHostContext,
    env: Env,
  ) => Promise<Journal<Operation, Shared, Principal, Operation>>
  /**
   * Who is opening this socket, from the upgrade request. Fails with a
   * `RemoteUnauthenticated` (`foldkit-remote`; `RemoteServer.unauthenticated()`
   * makes one) to refuse it: a 401 carrying its message. A defect is a 500
   * that says nothing of it. What it needs (a session store) comes from
   * `layer`.
   */
  readonly resolvePrincipal: (
    request: Request,
    env: Env,
  ) => Effect.Effect<Principal, RemoteUnauthenticated, RP>
  /**
   * Runs after each exchange's appends and before the reply is read: apply
   * what committed to another store, through `journal.recover`. Takes the
   * environment — a D1 binding, say — and the journal, because both live
   * outside the exchange. See `serveJournal`.
   */
  readonly settle?:
    | ((
        env: Env,
        journal: Journal<Operation, Shared, Principal, Operation>,
      ) => Effect.Effect<void, unknown>)
    | undefined
  /**
   * Asks `resolvePrincipal` again, of the upgrade request, every `every`
   * while the socket is open: a refusal closes it with 4401, and a principal
   * whose `key` differs from the one it opened with (`Policy.keyOf`) closes
   * it with 1012, which the replica reconnects after, as the new principal;
   * without `key` only a refusal closes it. Without it a socket
   * serves the principal it opened with until it closes, a revoked session
   * included.
   */
  readonly revalidate?:
    | {
        readonly every: Duration.Input
        readonly key?: ((principal: Principal) => unknown) | undefined
      }
    | undefined
  /** Whether `principal` may open the document. See `journalExchange`'s `opens`. */
  readonly opens?: ((principal: Principal) => Effect.Effect<boolean>) | undefined
  /**
   * Whether an operation from `principal` may be appended, before the journal
   * sees it. See `journalExchange`'s `admit`.
   */
  readonly admit?:
    | ((
        principal: Principal,
        operation: Operation,
      ) => AuthorizeDecision | Effect.Effect<AuthorizeDecision, unknown>)
    | undefined
  /**
   * Makes the socket pair for an upgrade: the server end is accepted before
   * serving. Defaults to the `WebSocketPair` global where one exists (a
   * worker, miniflare); pass one in tests.
   */
  readonly pair?: (() => readonly [client: WebSocket, server: AcceptingWebSocket]) | undefined
}

/**
 * What the resolver needs, from the environment: required exactly when it
 * needs something. Built per upgrade and kept until the socket closes, since
 * `revalidate` asks the resolver again while it is open; an upgrade that is
 * refused closes it at once.
 */
export type DocumentHostLayer<Env, RP> = [RP] extends [never]
  ? { readonly layer?: undefined }
  : { readonly layer: (env: Env) => Layer.Layer<RP> }

/**
 * A server `WebSocket`: accepted once it serves. The `accept` member is a
 * worker-runtime extension the DOM type does not declare.
 */
export interface AcceptingWebSocket extends WebSocket {
  accept(): void
}

/** What a revalidation that found another principal fails with. */
const changed = Symbol('changed')

/**
 * Closes a socket with `code`, and `reason` when the platform takes it: a
 * reason past 123 bytes, or a socket already gone, still closes or is closed.
 */
const closeWith = (socket: WebSocket, code: number, reason: string): void => {
  try {
    socket.close(code, reason)
  } catch {
    try {
      socket.close(code)
    } catch {
      // Already closed.
    }
  }
}

const defaultPair = (): readonly [client: WebSocket, server: AcceptingWebSocket] => {
  const maker = (
    globalThis as {
      readonly WebSocketPair?:
        (new () => { readonly 0: WebSocket; readonly 1: AcceptingWebSocket }) | undefined
    }
  ).WebSocketPair
  if (maker === undefined)
    throw new Error('DocumentHost: no WebSocketPair global; pass `pair` explicitly')
  const pair = new maker()
  return [pair[0], pair[1]] as const
}

/**
 * Defines the Durable Object class serving one document's Sync exchange.
 * Non-upgrades are 404s that open nothing; a refused principal is a 401; a
 * resolver that breaks, or a journal that never opened, a 500 that says
 * nothing of it.
 */
export const defineDocumentHost = <Message, Shared, Principal, Env, RP = never>(
  Base: new (ctx: DocumentHostContext, env: Env) => object,
  config: DocumentHostConfig<Message, Shared, Principal, Env, RP> & DocumentHostLayer<Env, RP>,
): new (ctx: DocumentHostContext, env: Env) => { fetch(request: Request): Promise<Response> } => {
  if (
    config.revalidate !== undefined &&
    !Duration.isGreaterThan(Duration.fromInputUnsafe(config.revalidate.every), Duration.zero)
  )
    throw new Error('defineDocumentHost: revalidate.every must be longer than zero')
  return class extends Base {
    private readonly hostContext: DocumentHostContext
    private readonly hostEnv: Env
    private ready: Promise<Journal<Operation, Shared, Principal, Operation>> | undefined

    constructor(ctx: DocumentHostContext, env: Env) {
      super(ctx, env)
      this.hostContext = ctx
      this.hostEnv = env
    }

    async fetch(request: Request): Promise<Response> {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return Response.json({ error: 'not found' }, { status: 404 })
      // The upgrade's services live as long as its socket: revalidation asks
      // the resolver again while it is open.
      const scope = Effect.runSync(Scope.make())
      const release = (): void => void Effect.runFork(Scope.close(scope, Exit.void))
      const { layer } = config
      const services = await Effect.runPromise(
        layer === undefined
          ? // No layer is a resolver that needs nothing (`DocumentHostLayer`).
            Effect.succeed(Context.empty() as Context.Context<RP>)
          : Effect.suspend(() => Layer.buildWithScope(layer(this.hostEnv), scope)),
      ).catch(() => undefined)
      if (services === undefined) {
        release()
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
      // Suspended, so the resolver is called each time this runs (a resolver
      // may decide when called, not when its Effect runs), and one that throws
      // is a 500 like one that dies.
      const resolve = Effect.suspend(() => config.resolvePrincipal(request, this.hostEnv)).pipe(
        Effect.provide(services),
      )
      const resolved = await Effect.runPromise(Effect.result(resolve)).catch(() => undefined)
      if (resolved === undefined) {
        release()
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
      if (Result.isFailure(resolved)) {
        release()
        return Response.json({ error: resolved.failure.message }, { status: 401 })
      }
      const principal = resolved.success
      let journal: Journal<Operation, Shared, Principal, Operation>
      try {
        journal = await (this.ready ??= config.openJournal(this.hostContext, this.hostEnv))
      } catch {
        // A failed open provisions nothing: the next upgrade tries again.
        this.ready = undefined
        release()
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
      // Anything from here may throw (no WebSocketPair, an application's
      // `opens` or `settle`): a 500, and the upgrade's services released.
      try {
        const [client, server] = (config.pair ?? defaultPair)()
        server.accept()
        const { admit } = config
        const socket = workerSocket(server)
        const stop = serveJournal(socket, {
          sync: config.sync,
          journal,
          principal,
          ...(config.settle === undefined ? {} : { settle: config.settle(this.hostEnv, journal) }),
          ...(config.opens === undefined ? {} : { opens: config.opens(principal) }),
          ...(admit === undefined
            ? {}
            : { admit: (operation: Operation) => admit(principal, operation) }),
        })
        if (config.revalidate !== undefined) {
          const { every, key } = config.revalidate
          const checking = Effect.sleep(every).pipe(
            Effect.andThen(resolve),
            Effect.flatMap(now =>
              key === undefined || key(principal) === key(now) ? Effect.void : Effect.fail(changed),
            ),
            Effect.forever,
            Effect.catchCause(cause =>
              Effect.sync(() => {
                // Before closing: a worker's socket fires its own close only on
                // the replica's reply, and frames in flight until then would
                // still be appended as the principal just refused.
                stop()
                const failure = Cause.findErrorOption(cause)
                Option.match(failure, {
                  // A defect: this side broke, and the replica learns that it did.
                  onNone: () => closeWith(server, 1011, 'Internal error'),
                  onSome: error =>
                    error === changed
                      ? closeWith(server, 1012, 'Who is asking changed')
                      : closeWith(server, 4401, error.message),
                })
                release()
              }),
            ),
          )
          const fiber = Effect.runFork(checking)
          socket.onClose(() => void Effect.runFork(Fiber.interrupt(fiber)))
        }
        socket.onClose(release)
        return new Response(null, {
          status: 101,
          // The worker runtime reads the client out of the upgrade response;
          // the DOM's `ResponseInit` has no such member.
          webSocket: client,
        } as ResponseInit)
      } catch {
        release()
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
    }
  }
}
