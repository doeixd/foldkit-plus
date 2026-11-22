/**
 * A cascade declared in the domain (#343), landed by the writer itself: no
 * table here has a foreign key, so every row removed with a post is removed
 * by the writer, in the transaction (SQLite, Postgres) or the batch (D1) that
 * deletes the post. A thread: p1 by Ada, its reply p2 by Bo, p2's reply p3 by
 * Ada; a like on each, and p9, which nothing points at.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { eq, getTableColumns } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { boolean as pgBoolean, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  Collation,
  Derived,
  Entity,
  Expr,
  Order,
  Query as Body,
  Relation,
  Write,
  type AnyQuery,
  type AuthorizedBy,
} from 'foldkit-entity'
import { Mutation, Query, Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer, RowRequirement, type CascadeRequirement } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, source, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, body: Schema.String, pinned: Schema.Boolean }),
)
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Feed = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  {
    Post: {
      author: Relation.one(UserFields),
      replyTo: Relation.one(PostFields, { optional: true, onDelete: 'cascade' }),
    },
    Like: {
      post: Relation.one(PostFields, { onDelete: 'cascade' }),
      user: Relation.one(UserFields),
    },
  },
)
/**
 * The same thread where a post's author may take the likes under it
 * (`authorizedBy: 'parent'`), while each reply is still its own author's.
 */
const Parented = (() => {
  const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
  const Post = Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, body: Schema.String, pinned: Schema.Boolean }),
  )
  const parent: AuthorizedBy = 'parent'
  return Entity.relate(
    { User, Post, Like: Entity.define('Like', Schema.Struct({ id: Schema.String })) },
    {
      Post: {
        author: Relation.one(User),
        replyTo: Relation.one(Post, { optional: true, onDelete: 'cascade' }),
      },
      Like: {
        post: Relation.one(Post, { onDelete: 'cascade', authorizedBy: parent }),
        user: Relation.one(User),
      },
    },
  )
})()
const User = Feed.User.pipe(
  Entity.derived({ postCount: Derived.count(Feed.Post.relations.author) }),
)
const Post = Feed.Post.pipe(Entity.derived({ likeCount: Derived.count(Feed.Like.relations.post) }))
const Like = Feed.Like

const DeletePost = Mutation.write(
  'DeletePost',
  Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
/** Only an unpinned post: a delete that misses takes nothing with it. */
const DeleteUnpinned = Mutation.write(
  'DeleteUnpinned',
  Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), {
    id: 'id',
    when: () => Expr.eq(Post.fields.pinned, false),
  }),
)
const binary = { collation: Collation.binary }
const Everything = Query.define('Everything', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id, binary))),
)

const sqliteTables = {
  users: sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() }),
  posts: sqliteTable('posts', {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull(),
    authorId: text('author_id').notNull(),
    replyToId: text('reply_to_id'),
  }),
  likes: sqliteTable('likes', {
    id: text('id').primaryKey(),
    postId: text('post_id').notNull(),
    userId: text('user_id').notNull(),
  }),
}
const pgTables = {
  users: pgTable('users', { id: pgText('id').primaryKey(), name: pgText('name').notNull() }),
  posts: pgTable('posts', {
    id: pgText('id').primaryKey(),
    body: pgText('body').notNull(),
    pinned: pgBoolean('pinned').notNull(),
    authorId: pgText('author_id').notNull(),
    replyToId: pgText('reply_to_id'),
  }),
  likes: pgTable('likes', {
    id: pgText('id').primaryKey(),
    postId: pgText('post_id').notNull(),
    userId: pgText('user_id').notNull(),
  }),
}
type Tables = typeof sqliteTables | typeof pgTables

