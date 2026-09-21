import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Query,
  Remote,
  RemoteClient,
  edge,
  emptyConnection,
  emptyStore,
  entityKey,
  initialRemoteModel,
  items,
  merge,
  readField,
  segment,
  terminal,
  updateRemote,
  writeEntity,
} from '../src/index.js'

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: Schema.Struct({ ownerId: Schema.String, sort: Schema.String }),
  Result: Query.connection({ name: 'Project' }),
})

describe('Query and QueryRef', () => {
  it('connection identity excludes the pagination window', () => {
    const base = ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' })
    const latest = Query.first(25)(base)
    const older = Query.after('c1')(Query.first(25)(base))

    expect(latest.identity).toBe(base.identity)
    expect(older.identity).toBe(base.identity)
    expect(older.window).toEqual({ first: 25, after: 'c1' })
  })

  it('canonicalises input so key order does not change identity', () => {
    const a = ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' })
    const b = ProjectsByOwner.ref({ sort: 'newest', ownerId: 'u1' })
    expect(a.identity).toBe(b.identity)
  })

  it('a different filter or sort is a different connection', () => {
    expect(ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' }).identity).not.toBe(
      ProjectsByOwner.ref({ ownerId: 'u2', sort: 'newest' }).identity,
    )
    expect(ProjectsByOwner.ref({ ownerId: 'u1', sort: 'oldest' }).identity).not.toBe(
      ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' }).identity,
    )
  })

  it('connection spec records the entity and optional edgeKey/live', () => {
    const Project = Entity.make('Project', Schema.Struct({ id: Schema.String }))
    const spec = Query.connection(Project, {
      edgeKey: Schema.String,
      live: { prepend: 'visible' },
    })
    expect(spec.entity).toBe('Project')
    expect(spec.live).toEqual({ prepend: 'visible' })
    expect(spec.edgeKey).toBe(Schema.String)
  })

  it('an entity write propagates to every connection that references it', () => {
    let store = writeEntity(emptyStore, entityKey('E', 'a'), { label: 'old' })
    const connection = merge(
      emptyConnection,
      segment([edge({ entity: 'E', id: 'a' })], terminal, terminal),
    )
    const labels = () =>
      items(connection).map(value =>
        readField(store, entityKey(value.ref.entity, value.ref.id), 'label'),
      )

    expect(labels()).toEqual([Option.some('old')])
    store = writeEntity(store, entityKey('E', 'a'), { label: 'new' })
    expect(labels()).toEqual([Option.some('new')])
  })

  it('has no edgeKey or live by default', () => {
    const spec = Query.connection({ name: 'Project' })
    expect(spec.edgeKey).toBeUndefined()
    expect(spec.live).toBeUndefined()
  })

  it('canonicalises nested and array input regardless of key order', () => {
    const Nested = Query.make('Nested', {
      Input: Schema.Struct({
        filter: Schema.Struct({ a: Schema.Number, b: Schema.Number }),
        tags: Schema.Array(Schema.String),
      }),
      Result: Query.connection({ name: 'X' }),
    })
    const left = Nested.ref({ filter: { a: 1, b: 2 }, tags: ['x', 'y'] })
    const right = Nested.ref({ tags: ['x', 'y'], filter: { b: 2, a: 1 } })
    expect(left.identity).toBe(right.identity)
  })

  it('a later window option replaces the earlier one', () => {
    const base = ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' })
    const twice = Query.after('c2')(Query.after('c1')(base))
    expect(twice.window.after).toBe('c2')
  })

  it('keeps the base ref window unchanged when deriving', () => {
    const base = ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' })
    const derived = Query.after('c1')(Query.first(25)(base))

    expect(base.window).toEqual({})
    expect(derived.window).toEqual({ first: 25, after: 'c1' })
  })

  it('is stable across repeated refs of the same input', () => {
    const input = { ownerId: 'u1', sort: 'newest' }
    expect(ProjectsByOwner.ref(input).identity).toBe(ProjectsByOwner.ref(input).identity)
  })

  it('treats an absent optional field and an explicit undefined the same', () => {
    const Optional = Query.make('OptionalInput', {
      Input: Schema.Struct({ ownerId: Schema.String, tag: Schema.optional(Schema.String) }),
      Result: Query.connection({ name: 'X' }),
    })

    expect(Optional.ref({ ownerId: 'u1' }).identity).toBe(
      Optional.ref({ ownerId: 'u1', tag: undefined }).identity,
    )
  })
})

