/**
 * `Data.refresh` over the active record (#261): a page's "Try again" asks
 * again what its Surfaces read, with the params the Model gives them, and a
 * read that failed keeps its place while it is asked again.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  RemoteClient,
  RemoteQueryError,
  RemoteReadError,
  isRemoteMessage,
  terminal,
} from '../src/index.js'
import { Respond, Trace } from '../src/testing.js'

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
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

// The page's params live in the Model, as a route's would.
const Model = Schema.Struct({ remote: Remote.Model, handle: Schema.String })
type Model = typeof Model.Type
const own = { Retried: {}, Visited: { handle: Schema.String } }
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const Own = defineMessageUnion(own)
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [User, Post], queries: [ByAuthor] })

const card = Entity.select(User, { name: true })
const line = Entity.select(Post, { text: true })
const userOf = (id: string) => Data.get(card, id)
const postsOf = (author: string) => Data.query(ByAuthor, { author }, { select: line, first: 2 })

const Profile = App.surface('Profile', {
  params: { id: Schema.String },
  model: ({ params }) => ({ user: userOf(params.id) }),
})
const Posts = App.surface('Posts', {
  params: { author: Schema.String },
  model: ({ params }) => ({ posts: postsOf(params.author) }),
})
/** Both read the handle the Model holds; nothing while it holds none. */
const placed = (model: Model) => (model.handle === '' ? Option.none() : Option.some(model.handle))
const actives = {
  profile: Surface.at(Profile, model => Option.map(placed(model), id => ({ id }))),
  posts: Surface.at(Posts, model => Option.map(placed(model), author => ({ author }))),
}

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  return Own.match(message, {
    Retried: () => ({ model: Data.refresh(model, actives, { failed: true }) }),
    Visited: ({ handle }) => ({ model: modifyFields(model, { handle: () => handle }) }),
  })
}