const tablesOf = ({ users, posts, likes }: Tables, ownLikes: boolean) =>
  ({
    User: { table: users },
    Post: {
      table: posts,
      relations: { author: { field: posts.authorId }, replyTo: { field: posts.replyToId } },
    },
    Like: {
      table: likes,
      relations: { post: { field: likes.postId }, user: { field: likes.userId } },
      // Where asked: each reader sees only their own likes.
      ...(ownLikes ? { visible: (principal: unknown) => eq(likes.userId, String(principal)) } : {}),
    },
  }) as const
const bindOn = (tables: Tables, ownLikes = false) =>
  bind({ User, Post, Like }, tablesOf(tables, ownLikes))
const bindParented = (tables: Tables) =>
  bind({ User: Parented.User, Post: Parented.Post, Like: Parented.Like }, tablesOf(tables, false))

const SCHEMA = [
  'create table users (id text primary key, name text not null)',
  'create table posts (id text primary key, body text not null, pinned boolean not null, author_id text not null, reply_to_id text)',
  // No user is a like the rules cannot judge: `user_id = ?` is unknown for it.
  'create table likes (id text primary key, post_id text not null, user_id text)',
  "insert into users values ('ada', 'Ada'), ('bo', 'Bo')",
  `insert into posts values
    ('p1', 'root', false, 'ada', null),
    ('p2', 'reply', false, 'bo', 'p1'),
    ('p3', 'reply to the reply', false, 'ada', 'p2'),
    ('p8', 'pinned', true, 'bo', null),
    ('p9', 'alone', false, 'bo', null)`,
  `insert into likes values
    ('l1', 'p1', 'bo'), ('l2', 'p2', 'ada'), ('l3', 'p3', 'bo'), ('l8', 'p8', 'ada'), ('l9', 'p9', 'ada')`,
]

interface Backend {
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly ids: (table: 'posts' | 'likes') => Promise<ReadonlyArray<string>>
  readonly Db: ReturnType<typeof bindOn>
  /** The same tables, each reader seeing only their own likes. */
  readonly Own: ReturnType<typeof bindOn>
  readonly Parented: ReturnType<typeof bindParented>
  readonly exec: (statement: string) => Promise<void>
  /** What the writer is told of the database: Postgres here runs serializable. */
  readonly writing: { readonly isolation?: 'serializable' }
}

const sqliteBackend = (): Backend => {
  const sqlite = new DatabaseSync(':memory:')
  // SQLite's own foreign keys are off here: the writer holds the cascade alone.
  sqlite.exec('pragma foreign_keys = off')
  for (const statement of SCHEMA)
    sqlite.exec(statement.replaceAll('false', '0').replaceAll('true', '1'))
  return {
    layer: databaseLayer(drizzle({ client: sqlite })),
    ids: async table =>
      sqlite
        .prepare(`select id from ${table} order by id`)
        .all()
        .map(row => String(row['id'])),
    Db: bindOn(sqliteTables),
    Own: bindOn(sqliteTables, true),
    Parented: bindParented(sqliteTables),
    exec: async statement => void sqlite.exec(statement),
    writing: {},
  }
}

let pglite: PGlite
let mf: Miniflare
beforeAll(async () => {
  pglite = await PGlite.create()
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
  })
}, 60_000)
afterAll(async () => {
  await pglite.close()
  await mf.dispose()
})

const pgBackend = async (): Promise<Backend> => {
  // Without a foreign key, only serializable Postgres holds a cascade against a new link.
  await pglite.exec("set default_transaction_isolation to 'serializable'")
  await pglite.exec('drop table if exists users, posts, likes')
  for (const statement of SCHEMA) await pglite.exec(statement)
  return {
    layer: databaseLayer(drizzlePg({ client: pglite })),
    ids: async table =>
      (await pglite.query<{ id: string }>(`select id from ${table} order by id`)).rows.map(
        row => row.id,
      ),
    Db: bindOn(pgTables),
    Own: bindOn(pgTables, true),
    Parented: bindParented(pgTables),
    exec: async statement => void (await pglite.exec(statement)),
    writing: { isolation: 'serializable' },
  }
}

