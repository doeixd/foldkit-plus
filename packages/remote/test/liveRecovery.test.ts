/**
 * A live stream that breaks, by an error or by an event ahead of its cursor,
 * restarts on its own: after a backoff it resubscribes from its cursor and
 * refetches what it covers, since no server replays what a stream missed.
 */
import { Duration, Effect, Fiber, Layer, Match, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  RemoteClient,
  RemoteLiveError,
  Selection,
  type LiveEvent,
  type RemoteMessage,
} from '../src/index.js'

const Project = Entity.make('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const summary = Selection.make(Project, { id: true, name: true })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })

const Watched = Data.active('Watched', () => Option.some(Data.live(summary, 'p1')))
const Fetched = Data.active('Fetched', () => Option.some(Data.get(summary, 'p1')))
const entries = Data.subscriptions({ watched: Watched }, { retryBase: 0 })
const read = entries['watched.read']
const live = entries['watched.live']
const same = Schema.toEquivalence(live.dependenciesSchema)

const initial: Model = { remote: Remote.initial }

const patched = (name: string, cursor: number): LiveEvent => ({
  _tag: 'EntityPatched',
  ref: { entity: 'Project', id: 'p1' },
  values: { name },
  changed: ['name'],
  cursor,
})

/** A server holding one project, whose live calls answer from `streams` in turn. */
const serverWith = (streams: ReadonlyArray<Stream.Stream<LiveEvent, RemoteLiveError>>) => {
  const server = { name: 'Apollo', asked: [] as Array<number> }
  const layer = Layer.succeed(RemoteClient, {
    read: batch =>
      Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { id: request.id, name: server.name },
        })),
      }),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: ({ after }) => {
      server.asked.push(after)
      return streams[server.asked.length - 1] ?? Stream.never
    },
  })
  return { server, layer }
}

/** One run of an entry for the Model's dependencies, every Message it emits reduced in. */
const step = async <D>(
  layer: Layer.Layer<RemoteClient>,
  entry: {
    readonly modelToDependencies: (model: Model) => D
    readonly dependenciesToStream: (
      dependencies: D,
      readDependencies: () => D,
    ) => Stream.Stream<RemoteMessage, never, RemoteClient>
  },
  model: Model,
): Promise<Model> => {
  const dependencies = entry.modelToDependencies(model)
  const messages = await Effect.runPromise(
    Stream.runCollect(entry.dependenciesToStream(dependencies, () => dependencies)).pipe(
      Effect.provide(layer),
    ),
  )
  return [...messages].reduce(Data.reduce, model)
}

const shown = (model: Model) => {
  const value = Data.get(summary, 'p1').read(model)
  return value._tag === 'Ready' || value._tag === 'Refreshing' ? value.value.name : value._tag
}

/** A live entry's stream key, as Remote derives it from the requirements. */
const keyOf = (
  requirements: ReadonlyArray<{ entity: string; id: string; fields: ReadonlyArray<string> }>,
) =>
  requirements
    .map(
      requirement =>
        `${requirement.entity}:${requirement.id}:${[...requirement.fields].sort().join(',')}`,
    )
    .sort()
    .join('|')