/** A server whose every user and post exists, two posts an author. */
const server: RemoteClient['Service'] = {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { name: `name of ${request.id}` },
      })),
    }),
  query: request => {
    const { author } = Schema.decodeUnknownSync(ByAuthor.Input)(request.input)
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

const run = (start: Model, steps: ReadonlyArray<Message | Respond>) =>
  Trace.run(Data, { start, update, active: actives, client: server, steps })

const last = (trace: Trace<Model, Message>) => trace.entries.at(-1)!.model
const tag = (model: Model, read: { readonly read: (model: Model) => { readonly _tag: string } }) =>
  read.read(model)._tag

/** u1's page loaded, and u2's profile held from an earlier visit. */
const loaded = async () => {
  const held = await run({ remote: Remote.initial, handle: 'u2' }, [Respond.all])
  return last(await run(modifyFields(last(held), { handle: () => 'u1' }), [Respond.all]))
}

/** u1's page with its first read failed as `fail` says, the other loaded. */
const failing = async (fail: 'user' | 'posts') =>
  last(
    await run({ remote: Remote.initial, handle: 'u1' }, [
      fail === 'user'
        ? Respond.read(User, 'u1', { fail: new RemoteReadError({ message: 'down' }) })
        : Respond.query(postsOf('u1').ref, { fail: new RemoteQueryError({ message: 'down' }) }),
      Respond.all,
    ]),
  )

describe('Data.refresh over the active record', () => {
  it('asks again what each Surface reads, with the params the Model gives', async () => {
    const model = await loaded()
    expect(tag(model, userOf('u1'))).toBe('Ready')
    expect(tag(model, userOf('u2'))).toBe('Ready')

    const refreshed = Data.refresh(model, actives)
    expect(tag(refreshed, userOf('u1'))).toBe('Refreshing')
    expect(tag(refreshed, postsOf('u1'))).toBe('Refreshing')
    // u2 is held, but the Model places the page at u1.
    expect(tag(refreshed, userOf('u2'))).toBe('Ready')
  })

  it('asks again one entry of the record', async () => {
    const model = await loaded()
    const refreshed = Data.refresh(model, actives.posts)
    expect(tag(refreshed, postsOf('u1'))).toBe('Refreshing')
    expect(tag(refreshed, userOf('u1'))).toBe('Ready')
    // A domain's own read, as `Data.active` places it, is one entry too.
    const user = Data.active('user', () => Option.some(userOf('u1')))
    expect(tag(Data.refresh(model, user), userOf('u1'))).toBe('Refreshing')
  })

  it('asks again a family’s parent and each instance it reveals', async () => {
    const friends = Surface.each(Profile, {
      from: actives.profile,
      instances: ({ user }) => (user._tag === 'Ready' ? [{ key: 'u3', params: { id: 'u3' } }] : []),
    })
    const model = Data.reduce(await loaded(), {
      _tag: 'ReadReceived',
      requests: [{ entity: 'User', id: 'u3', fields: ['name'] }],
      result: { settled: [], entities: [{ entity: 'User', id: 'u3', values: { name: 'Three' } }] },
      now: 0,
    })
    const refreshed = Data.refresh(model, friends)
    expect(tag(refreshed, userOf('u1'))).toBe('Refreshing')
    expect(tag(refreshed, userOf('u3'))).toBe('Refreshing')
    expect(tag(refreshed, postsOf('u1'))).toBe('Ready')
  })

  it('reads a record whose keys are named like an entry’s members as a record', async () => {
    const model = await loaded()
    const refreshed = Data.refresh(model, { read: actives.profile, projection: actives.posts })
    expect(tag(refreshed, userOf('u1'))).toBe('Refreshing')
    expect(tag(refreshed, postsOf('u1'))).toBe('Refreshing')
  })

  it('returns the Model when no entry is active', async () => {
    const model = modifyFields(await loaded(), { handle: () => '' })
    expect(Data.refresh(model, actives)).toBe(model)
  })

  it('refuses a Surface of another application', () => {
    const Other = Surface.application({ Model, Message })
    const Foreign = Other.surface('Foreign', { model: () => ({ user: userOf('u1') }) })
    const model: Model = { remote: Remote.initial, handle: 'u1' }
    expect(() => Data.refresh(model, { foreign: Foreign })).toThrow(
      /Surface "Foreign" belongs to another application/,
    )
  })
})

describe('Data.refresh with { failed: true }', () => {
  it('asks again a failed read and leaves what loaded as it is', async () => {
    const model = await failing('user')
    expect(tag(model, userOf('u1'))).toBe('Failed')
    expect(tag(model, postsOf('u1'))).toBe('Ready')

    const retried = Data.refresh(model, actives, { failed: true })
    expect(tag(retried, userOf('u1'))).toBe('Loading')
    expect(tag(retried, postsOf('u1'))).toBe('Ready')
    // A list's pages stay as they are, later ones included; without
    // `failed`, it is refetched from its first page.
    expect(retried.remote.connections).toBe(model.remote.connections)
    expect(Data.refresh(model, actives).remote.connections).not.toBe(model.remote.connections)
  })

  it('asks again a failed list and leaves a loaded read as it is', async () => {
    const model = await failing('posts')
    expect(tag(model, postsOf('u1'))).toBe('Failed')

    const retried = Data.refresh(model, actives, { failed: true })
    expect(tag(retried, postsOf('u1'))).toBe('Loading')
    expect(tag(retried, userOf('u1'))).toBe('Ready')
    expect(retried.remote.entities).toBe(model.remote.entities)
  })

  it('returns the Model when nothing failed', async () => {
    const model = await loaded()
    expect(Data.refresh(model, actives, { failed: true })).toBe(model)
  })
})

describe('a retried read keeps its place', () => {
  it('reads Loading while it is asked again, and Failed again if it fails again', async () => {
    const userFails = Respond.read(User, 'u1', { fail: new RemoteReadError({ message: 'down' }) })
    const postsFail = Respond.query(postsOf('u1').ref, {
      fail: new RemoteQueryError({ message: 'down' }),
    })
    const trace = await run({ remote: Remote.initial, handle: 'u1' }, [
      userFails,
      postsFail,
      Message.Retried(),
      userFails,
      postsFail,
      Message.Retried(),
      Respond.all,
    ])

    const tries = ['Loading', 'Failed', 'Loading', 'Failed', 'Loading', 'Ready']
    expect(Trace.tags(trace, userOf('u1'))).toEqual(['Initial', ...tries])
    expect(Trace.tags(trace, postsOf('u1'))).toEqual(['Initial', ...tries])
  })

  it('claims no read for a refresh of what never failed', () => {
    const model: Model = { remote: Remote.initial, handle: '' }
    // Nothing observes it, so nothing will read it: it stays `Initial`.
    expect(tag(Data.refresh(model, userOf('u1')), userOf('u1'))).toBe('Initial')
  })
})

// A Surface that takes params reads only where the Model places it.
const nowhere: Model = { remote: Remote.initial, handle: '' }
export const unplacedEntry = () =>
  // @ts-expect-error the Surface's params are unknown
  Data.refresh(nowhere, Profile)
export const unplacedRecord = () =>
  // @ts-expect-error the Surface's params are unknown
  Data.refresh(nowhere, { profile: Profile })
