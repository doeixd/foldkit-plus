/**
 * `RemoteServer.memory`: a backend held in memory, through the real handlers.
 *
 * It exists so a first run needs no database and no network. It serves reads
 * through `RemoteServer.handlers`, so what a client sees is what a real server
 * would send. It runs a `Query.define` body with the reference interpreter, so
 * a query means here what the conformance suite says it means.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Mutation, Query, REMOTE_PROTOCOL_VERSION, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type MemoryBackend } from '../src/index.js'

const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const { User, Project } = Entity.relate(
  { User: UserBase, Project: ProjectBase },
  { Project: { owner: Relation.one(UserBase) } },
)

const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, input.status)),
    Query.orderBy(Order.asc(Project.fields.name)),
  ),
)
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ByStatus],
  mutations: [Rename],
})
const initial: Model = { remote: Remote.initial }

const rows = {
  User: [{ id: 'u1', name: 'Ada' }],
  Project: [
    { id: 'p1', name: 'Borealis', status: 'active', owner: 'User:u1' },
    { id: 'p2', name: 'Apollo', status: 'active', owner: 'User:u1' },
    { id: 'p3', name: 'Calypso', status: 'archived', owner: 'User:u1' },
  ],
}

const summary = Entity.select(Project, {
  name: true,
  owner: Entity.select(User, { name: true }),
})

/** What an active Surface would bring: the projection's queries, then its rows. */
const load = <P>(
  backend: MemoryBackend<P>,
  projection: Parameters<typeof Data.prefetch>[1],
  from: Model = initial,
): Promise<Model> =>
  Effect.runPromise(Data.prefetch(from, projection).pipe(Effect.provide(backend.layer)))

