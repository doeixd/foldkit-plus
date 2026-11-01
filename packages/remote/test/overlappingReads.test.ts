/**
 * Two Surfaces whose reads overlap settle once answered (#399). Foldkit
 * restarts a Subscription on a fiber of its own, so a restart planned from
 * one Model sends its `ReadStarted` and `RefreshStarted` after Messages that
 * were already queued, an answer to the very rows it plans among them. A
 * `RefreshStarted` that marked such a row stale again made the other read
 * plan it, whose own restart did the same: domains-plus's Top Results and
 * visible rows took turns for good once the visible set shrank mid-read.
 *
 * The driver below runs the real read entries as Foldkit does, with one
 * difference made explicit: `reconcile` (the Subscription fiber catching up
 * with a Model) is a step of its own, so a test can queue answers before it.
 */
import { Cause, Effect, Exit, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity as RemoteEntity,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemotePolicy,
  ReadBatch,
  ReadBatchResult,
  Selection,
  type ReadDependencies,
  RemoteReadError,
  type RemoteMessage,
} from '../src/index.js'

const Domain = Entity.define('Domain', Schema.Struct({ id: Schema.String, price: Schema.Number }))
const Model = Schema.Struct({ remote: Remote.Model, visible: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Domain] })

const Quote = Entity.select(Domain, { price: true })
const readsOf = (names: ReadonlyArray<string>) =>
  Object.fromEntries(names.map(name => [name, Data.get(Quote, name)]))
const names = Array.from({ length: 10 }, (_, index) => `n${index}`)
/** The first four names, read on their own, as domains-plus's Top Results. */
const top = names.slice(0, 4)
const Top = App.surface('Top', { model: () => readsOf(top) })
/** The rows in view, the top ones among them. */
const Visible = App.surface('Visible', {
  params: { names: Schema.Array(Schema.String) },
  model: ({ params }) => readsOf(params.names),
})
const active = {
  top: Surface.at(Top, undefined),
  visible: Surface.at(Visible, (model: Model) => Option.some({ names: model.visible })),
}

/** The two read entries; retention and live streams have nothing to do with the loop. */
const readEntries = (policy: RemotePolicy) => {
  const subscriptions = Data.subscriptions(active, { policy, now: () => 1_000 })
  return [
    ['top', subscriptions['top.read']],
    ['visible', subscriptions['visible.read']],
  ] as const
}

