/**
 * `Sync.mount`: runs a Foldkit application over a replica with one reducer.
 *
 * A durable Message is a state-only, deterministic transition of the shared
 * projection (the derived replay enforces it), so the application's own `update`
 * is applied at once and the Message is persisted afterwards in a Command. The
 * shared slice is re-installed from the replica when an exchange changes it or
 * a persist fails, through one private Message the application never sees.
 */
import { Effect, Exit, Layer, Schema, Stream } from 'effect'
import { absurd } from 'effect/Function'
import type { Document, HtmlBuilder } from 'foldkit/html'
import * as Navigation from 'foldkit/navigation'
import type { UrlRequest } from 'foldkit/navigation'
import * as Port from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import type { Subscriptions } from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import * as Url from 'foldkit/url'
import type { RunnableApplication } from 'foldkit-surface'
import type { ReplicaError } from './errors.js'
import type { DefinedSync } from './make.js'
import type { Replica, ReplicaStatus } from './sync.js'

const REFRESH = 'foldkit-sync/Refresh'
const PERSISTED = 'foldkit-sync/Persisted'
const FAILED = 'foldkit-sync/PersistenceFailed'
const NAVIGATE = 'foldkit-sync/Navigate'
const NAVIGATED = 'foldkit-sync/Navigated'
const DISPATCHED = 'foldkit-sync/Dispatched'

type Private =
  // Every replica status, applied in order, so `settled` counts one seen only once `update` has it.
  | { readonly _tag: typeof REFRESH; readonly status: ReplicaStatus; readonly changed: boolean }
  | { readonly _tag: typeof PERSISTED }
  | { readonly _tag: typeof FAILED; readonly error: ReplicaError }
  | { readonly _tag: typeof NAVIGATE; readonly request: UrlRequest }
  | { readonly _tag: typeof NAVIGATED }
  // An application Message sent through `dispatch`, so `settled` counts it in.
  | { readonly _tag: typeof DISPATCHED; readonly message: unknown }

// A key per private tag, so a variant added to `Private` must be added here too.
const PRIVATE: Readonly<Record<Private['_tag'], true>> = {
  [REFRESH]: true,
  [PERSISTED]: true,
  [FAILED]: true,
  [NAVIGATE]: true,
  [NAVIGATED]: true,
  [DISPATCHED]: true,
}

const isPrivate = (message: { readonly _tag: string }): message is Private =>
  Object.hasOwn(PRIVATE, message._tag)

// A registered symbol, so two copies of this package in one bundle recognize each other's.
const FACT = Symbol.for('foldkit-sync/fact')

/**
 * A Command that dispatches `message` as the next transition, which under `Sync.mount`
 * means within this one: the mount applies it straight after the `update` that returned
 * it, and persists it if it is durable, before any other Message is processed. This is
 * how a local intent turns into a durable fact that needs something only the intent's
 * transition knows, such as an id minted from local state, without a later Message
 * seeing the Model before the fact. Elsewhere, or once a parent has mapped the Command,
 * it is an ordinary Command that yields `message`, and so is one a durable Message's
 * update returns: replay would not apply it, and with derived replay the durable Message's
 * persist fails with `ReplayError` as for any Command.
 */
export const fact = <Message>(
  message: Message,
): { readonly name: string; readonly effect: Effect.Effect<Message> } =>
  // Not enumerable, so the spread a mapping Command is copied with drops the marker, and a
  // mapped fact is the ordinary Command it now is rather than the unmapped Message.
  Object.defineProperty({ name: 'foldkit-sync/fact', effect: Effect.succeed(message) }, FACT, {
    value: message,
    enumerable: false,
  })

const factOf = (command: unknown): { readonly message: unknown } | undefined =>
  typeof command === 'object' && command !== null && FACT in command
    ? { message: (command as { readonly [FACT]: unknown })[FACT] }
    : undefined

/**
 * The URL as part of the application: `onUrlChange` names the Message the
 * runtime sends for the current URL at start and on every navigation (so a
 * `foldkit-mirror` URL mirror reads back in), `init` reduces the URL into the
 * Model before the first render, and `onUrlRequest` names the Message for a
 * link click; omitted, the mount follows the link itself (an internal one is
 * pushed, an external one loaded).
 */
export interface MountUrl<Model, Message> {
  readonly init?: ((model: Model, url: Url.Url) => Model) | undefined
  readonly onUrlChange: (url: Url.Url) => Message
  readonly onUrlRequest?: ((request: UrlRequest) => Message) | undefined
}