const d1Backend = async (): Promise<Backend> => {
  const db = await mf.getD1Database('DB')
  await db.batch(
    ['drop table if exists users', 'drop table if exists posts', 'drop table if exists likes']
      .concat(SCHEMA.map(statement => statement.replaceAll('false', '0').replaceAll('true', '1')))
      .map(statement => db.prepare(statement)),
  )
  return {
    layer: databaseLayer(drizzleD1(db)),
    ids: async table =>
      (await db.prepare(`select id from ${table} order by id`).all<{ id: string }>()).results.map(
        row => row.id,
      ),
    Db: bindOn(sqliteTables),
    Own: bindOn(sqliteTables, true),
    Parented: bindParented(sqliteTables),
    exec: async statement => void (await db.prepare(statement).run()),
    writing: {},
  }
}

const backends: ReadonlyArray<readonly [string, () => Promise<Backend>]> = [
  ['SQLite', async () => sqliteBackend()],
  ['Postgres', pgBackend],
  ['D1', d1Backend],
]

const serverOf = (Db: Backend['Db'], writing: Backend['writing']) =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities: [source(Db.User), source(Db.Post), source(Db.Like)],
    queries: [query(Everything, { entity: Db.Post })],
    mutations: [
      RemoteServer.write(DeletePost, writer(Db.Post, writing)),
      RemoteServer.write(DeleteUnpinned, writer(Db.Post, writing)),
    ],
    viewer: principal => Option.some({ entity: 'User', id: principal }),
  })

const sent = (backend: Backend, mutation: string, input: unknown) =>
  Effect.runPromise(
    RemoteServer.handlers(serverOf(backend.Db, backend.writing), 'ada')
      .FoldkitRemoteMutate({ requestId: 'r1', mutation, input })
      .pipe(Effect.result, Effect.provide(backend.layer)),
  )

describe.each(backends)('A declared cascade, on %s', (_, open) => {
  it('takes the thread with the post: its replies, their replies, and every like of them', async () => {
    const backend = await open()
    const answer = await sent(backend, 'DeletePost', { id: 'p1' })
    expect(await backend.ids('posts')).toEqual(['p8', 'p9'])
    expect(await backend.ids('likes')).toEqual(['l8', 'l9'])
    expect(answer).toMatchObject({ _tag: 'Success' })
    const deleted = answer._tag === 'Success' ? (answer.success.deleted ?? []) : []
    expect(deleted.map(({ entity, id }) => `${entity}:${id}`).sort()).toEqual(
      ['Like:l1', 'Like:l2', 'Like:l3', 'Post:p1', 'Post:p2', 'Post:p3'].sort(),
    )
  })

  it('names only the rows its asker may see, and removes the rest unnamed', async () => {
    const backend = await open()
    const answer = await Effect.runPromise(
      RemoteServer.handlers(serverOf(backend.Own, backend.writing), 'ada')
        .FoldkitRemoteMutate({ requestId: 'r1', mutation: 'DeletePost', input: { id: 'p1' } })
        .pipe(Effect.result, Effect.provide(backend.layer)),
    )
    const deleted = answer._tag === 'Success' ? (answer.success.deleted ?? []) : []
    expect(deleted.map(({ entity, id }) => `${entity}:${id}`).sort()).toEqual(
      ['Like:l2', 'Post:p1', 'Post:p2', 'Post:p3'].sort(),
    )
    expect(await backend.ids('likes')).toEqual(['l8', 'l9'])
  })

  it('takes nothing when the delete misses', async () => {
    const backend = await open()
    const answer = await sent(backend, 'DeleteUnpinned', { id: 'p8' })
    expect(answer).toMatchObject({ _tag: 'Failure' })
    expect(await backend.ids('posts')).toEqual(['p1', 'p2', 'p3', 'p8', 'p9'])
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l3', 'l8', 'l9'])
  })

  it('takes nothing when the row named is not there, even with rows pointing at its id', async () => {
    const backend = await open()
    await backend.exec("insert into likes values ('l4', 'missing', 'bo')")
    const answer = await sent(backend, 'DeletePost', { id: 'missing' })
    expect(answer).toMatchObject({ _tag: 'Success' })
    const deleted = answer._tag === 'Success' ? (answer.success.deleted ?? []) : []
    expect(deleted.map(({ entity, id }) => `${entity}:${id}`)).toEqual(['Post:missing'])
    expect(await backend.ids('posts')).toEqual(['p1', 'p2', 'p3', 'p8', 'p9'])
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l3', 'l4', 'l8', 'l9'])
  })

  it('removes only what points at the row deleted', async () => {
    const backend = await open()
    await sent(backend, 'DeletePost', { id: 'p2' })
    expect(await backend.ids('posts')).toEqual(['p1', 'p8', 'p9'])
    expect(await backend.ids('likes')).toEqual(['l1', 'l8', 'l9'])
  })
})