describe('RemoteServer.memory', () => {
  it('serves an entity and the relation it selects', async () => {
    const backend = RemoteServer.memory({ domain: Data, rows })
    const project = Data.get(summary, 'p1')

    const model = await load(backend, project)

    expect(project.read(model)).toEqual({
      _tag: 'Ready',
      value: { name: 'Borealis', owner: { name: 'Ada' } },
    })
  })

  it('answers an id it does not hold as absent', async () => {
    const backend = RemoteServer.memory({ domain: Data, rows })
    const missing = Data.get(summary, 'p9')

    expect(missing.read(await load(backend, missing))._tag).toBe('NotFound')
  })

  it('runs a query body over the rows, in its order, a page at a time', async () => {
    const backend = RemoteServer.memory({ domain: Data, rows })
    const first = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 1 })

    const model = await load(backend, first)
    const page = first.read(model)

    expect(page).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ name: 'Apollo' }], hasNext: true, hasPrevious: false },
    })

    // One more row shown: the next page is fetched and its rows read, as on screen.
    const more = await load(backend, first, Option.getOrThrow(Data.more(model, first)))
    expect(first.read(more)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ name: 'Apollo' }, { name: 'Borealis' }], hasNext: false },
    })
  })

  it('pages forward into one joined list, and backward the same', async () => {
    const many = {
      ...rows,
      Project: ['a', 'b', 'c', 'd', 'e'].map(id => ({
        id,
        name: id,
        status: 'active',
        owner: 'User:u1',
      })),
    }
    const backend = RemoteServer.memory({ domain: Data, rows: many })
    /** Loads more until there is no more: five rows, two at a time, is three loads. */
    const walk = async (projection: typeof forward) => {
      let model = await load(backend, projection)
      for (let loads = 1; loads < 3; loads += 1) {
        model = await load(backend, projection, Option.getOrThrow(Data.more(model, projection)))
      }
      expect(Option.isNone(Data.more(model, projection))).toBe(true)
      return model
    }
    const forward = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 2 })
    const backward = Data.query(ByStatus, { status: 'active' }, { select: summary, last: 2 })

    const ahead = await walk(forward)
    const behind = await walk(backward)

    for (const [model, projection] of [
      [ahead, forward],
      [behind, backward],
    ] as const) {
      // One segment, terminal at both ends: the pages joined, with no gap.
      const connection = model.remote.connections[projection.ref.identity]!
      expect(connection.segments).toHaveLength(1)
      expect(connection.segments[0]!.start._tag).toBe('Terminal')
      expect(connection.segments[0]!.end._tag).toBe('Terminal')
      expect(projection.read(model)).toMatchObject({
        _tag: 'Ready',
        value: { items: ['a', 'b', 'c', 'd', 'e'].map(name => ({ name })) },
      })
    }
  })

  it('loads more after the last row stopped matching, and refuses one that is gone', async () => {
    const backend = RemoteServer.memory({ domain: Data, rows })
    const first = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 1 })
    const model = await load(backend, first)
    const grown = Option.getOrThrow(Data.more(model, first))

    // Apollo, the row the page ended on, is archived: it leaves the results but
    // keeps its place in the order, so the next page is still Borealis.
    backend.write('Project', 'p2', { status: 'archived' })
    const after = await load(backend, first, grown)
    expect(
      after.remote.connections[first.ref.identity]!.segments[0]!.edges.map(edge => edge.ref.id),
    ).toEqual(['p2', 'p1'])

    backend.remove('Project', 'p2')
    const gone = await Effect.runPromiseExit(
      Data.prefetch(grown, first).pipe(Effect.provide(backend.layer)),
    )
    expect(gone._tag).toBe('Failure')
  })

  it('reads a row whose id arrived as a number', async () => {
    const backend = RemoteServer.memory({
      domain: Data,
      rows: {
        ...rows,
        Project: [{ id: 7 as never, name: 'Seven', status: 'active', owner: 'User:u1' }],
      },
    })
    const seven = Data.get(summary, '7')

    expect((seven.read(await load(backend, seven)) as { _tag: string })._tag).toBe('Ready')
  })

  it('says a page of no rows cannot tell where it ends, while more remain', async () => {
    const backend = RemoteServer.memory({ domain: Data, rows })
    const none = Query.first(0)(ByStatus.ref({ status: 'active' }))

    const page = await Effect.runPromise(Remote.query(none).pipe(Effect.provide(backend.layer)))

    expect(Remote.queryMessage(none, page)).toMatchObject({
      _tag: 'ConnectionMerged',
      page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Unknown' } },
    })
  })

  it('refuses a window that asks for both directions', async () => {
    const backend = RemoteServer.memory({ domain: Data, rows })
    const both = Query.first(1)(Query.last(1)(ByStatus.ref({ status: 'active' })))

    const answer = await Effect.runPromiseExit(
      Remote.query(both).pipe(Effect.provide(backend.layer)),
    )

    expect(answer._tag).toBe('Failure')
  })

  it('shows a mutation’s write on the next read', async () => {
    const backend = RemoteServer.memory({
      domain: Data,
      rows,
      mutations: store => [
        RemoteServer.mutation(Rename, ({ input }) => {
          store.write('Project', input.id, { name: input.name })
          return Effect.succeed({
            output: { id: input.id },
            entities: [Remote.patch(Project, input.id, { name: input.name })],
          })
        }),
      ],
    })

    const { command } = Data.mutate(initial, Rename, { id: 'p1', name: 'Borealis II' })
    await Effect.runPromise(command.effect.pipe(Effect.provide(backend.layer)))

    expect(backend.rows('Project').find(row => row.id === 'p1')?.name).toBe('Borealis II')
    const project = Data.get(summary, 'p1')
    expect(project.read(await load(backend, project))).toMatchObject({
      _tag: 'Ready',
      value: { name: 'Borealis II' },
    })
  })

  it('serves a to-many relation stored as a list of ref keys', async () => {
    const CommentBase = Entity.define(
      'Comment',
      Schema.Struct({ id: Schema.String, body: Schema.String }),
    )
    const PostBase = Entity.define(
      'Post',
      Schema.Struct({ id: Schema.String, title: Schema.String }),
    )
    const Blog = Entity.relate(
      { Comment: CommentBase, Post: PostBase },
      { Post: { comments: Relation.many(CommentBase) } },
    )
    const BlogData = Remote.make({ model: App.model.remote, entities: [Blog.Comment, Blog.Post] })
    const backend = RemoteServer.memory({
      domain: BlogData,
      rows: {
        Post: [{ id: 'a', title: 'Hello', comments: ['Comment:c1', 'Comment:c2'] }],
        Comment: [
          { id: 'c1', body: 'first' },
          { id: 'c2', body: 'second' },
        ],
      },
    })
    const post = BlogData.get(
      Entity.select(Blog.Post, {
        title: true,
        comments: Entity.select(Blog.Comment, { body: true }),
      }),
      'a',
    )

    const model = await Effect.runPromise(
      BlogData.prefetch(initial, post).pipe(Effect.provide(backend.layer)),
    )

    expect(post.read(model)).toEqual({
      _tag: 'Ready',
      value: { title: 'Hello', comments: [{ body: 'first' }, { body: 'second' }] },
    })
  })

  it('serves a page of a to-many relation, with whether more follow', async () => {
    const CommentBase = Entity.define(
      'Comment',
      Schema.Struct({ id: Schema.String, body: Schema.String }),
    )
    const PostBase = Entity.define(
      'Post',
      Schema.Struct({ id: Schema.String, title: Schema.String }),
    )
    const Blog = Entity.relate(
      { Comment: CommentBase, Post: PostBase },
      { Post: { comments: Relation.many(CommentBase) } },
    )
    const BlogData = Remote.make({ model: App.model.remote, entities: [Blog.Comment, Blog.Post] })
    const backend = RemoteServer.memory({
      domain: BlogData,
      rows: {
        // c1 listed twice: paging must not cycle back to it.
        Post: [
          {
            id: 'a',
            title: 'Hello',
            comments: ['Comment:c1', 'Comment:c2', 'Comment:c1', 'Comment:c3'],
          },
        ],
        Comment: [
          { id: 'c1', body: 'first' },
          { id: 'c2', body: 'second' },
          { id: 'c3', body: 'third' },
        ],
      },
    })
    const post = BlogData.get(
      Entity.select(Blog.Post, {
        title: true,
        comments: Entity.page(Entity.select(Blog.Comment, { body: true }), { first: 2 }),
      }),
      'a',
    )

    const model = await Effect.runPromise(
      BlogData.prefetch(initial, post).pipe(Effect.provide(backend.layer)),
    )

    expect(post.read(model)).toEqual({
      _tag: 'Ready',
      value: {
        title: 'Hello',
        comments: {
          items: [{ body: 'first' }, { body: 'second' }],
          hasNext: true,
          hasPrevious: false,
        },
      },
    })

    // Each relation window the server can be asked for, straight through the
    // client's transport: a ref-key cursor, a bare id, backward, and a cursor
    // that names nothing.
    const read = (window: Record<string, unknown>) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* RemoteClient
          return yield* client.read({
            version: REMOTE_PROTOCOL_VERSION,
            requests: [
              {
                entity: 'Post',
                id: 'a',
                fields: ['comments@w'],
                windows: { 'comments@w': window },
              },
            ],
          })
        }).pipe(Effect.provide(backend.layer)),
      )
    const page = async (window: Record<string, unknown>) =>
      (await read(window)).entities[0]!.values['comments@w']

    expect(await page({ first: 1, after: 'Comment:c1' })).toEqual({
      refs: ['Comment:c2'],
      hasNext: true,
      hasPrevious: true,
    })
    expect(await page({ first: 1, after: 'c1' })).toEqual({
      refs: ['Comment:c2'],
      hasNext: true,
      hasPrevious: true,
    })
    expect(await page({ first: 1, after: 'c2' })).toEqual({
      refs: ['Comment:c3'],
      hasNext: false,
      hasPrevious: true,
    })
    expect(await page({ last: 2 })).toEqual({
      refs: ['Comment:c2', 'Comment:c3'],
      hasNext: false,
      hasPrevious: true,
    })
    expect(await page({ last: 1, before: 'c3' })).toEqual({
      refs: ['Comment:c2'],
      hasNext: true,
      hasPrevious: true,
    })
    // A cursor that names nothing empties that one field, rather than failing
    // the batch: the post's title rides in the same read and still arrives.
    const batch = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [
            {
              entity: 'Post',
              id: 'a',
              fields: ['title', 'comments@w'],
              windows: { 'comments@w': { first: 1, after: 'Comment:gone' } },
            },
            { entity: 'Comment', id: 'c1', fields: ['body'] },
          ],
        })
      }).pipe(Effect.provide(backend.layer)),
    )
    expect(batch.entities).toEqual([
      {
        entity: 'Post',
        id: 'a',
        values: { title: 'Hello', 'comments@w': { refs: [], hasNext: false, hasPrevious: false } },
      },
      { entity: 'Comment', id: 'c1', values: { body: 'first' } },
    ])
  })

  describe('authorize', () => {
    // A guest may not read a project's status; anyone else may.
    const guarded = (principal: string) =>
      RemoteServer.memory({
        domain: Data,
        rows,
        principal,
        authorize: {
          Project: (who: string, fields) =>
            who === 'guest' ? fields.filter(field => field !== 'status') : fields,
        },
      })
    const read = (layer: Layer.Layer<RemoteClient>) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* RemoteClient
          return yield* client.read({
            version: REMOTE_PROTOCOL_VERSION,
            requests: [
              { entity: 'Project', id: 'p1', fields: ['name', 'status'] },
              { entity: 'User', id: 'u1', fields: ['name'] },
            ],
          })
        }).pipe(Effect.provide(layer)),
      )

    it('reads as the principal it was given, and settles what is withheld', async () => {
      const batch = await read(guarded('guest').layer)

      expect(batch.entities).toEqual([
        { entity: 'Project', id: 'p1', values: { name: 'Borealis' } },
        { entity: 'User', id: 'u1', values: { name: 'Ada' } },
      ])
      expect(batch.settled).toEqual([{ entity: 'Project', id: 'p1', fields: ['status'] }])
    })

    it('decides per principal, and its server answers as any', async () => {
      const backend = guarded('guest')
      const asAdmin = Remote.clientLayer(RemoteServer.handlers(backend.server, 'admin'))
      const batch = await read(asAdmin)

      expect(batch.entities[0]).toEqual({
        entity: 'Project',
        id: 'p1',
        values: { name: 'Borealis', status: 'active' },
      })
    })

    it('withholds a field from the rows a query body answers with', async () => {
      const backend = guarded('guest')
      const first = Data.query(
        ByStatus,
        { status: 'active' },
        { select: Entity.select(Project, { name: true, status: true }), first: 1 },
      )
      const page = first.read(await load(backend, first))

      // A selection that needs a withheld field cannot be drawn: the client
      // says so rather than waiting for it.
      expect(page).toMatchObject({
        _tag: 'Failed',
        error: { _tag: 'Unavailable', message: expect.stringContaining('Project:p2.status') },
      })
    })

    it('refuses, when made, an entity the domain does not declare', () => {
      expect(() =>
        RemoteServer.memory({ domain: Data, rows, authorize: { Projct: (_, fields) => fields } }),
      ).toThrow(
        'RemoteServer.memory: `authorize` names "Projct", which the domain does not declare',
      )
    })
  })

  it('refuses, when made, a query it has no body to run', () => {
    const Bodiless = Query.make('Bodiless', { Input: {}, Result: Query.connection(Project) })
    const domain = Remote.define({ entities: [Project], queries: [Bodiless] })

    expect(() => RemoteServer.memory({ domain, rows })).toThrow(
      'RemoteServer.memory: "Bodiless" has no body to run',
    )
  })
})
