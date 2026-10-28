/**
 * A failed write is kept in the ledger with what it wrote (#260): listed by
 * `Data.failedWrites`, sent again as itself by `Data.retry`, forgotten by
 * `Data.dismiss`, and heard by the application's own update through the
 * wiring's `shared`.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Surface } from 'foldkit-surface'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Entity,
  Mutation,
  Remote,
  RemoteClient,
  RemoteMutationError,
  type FailedWrite,
  type RemoteMessage,
} from '../src/index.js'

const Post = Entity.make('Post', Schema.Struct({ id: Schema.String, text: Schema.String }))
const TooLong = Schema.TaggedStruct('TooLong', { limit: Schema.Number })
const CreatePost = Mutation.make('CreatePost', {
  Input: { id: Schema.String, text: Schema.String },
  Output: { id: Schema.String },
  Refusal: TooLong,
})
const Like = Mutation.make('Like', { Input: { post: Schema.String }, Output: {} })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Heard: { requestId: Schema.String } })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post],
  mutations: [CreatePost, Like],
})
const initial: Model = { remote: Remote.initial }

/** What a client is asked to answer next: an answer, or a failure. */
type Outcome = 'ok' | 'down' | 'refused'

/** A client answering each write as `outcomes` says, in order, recording what it was sent. */
const client = (...outcomes: ReadonlyArray<Outcome>) => {
  const sent: Array<{
    readonly requestId: string
    readonly operation?: string | undefined
    readonly keys?: ReadonlyArray<string> | undefined
    readonly now?: number | undefined
  }> = []
  const layer = Layer.succeed(RemoteClient, {
    read: () => Effect.die('no reads'),
    query: () => Effect.die('no queries'),
    mutate: request =>
      Effect.suspend(() => {
        const outcome = outcomes[sent.length]
        sent.push(request)
        if (outcome === 'down') return Effect.fail(new RemoteMutationError({ message: 'offline' }))
        if (outcome === 'refused')
          return Effect.fail(
            new RemoteMutationError({
              message: 'too long',
              refusal: { _tag: 'TooLong', limit: 5 },
            }),
          )
        return Effect.succeed({ output: { id: 'p1' }, entities: [] })
      }),
    live: () => Stream.empty,
  })
  return { sent, layer }
}

type Started = ReturnType<typeof Data.mutate>

/** Runs a started write's Command against `layer` and reduces what it answers. */
const settle = async (started: Started, layer: Layer.Layer<RemoteClient>): Promise<Model> =>
  Data.reduce(
    started.model,
    await Effect.runPromise(started.command.effect.pipe(Effect.provide(layer))),
  )

const post = (model: Model, id: string, text: string) =>
  Data.mutate(
    model,
    CreatePost,
    { id, text },
    { optimistic: [Remote.patch(Post, id, { id, text })], keys: ['text'], now: 1_234 },
  )

const shown = (model: Model, id: string) =>
  Data.get(Post.select({ text: true }), id).read(model)._tag

