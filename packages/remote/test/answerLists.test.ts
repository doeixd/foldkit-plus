/**
 * Single flight for lists (#386), on the client: which lists a write asks
 * back with its request, judged against its prediction as its answer will be,
 * and which carried pages the answer writes in. A list asked back and not
 * answered is fetched again, as before.
 */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  MAX_ANSWER_LISTS,
  Mutation,
  Query,
  Remote,
  RemoteClient,
  terminal,
  type MutationRequest,
  type QueryResult,
  type RemoteMessage,
} from '../src/index.js'

const Todo = Entity.define(
  'Todo',
  Schema.Struct({ id: Schema.String, title: Schema.String, archived: Schema.Boolean }),
)
/** The todos not archived on one shelf, by id; every shelf lists the same rows. */
const Active = Query.define('Active', { shelf: Schema.String }, () =>
  Query.from(Todo).pipe(
    Query.where(Expr.eq(Todo.fields.archived, false)),
    Query.orderBy(Order.asc(Todo.fields.id)),
  ),
)
/** Every todo, in the server's order: a held row changed is one the client cannot place. */
const Pile = Query.define('Pile', {}, () => Query.from(Todo))
const Archive = Mutation.make('Archive', { Input: { id: Schema.String }, Output: {} })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Todo],
  queries: [Active, Pile],
  mutations: [Archive],
})

const line = Entity.select(Todo, { title: true })
const shelf = (name: string) => Data.query(Active, { shelf: name }, { select: line, first: 2 })
/** The pile read three ways: its first page, its last, and a page after a cursor. */
const pile = Data.query(Pile, {}, { select: line, first: 2 })
const pileEnd = Data.query(Pile, {}, { select: line, last: 2 })
const pileAfter = Data.query(Pile, {}, { select: line, first: 2, after: 'Todo:t0' })
const shelves = (count: number) => Array.from({ length: count }, (_, at) => `s${at}`)

// Every shelf a test holds is on the page.
Data.subscriptions({
  page: Surface.at(
    App.surface('Page', {
      model: () => ({
        ...Object.fromEntries(shelves(MAX_ANSWER_LISTS + 1).map(name => [name, shelf(name)])),
        pile,
        pileEnd,
        pileAfter,
      }),
    }),
    undefined,
  ),
})

const edgesOf = (ids: ReadonlyArray<string>) =>
  ids.map(id => ({ key: `Todo:${id}`, ref: { entity: 'Todo', id } }))

/**
 * Each shelf holding `ids` as its first page, the rest of the list behind
 * `more`; or, with `pile`, the pile alone holding them.
 */
const holding = (
  ids: ReadonlyArray<string>,
  options: { readonly more?: boolean; readonly shelves?: number; readonly pile?: boolean } = {},
): Model => {
  const lists =
    options.pile === true
      ? [pile.ref.identity]
      : shelves(options.shelves ?? 1).map(name => shelf(name).ref.identity)
  const messages: ReadonlyArray<RemoteMessage> = [
    ...lists.map((connection): RemoteMessage => ({
      _tag: 'ConnectionMerged',
      connection,
      page: {
        edges: edgesOf(ids),
        start: terminal,
        end: options.more === true ? { _tag: 'Cursor', cursor: `Todo:${ids.at(-1)}` } : terminal,
      },
    })),
    {
      _tag: 'ReadReceived',
      requests: ids.map(id => ({ entity: 'Todo', id, fields: ['id', 'title', 'archived'] })),
      result: {
        settled: [],
        entities: ids.map(id => ({
          entity: 'Todo',
          id,
          values: { id, title: id.toUpperCase(), archived: false },
        })),
      },
      now: 0,
    },
  ]
  return messages.reduce(Data.reduce, { remote: Remote.initial })
}

const archived = (id: string) => [Remote.patch(Todo, id, { archived: true })]

/** The lists `Data.mutate`'s request asks back, as the client sends them. */
const asked = async (model: Model, optimistic = archived('t1')) => {
  let sent: typeof MutationRequest.Type | undefined
  const client: RemoteClient['Service'] = {
    read: () => Effect.die('unused'),
    query: () => Effect.die('unused'),
    mutate: request => {
      sent = request
      return Effect.succeed({ output: {}, entities: [] })
    },
    live: () => Stream.empty,
  }
  const started = Data.mutate(model, Archive, { id: 't1' }, { optimistic })
  await Effect.runPromise(started.command.effect.pipe(Effect.provideService(RemoteClient, client)))
  return sent?.lists
}

