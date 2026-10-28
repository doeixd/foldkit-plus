import { Cause, Effect, Exit, Layer, Option, PubSub, Queue, Schema, Scope, Stream } from 'effect'
import type * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import type { AnyMessage } from './types.js'

/**
 * A running application as an agent host. The runtime owns the Model; the
 * host reads what it committed and sends Messages into its queue. Pass it to
 * `bind`, never to an agent: it has no policy of its own.
 */
export interface RuntimeHost<Model, Message extends AnyMessage> {
  /** The Model the runtime committed last. Throws before the runtime has booted. */
  readonly model: () => Model
  /**
   * Queues a Message as a click would. Resolves once `update` has applied it;
   * rejects when the runtime is not running, or stops before applying it.
   */
  readonly dispatch: (message: Message) => Promise<void>
  /** Told after each transition that changed the Model. */
  readonly subscribe: (listener: () => void) => () => void
  /** Told of every Message `update` applies, from any origin. */
  readonly observe: (listener: (message: Message) => void) => () => void
}

/** A listener's throw is reported on its own, never into the runtime that told it. */
const tell = <A>(listeners: ReadonlySet<(value: A) => void>, value: A): void => {
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

/** What both hosts share: the last committed Model, the listeners, and the dispatches awaiting `update`. */
const makeCore = <Model, Message extends AnyMessage>(name: string) => {
  let latest = Option.none<Model>()
  // Why the runtime is not running: not started yet, or how it stopped.
  let halted = Option.some('has not started')
  const modelListeners = new Set<() => void>()
  const messageListeners = new Set<(message: Message) => void>()
  // By identity: the runtime hands `update` the object that was dispatched.
  const awaiting = new Map<
    Message,
    Array<{ readonly resolve: () => void; readonly reject: (error: Error) => void }>
  >()

  const host = (deliver: (message: Message) => void): RuntimeHost<Model, Message> => ({
    model: () =>
      Option.getOrThrowWith(latest, () => new Error(`${name}: the application has not started`)),
    dispatch: message => {
      if (Option.isSome(halted))
        return Promise.reject(new Error(`${name}: the application ${halted.value}`))
      return new Promise<void>((resolve, reject) => {
        // Registered before delivery: a headless runtime applies it on this stack.
        const waiting = awaiting.get(message)
        if (waiting === undefined) awaiting.set(message, [{ resolve, reject }])
        else waiting.push({ resolve, reject })
        deliver(message)
      })
    },
    subscribe: listener => {
      modelListeners.add(listener)
      return () => modelListeners.delete(listener)
    },
    observe: listener => {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },
  })

  return {
    host,
    started: (model: Model): void => {
      latest = Option.some(model)
      halted = Option.none()
      tell(modelListeners, undefined)
    },
    applied: (message: Message, before: Model, after: Model): void => {
      latest = Option.some(after)
      const waiting = awaiting.get(message)
      const settled = waiting?.shift()
      if (waiting?.length === 0) awaiting.delete(message)
      settled?.resolve()
      tell(messageListeners, message)
      if (after !== before) tell(modelListeners, undefined)
    },
    stopped: (reason: string): void => {
      halted = Option.some(reason)
      const error = new Error(`${name}: the application ${reason}`)
      for (const waiting of awaiting.values()) for (const { reject } of waiting) reject(error)
      awaiting.clear()
    },
  }
}

const HOST_ENTRY = 'foldkit-agent/host'

/** The part of a Foldkit application config the host wraps. */
export interface HostableConfig<Model, Message> {
  readonly update: (model: Model, message: Message) => Update.Return<Model, Message, any>
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, any> | undefined
  readonly crash?: { report?(context: { readonly error: Error }): void } | undefined
}

type ModelOf<Config extends HostableConfig<any, any>> = Parameters<Config['update']>[0]
type MessageOf<Config extends HostableConfig<any, any>> = Parameters<
  Config['update']
>[1] extends infer Message extends AnyMessage
  ? Message
  : never

/**
 * Hosts a Foldkit runtime for an agent. Returns the config to start, with
 * `run`, `hydrate`, `embed` or `SSR.hydrate` as before, and the host that
 * reads and drives the runtime started from it.
 */
export const host = <Config extends HostableConfig<any, any>>(
  config: Config,
): { readonly config: Config; readonly host: RuntimeHost<ModelOf<Config>, MessageOf<Config>> } => {
  type Model = ModelOf<Config>
  type Message = MessageOf<Config>
  if (config.subscriptions !== undefined && Object.hasOwn(config.subscriptions, HOST_ENTRY))
    throw new Error('Agent.host: this config is already hosted')
  const core = makeCore<Model, Message>('Agent.host')
  type Boot = {
    readonly id: number
    /** The Model this runtime holds. */
    current: Model
    /**
     * The Models it booted with and its `update` produced: its later reads,
     * which lag behind `update`, are of these, and another runtime's first is not.
     */
    readonly produced: WeakSet<object>
    /** Its own queue, so nothing sent to a runtime that stopped reaches the next. */
    readonly queue: Queue.Queue<Message>
    crashed: boolean
  }
  // Each runtime started from this config, from its first read of its Model.
  // One disposed before its Subscriptions start never reports stopping, so
  // until one starts, a runtime booted while another is booted may be its
  // restart or a second runtime beside it.
  const boots = new Map<number, Boot>()
  let nextBoot = 0
  // The runtime whose Subscriptions run: the one the host reads and drives.
  let running = Option.none<Boot>()
  const refusals = new WeakSet<Error>()
  const refuse = (): Error => {
    const error = new Error(
      'Agent.host: a second runtime was started from this config; host each one',
    )
    refusals.add(error)
    return error
  }

  const update = (model: Model, message: Message) => {
    const result = config.update(model, message)
    // DevTools' time travel replays `update` over older Models; only a
    // transition of the Model a runtime holds is a commit.
    for (const boot of boots.values()) {
      if (boot.current !== model) continue
      boot.current = result.model
      boot.produced.add(result.model as object)
      if (Option.exists(running, held => held === boot)) core.applied(message, model, result.model)
      break
    }
    return result
  }

  const entry = {
    dependenciesSchema: Schema.Struct({ boot: Schema.Number }),
    // The runtime reads this first with the Model it booted with (fresh,
    // hydrated, or restored by a development reload, which skips `init`),
    // before it processes any Message.
    modelToDependencies: (model: Model) => {
      for (const boot of boots.values()) {
        if (boot.produced.has(model as object)) return { boot: boot.id }
      }
      if (Option.isSome(running)) throw refuse()
      const boot: Boot = {
        id: nextBoot++,
        current: model,
        produced: new WeakSet([model as object]),
        queue: Effect.runSync(Queue.unbounded<Message>()),
        crashed: false,
      }
      boots.set(boot.id, boot)
      return { boot: boot.id }
    },
    dependenciesToStream: ({ boot: id }: { readonly boot: number }) =>
      Stream.unwrap(
        Effect.sync(() => {
          const boot = boots.get(id)
          // The first runtime to start its Subscriptions is the one hosted: one
          // booted before it that has not started was disposed first.
          if (boot === undefined || Option.isSome(running)) return Stream.die(refuse())
          for (const earlier of boots.keys()) if (earlier < id) boots.delete(earlier)
          running = Option.some(boot)
          core.started(boot.current)
          return Stream.fromQueue(boot.queue).pipe(
            Stream.ensuring(
              Effect.sync(() => {
                running = Option.none()
                boots.delete(id)
                // A crash already halted the host, and says why.
                if (!boot.crashed) core.stopped('stopped')
              }),
            ),
          )
        }),
      ),
  }

  const hosted = {
    ...config,
    update,
    subscriptions: { ...config.subscriptions, [HOST_ENTRY]: entry },
    crash: {
      ...config.crash,
      report: (context: { readonly error: Error }) => {
        // A refused second runtime crashes alone; the hosted one runs on.
        if (!refusals.has(context.error)) {
          if (Option.isSome(running)) running.value.crashed = true
          core.stopped('crashed')
        }
        config.crash?.report?.(context)
      },
    },
  } as unknown as Config

  return {
    config: hosted,
    host: core.host(message => {
      if (Option.isSome(running)) Queue.offerUnsafe(running.value.queue, message)
    }),
  }
}

/** An application's runtime config, without what draws it. */
export type HeadlessConfig<Model, Message, Resources> = {
  readonly init: () => Update.Return<Model, Message, Resources>
  readonly update: (model: Model, message: Message) => Update.Return<Model, Message, Resources>
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, Resources> | undefined
  /** Not run headless: Foldkit acquires them against the page. */
  readonly managedResources?: never
  /** Not run headless: there is no URL. */
  readonly routing?: never
  /** Not run headless: there is no embedding page. */
  readonly ports?: never
} & ([Resources] extends [never]
  ? { readonly resources?: undefined }
  : // `NoInfer`, so a wrong Layer is reported here rather than at `update`.
    { readonly resources: Layer.Layer<NoInfer<Resources>> })

/** A Command as the runtime runs it. */
interface RunnableCommand<Message, Resources> {
  readonly name: string
  readonly key?: string | undefined
  readonly args?: Record<string, unknown> | undefined
  readonly effect: Effect.Effect<Message, never, Resources>
}

export interface Headless<Model, Message extends AnyMessage> {
  readonly host: RuntimeHost<Model, Message>
  /** Stops the runtime and releases its resources. Pending dispatches reject. */
  readonly dispose: () => Promise<void>
}

/**
 * Runs an application's `init`, `update`, Commands and Subscriptions with no
 * view, for tests and servers: one runtime per session, its Remote over
 * whatever `RemoteClient` `resources` gives.
 */
export const headless = <Model, Message extends AnyMessage, Resources = never>(
  config: HeadlessConfig<Model, Message, Resources>,
): Headless<Model, Message> => {
  const core = makeCore<Model, Message>('Agent.headless')
  const scope = Scope.makeUnsafe()
  const models = Effect.runSync(PubSub.unbounded<Model>())
  // Built once into the runtime's scope, by the first Command or
  // Subscription that needs it, and released when the runtime stops.
  const acquire = Option.map(Option.fromNullishOr(config.resources), layer =>
    Effect.runSync(
      Effect.cached(
        Effect.uninterruptible(Layer.buildWithScope(layer as Layer.Layer<Resources>, scope)),
      ),
    ),
  )
  const provide = <A>(effect: Effect.Effect<A, never, Resources>): Effect.Effect<A> =>
    Option.match(acquire, {
      onNone: () => effect as Effect.Effect<A>,
      onSome: build => Effect.flatMap(build, context => Effect.provideContext(effect, context)),
    })

  let stopped = false
  let model: Model
  let pending: Array<Message> = []
  let draining = false

  const stop = (reason: string): Promise<void> => {
    if (!stopped) {
      stopped = true
      core.stopped(reason)
    }
    return Effect.runPromise(Scope.close(scope, Exit.void))
  }

  const crash = (cause: Cause.Cause<unknown>): void => {
    if (stopped || Cause.hasInterruptsOnly(cause)) return
    void stop(`crashed: ${Cause.pretty(cause)}`)
  }

  const run = (effect: Effect.Effect<void>): void => {
    Effect.runFork(
      Effect.forkIn(
        effect.pipe(Effect.catchCause(cause => Effect.sync(() => crash(cause)))),
        scope,
      ),
    )
  }

  const enqueue = (message: Message): void => {
    if (stopped) return
    pending.push(message)
    if (draining) return
    draining = true
    try {
      while (pending.length > 0) {
        const batch = pending
        pending = []
        for (const next of batch) {
          if (stopped) break
          const before = model
          const result = config.update(before, next)
          model = result.model
          if (model !== before) PubSub.publishUnsafe(models, model)
          core.applied(next, before, model)
          start(result.commands)
        }
      }
    } catch (error) {
      crash(Cause.die(error))
    } finally {
      draining = false
    }
  }

  // A Command starts a microtask later, never on the stack that dispatched it.
  const start = (commands: Update.Commands<Message, Resources> | undefined): void => {
    // `Command<Message>` is conditional on whether `Message` is a Schema, which
    // a generic `Message` cannot decide.
    for (const command of (commands ?? []) as ReadonlyArray<RunnableCommand<Message, Resources>>) {
      queueMicrotask(() => {
        if (stopped) return
        if (command.key !== undefined) {
          crash(
            Cause.die(
              new Error(
                `Agent.headless: the interruptible Command ${command.name} cannot run headless`,
              ),
            ),
          )
          return
        }
        run(
          provide(
            command.effect.pipe(Effect.withSpan(command.name, { attributes: command.args ?? {} })),
          ).pipe(Effect.flatMap(message => Effect.sync(() => enqueue(message)))),
        )
      })
    }
  }

  try {
    const initial = config.init()
    model = initial.model
    for (const entry of Object.values(config.subscriptions ?? {})) {
      const equivalence =
        entry.keepAliveEquivalence ?? Schema.toEquivalence(entry.dependenciesSchema)
      let dependencies: unknown = entry.modelToDependencies(model)
      const first = dependencies
      // Subscribed now, on this stack, so no transition after it is missed.
      const changes = Effect.runSync(
        PubSub.subscribe(models).pipe(Effect.provideService(Scope.Scope, scope)),
      )
      run(
        Stream.concat(
          Stream.make(first),
          Stream.fromSubscription(changes).pipe(
            Stream.map(next => {
              dependencies = entry.modelToDependencies(next)
              return dependencies
            }),
          ),
        ).pipe(
          Stream.changesWith(equivalence),
          Stream.switchMap(current => entry.dependenciesToStream(current, () => dependencies)),
          Stream.runForEach(message => Effect.sync(() => enqueue(message))),
          provide,
        ),
      )
    }
    core.started(model)
    start(initial.commands)
  } catch (error) {
    void stop('failed to start')
    throw error
  }

  return {
    host: core.host(enqueue),
    dispose: () => stop('was disposed'),
  }
}
