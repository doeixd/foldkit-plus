/**
 * An invariant over `one` relations (#345), refused where the write is made:
 * a follow pointing at the person who makes it never reaches the server, and
 * one relinked to its own follower neither, judged over the held row's links.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Refusal, Remote, RemoteClient } from '../src/index.js'

const PersonFields = Entity.define('Person', Schema.Struct({ id: Schema.String }))
const FollowFields = Entity.define('Follow', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { Person: PersonFields, Follow: FollowFields },
  { Follow: { follower: Relation.one(PersonFields), followee: Relation.one(PersonFields) } },
)
const notSelf = Entity.invariant<typeof Social.Follow>(
  'notSelf',
  ({ after }) => Expr.not(Expr.eq(after.follower, after.followee)),
  { message: 'You cannot follow yourself', path: ['followee'] },
)
const Follow = Social.Follow.pipe(
  Entity.sets({ follower: Expr.viewer(PersonFields) }, { on: 'create' }),
  notSelf,
)

const FollowSomeone = Mutation.write(
  'FollowSomeone',
  Write.insert(
    Entity.input(Follow, Schema.Struct({ id: Schema.String, followeeId: Schema.String }), {
      followeeId: 'followee',
    }),
    { id: 'id' },
  ),
)
const Refollow = Mutation.write(
  'Refollow',
  Write.update(
    Entity.input(Follow, Schema.Struct({ id: Schema.String, followeeId: Schema.String }), {
      followeeId: 'followee',
    }),
    { id: 'id' },
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Social.Person, Follow],
  mutations: [FollowSomeone, Refollow],
  viewer: () => Option.some(Remote.ref(PersonFields, 'ada')),
})

/** Ada's follow of Bo, held with both its links. */
const held = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Follow', id: 'f1', fields: ['id', 'follower', 'followee'] }],
    result: {
      settled: [],
      entities: [
        {
          entity: 'Follow',
          id: 'f1',
          values: { id: 'f1', follower: 'Person:ada', followee: 'Person:bo' },
        },
      ],
    },
    now: 0,
  },
)

const sending = () => {
  const sent: Array<string> = []
  const client: RemoteClient['Service'] = {
    read: () => Effect.succeed({ settled: [], entities: [] }),
    query: () =>
      Effect.succeed({ edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } }),
    mutate: request => {
      sent.push(request.mutation)
      return Effect.succeed({ output: {}, entities: [], connections: [], deleted: [] })
    },
    live: () => Stream.empty,
  }
  return { sent, client }
}

const run = (started: ReturnType<typeof Data.mutate>, client: RemoteClient['Service']) =>
  Effect.runPromise(started.command.effect.pipe(Effect.provideService(RemoteClient, client)))

describe('an invariant over one relations, on the client', () => {
  /** The Model once `started` is answered, asserting nothing reached the server. */
  const unsent = async (started: ReturnType<typeof Data.mutate>) => {
    const { sent, client } = sending()
    const answer = await run(started, client)
    expect(sent).toEqual([])
    return Data.reduce(started.model, answer)
  }
  const breaksNotSelf = (refusal: Option.Option<unknown>) =>
    expect(Option.map(refusal, held => Refusal.isInvalidBy(held, notSelf))).toEqual(
      Option.some(true),
    )

  it('refuses a follow of yourself, its follower set from who asks, where it is made', async () => {
    const started = Data.mutate(held, FollowSomeone, { id: 'f2', followeeId: 'ada' })
    const model = await unsent(started)
    breaksNotSelf(Data.refusal(model, started.requestId, FollowSomeone))
  })

  it('refuses a follow relinked to its own follower where it is made', async () => {
    const started = Data.mutate(held, Refollow, { id: 'f1', followeeId: 'ada' })
    const model = await unsent(started)
    breaksNotSelf(Data.refusal(model, started.requestId, Refollow))
  })

  it('sends a follow of someone else', async () => {
    const { sent, client } = sending()
    await run(Data.mutate(held, FollowSomeone, { id: 'f2', followeeId: 'cy' }), client)
    expect(sent).toEqual(['FollowSomeone'])
  })
})
