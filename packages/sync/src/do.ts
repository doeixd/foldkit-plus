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
import { Cause, Duration, Effect, Exit, type Layer, Option, Result } from 'effect'
import type { RemoteUnauthenticated } from 'foldkit-remote'
import type { Diagnostic } from 'foldkit-surface'
import { DocumentId as JournalDocumentId, type Journal } from 'foldkit-durable/core'
import {
  documentHost,
  type Accepted,
  type DocumentHostOptions,
  type DocumentHostOptionsLayer,
} from './journal.js'
import { checkRevalidate } from './revalidate.js'
import { hostDefect, reportTo } from './diagnostics.js'
import type { AuthorizeDecision } from './make.js'
import type { Operation, Sync, WrittenOperation } from './sync.js'
import { workerSocket } from './transport.js'
import { serverJournal, type Reaction, type ServerJournal } from './serverJournal.js'

/** How long after a commit the alarm is set for: what resumes a run eviction cut off. */
const ALARM_AFTER_COMMIT = Duration.seconds(1)
/** When the alarm comes back after a pass that broke: never left to the runtime's retries. */
const ALARM_AFTER_DEFECT = Duration.seconds(30)

/** The alarm a Durable Object's storage keeps: one per object. */
interface AlarmStorage {
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number): Promise<void>
}

const alarmsOf = (storage: unknown): Option.Option<AlarmStorage> =>
  typeof storage === 'object' &&
  storage !== null &&
  typeof (storage as Partial<AlarmStorage>).getAlarm === 'function' &&
  typeof (storage as Partial<AlarmStorage>).setAlarm === 'function'
    ? Option.some(storage as AlarmStorage)
    : Option.none()

/**
 * The sliver of a Durable Object the host uses: state for the journal to
 * open with, and, with `server`, the storage's alarm (`getAlarm`,
 * `setAlarm`). Left `unknown` so `openJournal` can read the rest of it (the
 * object's SQLite) as its own type.
 */
export interface DocumentHostContext {
  readonly storage?: unknown
}

