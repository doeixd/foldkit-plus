import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Derived, Entity, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey() })
const teams = sqliteTable('teams', { id: text('id').primaryKey() })
const posts = sqliteTable('posts', { id: text('id').primaryKey() })
const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  userId: text('user_id').notNull(),
  shown: text('shown').notNull().default('yes'),
})

const Id = Schema.String
const UserFields = Entity.define('User', Schema.Struct({ id: Id }))
const TeamFields = Entity.define('Team', Schema.Struct({ id: Id }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Id }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Id }))
const Social = Entity.relate(
  { User: UserFields, Team: TeamFields, Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
)
const Post = Social.Post.pipe(
  Entity.derived({
    liked: Derived.exists(Social.Like.relations.post, { viewer: Social.Like.relations.user }),
    likeCount: Derived.count(Social.Like.relations.post),
  }),
)

const Db = bind(
  { User: Social.User, Post, Like: Social.Like },
  {
    User: { table: users },
    Post: { table: posts },
    Like: {
      table: likes,
      relations: { post: { field: likes.postId }, user: { field: likes.userId } },
      // Bob may not see the likes marked hidden.
      visible: principal => (principal === 'bob' ? eq(likes.shown, 'yes') : undefined),
    },
  },
)

/** The reader is the user the principal names; `team:` names a reader who is a Team. */
const viewer = (principal: string | null) =>
  Option.map(Option.fromNullishOr(principal), name =>
    name.startsWith('team:')
      ? { entity: 'Team', id: name.slice('team:'.length) }
      : { entity: 'User', id: name },
  )

const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key);
    create table teams (id text primary key);
    create table posts (id text primary key);
    create table likes (
      id text primary key, post_id text not null, user_id text not null, shown text not null
    );
    insert into users values ('ada'), ('bob');
    insert into posts values ('p1'), ('p2'), ('p3');
    insert into likes values
      ('l2', 'p1', 'ada', 'yes'), ('l1', 'p1', 'ada', 'yes'), ('l3', 'p1', 'bob', 'yes'),
      ('l4', 'p2', 'bob', 'no');
  `)
  return { sqlite, layer: databaseLayer(drizzle({ client: sqlite })) }
}

/** What each post reads as `liked` for `principal`. */
const liked = async (principal: string | null, ids = ['p1', 'p2', 'p3']) => {
  const { sqlite, layer } = seeded()
  try {
    const rows = await Effect.runPromise(
      source(Db.Post, { viewer })
        .read({ ids, fields: ['liked'], principal })
        .pipe(Effect.provide(layer)),
    )
    return Object.fromEntries(rows.map(row => [row.id, row.values.liked]))
  } finally {
    sqlite.close()
  }
}

describe('a Derived.exists, compiled by bind', () => {
  it("reads each row's like by the reader, the least id where there are two", async () => {
    expect(await liked('ada')).toEqual({ p1: 'l1', p2: null, p3: null })
  })

  it('answers each reader for themselves', async () => {
    expect(await liked('bob', ['p1'])).toEqual({ p1: 'l3' })
  })

  it('finds only the rows the reader may see', async () => {
    expect(await liked('bob', ['p2'])).toEqual({ p2: null })
  })

  it('reads none for a visitor, and for a reader who is not a User', async () => {
    expect(await liked(null)).toEqual({ p1: null, p2: null, p3: null })
    expect(await liked('team:ada', ['p1'])).toEqual({ p1: null })
  })
})

describe('a Derived.exists, refused where it is bound or served', () => {
  it('refuses a source that does not say who reads', () => {
    expect(() => source(Db.Post)).toThrow(
      "Post's liked depend on who reads them (Derived.exists): give source a viewer",
    )
  })

  it('refuses it as a shared field', () => {
    expect(() => source(Db.Post, { viewer, shared: ['likeCount', 'liked'] })).toThrow(
      "Post's liked depend on who reads them, so none is shared",
    )
  })

  it('refuses an entry for it', () => {
    expect(() =>
      bind(
        { User: Social.User, Post, Like: Social.Like },
        {
          User: { table: users },
          // @ts-expect-error a Derived.exists takes no storage
          Post: { table: posts, derived: { liked: { supplied: true } } },
          Like: {
            table: likes,
            relations: { post: { field: likes.postId }, user: { field: likes.userId } },
          },
        },
      ),
    ).toThrow('derived "liked" on entity "Post" is a Derived.exists, which bind compiles')
  })
})

const LikePost = Mutation.write(
  'LikePost',
  Write.insert(
    Entity.input(Social.Like, Schema.Struct({ id: Id, postId: Id, userId: Id }), {
      postId: 'post',
      userId: 'user',
    }),
    { id: 'id' },
  ),
)
const Unlike = Mutation.write(
  'Unlike',
  Write.delete(Entity.input(Social.Like, Schema.Struct({ id: Id })), { id: 'id' }),
)

describe("a like's answer reads its post as the asker reads it", () => {
  const server = RemoteServer.make<string, DrizzleDatabase>({
    entities: [source(Db.Post, { viewer }), source(Db.Like)],
    mutations: [
      RemoteServer.write(LikePost, writer(Db.Like)),
      RemoteServer.write(Unlike, writer(Db.Like)),
    ],
  })
  const answered = async (mutation: string, input: object, principal: string) => {
    const { sqlite, layer } = seeded()
    try {
      const answer = await Effect.runPromise(
        RemoteServer.handlers(server, principal)
          .FoldkitRemoteMutate({
            requestId: 'r1',
            mutation,
            input,
            shown: [{ entity: 'Post', fields: ['liked', 'likeCount'] }],
          })
          .pipe(Effect.provide(layer)),
      )
      return (answer.read?.result.entities ?? [])
        .filter(row => row.entity === 'Post')
        .map(row => ({ id: row.id, ...row.values }))
    } finally {
      sqlite.close()
    }
  }

  it('reads the new like as the liker', async () => {
    expect(await answered('LikePost', { id: 'l9', postId: 'p3', userId: 'bob' }, 'bob')).toEqual([
      { id: 'p3', liked: 'l9', likeCount: 1 },
    ])
  })

  it('reads none once the like is taken back', async () => {
    expect(await answered('Unlike', { id: 'l3' }, 'bob')).toEqual([
      { id: 'p1', liked: null, likeCount: 2 },
    ])
  })
})

describe('a writer of an Entity with a Derived.exists', () => {
  it('is made without a viewer: it reads only stored fields', () => {
    expect(writer(Db.Post).entity).toBe('Post')
  })
})
