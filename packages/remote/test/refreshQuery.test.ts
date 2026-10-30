/**
 * `Data.refresh(model, Query.ref(input))` (#238): one list asked again by its
 * query and input, whatever window reads it, with no select to restate. It
 * was reachable only by reducing Remote's own `ConnectionInvalidated`.
 */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  RemoteClient,
  RemoteQueryError,
  isRemoteMessage,
  terminal,
} from '../src/index.js'
import { Respond, Trace } from '../src/testing.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, author: Schema.String, text: Schema.String }),
)
const ByAuthor = Query.define('ByAuthor', { author: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.author, input.author)),
    Query.orderBy(Order.asc(Post.fields.id)),
  ),
)
const Unregistered = Query.make('Unregistered', { Input: {}, Result: Post })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Refreshed: {} })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post],
  queries: [ByAuthor],
  verifyPredictions: true,
})

const line = Entity.select(Post, { text: true })
const postsOf = (author: string, first = 2) =>
  Data.query(ByAuthor, { author }, { select: line, first })

const Posts = App.surface('Posts', {
  model: () => ({ ada: postsOf('ada'), adaWide: postsOf('ada', 5), bo: postsOf('bo') }),
})
const actives = { posts: Surface.at(Posts, undefined) }

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
  isRemoteMessage(message)
    ? { model: Data.reduce(model, message) }
    : { model: Data.refresh(model, ByAuthor.ref({ author: 'ada' })) }

/** A server answering each author with two posts, counting the queries it is asked. */
const serverCounting = () => {
  const asked: Array<string> = []
  const client: RemoteClient['Service'] = {
    read: () => Effect.succeed({ settled: [], entities: [] }),
    query: request => {
      const { author } = Schema.decodeUnknownSync(ByAuthor.Input)(request.input)
      asked.push(author)
      const ids = [`${author}-1`, `${author}-2`]
      return Effect.succeed({
        edges: ids.map(id => ({ entity: 'Post', id, key: `Post:${id}` })),
        start: terminal,
        end: terminal,
        entities: ids.map(id => ({ entity: 'Post', id, values: { text: `text of ${id}` } })),
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  }
  return { client, asked }
}

const run = (start: Model, steps: ReadonlyArray<Message | Respond>) => {
  const { client, asked } = serverCounting()
  return Trace.run(Data, { start, update, active: actives, client, steps }).then(trace => ({
    trace,
    asked,
  }))
}

const last = (trace: Trace<Model, Message>) => trace.entries.at(-1)!.model
const tag = (model: Model, read: { readonly read: (model: Model) => { readonly _tag: string } }) =>
  read.read(model)._tag

const loaded = async () => last((await run({ remote: Remote.initial }, [Respond.all])).trace)

describe('Data.refresh of a query ref', () => {
  it('asks again the list, every window of it, and no other input', async () => {
    const model = await loaded()
    const refreshed = Data.refresh(model, ByAuthor.ref({ author: 'ada' }))

    expect(tag(refreshed, postsOf('ada'))).toBe('Refreshing')
    expect(tag(refreshed, postsOf('ada', 5))).toBe('Refreshing')
    expect(tag(refreshed, postsOf('bo'))).toBe('Ready')
  })

  it('is fetched again by the read entry that reads it', async () => {
    const { trace, asked } = await run(await loaded(), [Message.Refreshed(), Respond.all])

    expect(asked).toEqual(['ada'])
    expect(tag(last(trace), postsOf('ada'))).toBe('Ready')
  })

  it('reads a record keyed `identity` as a record of entries', async () => {
    const model = await loaded()
    const refreshed = Data.refresh(model, { identity: actives.posts })
    expect(tag(refreshed, postsOf('bo'))).toBe('Refreshing')
  })

  it('returns the Model for a list it never loaded', async () => {
    const model = await loaded()
    expect(Data.refresh(model, ByAuthor.ref({ author: 'cy' }))).toBe(model)
  })

  it('with { failed: true }, asks again only a list whose query failed', async () => {
    const model = await loaded()
    expect(Data.refresh(model, ByAuthor.ref({ author: 'ada' }), { failed: true })).toBe(model)

    const { trace } = await run({ remote: Remote.initial }, [
      Respond.query(postsOf('ada').ref, { fail: new RemoteQueryError({ message: 'down' }) }),
      Respond.all,
    ])
    const failed = last(trace)
    expect(tag(failed, postsOf('ada'))).toBe('Failed')
    const retried = Data.refresh(failed, ByAuthor.ref({ author: 'ada' }), { failed: true })
    expect(tag(retried, postsOf('ada'))).toBe('Loading')
    expect(tag(retried, postsOf('bo'))).toBe('Ready')
  })

  it('refuses a query the domain does not register', () => {
    const model: Model = { remote: Remote.initial }
    expect(() => Data.refresh(model, untyped(Unregistered.ref({})))).toThrow(
      /Query "Unregistered" is not registered/,
    )
  })
})

/** What the types refuse, made at runtime anyway. */
function untyped(value: unknown): never {
  return value as never
}

export const unregistered = (model: Model) =>
  // @ts-expect-error the domain does not register `Unregistered`
  Data.refresh(model, Unregistered.ref({}))