/** A scheduler that runs fiber tasks when told, so every step is deterministic. */
const makeScheduler = () => {
  const tasks: Array<() => void> = []
  const dispatcher = {
    scheduleTask: (task: () => void) => void tasks.push(task),
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

type Batch = typeof ReadBatch.Type
type Answer = typeof ReadBatchResult.Type

interface Held {
  readonly batch: Batch
  readonly resume: (exit: Exit.Exit<Answer, RemoteReadError>) => void
}

const answerOf = (batch: Batch): Answer => ({
  settled: [],
  entities: batch.requests.map(request => ({
    entity: request.entity,
    id: request.id,
    values: { price: 1 },
  })),
})

/** The read entries over `start`, with every read held until a step answers it. */
const drive = (start: Model, policy: RemotePolicy) => {
  const { scheduler, flush } = makeScheduler()
  const entries = readEntries(policy)
  const held: Array<Held> = []
  const queue: Array<RemoteMessage> = []
  const handled: Array<RemoteMessage> = []
  const defects: Array<Cause.Cause<unknown>> = []
  const running = new Map<string, { dependencies: ReadDependencies; fiber: Fiber.Fiber<void> }>()
  let model = start

  const client: RemoteClient['Service'] = {
    read: batch =>
      Effect.callback<Answer, RemoteReadError>(resume => {
        const request: Held = { batch, resume }
        held.push(request)
        return Effect.sync(() => {
          const at = held.indexOf(request)
          if (at >= 0) held.splice(at, 1)
        })
      }),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.never,
  }

  const settle = () => {
    flush()
    const defect = defects.shift()
    if (defect !== undefined) throw new Error(Cause.pretty(defect))
  }

  /** The Subscription fibers catch up with the Model: each entry whose dependencies changed restarts. */
  const reconcile = () => {
    for (const [key, entry] of entries) {
      const dependencies = entry.modelToDependencies(model)
      const current = running.get(key)
      if (
        current !== undefined &&
        Schema.toEquivalence(entry.dependenciesSchema)(current.dependencies, dependencies)
      )
        continue
      current?.fiber.interruptUnsafe()
      const fiber = Effect.runFork(
        Stream.runForEach(entry.dependenciesToStream(dependencies), message =>
          Effect.sync(() => void queue.push(message)),
        ).pipe(Effect.provideService(RemoteClient, client)),
        { scheduler },
      )
      fiber.addObserver(exit => {
        if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) defects.push(exit.cause)
      })
      running.set(key, { dependencies, fiber })
    }
    settle()
  }

  /** Reduces the next queued Message, the Subscriptions catching up after it, as the runtime does. */
  const handleNext = () => {
    const message = queue.shift()!
    handled.push(message)
    model = Data.reduce(model, message)
    reconcile()
  }

  /** Settles the held read asking for `id` with `exit`; its Message is queued, not reduced. */
  const settleRead = (id: string, exit: (batch: Batch) => Exit.Exit<Answer, RemoteReadError>) => {
    const request = held.find(({ batch }) => batch.requests.some(r => r.id === id))
    if (request === undefined) throw new Error(`no read of ${id} is held`)
    held.splice(held.indexOf(request), 1)
    request.resume(exit(request.batch))
    settle()
  }
  const answer = (id: string) => settleRead(id, batch => Exit.succeed(answerOf(batch)))

  return {
    model: () => model,
    held: () => held.map(({ batch }) => batch.requests.map(request => request.id)),
    handled,
    /** Sets the visible names without the Subscriptions seeing it yet. */
    show: (visible: ReadonlyArray<string>) => {
      model = { ...model, visible }
    },
    answer,
    /** Fails the held read asking for `id`; its `ReadFailed` is queued, not reduced. */
    fail: (id: string) => settleRead(id, () => Exit.fail(new RemoteReadError({ message: 'down' }))),
    reconcile,
    /** Reduces every queued Message, answering nothing. */
    drain: () => {
      while (queue.length > 0) handleNext()
    },
    /**
     * A server that answers each read as soon as it is sent: before every
     * Message, each held read's answer is queued behind what is queued
     * already. Stops when nothing is queued or held, or after `limit` Messages.
     */
    serve: (limit: number) => {
      while (handled.length < limit && (queue.length > 0 || held.length > 0)) {
        for (const { batch } of [...held]) answer(batch.requests[0]!.id)
        handleNext()
      }
    },
  }
}

const start: Model = { remote: Remote.initial, visible: names }

describe('two overlapping reads', () => {
  for (const policy of [
    RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 }),
    RemotePolicy.cacheFirst,
  ]) {
    for (const first of ['top', 'visible'] as const) {
      it(`settle under ${policy._tag} when the visible set shrinks mid-read, ${first}'s answer first`, () => {
        const driver = drive(start, policy)
        driver.reconcile()
        driver.drain()
        expect(driver.held()).toEqual([top, names])

        // The visible set shrinks while both reads are in flight, and both
        // answers are queued before the read entry's restart sends its own.
        driver.show(names.slice(0, 6))
        const order = first === 'top' ? ['n0', 'n9'] : ['n9', 'n0']
        for (const id of order) driver.answer(id)
        driver.reconcile()
        driver.drain()

        // The rows the restart still lacks are read once more, and then
        // nothing is: before the fix, each restart's mark undid an answer
        // queued before it, and the reads took turns for good.
        driver.serve(200)
        expect(driver.held()).toEqual([])
        // Four starts, four answers, then the one restart and its answer: the loop ran to the limit.
        expect(driver.handled.length).toBeLessThanOrEqual(8)
        const model = driver.model()
        for (const name of names.slice(0, 6))
          expect(Data.get(Quote, name).read(model)).toEqual({
            _tag: 'Ready',
            value: { price: 1 },
          })
      })
    }
  }
})