export interface MountOptions<Model, Message, Shared, Resources> {
  /** An open replica of this contract; `mount` does not close it. */
  readonly replica: Replica<Message, Shared>
  /** The element the application renders into; Foldkit requires it to have an `id`. */
  readonly container: HTMLElement
  readonly view: (model: Model, h: HtmlBuilder<Message>) => Document
  readonly subscriptions?: Subscriptions<Model, Message, Resources> | undefined
  readonly resources?: Layer.Layer<Resources> | undefined
  /** Route the URL through the application; without it the mount ignores the URL. */
  readonly url?: MountUrl<Model, Message> | undefined
  /**
   * Reflects a refused or failed persist in the Model, after the durable edit
   * has been reverted. Omitted, the edit is reverted silently.
   */
  readonly onPersistenceFailure?: ((model: Model, error: ReplicaError) => Model) | undefined
  /**
   * Runs when the mount replaces the shared slice outside `update`: an exchange committed,
   * acknowledged or rejected something, or a persist failed and its edit was reverted.
   * `previous` is the Model before; what it returns is the transition, so an application
   * can carry local state across the change (a selection held by what it points at) or
   * return Commands (a DOM the change has to reach). Omitted, the Model is `next`. It is
   * not called for a status that changes nothing the Model shows, such as the first.
   */
  readonly onReinstall?:
    ((next: Model, previous: Model) => Update.Return<Model, Message, Resources>) | undefined
}

/**
 * The shared slice as the server has confirmed it, outside the Model. It is a
 * source for waiting consumers, the shape `Agent.when({ source })` reads, and
 * not a Projection: it does not render and is not derived from the Model.
 */
export interface CommittedView<Shared> {
  readonly get: () => Shared
  /** Told after every exchange, including one that moves no cursor (a checkpoint). */
  readonly subscribe: (listener: () => void) => () => void
}

export interface Mounted<Model, Message, Shared = unknown> {
  /** Sends an application Message through the runtime; the `Exit` reports a decode failure. */
  readonly dispatch: (message: Message) => Exit.Exit<void, unknown>
  /** The Model after the last transition. */
  readonly model: () => Model
  /** Notified after every transition; with `model` and `dispatch`, the host an agent binds to. */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Every application Message the runtime applies, from any origin, so an
   * agent contract that declares a `completion` can see the Message that
   * finishes its work. The mount's private Messages are not reported.
   */
  readonly observe: (listener: (message: Message) => void) => () => void
  /**
   * The shared slice without pending local edits, for an agent that must not
   * report an optimistic edit as done: `Agent.when({ source: mounted.committed, … })`.
   */
  readonly committed: CommittedView<Shared>
  /**
   * Resolves once the Model has caught up with the replica: no persist in
   * flight or unanswered, every replica status the mount was told of seen,
   * and every reinstall it asked for applied. It observes and never does the
   * work. Frames are not its to wait for (`Frames.track` in
   * `foldkit-mixins/testing` is), nor I/O a Command started. Rejects after
   * `dispose`.
   */
  readonly settled: () => Promise<void>
  /** Waits for in-flight persists, then disposes the runtime. The replica stays open. */
  readonly dispose: () => Promise<void>
}

/**
 * Commits, rejections and acknowledgments change what the replica holds; a
 * submit only echoes a local edit. An acknowledgment that does not return the
 * operation moves no cursor, but it still drops the edit from the outbox.
 */
const sharedChanged = (previous: ReplicaStatus | undefined, next: ReplicaStatus): boolean =>
  previous === undefined ||
  previous.cursor !== next.cursor ||
  next.pending < previous.pending ||
  previous.rejected.length !== next.rejected.length ||
  previous.rejected.some((rejection, index) => rejection.opId !== next.rejected[index]?.opId)

/**
 * A durable edit the Model already shows. `started` is the replica's next local
 * sequence when its submit began, `undefined` while it waits for its turn.
 */
export interface LocalEdit<Message> {
  readonly message: Message
  started: number | undefined
}

/**
 * The edits a replica whose next local sequence is `next` does not hold yet.
 * Submits run one at a time, so the one in flight is in the replica exactly
 * when its submit has moved the sequence past `started`.
 */
export const unconfirmedEdits = <Message>(
  edits: ReadonlyArray<LocalEdit<Message>>,
  next: number,
): ReadonlyArray<Message> =>
  edits.filter(edit => edit.started === undefined || next <= edit.started).map(edit => edit.message)

/** The application's Message union, as `Surface.application` types it. */
type MessageOf<App> =
  App extends RunnableApplication<any, any, any, any> ? Schema.Schema.Type<App['Message']> : never