/** A Delete rule as a guard hands it to the writer: a body over the row, for `viewer`. */
const ruleOf = (
  entity: string,
  body: AnyQuery,
  viewer: string,
  reason: Option.Option<string> = Option.none(),
): CascadeRequirement => ({
  entity,
  requires: {
    holds: RowRequirement.Body({
      query: body,
      input: {},
      context: { viewer: Option.some({ entity: 'User', id: viewer }), now: Option.none() },
    }),
    reason,
  },
})
const likerOnly = (viewer: string, reason?: string) =>
  ruleOf(
    'Like',
    Body.from(Like).pipe(Body.where(Expr.eq(Like.relations.user, Expr.viewer(UserFields)))),
    viewer,
    Option.fromUndefinedOr(reason),
  )
const authorOnly = (viewer: string, over: typeof Post | typeof Parented.Post = Post) =>
  ruleOf(
    'Post',
    Body.from(over).pipe(Body.where(Expr.eq(over.relations.author, Expr.viewer(UserFields)))),
    viewer,
  )

/**
 * Who may let a cascade take a row (#348): each row's own Delete rule, as
 * a guard hands it to the writer, judged in the statement that deletes the
 * row named, before anything goes.
 */
describe.each(backends)('A cascade judged by each row it takes, on %s', (_, open) => {
  const deleting = (
    backend: Backend,
    binding: Backend['Db']['Post'] | Backend['Parented']['Post'],
    id: string,
    cascading: ReadonlyArray<CascadeRequirement>,
    principal = 'ada',
  ) =>
    Effect.runPromise(
      writer(binding)
        .delete({ id, expect: Option.none(), when: Option.none(), cascading, principal })
        .pipe(Effect.result, Effect.provide(backend.layer)),
    )
  const unchanged = async (backend: Backend) => {
    expect(await backend.ids('posts')).toEqual(['p1', 'p2', 'p3', 'p8', 'p9'])
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l3', 'l8', 'l9'])
  }

  it("is refused whole when it would take another's like, and removes nothing", async () => {
    const backend = await open()
    const answer = await deleting(backend, backend.Db.Post, 'p1', [likerOnly('ada')])
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    await unchanged(backend)
  })

  it('names the Entity it refused for, never the row: not its id, nor whose it is', async () => {
    const backend = await open()
    const answer = await deleting(backend, backend.Db.Post, 'p1', [
      likerOnly('ada', 'Only its liker may take a like back.'),
    ])
    const message = answer._tag === 'Failure' ? String(answer.failure.message) : ''
    expect(message).toBe(
      'It would delete a Like you may not delete: Only its liker may take a like back.',
    )
    expect(message).not.toMatch(/l1|l3|bo|p2|p3/)
  })

  it('is refused for a reply by someone else, deeper in the thread', async () => {
    const backend = await open()
    const answer = await deleting(backend, backend.Db.Post, 'p1', [authorOnly('ada')])
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    await unchanged(backend)
  })

  it('takes what every rule allows', async () => {
    const backend = await open()
    // p3 is Ada's, and has only Bo's like: Bo may not take p3, Ada may.
    expect(
      await deleting(backend, backend.Db.Post, 'p3', [likerOnly('bo'), authorOnly('bo')], 'bo'),
    ).toMatchObject({ _tag: 'Success', success: { _tag: 'Deleted' } })
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l8', 'l9'])
  })

  it('refuses a row its rule cannot judge (a like of no one), rather than taking it', async () => {
    const backend = await open()
    await backend.exec("insert into likes values ('l7', 'p9', null)")
    const answer = await deleting(backend, backend.Db.Post, 'p9', [likerOnly('ada')])
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l3', 'l7', 'l8', 'l9'])
  })

  it('takes, under authorizedBy: parent, the likes their own rule would refuse', async () => {
    const backend = await open()
    // Ada's p3 has Bo's like l3: the parent's delete takes it; Post's own rule still judges replies.
    expect(
      await deleting(backend, backend.Parented.Post, 'p3', [authorOnly('ada', Parented.Post)]),
    ).toMatchObject({ _tag: 'Success', success: { _tag: 'Deleted' } })
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l8', 'l9'])
    const deeper = await deleting(backend, backend.Parented.Post, 'p1', [
      authorOnly('ada', Parented.Post),
    ])
    expect(deeper).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(await backend.ids('posts')).toEqual(['p1', 'p2', 'p8', 'p9'])
  })

  it("refuses a rule for rows it takes under their parent's, as its caller's mistake", async () => {
    const backend = await open()
    const answer = await deleting(backend, backend.Parented.Post, 'p1', [likerOnly('ada')])
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'RemoteServerError' } })
    await unchanged(backend)
  })
})

