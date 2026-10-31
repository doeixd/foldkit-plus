/**
 * Single flight for lists (#386), end to end over the memory server: a write
 * that moves a list's membership costs one request, the list reads `Ready`
 * with no `Refreshing` between, and its page is what a refetch returns. A
 * list the server does not answer is fetched again, as before.
 */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity, Expr, Order } from 'foldkit-entity'
import {
  Mutation,
  Query,
  Remote,
  RemoteData,
  isRemoteMessage,
  type MutationResult,
  type RemoteClient,
} from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type HandlerOptions } from '../src/index.js'

const Todo = Entity.define(
  'Todo',
  Schema.Struct({ id: Schema.String, title: Schema.String, archived: Schema.Boolean }),
)
/** The todos not archived, by id: the client places a row in it, or takes one out. */
const Active = Query.define('Active', {}, () =>
  Query.from(Todo).pipe(
    Query.where(Expr.eq(Todo.fields.archived, false)),
    Query.orderBy(Order.asc(Todo.fields.id)),
  ),
)
/** Every todo, in the server's own order: a changed row is one the client cannot place. */
const Unordered = Query.define('Unordered', {}, () => Query.from(Todo))

const Archive = Mutation.make('Archive', { Input: { id: Schema.String }, Output: {} })
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, title: Schema.String },
  Output: {},
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const own = {
  ClickedArchive: { id: Schema.String },
  ClickedRename: { id: Schema.String, title: Schema.String },
}
const Own = defineMessageUnion(own)
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Todo],
  queries: [Active, Unordered],
  mutations: [Archive, Rename],
  verifyPredictions: true,
})

const line = Entity.select(Todo, { title: true })
const active = Data.query(Active, {}, { select: line, first: 2 })
const unordered = Data.query(Unordered, {}, { select: line, first: 3 })

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  const started = Own.match(message, {
    ClickedArchive: ({ id }) =>
      Data.mutate(
        model,
        Archive,
        { id },
        { optimistic: [Remote.patch(Todo, id, { archived: true })] },
      ),
    ClickedRename: ({ id, title }) =>
      Data.mutate(
        model,
        Rename,
        { id, title },
        { optimistic: [Remote.patch(Todo, id, { title })] },
      ),
  })
  return { model: started.model, commands: [started.command] }
}

const rows = [
  { id: 't1', title: 'One', archived: false },
  { id: 't2', title: 'Two', archived: false },
  { id: 't3', title: 'Three', archived: false },
]

/**
 * The memory server's client, counting each kind of request sent after the
 * write (`afterWrite`), with every answer kept as `answered` leaves it.
 */
const serve = (
  options: HandlerOptions<string, never> = {},
  answered: (result: typeof MutationResult.Type) => typeof MutationResult.Type = result => result,
) => {
  const backend = RemoteServer.memory({
    domain: Data,
    rows: { Todo: rows },
    principal: 'reader',
    mutations: store => [
      RemoteServer.mutation(Archive, ({ input }) => {
        store.write('Todo', input.id, { archived: true })
        return Effect.succeed({
          output: {},
          entities: [Remote.patch(Todo, input.id, { archived: true })],
        })
      }),
      RemoteServer.mutation(Rename, ({ input }) => {
        store.write('Todo', input.id, { title: input.title })
        return Effect.succeed({
          output: {},
          entities: [Remote.patch(Todo, input.id, { title: input.title })],
        })
      }),
    ],
  })
  const handlers = RemoteServer.handlers(backend.server, 'reader', options)
  const sent = { read: 0, query: 0, mutate: 0 }
  let atWrite = sent
  const afterWrite = () => ({
    read: sent.read - atWrite.read,
    query: sent.query - atWrite.query,
    mutate: sent.mutate,
  })
  const answers: Array<typeof MutationResult.Type> = []
  const client: RemoteClient['Service'] = {
    read: batch => Effect.suspend(() => (sent.read++, handlers.FoldkitRemoteRead(batch))),
    query: request => Effect.suspend(() => (sent.query++, handlers.FoldkitRemoteQuery(request))),
    mutate: request =>
      Effect.suspend(() => {
        atWrite = { ...sent }
        sent.mutate++
        return Effect.map(handlers.FoldkitRemoteMutate(request), result => {
          const kept = answered(result)
          answers.push(kept)
          return kept
        })
      }),
    live: () => Stream.never,
  }
  return { client, afterWrite, answers, handlers }
}