describe('a live stream that breaks', () => {
  it('reconnects, resuming from its cursor, and shows a write made while it was down', async () => {
    const { server, layer } = serverWith([
      Stream.make(patched('Apollo II', 1)).pipe(
        Stream.concat(Stream.fail(new RemoteLiveError({ message: 'dropped' }))),
      ),
      Stream.empty,
    ])
    const loaded = await step(layer, read, initial)
    const dropped = await step(layer, live, loaded)
    expect(shown(dropped)).toBe('Apollo II')
    expect(Data.liveStatus(dropped, Watched)).toEqual({
      _tag: 'Reconnecting',
      attempt: 1,
      error: Option.some({ _tag: 'RemoteLiveError', message: 'dropped' }),
    })
    // The break is what restarts the entry.
    expect(same(live.modelToDependencies(loaded), live.modelToDependencies(dropped))).toBe(false)

    server.name = 'Gemini'
    const reconnected = await step(layer, live, dropped)
    expect(server.asked).toEqual([0, 1])
    expect(Data.liveStatus(reconnected, Watched)).toEqual({ _tag: 'Live' })
    expect(Data.get(summary, 'p1').read(reconnected)._tag).toBe('Refreshing')
    expect(shown(await step(layer, read, reconnected))).toBe('Gemini')
  })

  it('breaks again when the resubscribe itself fails, so it keeps retrying', async () => {
    const down = Stream.fail(new RemoteLiveError({ message: 'still down' }))
    const { server, layer } = serverWith([down, down])
    const once = await step(layer, live, initial)
    const twice = await step(layer, live, once)
    expect(server.asked).toEqual([0, 0])
    expect(Data.liveStatus(twice, Watched)).toMatchObject({ _tag: 'Reconnecting', attempt: 2 })
    expect(same(live.modelToDependencies(once), live.modelToDependencies(twice))).toBe(false)
  })

  it('restarts once for a gap, however many events the dying stream still delivers', () => {
    const stream = keyOf(live.modelToDependencies(initial).requirements)
    const receive = (model: Model, cursor: number) =>
      Data.reduce(model, {
        _tag: 'LiveReceived',
        stream,
        event: patched(`at ${cursor}`, cursor),
        now: 0,
      })
    const broken = [1, 3, 5, 2].reduce(receive, initial)
    expect(broken.remote.streams[stream]).toEqual({
      restarts: 1,
      failures: 1,
      error: Option.none(),
    })
    expect(Data.liveStatus(broken, Watched)).toEqual({
      _tag: 'Reconnecting',
      attempt: 1,
      error: Option.none(),
    })
  })

  it('backs off from the start again once an event applies, without restarting for it', () => {
    const stream = keyOf(live.modelToDependencies(initial).requirements)
    const fail = (model: Model) =>
      Data.reduce(
        Data.reduce(model, {
          _tag: 'ReadFailed',
          requests: [],
          error: { _tag: 'RemoteLiveError', message: 'dropped' },
          stream,
        }),
        { _tag: 'GapCleared', stream },
      )
    const twice = fail(fail(initial))
    expect(twice.remote.streams[stream]).toMatchObject({ restarts: 2, failures: 2 })
    const working = Data.reduce(twice, {
      _tag: 'LiveReceived',
      stream,
      event: patched('Apollo', 1),
      now: 0,
    })
    expect(working.remote.streams[stream]).toEqual({
      restarts: 2,
      failures: 0,
      error: Option.none(),
    })
    expect(same(live.modelToDependencies(twice), live.modelToDependencies(working))).toBe(true)
    expect(fail(working).remote.streams[stream]).toMatchObject({ restarts: 3, failures: 1 })
    // A list's event works the same as a row's.
    const listed = Data.reduce(twice, {
      _tag: 'LiveReceived',
      stream,
      event: {
        _tag: 'ConnectionInvalidate',
        connection: 'Projects',
        cursor: 1,
      },
      now: 0,
    })
    expect(listed.remote.streams[stream]).toMatchObject({ restarts: 2, failures: 0 })
  })

  it('waits longer for each break in a row, up to the longest delay', async () => {
    const slow = Data.subscriptions(
      { watched: Watched },
      { retryBase: '100 millis', maxRetryDelay: '1 second' },
    )['watched.live']
    const base = live.modelToDependencies(initial)
    const subscribedBy = (failures: number, wait: Duration.Input) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const { server, layer } = serverWith([])
          const dependencies = { ...base, restarts: failures, failures }
          const fiber = yield* Stream.runDrain(slow.dependenciesToStream(dependencies)).pipe(
            Effect.provide(layer),
            Effect.forkChild,
          )
          for (let i = 0; i < 100; i++) yield* Effect.yieldNow
          yield* TestClock.adjust(wait)
          for (let i = 0; i < 100; i++) yield* Effect.yieldNow
          yield* Fiber.interrupt(fiber)
          return server.asked.length > 0
        }).pipe(Effect.provide(TestClock.layer())),
      )
    // 100 ms ±20% after one break, 400 ms ±20% after three, and never past a second.
    expect(await subscribedBy(1, '79 millis')).toBe(false)
    expect(await subscribedBy(1, '121 millis')).toBe(true)
    expect(await subscribedBy(3, '319 millis')).toBe(false)
    expect(await subscribedBy(3, '481 millis')).toBe(true)
    expect(await subscribedBy(30, '1201 millis')).toBe(true)
  })

  it('is Idle for an entry that reads nothing live, and Live before anything broke', () => {
    expect(Data.liveStatus(initial, Fetched)).toEqual({ _tag: 'Idle' })
    // As the README shows it in a view.
    const label = (model: Model) =>
      Match.value(Data.liveStatus(model, Watched)).pipe(
        Match.tagsExhaustive({
          Idle: () => 'not live',
          Live: () => 'live',
          Reconnecting: ({ attempt }) => `reconnecting (attempt ${attempt})`,
        }),
      )
    expect(label(initial)).toBe('live')
  })

  it('starts over for another principal', () => {
    const stream = keyOf(live.modelToDependencies(initial).requirements)
    const broken = Data.reduce(initial, {
      _tag: 'ReadFailed',
      requests: [],
      error: { _tag: 'RemoteLiveError', message: 'dropped' },
      stream,
    })
    const forgotten = Data.forget(broken)
    expect(forgotten.remote.streams).toEqual({})
    expect(Data.liveStatus(forgotten, Watched)).toEqual({ _tag: 'Live' })
  })
})