describe('The law over a cascading delete', () => {
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
  const Data = Remote.make({
    model: App.model.remote,
    entities: [User, Post, Like],
    queries: [Everything],
    mutations: [DeletePost, DeleteUnpinned],
    viewer: () => Option.some(Remote.ref(UserFields, 'ada')),
  })

  it("agrees on every count and list while pending, and once answered (Ada's postCount was 1 to 0)", async () => {
    const backend = sqliteBackend()
    const report = await Effect.runPromise(
      Law.check(Data, {
        model: { remote: Remote.initial },
        holds: [
          { entity: User, ids: ['ada', 'bo'] },
          { entity: Post, ids: ['p1', 'p2', 'p3', 'p8', 'p9'] },
          { entity: Like, ids: ['l1', 'l2', 'l3', 'l8', 'l9'] },
        ],
        lists: [Everything.ref({})],
        mutation: DeletePost,
        input: { id: 'p1' },
        now: 1,
      }).pipe(
        Effect.provide(
          Remote.clientLayer(
            RemoteServer.handlers(serverOf(backend.Db, backend.writing), 'ada'),
          ).pipe(Layer.provide(backend.layer)),
        ),
      ),
    )
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(
      expect.arrayContaining([
        'Post:p2',
        'Post:p3',
        'Like:l2',
        'User:ada.postCount',
        'User:bo.postCount',
        Everything.ref({}).identity,
      ]),
    )
  })
})