export const mount = <
  Model,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Fields extends Schema.Struct.Fields,
  Ms extends readonly unknown[],
  Resources = never,
  Principal = unknown,
>(
  app: RunnableApplication<Model, F, Cases, Resources>,
  sync: DefinedSync<
    Model,
    Fields,
    MessageOf<RunnableApplication<Model, F, Cases, Resources>>,
    Ms,
    Principal
  >,
  options: MountOptions<
    Model,
    MessageOf<RunnableApplication<Model, F, Cases, Resources>>,
    Schema.Struct.Type<Fields>,
    Resources
  >,
): Mounted<
  Model,
  MessageOf<RunnableApplication<Model, F, Cases, Resources>>,
  Schema.Struct.Type<Fields>
> => {
  // Foldkit reports a missing id only inside the runtime fiber, where nothing
  // renders and nothing is thrown; fail here instead.
  if (options.container.id === '')
    throw new Error('Sync.mount: the container needs an id (`container.id = "app"`)')
  type Message = MessageOf<RunnableApplication<Model, F, Cases, Resources>>
  // The application's Messages are tagged structs; the generic cannot say so.
  type Tagged = { readonly _tag: string }
  type RuntimeMessage = (Message & Tagged) | Private
  type Shared = Schema.Struct.Type<Fields>
  const { replica } = options
  const durable = new Set(sync.contract.messages)

  // Durable edits whose submit has not settled, in dispatch order.
  const edits: Array<LocalEdit<Message>> = []
  // Settles when the latest edit's submit does; the next submit waits for it.
  let tail: Promise<void> = Promise.resolve()

  // The replica's `shared` holds every settled edit, and the one in flight once
  // its submit lands; the rest are replayed on top. Read from one snapshot, so
  // a refresh neither hides an edit still waiting for the replica nor applies
  // one the replica already holds.
  // The replica's shared value the Model was last installed from, and whether a durable
  // edit has changed the Model's copy since. The replica keeps one object per state, so
  // the same object with no edit since is the shared slice the Model already shows.
  let installedFrom: Shared | undefined
  let editedSinceInstall = false
  const install = (model: Model): Model => {
    const snapshot = Effect.runSync(replica.snapshot)
    installedFrom = snapshot.shared
    editedSinceInstall = false
    const shared = unconfirmedEdits(edits, snapshot.nextLocalSequence).reduce<Shared>(
      (value, message) => {
        try {
          return sync.replay(value, message)
        } catch {
          // The replica refuses it too; its FAILED re-installs without it.
          return value
        }
      },
      snapshot.shared,
    )
    return sync.projection.set(model, shared)
  }

  const inFlight = new Set<Promise<void>>()
  // What `settled` waits on: dispatches and persists not yet answered in
  // `update`, and the last replica status `update` applied.
  let dispatchesOwed = 0
  let persistsOwed = 0
  let applied: ReplicaStatus | undefined
  let disposed = false
  const waiters = new Set<{
    readonly resolve: () => void
    readonly reject: (error: Error) => void
  }>()
  const quiet = (): boolean =>
    dispatchesOwed === 0 &&
    persistsOwed === 0 &&
    !sharedChanged(applied, Effect.runSync(replica.status))
  const notifySettled = (): void => {
    if (!quiet()) return
    for (const waiter of [...waiters]) {
      waiters.delete(waiter)
      waiter.resolve()
    }
  }
  /**
   * A private transition that leaves the Model as it was: the runtime sends
   * no Subscription the change, so `settled` is told here, once it returns.
   */
  const unchanged = (model: Model): Update.Return<Model, RuntimeMessage, Resources> => {
    queueMicrotask(notifySettled)
    return { model }
  }
  let latest: Model = install(app.initial)
  const modelListeners = new Set<() => void>()
  const committedListeners = new Set<() => void>()
  const messageListeners = new Set<(message: Message) => void>()
  // Listeners run inside `update`, a Subscription, and the refresh stream. A
  // throwing one must not break those or skip the listeners after it, so its
  // error is reported asynchronously, as an event listener's would be.
  const notifyEach = <A>(listeners: ReadonlySet<(value: A) => void>, value: A): void => {
    for (const listener of [...listeners]) {
      try {
        listener(value)
      } catch (error) {
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }
  const notifyCommitted = (): void => notifyEach(committedListeners, undefined)

  const updatePrivate = (
    model: Model,
    message: Private,
  ): Update.Return<Model, RuntimeMessage, Resources> => {
    switch (message._tag) {
      // Installs at once: edits still waiting for the replica are replayed on
      // top, so nothing is deferred behind them.
      case REFRESH: {
        applied = message.status
        // The first status, and any other that changed nothing the Model shows, reinstall
        // nothing, so `onReinstall` hears only of a real change.
        if (
          !message.changed ||
          (!editedSinceInstall && Effect.runSync(replica.snapshot).shared === installedFrom)
        ) {
          return unchanged(model)
        }
        return reinstalled(install(model), model)
      }
      case PERSISTED:
        persistsOwed--
        return unchanged(model)
      case FAILED: {
        persistsOwed--
        const { error } = message
        const reverted = install(model)
        return reinstalled(options.onPersistenceFailure?.(reverted, error) ?? reverted, model)
      }
      case NAVIGATE: {
        // A link the application did not claim: follow it. The runtime then
        // reports the new URL through `onUrlChange`.
        const { request } = message
        const follow =
          request._tag === 'Internal'
            ? Navigation.pushUrl(Url.toString(request.url))
            : Navigation.load(request.href)
        return {
          model,
          commands: [
            {
              name: 'foldkit-sync/navigate',
              effect: follow.pipe(Effect.as({ _tag: NAVIGATED } as RuntimeMessage)),
            },
          ],
        }
      }
      case NAVIGATED:
        return { model }
      case DISPATCHED:
        dispatchesOwed--
        return transition(model, message.message as Message & Tagged)
      default:
        return absurd(message)
    }
  }

  const update = (
    model: Model,
    message: RuntimeMessage,
  ): Update.Return<Model, RuntimeMessage, Resources> => {
    if (isPrivate(message)) return updatePrivate(model, message)
    return transition(model, message as Message & Tagged)
  }

  const reinstalled = (
    next: Model,
    previous: Model,
  ): Update.Return<Model, RuntimeMessage, Resources> =>
    options.onReinstall === undefined
      ? { model: next }
      : applyFacts(
          options.onReinstall(next, previous) as Update.Return<Model, RuntimeMessage, Resources>,
        )

  /** The application's transition for one of its Messages, with the persist a durable one needs. */
  const step = (
    model: Model,
    message: Message & Tagged,
  ): Update.Return<Model, RuntimeMessage, Resources> => {
    notifyEach(messageListeners, message)
    const result = app.update(model, message) as Update.Return<Model, RuntimeMessage, Resources>
    if (!durable.has(message._tag)) return result
    editedSinceInstall = true
    persistsOwed++
    const edit: LocalEdit<Message> = { message, started: undefined }
    edits.push(edit)
    const previous = tail
    let settle!: () => void
    const done = new Promise<void>(resolve => {
      settle = resolve
    })
    tail = done
    const release = (): void => {
      const index = edits.indexOf(edit)
      if (index !== -1) edits.splice(index, 1)
      inFlight.delete(done)
      settle()
    }
    const persist = {
      name: 'foldkit-sync/persist',
      effect: Effect.gen(function* () {
        // Tracked so `dispose` can wait instead of interrupting a persist.
        inFlight.add(done)
        // One submit at a time, in dispatch order, so `started` is the
        // sequence this edit takes if its submit succeeds.
        yield* Effect.promise(() => previous)
        edit.started = (yield* replica.snapshot).nextLocalSequence
        const outcome = yield* Effect.result(replica.submit(edit.message))
        return outcome._tag === 'Success'
          ? ({ _tag: PERSISTED } as RuntimeMessage)
          : ({ _tag: FAILED, error: outcome.failure } as RuntimeMessage)
      }).pipe(
        // `ensuring`, so a defect in storage still releases the next submit and `dispose`.
        Effect.ensuring(Effect.sync(release)),
      ),
    }
    return { model: result.model, commands: [...(result.commands ?? []), persist] }
  }

  /**
   * A Message's transition, with the facts it returned applied after it. A durable
   * Message's are not: replay would not apply them, so they stay ordinary Commands.
   */
  const transition = (
    model: Model,
    message: Message & Tagged,
  ): Update.Return<Model, RuntimeMessage, Resources> => {
    const result = step(model, message)
    return durable.has(message._tag) ? result : applyFacts(result)
  }

  /** Applies the facts a transition returned, in order, each as the transition after it. */
  const applyFacts = (
    result: Update.Return<Model, RuntimeMessage, Resources>,
  ): Update.Return<Model, RuntimeMessage, Resources> => {
    let model = result.model
    const kept: Array<Update.Commands<RuntimeMessage, Resources>[number]> = []
    for (const command of result.commands ?? []) {
      const found = factOf(command)
      if (found === undefined) {
        kept.push(command)
        continue
      }
      const next = transition(model, found.message as Message & Tagged)
      model = next.model
      kept.push(...(next.commands ?? []))
    }
    return { model, commands: kept }
  }

  const ports = {
    inbound: { message: Port.inbound(app.Message as unknown as Schema.Codec<Message, unknown>) },
  }
  const own = Subscription.make<Model, RuntimeMessage, Resources>()(() => ({
    message: Port.subscription(ports.inbound.message, (message): RuntimeMessage => ({
      _tag: DISPATCHED,
      message,
    })),
    // The replica's status carries the cursor and rejections, which is exactly
    // when the shared slice held locally can differ from the replica's.
    refresh: Subscription.persistent<RuntimeMessage, Resources>(
      replica.statusChanges.pipe(
        // Every status, not only a changed cursor: a checkpoint at the same
        // cursor still replaces the committed state a waiter reads.
        Stream.tap(() => Effect.sync(notifyCommitted)),
        Stream.mapAccum(
          (): ReplicaStatus | undefined => undefined,
          (previous, status): readonly [ReplicaStatus, ReadonlyArray<RuntimeMessage>] => [
            status,
            [{ _tag: REFRESH, status, changed: sharedChanged(previous, status) }],
          ],
        ),
      ),
    ),
    // `modelToDependencies` runs on every transition, so it doubles as the Model
    // getter the runtime does not expose.
    latest: {
      dependenciesSchema: Schema.Struct({}),
      modelToDependencies: (model: Model) => {
        latest = model
        notifyEach(modelListeners, undefined)
        // After every transition, so `settled` resolves once `model()` has it.
        notifySettled()
        return {}
      },
      dependenciesToStream: () => Stream.never,
    },
  }))
  const subscriptions =
    options.subscriptions === undefined
      ? own
      : Subscription.aggregate<Model, RuntimeMessage, Resources>()(
          options.subscriptions as Subscriptions<Model, RuntimeMessage, Resources>,
          own,
        )

  const view = (model: Model, h: HtmlBuilder<RuntimeMessage>): Document =>
    // Sound: the view constructs only application Messages, a subset of the
    // runtime's union.
    options.view(model, h as unknown as HtmlBuilder<Message>)
  const common = {
    Model: app.Model as unknown as Schema.Codec<Model, any, unknown, unknown>,
    container: options.container,
    ports,
    update,
    subscriptions,
    ...(options.resources === undefined ? {} : { resources: options.resources }),
    view,
  }
  const url = options.url
  const program =
    url === undefined
      ? Runtime.makeApplication({ ...common, init: () => ({ model: latest }) })
      : Runtime.makeApplication({
          ...common,
          routing: {
            onUrlChange: (at: Url.Url) => url.onUrlChange(at) as RuntimeMessage,
            onUrlRequest: (request: UrlRequest): RuntimeMessage =>
              url.onUrlRequest === undefined
                ? { _tag: NAVIGATE, request }
                : (url.onUrlRequest(request) as RuntimeMessage),
          },
          init: (at: Url.Url) => {
            latest = url.init === undefined ? latest : url.init(latest, at)
            return { model: latest }
          },
        })
  const handle = Runtime.embed(program)
  const encodeMessage = Schema.encodeExit(app.Message as unknown as Schema.Codec<Message, unknown>)

  return {
    // The port decodes what it is sent, so it takes the Message encoded: a
    // Message is sent as its type is, Option fields and all.
    dispatch: message =>
      Exit.match(encodeMessage(message), {
        onSuccess: encoded => {
          // Counted before the send, in case the port delivers within it.
          dispatchesOwed++
          const sent = handle.ports.message.send(encoded)
          if (Exit.isFailure(sent)) dispatchesOwed--
          return sent
        },
        onFailure: cause => Exit.failCause(cause),
      }),
    model: () => latest,
    subscribe: listener => {
      modelListeners.add(listener)
      return () => modelListeners.delete(listener)
    },
    observe: listener => {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },
    committed: {
      get: () => Effect.runSync(replica.committed),
      subscribe: listener => {
        committedListeners.add(listener)
        return () => committedListeners.delete(listener)
      },
    },
    settled: () => {
      if (disposed) return Promise.reject(new Error('Sync.mount: settled() after dispose'))
      if (quiet()) return Promise.resolve()
      return new Promise<void>((resolve, reject) => waiters.add({ resolve, reject }))
    },
    dispose: async () => {
      disposed = true
      for (const waiter of [...waiters]) {
        waiters.delete(waiter)
        waiter.reject(new Error('Sync.mount: disposed before it settled'))
      }
      await Promise.all([...inFlight])
      handle.dispose()
    },
  }
}
