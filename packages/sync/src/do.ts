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
import { type Duration, type Effect, type Layer, Result } from 'effect'
import type { RemoteUnauthenticated } from 'foldkit-remote'
import type { Journal } from 'foldkit-durable/core'
import {
  documentHost,
  type Accepted,
  type DocumentHostOptions,
  type DocumentHostOptionsLayer,
} from './journal.js'
import { checkRevalidate } from './revalidate.js'
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
        | (new () => { readonly 0: WebSocket; readonly 1: AcceptingWebSocket })
        | undefined
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
  checkRevalidate(config.revalidate, 'defineDocumentHost')
  return class extends Base {
    private readonly host: (request: Request) => Promise<Result.Result<Accepted, Response>>

    constructor(ctx: DocumentHostContext, env: Env) {
      super(ctx, env)
      let ready: Promise<Journal<Operation, Shared, Principal, Operation>> | undefined
      const { layer, settle } = config
      this.host = documentHost<Message, Shared, Principal, RP>({
        sync: config.sync,
        // Opened on the first upgrade a principal passes, so probes never
        // provision storage; a failed open is tried again on the next.
        journal: () =>
          (ready ??= config.openJournal(ctx, env)).catch((error: unknown) => {
            ready = undefined
            throw error
          }),
        resolvePrincipal: request => config.resolvePrincipal(request, env),
        layer: layer === undefined ? undefined : () => layer(env),
        revalidate: config.revalidate,
        settle: settle === undefined ? undefined : journal => settle(env, journal),
        opens: config.opens,
        admit: config.admit,
        // `DocumentHostLayer` already tied `layer` to `RP` on the config; the
        // conditional cannot be resolved for an `RP` still generic here.
      } as DocumentHostOptions<Message, Shared, Principal, RP> & DocumentHostOptionsLayer<RP>)
    }

    async fetch(request: Request): Promise<Response> {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return Response.json({ error: 'not found' }, { status: 404 })
      // Made first: a runtime without WebSocketPair is a 500 that resolves no one.
      let pair: readonly [client: WebSocket, server: AcceptingWebSocket]
      try {
        pair = (config.pair ?? defaultPair)()
      } catch (error) {
        // The replica learns nothing of it; whoever runs the host must.
        console.error('[foldkit-sync] serving an upgrade broke:', error)
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
      const [client, server] = pair
      const answered = await this.host(request)
      if (Result.isFailure(answered)) return answered.failure
      const { serve, abandon } = answered.success
      try {
        server.accept()
        serve({
          ...workerSocket(server),
          closeWith: (code, reason) => closeWith(server, code, reason),
        })
        return new Response(null, {
          status: 101,
          // The worker runtime reads the client out of the upgrade response;
          // the DOM's `ResponseInit` has no such member.
          webSocket: client,
        } as ResponseInit)
      } catch (error) {
        console.error('[foldkit-sync] serving an upgrade broke:', error)
        abandon()
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
    }
  }
}