describe('A cascade the store must agree with', () => {
  const posts = sqliteTable('posts', { id: text('id').primaryKey(), body: text('body').notNull() })
  const tableWith = (onDelete: 'cascade' | 'no action') =>
    sqliteTable('likes', {
      id: text('id').primaryKey(),
      postId: text('post_id')
        .notNull()
        .references(() => posts.id, { onDelete }),
    })
  const bindLikes = (cascading: boolean, likes: ReturnType<typeof tableWith>) => {
    const P = Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
    const L = Entity.define('Like', Schema.Struct({ id: Schema.String }))
    const related = Entity.relate(
      { Post: P, Like: L },
      { Like: { post: Relation.one(P, cascading ? { onDelete: 'cascade' } : {}) } },
    )
    return () =>
      bind(
        { Post: related.Post, Like: related.Like },
        {
          Post: { table: posts },
          Like: { table: likes, relations: { post: { field: likes.postId } } },
        },
      )
  }

  it('is refused where the table cascades and the relation does not say so', () => {
    expect(bindLikes(false, tableWith('cascade'))).toThrow(/onDelete: 'cascade'/)
  })

  it('is refused where the relation cascades and the table does not', () => {
    expect(bindLikes(true, tableWith('no action'))).toThrow(/on delete cascade/)
  })

  it('binds where both say it', () => {
    expect(Object.keys(getTableColumns(tableWith('cascade')))).toContain('postId')
    expect(bindLikes(true, tableWith('cascade'))).not.toThrow()
  })

  it('refuses a cascade that comes back through another Entity, where the writer is made', () => {
    const A = Entity.define('A', Schema.Struct({ id: Schema.String }))
    const B = Entity.define('B', Schema.Struct({ id: Schema.String }))
    const related = Entity.relate(
      { A, B },
      {
        A: { b: Relation.one(B, { optional: true, onDelete: 'cascade' }) },
        B: { a: Relation.one(A, { optional: true, onDelete: 'cascade' }) },
      },
    )
    const as = sqliteTable('as', { id: text('id').primaryKey(), bId: text('b_id') })
    const bs = sqliteTable('bs', { id: text('id').primaryKey(), aId: text('a_id') })
    const Db = bind(
      { A: related.A, B: related.B },
      {
        A: { table: as, relations: { b: { field: as.bId } } },
        B: { table: bs, relations: { a: { field: bs.aId } } },
      },
    )
    expect(() => writer(Db.A)).toThrow(/back into A/)
  })

  it('refuses a delete through a writer that does not apply cascades', () => {
    const backend = sqliteBackend()
    const { cascades: _, ...forgetful } = writer(backend.Db.Post)
    expect(() => RemoteServer.write(DeletePost, forgetful)).toThrow(/cascades/)
  })
})

