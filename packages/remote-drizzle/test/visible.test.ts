/**
 * Which rows a principal may see, on every path a table is read by: by id, as
 * the children of a relation (listed, paged, and counted), as the target of a
 * ref, through a join table, and through a query. A rule on one path would leave
 * the others open, so each is checked, a visitor against an author, over the
 * same rows in real SQL.
 */
import { DatabaseSync } from 'node:sqlite'
import { isNotNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, source, type AnyEntityBinding } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() })
const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
  publishedAt: text('published_at'),
})
const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  postId: text('post_id'),
})
const tags = sqliteTable('tags', { id: text('id').primaryKey(), name: text('name').notNull() })
const postTags = sqliteTable('post_tags', {
  postId: text('post_id').notNull(),
  tagId: text('tag_id').notNull(),
})

const Id = Schema.String
const Domain = Entity.relate(
  {
    User: Entity.define('User', Schema.Struct({ id: Id, name: Schema.String })).pipe(
      Entity.derived({ postCount: Derived.make(Schema.Number) }),
    ),
    Post: Entity.define(
      'Post',
      Schema.Struct({ id: Id, title: Schema.String, publishedAt: Schema.NullOr(Schema.String) }),
    ),
    Comment: Entity.define('Comment', Schema.Struct({ id: Id, body: Schema.String })),
    Tag: Entity.define('Tag', Schema.Struct({ id: Id, name: Schema.String })),
  },
  {},
)
const Related = Entity.relate(Domain, {
  User: { posts: Relation.many(Domain.Post) },
  Comment: { post: Relation.one(Domain.Post, { optional: true }) },
  Tag: { posts: Relation.many(Domain.Post) },
})

type Principal = 'visitor' | 'author'
const Db = bind(Related, {
  User: {
    table: users,
    relations: { posts: { foreignKey: posts.authorId } },
    derived: { postCount: { relation: 'posts' } },
  },
  Post: {
    table: posts,
    // A visitor sees what is published; an author sees every row.
    visible: principal =>
      (principal as Principal) === 'author' ? undefined : isNotNull(posts.publishedAt),
  },
  Comment: { table: comments, relations: { post: { field: comments.postId } } },
  Tag: {
    table: tags,
    relations: {
      posts: { through: postTags, localColumn: postTags.tagId, foreignColumn: postTags.postId },
    },
  },
})

const setup = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key, name text not null);
    create table posts (id text primary key, title text not null, author_id text not null, published_at text);
    create table comments (id text primary key, body text not null, post_id text);
    create table tags (id text primary key, name text not null);
    create table post_tags (post_id text not null, tag_id text not null);
    insert into users values ('u1', 'Ada');
    insert into posts values ('p1', 'Live', 'u1', '2026-01-01'), ('p2', 'Draft', 'u1', null), ('p3', 'Also live', 'u1', '2026-01-02');
    insert into comments values ('c1', 'on live', 'p1'), ('c2', 'on draft', 'p2'), ('c3', 'on nothing', null);
    insert into tags values ('t1', 'Engines');
    insert into post_tags values ('p1', 't1'), ('p2', 't1');
  `)
  return { sqlite, database: drizzle({ client: sqlite }) }
}

const read = async (
  principal: Principal,
  binding: AnyEntityBinding,
  ids: string[],
  fields: string[],
  windows?: Record<string, { first: number }>,
) => {
  const { sqlite, database } = setup()
  try {
    const records = await Effect.runPromise(
      source<Principal>(binding)
        .read({ ids, fields, principal, ...(windows === undefined ? {} : { windows }) })
        .pipe(Effect.provide(databaseLayer(database))),
    )
    // A source always answers with the id beside what was asked for.
    return Object.fromEntries(
      records.map(record => {
        const { id: _, ...asked } = record.values as Record<string, unknown>
        return [record.id, asked]
      }),
    )
  } finally {
    sqlite.close()
  }
}

describe('a binding’s visible rows', () => {
  it('by id: a row the principal may not see is not there', async () => {
    expect(Object.keys(await read('visitor', Db.Post, ['p1', 'p2'], ['title']))).toEqual(['p1'])
    expect(Object.keys(await read('author', Db.Post, ['p1', 'p2'], ['title']))).toEqual([
      'p1',
      'p2',
    ])
  })

  it('as the children of a relation: listed, counted, and paged', async () => {
    const visitor = await read('visitor', Db.User, ['u1'], ['posts', 'postCount'])
    expect(visitor.u1).toEqual({ posts: ['Post:p1', 'Post:p3'], postCount: 2 })
    const author = await read('author', Db.User, ['u1'], ['posts', 'postCount'])
    expect(author.u1).toEqual({ posts: ['Post:p1', 'Post:p2', 'Post:p3'], postCount: 3 })

    // A page is of the rows they may see: the hidden one is not skipped over into a gap.
    const paged = await read('visitor', Db.User, ['u1'], ['posts'], { posts: { first: 2 } })
    expect(paged.u1?.posts).toEqual({
      refs: ['Post:p1', 'Post:p3'],
      hasNext: false,
      hasPrevious: false,
    })
  })

  it('as the target of a ref: a ref to a hidden row reads as none, so it does not say the row exists', async () => {
    const visitor = await read('visitor', Db.Comment, ['c1', 'c2', 'c3'], ['post'])
    expect(visitor).toEqual({ c1: { post: 'Post:p1' }, c2: { post: null }, c3: { post: null } })
    const author = await read('author', Db.Comment, ['c1', 'c2'], ['post'])
    expect(author).toEqual({ c1: { post: 'Post:p1' }, c2: { post: 'Post:p2' } })
  })

  it('through a join table', async () => {
    expect((await read('visitor', Db.Tag, ['t1'], ['posts'])).t1?.posts).toEqual(['Post:p1'])
    expect((await read('author', Db.Tag, ['t1'], ['posts'])).t1?.posts).toEqual([
      'Post:p1',
      'Post:p2',
    ])
  })

  it('through a query, beside the query’s own filter, page after page', async () => {
    const AllPosts = Query.make('AllPosts', {
      Input: Schema.Struct({}),
      Result: Query.connection({ name: 'Post' }),
    })
    const listed = query<Principal, {}>(AllPosts, {
      entity: Db.Post,
      orderBy: [{ column: posts.id, direction: 'asc' }],
    })
    const run = async (principal: Principal, window: { first: number; after?: string }) => {
      const { sqlite, database } = setup()
      try {
        const page = await Effect.runPromise(
          listed
            .run({ input: {}, window, principal })
            .pipe(Effect.provide(databaseLayer(database))),
        )
        return page.edges.map(edge => edge.id)
      } finally {
        sqlite.close()
      }
    }
    expect(await run('visitor', { first: 5 })).toEqual(['p1', 'p3'])
    expect(await run('author', { first: 5 })).toEqual(['p1', 'p2', 'p3'])
    expect(await run('visitor', { first: 1, after: 'p1' })).toEqual(['p3'])
    // A cursor a visitor could not have been given does not resolve for them.
    await expect(run('visitor', { first: 1, after: 'p2' })).rejects.toThrow()
  })
})
