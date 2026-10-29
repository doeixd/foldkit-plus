/**
 * `foldkit-remote/testing`: what every read shows, Model by Model, while an
 * application runs over scripted Messages and answers (#250).
 *
 * A list that blinks to `Loading` for one frame is a property of the reducer,
 * the Subscriptions and the order answers land in, so it can be caught without
 * a browser: run the real `update` and the real read entries, hold every
 * request they make, and release each when the test says. Every Model in
 * between is recorded, so nothing falls between samples.
 */
import { Cause, Clock, Duration, Effect, Exit, type Fiber, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import type { Equivalence } from 'effect'
import type * as Update from 'foldkit/update'
import type { ActiveSurface, Projection, SurfaceSource } from 'foldkit-surface'
import { RemoteClient } from './client.js'
import type { EntityLike, OutboxWiring, RemoteDomain, SubscriptionsOptions } from './index.js'
import type { RemoteMessage } from './model.js'
import type { MutationDescriptor } from './mutation.js'
import { OutboxLocks } from './outbox.js'
import { IDENTITY_SEPARATOR, stableStringify, type QueryRef } from './query.js'
import { RemoteData } from './remoteData.js'
import type {
  RemoteForbidden,
  RemoteMutationError,
  RemoteProtocolError,
  RemoteQueryError,
  RemoteReadError,
  RemoteUnauthenticated,
  RemoteUnreachable,
} from './wire.js'

type Tag = RemoteData<unknown>['_tag']
type Client = RemoteClient['Service']

/** A request the trace holds: what it asked, and how to let it go on. */
interface Held {
  /** What `Respond` matches it by: one per row a read batch asks for. */
  readonly keys: ReadonlySet<string>
  readonly description: string
  readonly ask: (client: Client) => Effect.Effect<unknown, unknown>
  readonly resume: (exit: Exit.Exit<unknown, unknown>) => void
}

const queryKey = (identity: string) => `query${IDENTITY_SEPARATOR}${identity}`
const readKey = (entity: string, id: string) =>
  `read${IDENTITY_SEPARATOR}${entity}${IDENTITY_SEPARATOR}${id}`
const mutationKey = (name: string) => `mutation${IDENTITY_SEPARATOR}${name}`

/** A step that lets held requests go on: from `Respond`, never built by hand. */
class Release {
  constructor(
    readonly label: string,
    /** None for `Respond.all`, which lets every held request go on. */
    readonly key: Option.Option<string>,
    readonly fail: Option.Option<unknown>,
  ) {}
}

/** A step of a trace that answers held requests. */
export type Respond = Release

/** The steps that answer what the application asked, each in the order the test puts it. */
export const Respond = {
  /**
   * Answers the oldest held query of `ref`'s connection (any window of it)
   * with what `client` returns for it, or fails it with `fail`.
   */
  query: (
    ref: QueryRef<string, unknown>,
    options: { readonly fail?: RemoteQueryError | RemoteUnauthenticated } = {},
  ): Respond =>
    new Release(
      `Respond.query(${ref.query})`,
      Option.some(queryKey(ref.identity)),
      Option.fromUndefinedOr(options.fail),
    ),
  /**
   * Answers the oldest held read batch that asks for this row. A batch is
   * answered whole, other rows included, as the server answers it.
   */
  read: (
    entity: EntityLike,
    id: string,
    options: {
      readonly fail?: RemoteReadError | RemoteProtocolError | RemoteUnauthenticated
    } = {},
  ): Respond =>
    new Release(
      `Respond.read(${entity.name}, ${id})`,
      Option.some(readKey(entity.name, id)),
      Option.fromUndefinedOr(options.fail),
    ),
  /** Answers the oldest held request of this mutation. */
  mutation: (
    mutation: MutationDescriptor<string, any, any>,
    options: {
      readonly fail?:
        | RemoteMutationError
        | RemoteForbidden
        | RemoteUnauthenticated
        | RemoteUnreachable
    } = {},
  ): Respond =>
    new Release(
      `Respond.mutation(${mutation.name})`,
      Option.some(mutationKey(mutation.name)),
      Option.fromUndefinedOr(options.fail),
    ),
  /**
   * Answers every held request, then every request those answers lead to,
   * until none is held: none at all, when nothing is.
   */
  all: new Release('Respond.all', Option.none(), Option.none()),
}

/** One Message the application handled, and the Model it left. */
export interface TraceEntry<AppModel, Message> {
  /** The step it followed: 0 while the Subscriptions start, 1 for the first step. */
  readonly step: number
  readonly message: Message
  readonly model: AppModel
  /** The Commands its `update` returned that the trace did not run: every one but Remote's. */
  readonly skipped: ReadonlyArray<string>
}

/** What `Trace.run` recorded. */
export interface Trace<AppModel, Message> {
  readonly start: AppModel
  /** Every Message in the order `update` handled it, with the Model after it. */
  readonly entries: ReadonlyArray<TraceEntry<AppModel, Message>>
  /** The requests still held when the steps ran out. */
  readonly pending: ReadonlyArray<string>
  /** `Data.why` of a read at a Model, given the trace's active record. */
  readonly why: (model: AppModel, read: Projection<AppModel, RemoteData<unknown>>) => string
}

/** A read that showed a value, and then did not, though nothing removed the value. */
export interface Regression<Message> {
  /** The read's name, as `regressions` was given it. */
  readonly read: string
  readonly step: number
  /** The Message after which it no longer showed its value. */
  readonly message: Message
  readonly from: Tag
  readonly to: Tag
  /** `Data.why`, for the Model it regressed in. */
  readonly why: string
}

export interface TraceConfig<AppModel, Message> {
  /** The Model the trace starts from; its Subscriptions start at it. */
  readonly start: AppModel
  /**
   * The application's `update`. Remote's Subscriptions send it Remote's
   * Messages, so its union must hold them. Its Commands other than Remote's are
   * not run.
   */
  readonly update: ((
    model: AppModel,
    message: Message,
  ) => Update.Return<AppModel, Message, unknown>) &
    // Said apart, so the application's union is inferred from `update` alone.
    ((model: AppModel, message: RemoteMessage) => unknown)
  /** The active record, as `Data.subscriptions` and `Data.why` take it. */
  readonly active: Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>>
  /** As `Data.subscriptions` takes them; the trace's clock stands still, so it sets `now`. */
  readonly options?: Omit<SubscriptionsOptions, 'now'>
  /**
   * The time the trace's clock stands at, in milliseconds since the epoch:
   * what every Command and Subscription it runs reads (`Remote.now`, an
   * answer's date), and what the answers it asks for are given. Default 0.
   */
  readonly now?: number
  /** What answers each request once a step lets it go on: a fake, or a server's in-process client. */
  readonly client: Client
  /**
   * The application's `Data.outbox`, when it makes durable writes: the trace
   * starts from its `restore` over an empty store of its own, and runs its
   * Subscriptions as one tab does (without Web Locks, and with no other tab
   * to hear), so a durable write is stored and sent by it.
   */
  readonly outbox?: OutboxWiring<AppModel>
  readonly steps: ReadonlyArray<NoInfer<Message> | Respond>
}

/** Subscription entries as the trace drives them: Foldkit's shape, with or without keep-alive. */
interface Entry<AppModel, Message> {
  readonly dependenciesSchema: Schema.Top
  readonly modelToDependencies: (model: AppModel) => unknown
  readonly keepAliveEquivalence?: Equivalence.Equivalence<unknown>
  readonly dependenciesToStream: (
    dependencies: unknown,
    read: () => unknown,
  ) => Stream.Stream<Message, never, RemoteClient | KeyValueStore.KeyValueStore>
}

/** A Command as the trace runs it: one of Remote's needs `RemoteClient` alone. */
type Runnable<Message> = Effect.Effect<Message, never, RemoteClient>

/** Remote's Commands, `Remote.mutate(…)` and `Remote.preload`, are the ones the trace runs. */
const isRemoteCommand = (name: string) => name.startsWith('Remote.')

/** How many Messages one step may cause before the trace calls it a loop. */
const MESSAGES_PER_STEP = 10_000
/** How many requests one `Respond.all` answers before it calls it a loop. */
const ANSWERS = 1_000

/**
 * A scheduler that runs fiber tasks only when told: after each Message, the
 * trace runs every fiber until each waits on a held request.
 */
const makeScheduler = () => {
  const tasks: Array<() => void> = []
  const dispatcher = {
    scheduleTask: (task: () => void) => {
      tasks.push(task)
    },
    flush: () => {
      while (tasks.length > 0) tasks.shift()!()
    },
  }
  return {
    flush: dispatcher.flush,
    scheduler: {
      executionMode: 'sync' as const,
      shouldYield: () => false,
      makeDispatcher: () => dispatcher,
    },
  }
}

/**
 * A clock that stands still at `at`: a wait of no time ends, as the next tick
 * would end it, and every longer one never does, so age-outs, a retention
 * `grace` and live restarts wait for good.
 */
const stopped = (at: number): Clock.Clock => {
  const nanos = BigInt(at) * 1_000_000n
  return {
    currentTimeMillisUnsafe: () => at,
    currentTimeMillis: Effect.succeed(at),
    currentTimeNanosUnsafe: () => nanos,
    currentTimeNanos: Effect.succeed(nanos),
    monotonicTimeNanosUnsafe: () => nanos,
    monotonicTimeNanos: Effect.succeed(nanos),
    sleep: duration => (Duration.isZero(duration) ? Effect.void : Effect.never),
  }
}

const run = async <AppModel, Message>(
  Data: RemoteDomain<AppModel, any, any, any, any>,
  config: TraceConfig<AppModel, Message>,
): Promise<Trace<AppModel, Message>> => {
  const { scheduler, flush } = makeScheduler()
  const at = config.now ?? 0
  const clock = stopped(at)
  const held: Array<Held> = []
  const queue: Array<Message> = []
  const entries: Array<TraceEntry<AppModel, Message>> = []
  const defects: Array<Cause.Cause<unknown>> = []
  const fibers = new Set<Fiber.Fiber<unknown, unknown>>()
  // One tab's own store: an outbox restores from it and writes to it.
  const store = Effect.runSync(
    Effect.gen(function* () {
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
  let model =
    config.outbox === undefined
      ? config.start
      : Effect.runSync(
          config.outbox
            .restore(config.start)
            .pipe(Effect.provideService(KeyValueStore.KeyValueStore, store)),
        )
  let step = 0

  const hold = <A, E>(
    keys: ReadonlyArray<string>,
    description: string,
    ask: (client: Client) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E> =>
    Effect.callback<A, E>(resume => {
      const request: Held = {
        keys: new Set(keys),
        description,
        ask,
        // The answer is the one `ask` gave for this very request.
        resume: exit => resume(exit as Exit.Exit<A, E>),
      }
      held.push(request)
      // A restarted stream abandons its request: its answer reaches no one.
      return Effect.sync(() => {
        const at = held.indexOf(request)
        if (at >= 0) held.splice(at, 1)
      })
    })

  const client: Client = {
    read: batch =>
      hold(
        batch.requests.map(request => readKey(request.entity, request.id)),
        `read ${batch.requests.map(request => `${request.entity}:${request.id}`).join(', ')}`,
        answer => answer.read(batch),
      ),
    query: request =>
      hold(
        [queryKey(`${request.query}${IDENTITY_SEPARATOR}${stableStringify(request.input)}`)],
        `query ${request.query} ${stableStringify(request.input)}`,
        answer => answer.query(request),
      ),
    mutate: request =>
      hold([mutationKey(request.mutation)], `mutation ${request.mutation}`, answer =>
        answer.mutate(request),
      ),
    // A live stream is never answered: its events are scripted as Messages.
    live: () => Stream.never,
  }

  const fork = (effect: Effect.Effect<void, never, RemoteClient | KeyValueStore.KeyValueStore>) => {
    const fiber = Effect.runFork(
      effect.pipe(
        Effect.provideService(RemoteClient, client),
        Effect.provideService(KeyValueStore.KeyValueStore, store),
        Effect.provideService(OutboxLocks, Option.none()),
        Effect.provideService(Clock.Clock, clock),
      ),
      { scheduler },
    )
    fibers.add(fiber)
    fiber.addObserver(exit => {
      fibers.delete(fiber)
      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) defects.push(exit.cause)
    })
    return fiber
  }

  /** Runs every fiber until each waits, and fails loudly on a defect, as the runtime crashes on one. */
  const settle = () => {
    flush()
    const defect = defects.shift()
    if (defect !== undefined) {
      throw new Error(
        `Trace: a Subscription or Command died at step ${step}\n${Cause.pretty(defect)}`,
      )
    }
  }

  const send = (message: Message) => Effect.sync(() => void queue.push(message))

  // The entries send Remote's Messages, which `update`'s type makes the application's own.
  const subscriptions = [
    ...Object.entries(Data.subscriptions(config.active, { ...config.options, now: () => at })),
    // A trace is one tab: there is no other to hear over the channel.
    ...Object.entries(config.outbox?.subscriptions ?? {}).filter(([key]) => key !== 'outbox.watch'),
  ] as unknown as ReadonlyArray<[string, Entry<AppModel, Message>]>
  const running = new Map<
    string,
    { readonly dependencies: unknown; readonly fiber: Fiber.Fiber<unknown, unknown> }
  >()
  const latest = new Map<string, unknown>()
  const equivalences = new Map(
    subscriptions.map(([key, entry]) => [
      key,
      entry.keepAliveEquivalence ?? Schema.toEquivalence(entry.dependenciesSchema),
    ]),
  )

  /** Restarts each entry whose dependencies changed, as Foldkit's runtime does (`switchMap`). */
  const reconcile = () => {
    for (const [key, entry] of subscriptions) {
      const dependencies = entry.modelToDependencies(model)
      latest.set(key, dependencies)
      const current = running.get(key)
      if (current !== undefined && equivalences.get(key)!(current.dependencies, dependencies)) {
        continue
      }
      current?.fiber.interruptUnsafe()
      const stream = entry.dependenciesToStream(dependencies, () => latest.get(key))
      running.set(key, {
        dependencies,
        fiber: fork(Stream.runForEach(stream, send)),
      })
    }
    settle()
  }

  const handle = (message: Message) => {
    const result = config.update(model, message)
    model = result.model
    const skipped: Array<string> = []
    for (const command of result.commands ?? []) {
      if (isRemoteCommand(command.name)) {
        fork(Effect.flatMap(command.effect as Runnable<Message>, send))
      } else {
        skipped.push(command.name)
      }
    }
    entries.push({ step, message, model, skipped })
    reconcile()
  }

  const drain = () => {
    let handled = 0
    while (queue.length > 0) {
      if (++handled > MESSAGES_PER_STEP) {
        throw new Error(`Trace: step ${step} caused more than ${MESSAGES_PER_STEP} Messages`)
      }
      handle(queue.shift()!)
    }
  }

  const answer = async (request: Held, fail: Option.Option<unknown>) => {
    held.splice(held.indexOf(request), 1)
    const exit = await Effect.runPromiseExit(
      Option.match(fail, {
        onNone: () => request.ask(config.client),
        onSome: error => Effect.fail(error),
      }).pipe(Effect.provideService(Clock.Clock, clock)),
    )
    request.resume(exit)
    settle()
    drain()
  }

  const describeHeld = () =>
    held.length === 0 ? 'none' : held.map(request => request.description).join('; ')

  const answerOne = async (key: string, respond: Release) => {
    const found = held.find(request => request.keys.has(key))
    if (found === undefined) {
      throw new Error(
        `Trace: step ${step}, ${respond.label}, answers nothing: no such request is held. Held: ${describeHeld()}`,
      )
    }
    await answer(found, respond.fail)
  }

  const answerAll = async () => {
    for (let answered = 0; held.length > 0; answered++) {
      if (answered >= ANSWERS) {
        throw new Error(
          `Trace: step ${step}, Respond.all, still holds requests after ${ANSWERS} answers: ${describeHeld()}`,
        )
      }
      await answer(held[0]!, Option.none())
    }
  }

  const release = (respond: Release) =>
    Option.match(respond.key, {
      onNone: answerAll,
      onSome: key => answerOne(key, respond),
    })

  try {
    reconcile()
    drain()
    for (const next of config.steps) {
      step++
      if (next instanceof Release) {
        await release(next)
      } else {
        queue.push(next)
        drain()
      }
    }
    return {
      start: config.start,
      entries,
      pending: held.map(request => request.description),
      why: (at, read) => Data.why(at, read, { surfaces: config.active }).message,
    }
  } finally {
    for (const fiber of [...fibers]) fiber.interruptUnsafe()
    flush()
  }
}

/** The Models of a trace, the start first. */
const models = <AppModel>(trace: Trace<AppModel, unknown>): ReadonlyArray<AppModel> => [
  trace.start,
  ...trace.entries.map(entry => entry.model),
]

const shows = (data: RemoteData<unknown>): boolean =>
  RemoteData.match(data, {
    Initial: () => false,
    Loading: () => false,
    Ready: () => true,
    Refreshing: () => true,
    Failed: () => false,
    NotFound: () => false,
  })

/** Whether a read that showed a value still does, or says why not: failed with it, or found it gone. */
const keeps = (data: RemoteData<unknown>): boolean =>
  RemoteData.match(data, {
    Initial: () => false,
    Loading: () => false,
    Ready: () => true,
    Refreshing: () => true,
    Failed: (_, previous) => Option.isSome(previous),
    NotFound: () => true,
  })

export const Trace = {
  run,
  /**
   * What the read showed across the trace, the start first: each change of
   * tag, so a one-Message blink reads `['Ready', 'Loading', 'Ready']`.
   */
  tags: <AppModel>(
    trace: Trace<AppModel, unknown>,
    read: Projection<AppModel, RemoteData<unknown>>,
  ): ReadonlyArray<Tag> =>
    models(trace).reduce<Array<Tag>>((tags, model) => {
      const tag = read.read(model)._tag
      if (tags.at(-1) !== tag) tags.push(tag)
      return tags
    }, []),
  /**
   * Every time a read that showed a value (`Ready`, `Refreshing`) stopped
   * showing it without a reason a reader can see: it read `Loading` or
   * `Initial`, or `Failed` without the value (#234). `NotFound` is a reason:
   * the server said the row is gone.
   */
  regressions: <AppModel, Message>(
    trace: Trace<AppModel, Message>,
    reads: Readonly<Record<string, Projection<AppModel, RemoteData<unknown>>>>,
  ): ReadonlyArray<Regression<Message>> =>
    trace.entries.flatMap((entry, at) => {
      const before = at === 0 ? trace.start : trace.entries[at - 1]!.model
      return Object.entries(reads).flatMap(([name, read]) => {
        const from = read.read(before)
        const to = read.read(entry.model)
        return shows(from) && !keeps(to)
          ? [
              {
                read: name,
                step: entry.step,
                message: entry.message,
                from: from._tag,
                to: to._tag,
                why: trace.why(entry.model, read),
              },
            ]
          : []
      })
    }),
}

export { Law, type LawConfig, type LawPart, type LawReport } from './law.js'