describe('the lists a write asks back', () => {
  it('names a list its prediction leaves short of its window, as a first page', async () => {
    expect(await asked(holding(['t1', 't2'], { more: true }))).toEqual([
      {
        query: 'Active',
        input: { shelf: 's0' },
        window: { first: 2 },
        select: { entity: 'Todo', fields: ['title', 'archived', 'id'] },
      },
    ])
  })

  it('names a list the client cannot place, by its first page alone', async () => {
    expect(await asked(holding(['t1', 't2'], { pile: true }))).toEqual([
      {
        query: 'Pile',
        input: {},
        window: { first: 2 },
        select: { entity: 'Todo', fields: ['title'] },
      },
    ])
  })

  it('names none already stale, whose read entry asks for it', async () => {
    const stale = Data.reduce(holding(['t1', 't2'], { more: true }), {
      _tag: 'ConnectionInvalidated',
      connection: shelf('s0').ref.identity,
    })
    expect(await asked(stale)).toBeUndefined()
  })

  it('names none the client places whole', async () => {
    expect(await asked(holding(['t1', 't2']))).toBeUndefined()
  })

  it('names none for a write that predicts nothing', async () => {
    expect(await asked(holding(['t1', 't2'], { more: true }), [])).toBeUndefined()
  })

  it(`names at most ${MAX_ANSWER_LISTS}, which the server takes`, async () => {
    const lists = await asked(holding(['t1', 't2'], { more: true, shelves: MAX_ANSWER_LISTS + 1 }))
    expect(lists).toHaveLength(MAX_ANSWER_LISTS)
  })
})

/** The server's first page of one shelf: `ids`, each titled by `title`. */
const pageOf = (
  name: string,
  ids: ReadonlyArray<string>,
  title = (id: string) => id.toUpperCase(),
) => ({
  request: {
    query: 'Active',
    input: { shelf: name },
    window: { first: 2 },
    select: { entity: 'Todo', fields: ['id', 'title', 'archived'] },
  },
  result: {
    edges: ids.map(id => ({ entity: 'Todo', id, key: `Todo:${id}` })),
    start: terminal,
    end: terminal,
    entities: ids.map(id => ({
      entity: 'Todo',
      id,
      values: { id, title: title(id), archived: false },
    })),
    settled: [],
  } satisfies typeof QueryResult.Type,
})

/** `model` with `Archive` of t1 answered, carrying `lists`. */
const answered = (model: Model, lists: ReadonlyArray<ReturnType<typeof pageOf>>) => {
  const started = Data.mutate(model, Archive, { id: 't1' }, { optimistic: archived('t1') })
  return Data.reduce(started.model, {
    _tag: 'MutationSucceeded',
    requestId: started.requestId,
    entities: [{ entity: 'Todo', id: 't1', values: { archived: true } }],
    lists,
    now: 1,
  })
}

const shown = (model: Model) => shelf('s0').read(model)
const titles = (ids: ReadonlyArray<string>) => ({
  items: ids.map(id => ({ title: id.toUpperCase() })),
})

describe('the pages an answer carries', () => {
  it('replaces a list the answer moved, which reads Ready with no fetch owed', () => {
    // The server's page is the list as it now is: t2 went too, by another hand.
    const model = answered(holding(['t1', 't2'], { more: true }), [pageOf('s0', ['t3', 't4'])])

    expect(shown(model)).toMatchObject({ _tag: 'Ready', value: titles(['t3', 't4']) })
    expect(Remote.planQueries(Data, model, shelf('s0'))).toEqual([])
  })

  it('leaves a list the answer did not move as it holds it', () => {
    const model = answered(holding(['t2', 't3'], { more: true }), [
      pageOf('s0', ['t2', 't4'], id => `renamed ${id}`),
    ])

    expect(shown(model)).toMatchObject({ _tag: 'Ready', value: titles(['t2', 't3']) })
  })

  it('leaves a list stale before the write to its own read', () => {
    const stale = Data.reduce(holding(['t1', 't2'], { more: true }), {
      _tag: 'ConnectionInvalidated',
      connection: shelf('s0').ref.identity,
    })
    const model = answered(stale, [pageOf('s0', ['t2', 't3'])])

    expect(shown(model)._tag).toBe('Refreshing')
  })

  it('refuses a page past its window, and the list is fetched again', () => {
    const model = answered(holding(['t1', 't2'], { more: true }), [
      pageOf('s0', ['t2', 't3', 't4']),
    ])

    expect(Remote.planQueries(Data, model, shelf('s0'))).toHaveLength(1)
  })

  it('without one, the list is fetched again', () => {
    const model = answered(holding(['t1', 't2'], { more: true }), [])

    expect(Remote.planQueries(Data, model, shelf('s0'))).toHaveLength(1)
  })
})
