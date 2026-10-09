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
 *   resolvePrincipal: request => ({ actorId: request.headers.get('x-actor') ?? 'anon' }),
 * }) {}
 * ```
 *
 * Open the journal once per object: on the first upgrade, so probes never
 * provision storage. Route one object per document (`idFromName(sync
 * .documentId)`); its in-memory cache and change stream are then exact
 * because nothing else writes.
 */
import type { Effect } from 'effect'
import type { Journal } from 'foldkit-durable/core'
import { serveJournal } from './journal.js'
import type { Operation, Sync } from './sync.js'
import { workerSocket } from './transport.js'

/** The sliver of a Durable Object the host uses: state for the journal to open with. */
export interface DocumentHostContext {
  readonly storage?: unknown
}

/** What `defineDocumentHost` needs of the application, per document. */
export interface DocumentHostConfig<Message, Shared, Principal, Env> {
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
  /** Who is opening this socket, from the upgrade request. May throw: a 401. */
  readonly resolvePrincipal: (request: Request, env: Env) => Principal | Promise<Principal>
  /**
   * Runs after each exchange's appends and before the reply is read: apply
   * what committed to another store. See `serveJournal`.
   */
  readonly settle?: Effect.Effect<void, unknown> | undefined
  /** Refuses an operation before the journal sees it, by connection. See `serveJournal`. */
  readonly refuse?: ((operation: Operation) => boolean) | undefined
  /**
   * Makes the socket pair for an upgrade: the server end is accepted before
   * serving. Defaults to the `WebSocketPair` global where one exists (a
   * worker, miniflare); pass one in tests.
   */
  readonly pair?: (() => readonly [client: WebSocket, server: AcceptingWebSocket]) | undefined
}

/**
 * A server `WebSocket`: accepted once it serves. The `accept` member is a
 * worker-runtime extension the DOM type does not declare.
 */
export interface AcceptingWebSocket extends WebSocket {
  accept(): void
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
 * Non-upgrades are 404s that open nothing; a throwing principal resolution
 * is a 401; a journal that never opened is a 500 that says nothing of it.
 */
export const defineDocumentHost = <Message, Shared, Principal, Env>(
  Base: new (ctx: DocumentHostContext, env: Env) => object,
  config: DocumentHostConfig<Message, Shared, Principal, Env>,
): new (ctx: DocumentHostContext, env: Env) => { fetch(request: Request): Promise<Response> } =>
  class extends Base {
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
      let principal: Principal
      try {
        principal = await config.resolvePrincipal(request, this.hostEnv)
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 401 },
        )
      }
      let journal: Journal<Operation, Shared, Principal, Operation>
      try {
        journal = await (this.ready ??= config.openJournal(this.hostContext, this.hostEnv))
      } catch {
        // A failed open provisions nothing: the next upgrade tries again.
        this.ready = undefined
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
      const [client, server] = (config.pair ?? defaultPair)()
      server.accept()
      serveJournal(workerSocket(server), {
        sync: config.sync,
        journal,
        principal,
        ...(config.settle === undefined ? {} : { settle: config.settle }),
        ...(config.refuse === undefined ? {} : { refuse: config.refuse }),
      })
      return new Response(null, {
        status: 101,
        // The worker runtime reads the client out of the upgrade response;
        // the DOM's `ResponseInit` has no such member.
        webSocket: client,
      } as ResponseInit)
    }
  }