const Page = App.surface('Page', { model: () => ({ active, unordered }) })
const actives = { page: Surface.at(Page, undefined) }

/** The page loaded, then `write` and all it leads to: what went up after the write. */
const run = async (write: Message, server = serve()) => {
  const trace = await Trace.run(Data, {
    start: { remote: Remote.initial },
    update,
    active: actives,
    client: server.client,
    steps: [Respond.all, write, Respond.all],
  })
  return { trace, server }
}

/** What a list shows, by title. */
const titles = (model: Model, read: typeof active | typeof unordered) =>
  RemoteData.map(read.read(model), page => page.items.map(row => row.title))

describe('a write that moves a list', () => {
  it('archived out of a full window: one request, Ready throughout, the next row in', async () => {
    const { trace, server } = await run(Message.ClickedArchive({ id: 't1' }))

    expect(server.afterWrite()).toEqual({ read: 0, query: 0, mutate: 1 })
    expect(Trace.tags(trace, active)).toEqual(['Initial', 'Loading', 'Ready'])
    expect(titles(trace.entries.at(-1)!.model, active)).toEqual({
      _tag: 'Ready',
      value: ['Two', 'Three'],
    })
  })

  it('renamed in a list the client cannot place: one request, Ready throughout', async () => {
    const { trace, server } = await run(Message.ClickedRename({ id: 't2', title: 'Deux' }))

    expect(server.afterWrite()).toEqual({ read: 0, query: 0, mutate: 1 })
    expect(Trace.tags(trace, unordered)).toEqual(['Initial', 'Loading', 'Ready'])
    expect(titles(trace.entries.at(-1)!.model, unordered)).toEqual({
      _tag: 'Ready',
      value: ['One', 'Deux', 'Three'],
    })
  })

  it('carries the page a separate refetch returns', async () => {
    const { server } = await run(Message.ClickedArchive({ id: 't1' }))
    const [carried] = server.answers.at(-1)!.lists!
    const refetched = await Effect.runPromise(server.handlers.FoldkitRemoteQuery(carried!.request))

    expect(carried!.result).toEqual(refetched)
  })
})

describe('a list the server does not answer', () => {
  it('is fetched again when the answer carries no page', async () => {
    const stripped = serve({}, ({ lists: _lists, ...result }) => result)
    const { trace } = await run(Message.ClickedArchive({ id: 't1' }), stripped)

    // The rest of the window, and the list the client cannot place, each asked again.
    expect(stripped.afterWrite()).toEqual({ read: 0, query: 2, mutate: 1 })
    expect(titles(trace.entries.at(-1)!.model, active)).toEqual({
      _tag: 'Ready',
      value: ['Two', 'Three'],
    })
    expect(titles(trace.entries.at(-1)!.model, unordered)).toEqual({
      _tag: 'Ready',
      value: ['One', 'Two', 'Three'],
    })
  })

  it('is fetched again after a rename when the answer carries no page', async () => {
    const stripped = serve({}, ({ lists: _lists, ...result }) => result)
    const { trace } = await run(Message.ClickedRename({ id: 't2', title: 'Deux' }), stripped)

    expect(stripped.afterWrite()).toEqual({ read: 0, query: 1, mutate: 1 })
    expect(Trace.tags(trace, unordered)).toEqual([
      'Initial',
      'Loading',
      'Ready',
      'Refreshing',
      'Ready',
    ])
  })

  it('is fetched again when it lists past maxIdsPerEntity, beside one carried', async () => {
    // Two rows of the window fit; three more of the other list do not.
    const bounded = serve({ maxIdsPerEntity: 3 })
    const { trace } = await run(Message.ClickedArchive({ id: 't1' }), bounded)

    expect(bounded.answers.at(-1)!.lists?.map(list => list.request.query)).toEqual(['Active'])
    expect(bounded.afterWrite()).toEqual({ read: 0, query: 1, mutate: 1 })
    expect(titles(trace.entries.at(-1)!.model, active)).toEqual({
      _tag: 'Ready',
      value: ['Two', 'Three'],
    })
    expect(titles(trace.entries.at(-1)!.model, unordered)).toEqual({
      _tag: 'Ready',
      value: ['One', 'Two', 'Three'],
    })
  })
})
