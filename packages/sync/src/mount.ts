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
import type { Document, HtmlBuilder } from 'foldkit/html'
import * as Navigation from 'foldkit/navigation'
import type { UrlRequest } from 'foldkit/navigation'
import * as Port from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import type { Subscriptions } from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import * as Url from 'foldkit/url'
import { Projection, type RunnableApplication } from 'foldkit-surface'
import type { ReplicaError } from './errors.js'
import type { DefinedSync } from './make.js'
import type { Replica, ReplicaStatus } from './sync.js'

const REFRESH = 'foldkit-sync/Refresh'
const PERSISTED = 'foldkit-sync/Persisted'
const FAILED = 'foldkit-sync/PersistenceFailed'
const NAVIGATE = 'foldkit-sync/Navigate'
const NAVIGATED = 'foldkit-sync/Navigated'

type Private =
  | { readonly _tag: typeof REFRESH }
  | { readonly _tag: typeof PERSISTED }
  | { readonly _tag: typeof FAILED; readonly error: ReplicaError }
  | { readonly _tag: typeof NAVIGATE; readonly request: UrlRequest }
  | { readonly _tag: typeof NAVIGATED }

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
   * The shared slice as the server has confirmed it, without pending local
   * edits: what an agent waits on when an optimistic edit must not count as
   * done, `Agent.when({ projection: mounted.committed, … })`. It reads the
   * replica rather than the Model it is handed, so it serves waiting consumers,
   * not views; `subscribe` fires after every exchange that changes it.
   */
  readonly committed: Projection<Model, Shared>
  /** Waits for in-flight persists, then disposes the runtime. The replica stays open. */
  readonly dispose: () => Promise<void>
}

/** Exchanges and rejections change what the replica holds; a submit only echoes a local edit. */
const sharedChanged = (previous: ReplicaStatus | undefined, next: ReplicaStatus): boolean =>
  previous === undefined ||
  previous.cursor !== next.cursor ||
  previous.rejected.length !== next.rejected.length ||
  previous.rejected.some((id, index) => id !== next.rejected[index])

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
  const { replica } = options
  const durable = new Set(sync.contract.messages)
  const install = (model: Model): Model =>
    sync.projection.set(model, Effect.runSync(replica.shared))

  const inFlight = new Set<Promise<void>>()
  let latest: Model = install(app.initial)
  const modelListeners = new Set<() => void>()
  const messageListeners = new Set<(message: Message) => void>()

  const update = (
    model: Model,
    message: RuntimeMessage,
  ): Update.Return<Model, RuntimeMessage, Resources> => {
    switch (message._tag) {
      case REFRESH:
        return { model: install(model) }
      case PERSISTED:
        return { model }
      case FAILED: {
        const { error } = message as Extract<Private, { readonly _tag: typeof FAILED }>
        const reverted = install(model)
        return { model: options.onPersistenceFailure?.(reverted, error) ?? reverted }
      }
      case NAVIGATE: {
        // A link the application did not claim: follow it. The runtime then
        // reports the new URL through `onUrlChange`.
        const { request } = message as Extract<Private, { readonly _tag: typeof NAVIGATE }>
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
      default: {
        for (const listener of messageListeners) listener(message as Message)
        const result = app.update(model, message as Message) as Update.Return<
          Model,
          RuntimeMessage,
          Resources
        >
        if (!durable.has(message._tag)) return result
        const persist = {
          name: 'foldkit-sync/persist',
          effect: Effect.gen(function* () {
            // Tracked so `dispose` can wait instead of interrupting a persist.
            let settle!: () => void
            const done = new Promise<void>(resolve => {
              settle = resolve
            })
            inFlight.add(done)
            const outcome = yield* Effect.result(replica.submit(message as Message))
            inFlight.delete(done)
            settle()
            return outcome._tag === 'Success'
              ? ({ _tag: PERSISTED } as RuntimeMessage)
              : ({ _tag: FAILED, error: outcome.failure } as RuntimeMessage)
          }),
        }
        return { model: result.model, commands: [...(result.commands ?? []), persist] }
      }
    }
  }

  const ports = {
    inbound: { message: Port.inbound(app.Message as unknown as Schema.Codec<Message, unknown>) },
  }
  const own = Subscription.make<Model, RuntimeMessage, Resources>()(() => ({
    message: Port.subscription(ports.inbound.message, message => message as RuntimeMessage),
    // The replica's status carries the cursor and rejections, which is exactly
    // when the shared slice held locally can differ from the replica's.
    refresh: Subscription.persistent<RuntimeMessage, Resources>(
      replica.statusChanges.pipe(
        Stream.mapAccum(
          (): ReplicaStatus | undefined => undefined,
          (previous, status): readonly [ReplicaStatus, ReadonlyArray<RuntimeMessage>] => [
            status,
            sharedChanged(previous, status) ? [{ _tag: REFRESH }] : [],
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
        for (const listener of modelListeners) listener()
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

  return {
    dispatch: message => handle.ports.message.send(message),
    model: () => latest,
    subscribe: listener => {
      modelListeners.add(listener)
      return () => modelListeners.delete(listener)
    },
    observe: listener => {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },
    committed: Projection.fromReader(
      sync.projection.schema,
      () => Effect.runSync(replica.committed),
      { dependencies: sync.projection.dependencies },
    ),
    dispose: async () => {
      await Promise.all([...inFlight])
      handle.dispose()
    },
  }
}
