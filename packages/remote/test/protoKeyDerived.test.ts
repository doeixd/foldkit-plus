/**
 * Derived members named like `Object.prototype`'s members, foreseen while a
 * write is pending: assigned to a plain object, `__proto__` sets the
 * prototype; read from one, `constructor` and `toString` find its functions.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Expr, Operators, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  Remote,
  brokenByWrite,
  entityKey,
  predictionOfWrite,
  readField,
  visibleStore,
} from '../src/index.js'

const names = ['__proto__', 'constructor', 'toString'] as const
const one = <A>(name: string, value: A): Record<string, A> => Object.fromEntries([[name, value]])
// The typed API sees member names as literals, and these are chosen per case at run time:
// a member so named is declared to the types as `odd`.
const named = <A>(name: string, value: A): { readonly odd: A } =>
  one(name, value) as unknown as { readonly odd: A }

const Id = Schema.String
const UserFields = Entity.define('User', Schema.Struct({ id: Id }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Id, title: Schema.String }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Id }))
const Social = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
)
const { User, Like } = Social

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

const fixture = (name: string, member: 'count' | 'exists') => {
  const Post = Social.Post.pipe(
    Entity.derived(
      named(
        name,
        member === 'count'
          ? Derived.count(Like.relations.post)
          : Derived.exists(Like.relations.post, { viewer: Like.relations.user }),
      ),
    ),
  )
  const CreatePost = Mutation.write(
    'CreatePost',
    Write.insert(Entity.input(Post, Schema.Struct({ id: Id, title: Schema.String })), { id: 'id' }),
  )
  const LikePost = Mutation.write(
    'LikePost',
    Write.insert(
      Entity.input(Like, Schema.Struct({ id: Id, postId: Id, userId: Id }), {
        postId: 'post',
        userId: 'user',
      }),
      { id: 'id' },
    ),
  )
  const MoveLike = Mutation.write(
    'MoveLike',
    Write.update(Entity.input(Like, Schema.Struct({ id: Id, postId: Id }), { postId: 'post' }), {
      id: 'id',
    }),
  )
  const Data = Remote.make({
    model: App.model.remote,
    entities: [User, Post, Like],
    mutations: [CreatePost, LikePost, MoveLike],
    viewer: () => Option.some(Remote.ref(User, 'ada')),
  })
  const held: Model = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [
        { entity: 'Post', id: 'p1', fields: [name] },
        { entity: 'Post', id: 'p2', fields: [name] },
        { entity: 'Like', id: 'l1', fields: ['post', 'user'] },
      ],
      result: {
        settled: [],
        entities: [
          { entity: 'Post', id: 'p1', values: one(name, member === 'count' ? 1 : 'l1') },
          { entity: 'Post', id: 'p2', values: one(name, member === 'count' ? 0 : null) },
          { entity: 'Like', id: 'l1', values: { post: 'Post:p1', user: 'User:ada' } },
        ],
      },
      now: 0,
    },
  )
  const shown = (model: Model, id: string) =>
    Option.getOrUndefined(
      readField(
        visibleStore(model.remote.entities, model.remote.optimistic),
        entityKey('Post', id),
        name,
      ),
    )
  return { Data, held, shown, CreatePost, LikePost, MoveLike }
}

describe.each(names)('a derived member named %s', name => {
  it('counts a like moved from one row to another', () => {
    const { Data, held, shown, MoveLike } = fixture(name, 'count')
    const { model } = Data.mutate(held, MoveLike, { id: 'l1', postId: 'p2' })
    expect([shown(model, 'p1'), shown(model, 'p2')]).toEqual([0, 1])
  })

  it('finds the viewer’s like where it moves', () => {
    const { Data, held, shown, MoveLike } = fixture(name, 'exists')
    const { model } = Data.mutate(held, MoveLike, { id: 'l1', postId: 'p2' })
    expect([shown(model, 'p1'), shown(model, 'p2')]).toEqual([null, 'l1'])
  })

  it.each(['count', 'exists'] as const)('starts a new row’s %s empty', member => {
    const { Data, held, shown, CreatePost } = fixture(name, member)
    const { model } = Data.mutate(held, CreatePost, { id: 'p9', title: 'New' })
    expect(shown(model, 'p9')).toEqual(member === 'count' ? 0 : null)
  })
})

describe.each(names)('a supplied member named %s', name => {
  it('is foreseen over a new row', () => {
    const Item = Entity.define('Item', Schema.Struct({ id: Id, label: Schema.String })).pipe(
      Entity.derived(
        named(name, Derived.make(Schema.String, { predict: () => Option.some('seen') })),
      ),
    )
    const create = Write.insert(
      Entity.input(Item, Schema.Struct({ id: Id, label: Schema.String })),
      { id: 'id' },
    )
    const foreseen = predictionOfWrite(create, { id: 'i1', label: 'x' }, undefined, {
      derived: new Map(),
      store: {},
      viewer: Option.none(),
      now: Option.none(),
    })
    expect(foreseen).toContainEqual({ entity: 'Item', id: 'i1', values: one(name, 'seen') })
  })
})

describe.each(names)('an invariant over a field named %s', name => {
  it('refuses a write that breaks it', () => {
    const Item = Entity.define('Item', Schema.Struct({ id: Id, ...one(name, Schema.Number) })).pipe(
      Entity.invariant(
        'positive',
        ({ after }) => Expr.gt(Object.getOwnPropertyDescriptor(after, name)?.value, 0) as never,
        { message: 'must be positive' },
      ),
    )
    const create = Write.insert(
      Entity.input(Item, Schema.Struct({ id: Id, ...one(name, Schema.Number) })),
      { id: 'id' },
    )
    const judged = (value: number) =>
      brokenByWrite(
        create,
        { id: 'i1', ...one(name, value) },
        undefined,
        { viewer: Option.none(), now: Option.none() },
        {},
        Operators.kernel,
      )
    expect(Option.map(judged(-1), invariant => invariant.id)).toEqual(Option.some('positive'))
    expect(judged(1)).toEqual(Option.none())
  })
})