/** The server's own side of the document, for `defineDocumentHost`'s `server`. */
export interface DocumentHostServer<Principal, Env> {
  /** Who the server commits as. Never resolved from a request, and never changed. */
  readonly principal: Principal
  /** The document's reactions, made from the environment (a mailer's key, a binding). */
  readonly reactions: (env: Env) => ReadonlyArray<Reaction<unknown, never>>
  /** The most runs one pass starts. */
  readonly runsPerPass?: number | undefined
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
  ) => Promise<Journal<Operation, Shared, Principal, WrittenOperation>>
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
        journal: Journal<Operation, Shared, Principal, WrittenOperation>,
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
   * The server's own side: who it commits as, and the document's reactions
   * (`foldkit-sync/journal`'s `reaction`), for a contract from
   * `Sync.forApplication(App).make`. The host registers them when it opens
   * the journal, before the first socket is served. After an exchange that
   * committed, it sets the object's alarm and then runs them without holding
   * the reply; `alarm()` runs them and sets the alarm again from what they
   * answer. A run eviction cut off is resumed by the alarm, never by the
   * runtime's retries of a throwing `alarm()`. The object has one alarm:
   * the host only ever brings it earlier.
   */
  readonly server?: DocumentHostServer<Principal, Env> | undefined
  /**
   * Makes the socket pair for an upgrade: the server end is accepted before
   * serving. Defaults to the `WebSocketPair` global where one exists (a
   * worker, miniflare); pass one in tests.
   */
  readonly pair?: (() => readonly [client: WebSocket, server: AcceptingWebSocket]) | undefined
  /**
   * Where each upgrade's diagnostics go, with its request: a `HostDefect`
   * for every failure answered "Internal error" (making the socket pair,
   * the resolver, the journal, the exchange) and the rest `documentHost`
   * reports. A pass of reactions that broke has no request of its own: it is
   * reported with one for `https://durable-object/alarm`. The reporter in the
   * Effect context when not given, by default the log.
   */
  readonly diagnostics?:
    | ((diagnostic: Diagnostic, request: Request) => Effect.Effect<void>)
    | undefined
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
): new (
  ctx: DocumentHostContext,
  env: Env,
) => { fetch(request: Request): Promise<Response>; alarm(): Promise<void> } => {
  checkRevalidate(config.revalidate, 'defineDocumentHost')
  // The application's own alarm, if its base has one: run after the reactions'.
  const baseAlarm = (Base.prototype as { readonly alarm?: unknown }).alarm
  return class extends Base {
    private readonly host: (request: Request) => Promise<Result.Result<Accepted, Response>>
    private readonly react: () => Promise<void>

    constructor(ctx: DocumentHostContext, env: Env) {
      super(ctx, env)
      interface Opened {
        readonly journal: Journal<Operation, Shared, Principal, WrittenOperation>
        readonly server: Option.Option<ServerJournal<unknown, never>>
      }
      let ready: Promise<Opened> | undefined
      const { layer, settle, server } = config
      const alarms = Option.flatMap(Option.fromUndefinedOr(server), () => alarmsOf(ctx.storage))
      if (server !== undefined && Option.isNone(alarms))
        throw new Error('defineDocumentHost: `server` needs the object’s storage alarm')
      // Made now, so one declared for another contract fails here and not at
      // the first upgrade; `serverJournal` checks the rest when it opens.
      const reactions = server === undefined ? [] : server.reactions(env)
      for (const each of reactions)
        if (each.sync !== config.sync)
          throw new Error(
            `defineDocumentHost: reaction ${each.name} was declared for another contract`,
          )
      /** Reports a pass that broke; a reporter that fails itself is not let out of `alarm()`. */
      const report = (stage: 'Alarm', cause: Cause.Cause<unknown>): Promise<void> =>
        Effect.runPromise(
          reportTo(
            config.diagnostics === undefined
              ? undefined
              : diagnostic =>
                  config.diagnostics!(diagnostic, new Request('https://durable-object/alarm')),
            hostDefect(stage, cause),
          ),
        ).catch(() => undefined)
      /** Brings the alarm to `after` from now unless it is already sooner. */
      const arm = async (after: Duration.Duration): Promise<void> => {
        const storage = Option.getOrThrow(alarms)
        const at = Date.now() + Duration.toMillis(after)
        const current = await storage.getAlarm()
        // Inside `alarm()` the runtime may still answer the alarm being run:
        // one in the past is no alarm.
        if (current === null || current <= Date.now() || current > at) await storage.setAlarm(at)
      }
      // The journal and the reactions' registration in one, once per object:
      // registered before any socket is served, so no commit is missed.
      const open = (): Promise<Opened> =>
        (ready ??= config.openJournal(ctx, env).then(async journal => ({
          journal,
          server:
            server === undefined
              ? Option.none()
              : Option.some(
                  await Effect.runPromise(
                    // The contract's own type is not kept here: `serverJournal`
                    // refuses a reaction declared for another at run time.
                    serverJournal({
                      sync: config.sync,
                      journal,
                      server: server.principal,
                      reactions,
                      runsPerPass: server.runsPerPass,
                    } as never) as Effect.Effect<ServerJournal<unknown, never>>,
                  ),
                ),
        }))).catch((error: unknown) => {
          ready = undefined
          throw error
        })
      /**
       * One pass, then the alarm from its answer. Never rejects: a pass that
       * broke (the journal would not open, a reaction was never registered)
       * is reported and brings the alarm back later.
       */
      const runPass = async (): Promise<void> => {
        if (server === undefined) return
        const exit = await Effect.runPromiseExit(
          Effect.gen(function* () {
            const { server: running } = yield* Effect.promise(open)
            if (Option.isNone(running)) return
            const next = yield* running.value.react
            if (Option.isSome(next)) yield* Effect.promise(() => arm(next.value))
          }),
        )
        if (Exit.isSuccess(exit)) return
        await report('Alarm', exit.cause)
        await arm(ALARM_AFTER_DEFECT).catch(() => undefined)
      }
      // One pass at a time per object: two at once would count each failure
      // twice and reach the attempts bound in half the failures.
      let passing: Promise<void> = Promise.resolve()
      const pass = (): Promise<void> => (passing = passing.then(runPass))
      this.react = pass
      // What the host knows was committed, so only an exchange that moved it arms the alarm.
      let seen = -1
      const afterExchange = (journal: Journal<Operation, Shared, Principal, WrittenOperation>) =>
        Effect.gen(function* () {
          const at = yield* journal.cursor(JournalDocumentId.make(config.sync.documentId))
          if (at === seen) return
          // Before the reply, so a run cut off by eviction is resumed. One that
          // fails is reported, and `seen` stays, so the next exchange arms again.
          const armed = yield* Effect.promise(() =>
            arm(ALARM_AFTER_COMMIT).then(
              () => true,
              async (error: unknown) => {
                await report('Alarm', Cause.die(error))
                return false
              },
            ),
          )
          if (armed) seen = at
          // Not awaited: the reply does not wait on a provider.
          void pass()
        })
      this.host = documentHost<Message, Shared, Principal, RP>({
        sync: config.sync,
        // Opened on the first upgrade a principal passes, so probes never
        // provision storage; a failed open is tried again on the next.
        journal: () => open().then(opened => opened.journal),
        resolvePrincipal: request => config.resolvePrincipal(request, env),
        layer: layer === undefined ? undefined : () => layer(env),
        revalidate: config.revalidate,
        settle:
          settle === undefined && server === undefined
            ? undefined
            : journal =>
                Effect.gen(function* () {
                  // First: a settle that fails still leaves what committed to be reacted to.
                  if (server !== undefined) yield* afterExchange(journal)
                  if (settle !== undefined) yield* settle(env, journal)
                }),
        opens: config.opens,
        admit: config.admit,
        diagnostics: config.diagnostics,
        // `DocumentHostLayer` already tied `layer` to `RP` on the config; the
        // conditional cannot be resolved for an `RP` still generic here.
      } as DocumentHostOptions<Message, Shared, Principal, RP> & DocumentHostOptionsLayer<RP>)
    }

    /**
     * The object's alarm: runs the reactions and sets the alarm again from
     * what they answer, then the base class's own `alarm()`, if it has one.
     * The reactions' part never throws, so the runtime's few retries of a
     * throwing alarm are never what a run depends on.
     */
    async alarm(): Promise<void> {
      await this.react()
      if (typeof baseAlarm === 'function') await (baseAlarm as () => Promise<void>).call(this)
    }

    async fetch(request: Request): Promise<Response> {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return Response.json({ error: 'not found' }, { status: 404 })
      // The replica learns nothing of it; whoever runs the host must.
      const broke = async (error: unknown): Promise<Response> => {
        const { diagnostics } = config
        await Effect.runPromise(
          reportTo(
            diagnostics === undefined ? undefined : diagnostic => diagnostics(diagnostic, request),
            hostDefect('Upgrade', Cause.die(error)),
          ),
        )
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }
      // Made first: a runtime without WebSocketPair is a 500 that resolves no one.
      let pair: readonly [client: WebSocket, server: AcceptingWebSocket]
      try {
        pair = (config.pair ?? defaultPair)()
      } catch (error) {
        return broke(error)
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
        abandon()
        return broke(error)
      }
    }
  }
}