describe('Remote.query', () => {
  it('encodes the input and sends the wire request', async () => {
    const requests: Array<unknown> = []
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: request =>
        Effect.sync(() => {
          requests.push(request)
          return {
            edges: [{ entity: 'Project', id: 'p1', key: 'Project:p1' }],
            start: { _tag: 'Terminal' as const },
            end: { _tag: 'Terminal' as const },
          }
        }),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })

    const ref = Query.first(25)(ProjectsByOwner.ref({ ownerId: 'u1', sort: 'newest' }))
    const result = await Effect.runPromise(Remote.query(ref).pipe(Effect.provide(client)))
    expect(requests).toEqual([
      { query: 'ProjectsByOwner', input: { ownerId: 'u1', sort: 'newest' }, window: { first: 25 } },
    ])

    // The page merges into the connection keyed by the ref's identity.
    const model = updateRemote(initialRemoteModel, Remote.queryMessage(ref, result))
    expect(items(model.connections[ref.identity]!).map(value => value.key)).toEqual(['Project:p1'])
  })
})

describe('Query.define declares a query by what it means', () => {
  const Post = DomainEntity.define(
    'Post',
    Schema.Struct({ id: Schema.String, slug: Schema.String, published: Schema.Boolean }),
  )

  const PostsBySlug = Query.define('PostsBySlug', { slug: Schema.String }, ({ input }) =>
    Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.slug, input.slug)),
      Query.orderBy(Order.asc(Post.fields.id)),
    ),
  )

  it('is a descriptor like any other: same name, input, ref and identity', () => {
    const made = Query.make('PostsBySlug', {
      Input: { slug: Schema.String },
      Result: Query.connection(Post),
    })

    expect(PostsBySlug.name).toBe(made.name)
    expect(PostsBySlug.ref({ slug: 'hello' }).identity).toBe(made.ref({ slug: 'hello' }).identity)
    expect(PostsBySlug.Result).toEqual(made.Result)
  })

  it('excludes the window from identity, as every connection does', () => {
    const base = PostsBySlug.ref({ slug: 'hello' })

    expect(Query.first(10)(base).identity).toBe(base.identity)
    expect(Query.after('c1')(Query.first(10)(base)).identity).toBe(base.identity)
  })

  it('carries the body, over the Entity it reads', () => {
    expect(PostsBySlug.body?.entity).toBe(Post)
    expect(PostsBySlug.body?.orderBy).toEqual([Order.asc(Post.fields.id)])
  })

  it('builds the body once, with placeholders and not values', () => {
    const [predicate] = PostsBySlug.body!.where

    expect(predicate).toEqual({
      _tag: 'Eq',
      left: Expr.field(Post.fields.slug),
      right: { _tag: 'Input', key: 'slug', schema: Schema.String },
    })
  })

  it('says what it reads, which is the whole point of carrying the body', () => {
    expect(Query.dependencies(PostsBySlug.body!)).toEqual({
      fields: [
        { entity: 'Post', key: 'slug' },
        { entity: 'Post', key: 'id' },
      ],
      inputs: ['slug'],
      operations: ['eq'],
    })
  })

  it('leaves a descriptor made the old way without a body', () => {
    const made = Query.make('Posts', { Input: {}, Result: Query.connection(Post) })

    expect(made.body).toBeUndefined()
  })

  it('names the result connection after the Entity the body reads', () => {
    expect(PostsBySlug.Result).toEqual({ entity: 'Post' })
    const live = Query.define('LivePosts', {}, () => Query.from(Post), {
      live: { prepend: 'visible' },
    })
    expect(live.Result).toEqual({ entity: 'Post', live: { prepend: 'visible' } })
  })

  it('gives a body with no inputs nothing to stand for', () => {
    const All = Query.define('AllPosts', {}, ({ input }) => {
      expect(input).toEqual({})
      return Query.from(Post)
    })

    expect(Query.dependencies(All.body!).inputs).toEqual([])
  })

  it('reaches a fragment composed outside the definition', () => {
    const published = Query.where(Expr.eq(Post.fields.published, true))
    const Published = Query.define('PublishedPosts', { slug: Schema.String }, ({ input }) =>
      Query.from(Post).pipe(published, Query.where(Expr.eq(Post.fields.slug, input.slug))),
    )

    expect(Published.body!.where).toHaveLength(2)
    expect(Query.dependencies(Published.body!).fields).toEqual([
      { entity: 'Post', key: 'published' },
      { entity: 'Post', key: 'slug' },
    ])
  })
})