describe('Data.failedWrites', () => {
  it('lists each failed write, oldest first, with its mutation, input and error', async () => {
    const { layer } = client('down', 'refused', 'ok')
    const one = await settle(post(initial, 'p1', 'first'), layer)
    const two = await settle(Data.mutate(one, Like, { post: 'p9' }), layer)
    const three = await settle(post(two, 'p2', 'kept'), layer)

    expect(Data.failedWrites(three)).toEqual([
      {
        requestId: 'remote-1',
        mutation: CreatePost,
        input: { id: 'p1', text: 'first' },
        error: { _tag: 'RemoteMutationError', message: 'offline' },
        refusal: Option.none(),
      },
      {
        requestId: 'remote-2',
        mutation: Like,
        input: { post: 'p9' },
        error: {
          _tag: 'RemoteMutationError',
          message: 'too long',
          refusal: { _tag: 'TooLong', limit: 5 },
        },
        refusal: Option.none(),
      },
    ])
  })

  it('narrows to one mutation, typed by it, with its refusal decoded', async () => {
    const { layer } = client('refused', 'down')
    const model = await settle(
      Data.mutate(await settle(post(initial, 'p1', 'far too long'), layer), Like, { post: 'p1' }),
      layer,
    )

    const posts = Data.failedWrites(model, CreatePost)
    expectTypeOf(posts).toEqualTypeOf<ReadonlyArray<FailedWrite<typeof CreatePost>>>()
    expectTypeOf(posts[0]!.input).toEqualTypeOf<{ readonly id: string; readonly text: string }>()
    expect(posts.map(failed => [failed.input.text, failed.refusal])).toEqual([
      ['far too long', Option.some({ _tag: 'TooLong', limit: 5 })],
    ])
    expect(Data.failedWrites(model, Like).map(failed => failed.input.post)).toEqual(['p1'])
  })

  it('keeps a write in flight while another fails', async () => {
    const { layer } = client('down', 'down')
    const first = post(initial, 'p1', 'first')
    const second = post(first.model, 'p2', 'second')
    const oneFailed = Data.reduce(
      second.model,
      await Effect.runPromise(first.command.effect.pipe(Effect.provide(layer))),
    )
    const bothFailed = await settle({ ...second, model: oneFailed }, layer)
    expect(Data.failedWrites(bothFailed, CreatePost).map(failed => failed.input.text)).toEqual([
      'first',
      'second',
    ])
  })

  it('lists nothing in flight or applied', async () => {
    const { layer } = client('ok')
    const started = post(initial, 'p1', 'hello')
    expect(Data.failedWrites(started.model)).toEqual([])
    expect(Data.failedWrites(await settle(started, layer))).toEqual([])
  })

  it('refuses a mutation the domain does not register', () => {
    const Other = Mutation.make('Other', { Input: {}, Output: {} })
    // @ts-expect-error a mutation is listed only by a domain that registers it
    expect(() => Data.failedWrites(initial, Other)).toThrow(
      'Remote: Mutation "Other" is not registered with domain "remote"',
    )
  })

  it('forgets a failed write when the principal changes', async () => {
    const failed = await settle(post(initial, 'p1', 'first'), client('down').layer)
    expect(Data.failedWrites(Data.forget(failed))).toEqual([])
  })
})

describe('Data.retry', () => {
  it('sends a failed write again as itself, its optimistic change shown again', async () => {
    const { sent, layer } = client('down', 'ok')
    const failed = await settle(post(initial, 'p1', 'first'), layer)
    expect(shown(failed, 'p1')).not.toBe('Ready')

    const retried = Option.getOrThrow(Data.retry(failed, 'remote-1'))
    expect(retried.requestId).toBe('remote-1')
    expect(shown(retried.model, 'p1')).toBe('Ready')
    // In flight again: neither listed nor retried twice.
    expect(Data.failedWrites(retried.model)).toEqual([])
    expect(Data.retry(retried.model, 'remote-1')).toEqual(Option.none())

    const applied = await settle(retried, layer)
    expect(sent.map(request => request.requestId)).toEqual(['remote-1', 'remote-1'])
    expect(sent[1]?.operation).toBe(sent[0]?.operation)
    expect(sent.map(request => request.keys)).toEqual([['text'], ['text']])
    // When the reader acted, not when the retry was pressed.
    expect(sent.map(request => request.now)).toEqual([1_234, 1_234])
    expect(Data.mutation(applied, 'remote-1')).toEqual({ _tag: 'Applied' })
    expect(Data.failedWrites(applied)).toEqual([])
  })

  it('lists a write that fails again once', async () => {
    const { layer } = client('down', 'down')
    const failed = await settle(post(initial, 'p1', 'first'), layer)
    const again = await settle(Option.getOrThrow(Data.retry(failed, 'remote-1')), layer)
    expect(Data.failedWrites(again).map(failed => failed.requestId)).toEqual(['remote-1'])
  })

  it('sends nothing for a write that did not fail', async () => {
    const applied = await settle(post(initial, 'p1', 'first'), client('ok').layer)
    expect(Data.retry(applied, 'remote-1')).toEqual(Option.none())
    expect(Data.retry(applied, 'nobody')).toEqual(Option.none())
  })

  it('lifts its Command through a fold', async () => {
    const fold = Remote.fold(Data, message => ({ _tag: 'Got' as const, message }))
    const failed = await settle(post(initial, 'p1', 'first'), client('down').layer)
    const retried = Option.getOrThrow(fold.retry(failed, 'remote-1'))
    const message = await Effect.runPromise(
      retried.command.effect.pipe(Effect.provide(client('ok').layer)),
    )
    expect(message._tag).toBe('Got')
  })
})