describe('two overlapping reads that fail', () => {
  for (const policy of [
    RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 }),
    RemotePolicy.cacheFirst,
  ]) {
    it(`end Failed under ${policy._tag} when a restart lands behind the second failure`, () => {
      const driver = drive(start, policy)
      driver.reconcile()
      driver.drain()
      expect(driver.held()).toEqual([top, names])

      // Both fail. The visible entry restarts on the top read's failure,
      // planning the names its own failure, queued already, is about to fail:
      // its `ReadStarted` lands after that failure. Dropping those names as
      // failed then interrupted the restart's read, and they read Loading for
      // good (domains-plus's search sat at "Checking" with no Try again).
      driver.fail('n0')
      driver.fail('n9')
      driver.drain()
      // A server down for good: every read sent from here fails too.
      for (let round = 0; round < 10 && driver.held().length > 0; round++) {
        for (const [id] of driver.held()) driver.fail(id!)
        driver.drain()
      }

      expect(driver.held()).toEqual([])
      const model = driver.model()
      for (const name of names)
        expect(Data.get(Quote, name).read(model)).toEqual({
          _tag: 'Failed',
          error: { _tag: 'RemoteReadError', message: 'down' },
        })
    })
  }
})

describe('a read entry under staleWhileRevalidate', () => {
  const entry = Data.subscriptions(active, {
    policy: RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 }),
    now: () => 100_000,
  })['top.read']
  const requests = top.map(id => ({ entity: 'Domain', id, fields: ['price'] }))
  /** The top names read at `updatedAt`. */
  const heldAt = (updatedAt: number): Model =>
    Data.reduce(start, {
      _tag: 'ReadReceived',
      requests,
      result: answerOf({ version: REMOTE_PROTOCOL_VERSION, requests }),
      now: updatedAt,
    })

  it('marks what aged out, which reads Refreshing, and is not restarted by its own mark', async () => {
    const aged = heldAt(1_000)
    const dependencies = entry.modelToDependencies(aged)
    const prefix = await Effect.runPromise(
      Stream.runCollect(Stream.take(entry.dependenciesToStream(dependencies), 2)).pipe(
        Effect.provideService(RemoteClient, {
          read: () => Effect.never,
          query: () => Effect.die('unused'),
          mutate: () => Effect.die('unused'),
          live: () => Stream.never,
        }),
      ),
    )
    expect(prefix.map(message => message._tag)).toEqual(['ReadStarted', 'RefreshStarted'])
    const marked = prefix.reduce(Data.reduce, aged)
    expect(Data.get(Quote, 'n0').read(marked)).toEqual({
      _tag: 'Refreshing',
      value: { price: 1 },
    })
    expect(entry.modelToDependencies(marked)).toEqual(dependencies)
  })

  it('marks nothing it plans because it is stale already', () => {
    const marked = Data.reduce(heldAt(99_000), {
      _tag: 'RefreshStarted',
      requests: [{ entity: 'Domain', id: 'n0', fields: ['price'] }],
    })
    expect(entry.modelToDependencies(marked)).toMatchObject({
      requirements: [{ entity: 'Domain', id: 'n0', fields: ['price'] }],
      refreshes: [],
    })
  })
})

describe('a read of a page under another window', () => {
  const Comment = RemoteEntity.make(
    'Comment',
    Schema.Struct({ id: Schema.String, body: Schema.String }),
  )
  const Project = RemoteEntity.make(
    'Project',
    Schema.Struct({ id: Schema.String, comments: RemoteEntity.refPage(Comment) }),
  )
  const Paged = Remote.make({ model: App.model.remote, entities: [Comment, Project] })
  const firstOf = (first: number) =>
    Paged.get(
      Selection.make(Project, {
        comments: Selection.connection(Comment, { first }, Selection.make(Comment, { body: true })),
      }),
      'p1',
    )
  const Page = App.surface('Page', { model: () => ({ project: firstOf(5) }) })
  const page = { refs: [], hasNext: false, hasPrevious: false }
  const held = Paged.reduce(start, {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Project', id: 'p1', fields: ['comments'], windows: { comments: { first: 2 } } },
    ],
    result: {
      settled: [],
      entities: [{ entity: 'Project', id: 'p1', values: { comments: page } }],
    },
    now: 1_000,
  })
  const readOf = (policy: RemotePolicy) =>
    Paged.subscriptions({ page: Page }, { policy, now: () => 1_000 })['page.read']

  it('marks it under a refreshing policy, and not under cacheFirst', () => {
    const asked = [
      { entity: 'Project', id: 'p1', fields: ['comments'], windows: { comments: { first: 5 } } },
    ]
    expect(
      readOf(RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 })).modelToDependencies(held),
    ).toMatchObject({ requirements: asked, refreshes: asked })
    expect(readOf(RemotePolicy.cacheFirst).modelToDependencies(held)).toMatchObject({
      requirements: asked,
      refreshes: [],
    })
  })
})
