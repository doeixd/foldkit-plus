// @vitest-environment jsdom
/**
 * Deadlines as an application sets them (#353): per call on `Data.mutate` and
 * on a read entry, and a durable write that runs out, which the outbox sends
 * again under the same operation id.
 */
import { type Duration, Effect, Fiber, Layer, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Entity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Mutation,
  Remote,
  RemoteClient,
  isRemoteMessage,
  terminal,
  type RemoteMessage,
} from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const SetCount = Mutation.write(
  'SetCount',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number })), {
    id: 'id',
  }),
)
const Model = Schema.Struct({ remote: Remote.Model, actor: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Pressed: {} })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [SetCount] })
const Counted = Entity.select(Item, { count: true })
const initial: Model = { remote: Remote.initial, actor: 'ada' }

/** A client that never answers, and what was asked of it. */
const silent = () => {
  const asked: string[] = []
  const layer = Layer.succeed(RemoteClient, {
    read: () => Effect.sync(() => void asked.push('read')).pipe(Effect.andThen(Effect.never)),
    query: () => Effect.never,
    mutate: () => Effect.sync(() => void asked.push('mutate')).pipe(Effect.andThen(Effect.never)),
    live: () => Stream.empty,
  })
  return { asked, layer }
}

/** Runs `effect` over `layer` under the test clock, moving it by `by` once the call is asked. */
const after = <A>(
  effect: Effect.Effect<A, never, RemoteClient>,
  layer: Layer.Layer<RemoteClient>,
  asked: ReadonlyArray<string>,
  by: Duration.Input,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(effect)
      for (let turn = 0; turn < 100 && asked.length === 0; turn++) yield* Effect.yieldNow
      yield* TestClock.adjust(by)
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(layer), Effect.provide(TestClock.layer())),
  )

describe('a deadline per call', () => {
  it('Data.mutate’s timeout fails that send as unreachable, before the client’s', async () => {
    const client = silent()
    const started = Data.mutate(initial, SetCount, { id: 'i1', count: 2 }, { timeout: '1 second' })
    const settled = await after(
      started.command.effect,
      Remote.coalesced(client.layer, { timeout: '1 minute' }),
      client.asked,
      '1 second',
    )
    expect(settled).toMatchObject({
      _tag: 'MutationFailed',
      error: { _tag: 'Unreachable', message: 'No answer within 1s' },
    })
  })

  it('a durable write takes no timeout of its own: the outbox sends it under the client’s', () => {
    expect(() =>
      Data.mutate(
        initial,
        SetCount,
        { id: 'i1', count: 2 },
        { durable: true, timeout: '1 second' },
      ),
    ).toThrow(/under the client's timeout/)
  })

  it('a read entry’s timeout fails its reads, before the client’s', async () => {
    const client = silent()
    const read = Remote.observe(
      Data,
      App.surface('One', { model: () => ({ item: Data.get(Counted, 'i1') }) }),
      undefined,
      undefined,
      { timeout: '1 second' },
    )
    const messages = Stream.runCollect(read.dependenciesToStream(read.modelToDependencies(initial)))
    const emitted: ReadonlyArray<RemoteMessage> = await after(
      messages,
      Remote.coalesced(client.layer, { timeout: '1 minute' }),
      client.asked,
      '1 second',
    )
    expect(emitted.at(-1)).toMatchObject({
      _tag: 'ReadFailed',
      error: { message: 'No answer within 1s' },
    })
  })
})

describe('a durable write that runs out', () => {
  it('is sent again under the same operation id, and settles when answered', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const outbox = Data.outbox({
      key: model => `outbox:${model.actor}`,
      scope: model => model.actor,
      retry: { base: '20 millis', max: '40 millis' },
    })
    const sent: Array<string | undefined> = []
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.succeed({ settled: [], entities: [] }),
      query: () => Effect.succeed({ edges: [], start: terminal, end: terminal }),
      // The first send is never answered; the second is.
      mutate: request =>
        Effect.suspend(() => {
          sent.push(request.operation)
          return sent.length === 1
            ? Effect.never
            : Effect.succeed({ output: {}, entities: [], connections: [], deleted: [] })
        }),
      live: () => Stream.empty,
    })
    const kv = Effect.runSync(
      Effect.gen(function* () {
        return yield* KeyValueStore.KeyValueStore
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    const update = (
      model: Model,
      message: Message,
    ): Update.Return<Model, Message, RemoteClient> => {
      if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
      const started = Data.mutate(model, SetCount, { id: 'i1', count: 2 }, { durable: true })
      return { model: started.model, commands: [started.command] }
    }
    const view = (model: Model, h: HtmlBuilder<Message>) =>
      h.main(
        [],
        [
          h.p([h.Id('waiting')], [String(Data.outboxStatus(model).waiting)]),
          h.button([h.Id('press'), h.OnClick(Message.Pressed())], ['Set']),
        ],
      )
    const container = document.createElement('div')
    container.id = 'deadline-page'
    document.body.appendChild(container)
    const page = Runtime.embed(
      Runtime.makeElement({
        Model,
        Flags: Model,
        flags: outbox.restore(initial),
        init: (model: Model) => ({ model }),
        update,
        view,
        subscriptions: outbox.subscriptions!,
        container,
        resources: Layer.merge(
          Remote.coalesced(client, { timeout: '50 millis' }),
          Layer.succeed(KeyValueStore.KeyValueStore, kv),
        ),
      }),
    )
    try {
      await vi.waitFor(() => expect(document.getElementById('press')).not.toBeNull())
      ;(document.getElementById('press') as HTMLElement).click()
      await vi.waitFor(() => expect(sent).toHaveLength(2))
      await vi.waitFor(() => expect(document.getElementById('waiting')?.textContent).toBe('0'))
      expect(sent[1]).toBe(sent[0])
      expect(sent[0]).toEqual(expect.any(String))
    } finally {
      page.dispose()
    }
  })
})