describe('Data.dismiss', () => {
  it('forgets a failed write', async () => {
    const failed = await settle(post(initial, 'p1', 'first'), client('down').layer)
    const dismissed = Data.dismiss(failed, 'remote-1')
    expect(Data.failedWrites(dismissed)).toEqual([])
    expect(Data.mutation(dismissed, 'remote-1')).toEqual({ _tag: 'Unknown' })
    expect(Data.retry(dismissed, 'remote-1')).toEqual(Option.none())
  })

  it('returns the Model for a write that is not failed', async () => {
    const started = post(initial, 'p1', 'first')
    expect(Data.dismiss(started.model, 'remote-1')).toBe(started.model)
    expect(Data.dismiss(initial, 'nobody')).toBe(initial)
  })
})

describe('The wiring’s shared Messages', () => {
  it('reach the application’s own update after Remote has reduced them', async () => {
    const Page = Bundle.parent({ Model, Message })
    const assembly = Page.assemble(Data.wiring({}, { shared: ['MutationFailed'] }))
    const heard: Array<ReadonlyArray<string>> = []
    const update = assembly.update((model, message) => {
      // Only the shared tag reaches here among Remote's: the rest stay claimed.
      expectTypeOf(message._tag).toEqualTypeOf<'Heard' | 'MutationFailed'>()
      if (message._tag === 'MutationFailed')
        heard.push(Data.failedWrites(model).map(failed => failed.requestId))
      return { model }
    })
    const started = post(initial, 'p1', 'first')
    const failure: RemoteMessage = await Effect.runPromise(
      started.command.effect.pipe(Effect.provide(client('down').layer)),
    )
    if (failure._tag !== 'MutationFailed') throw new Error(`answered ${failure._tag}`)
    const after = update(
      started.model,
      Message.MutationFailed({
        requestId: failure.requestId,
        error: failure.error,
        operation: failure.operation,
      }),
    )
    expect(heard).toEqual([['remote-1']])
    expect(Data.failedWrites(after.model)).toHaveLength(1)
  })

  it('share nothing unless named', () => {
    expect(Data.wiring({}).shared).toEqual([])
  })
})

// The ledger keeps a bounded window of failures, and each write goes with its failure.
const many = Array.from({ length: 1030 }, (_, n) => `r${n}`)
describe('The failed-write window', () => {
  it('drops the oldest writes with their failures', () => {
    const failedAll = many.reduce(
      (model, requestId) =>
        Data.reduce(
          Data.reduce(model, {
            _tag: 'MutationStarted',
            requestId,
            write: { mutation: 'Like', input: { post: requestId } },
          }),
          {
            _tag: 'MutationFailed',
            requestId,
            error: { _tag: 'RemoteMutationError', message: 'down' },
            operation: requestId,
          },
        ),
      initial,
    )
    const listed = Data.failedWrites(failedAll)
    expect(listed).toHaveLength(1024)
    expect(listed[0]?.requestId).toBe('r6')
    expect(failedAll.remote.mutations.writes.size).toBe(1024)
  })
})