describe('Postgres row locking during a cascade', () => {
  it('locks root, self-cascade replies, and child likes for update before any delete', async () => {
    await pglite.exec("set default_transaction_isolation to 'read committed'")
    await pglite.exec('drop table if exists users, posts, likes')
    for (const statement of SCHEMA) await pglite.exec(statement)
    const queries: Array<string> = []
    const db = drizzlePg({ client: pglite, logger: { logQuery: query => queries.push(query) } })
    const Db = bindOn(pgTables)
    const outcome = await Effect.runPromise(
      writer(Db.Post)
        .delete({ id: 'p1', expect: Option.none(), when: Option.none(), principal: 'ada' })
        .pipe(Effect.provide(databaseLayer(db))),
    )
    expect(outcome).toMatchObject({ _tag: 'Deleted' })
    const locks = queries.filter(q => q.toLowerCase().includes('for update'))
    const firstDelete = queries.findIndex(q => q.toLowerCase().startsWith('delete '))
    expect(firstDelete).toBeGreaterThan(-1)
    // Root post locked first, then self-cascade posts (with fixpoint re-check), then likes.
    expect(locks.length).toBeGreaterThanOrEqual(4)
    expect(locks[0]).toMatch(/from "posts".*for update/i)
    expect(locks[1]).toMatch(/from "posts".*with recursive.*for update/i)
    expect(locks[2]).toMatch(/from "posts".*with recursive.*for update/i)
    expect(locks[locks.length - 1]).toMatch(/from "likes".*for update/i)
    // Every FOR UPDATE runs before the first DELETE.
    for (const lock of locks) {
      expect(queries.indexOf(lock)).toBeLessThan(firstDelete)
    }
    expect(
      (await pglite.query<{ id: string }>('select id from posts order by id')).rows.map(r => r.id),
    ).toEqual(['p8', 'p9'])
    expect(
      (await pglite.query<{ id: string }>('select id from likes order by id')).rows.map(r => r.id),
    ).toEqual(['l8', 'l9'])
  })

  it('locks intermediate parents top-down for a 2-hop Postgres FK cascade at read committed', async () => {
    const Org = Entity.define('Org', Schema.Struct({ id: Schema.String }))
    const Proj = Entity.define('Proj', Schema.Struct({ id: Schema.String }))
    const Item = Entity.define('Item', Schema.Struct({ id: Schema.String }))
    const Tree = Entity.relate(
      { Org, Proj, Item },
      {
        Proj: { org: Relation.one(Org, { onDelete: 'cascade' }) },
        Item: { proj: Relation.one(Proj, { onDelete: 'cascade' }) },
      },
    )
    const orgs = pgTable('lock_orgs', { id: pgText('id').primaryKey() })
    const projs = pgTable('lock_projs', {
      id: pgText('id').primaryKey(),
      orgId: pgText('org_id')
        .notNull()
        .references(() => orgs.id, { onDelete: 'cascade' }),
    })
    const items = pgTable('lock_items', {
      id: pgText('id').primaryKey(),
      projId: pgText('proj_id')
        .notNull()
        .references(() => projs.id, { onDelete: 'cascade' }),
    })
    await pglite.exec("set default_transaction_isolation to 'read committed'")
    await pglite.exec('drop table if exists lock_items, lock_projs, lock_orgs')
    await pglite.exec(`
      create table lock_orgs (id text primary key);
      create table lock_projs (id text primary key, org_id text not null references lock_orgs (id) on delete cascade);
      create table lock_items (id text primary key, proj_id text not null references lock_projs (id) on delete cascade);
      insert into lock_orgs values ('o1'), ('o2');
      insert into lock_projs values ('pr1', 'o1'), ('pr2', 'o2');
      insert into lock_items values ('i1', 'pr1'), ('i2', 'pr2');
    `)
    const Db = bind(Tree, {
      Org: { table: orgs },
      Proj: { table: projs, relations: { org: { field: projs.orgId } } },
      Item: { table: items, relations: { proj: { field: items.projId } } },
    })
    const DeleteOrg = Mutation.write(
      'DeleteOrg',
      Write.delete(Entity.input(Tree.Org, Schema.Struct({ id: Schema.String })), { id: 'id' }),
    )
    const queries: Array<string> = []
    const db = drizzlePg({ client: pglite, logger: { logQuery: query => queries.push(query) } })
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [source(Db.Org), source(Db.Proj), source(Db.Item)],
      mutations: [RemoteServer.write(DeleteOrg, writer(Db.Org))],
    })
    const answer = await Effect.runPromise(
      RemoteServer.handlers(server, 'ada')
        .FoldkitRemoteMutate({ requestId: 'r1', mutation: 'DeleteOrg', input: { id: 'o1' } })
        .pipe(Effect.result, Effect.provide(databaseLayer(db))),
    )
    expect(answer).toMatchObject({ _tag: 'Success' })
    const locks = queries.filter(q => q.toLowerCase().includes('for update'))
    expect(locks).toHaveLength(3)
    expect(locks[0]).toMatch(/from "lock_orgs".*for update/i)
    expect(locks[1]).toMatch(/from "lock_projs".*for update/i)
    expect(locks[2]).toMatch(/from "lock_items".*for update/i)
    const firstDelete = queries.findIndex(q => q.toLowerCase().startsWith('delete '))
    expect(queries.indexOf(locks[2]!)).toBeLessThan(firstDelete)
    expect(
      (await pglite.query<{ id: string }>('select id from lock_items order by id')).rows.map(
        r => r.id,
      ),
    ).toEqual(['i2'])
  })
})
