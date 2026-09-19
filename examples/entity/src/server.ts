/**
 * The server's interpretation of the domain: which table and columns store
 * each Entity. What a relation is comes from `domain.ts`; only how it is stored
 * is said here.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { bind, databaseLayer, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Blog } from './domain.js'

const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  // The column is `headline`; the domain calls it `title`.
  headline: text('headline').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull(),
  authorId: text('author_id').notNull(),
  editorId: text('editor_id'),
})
const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  postId: text('post_id').notNull(),
  authorId: text('author_id').notNull(),
  createdAt: text('created_at').notNull(),
})

export const Db = bind(Blog, {
  Author: { table: authors, relations: { posts: { foreignKey: posts.authorId } } },
  Post: {
    table: posts,
    fields: { title: posts.headline },
    relations: {
      author: { field: posts.authorId },
      editor: { field: posts.editorId },
      comments: {
        foreignKey: comments.postId,
        orderBy: [{ column: comments.createdAt, direction: 'asc' }],
      },
    },
    derived: { commentCount: { relation: 'comments' } },
  },
  Comment: {
    table: comments,
    relations: { post: { field: comments.postId }, author: { field: comments.authorId } },
  },
})

export const Server = RemoteServer.make({
  entities: [source(Db.Author), source(Db.Post), source(Db.Comment)],
})

/** An in-memory database with a little data, and the layer the sources read it through. */
export const openDatabase = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table authors (id text primary key, name text not null);
    create table posts (id text primary key, headline text not null, published integer not null, author_id text not null, editor_id text);
    create table comments (id text primary key, body text not null, post_id text not null, author_id text not null, created_at text not null);
    insert into authors values ('a1', 'Ada'), ('a2', 'Grace');
    insert into posts values ('p1', 'Notes on the Engine', 1, 'a1', null), ('p2', 'Compilers', 0, 'a1', 'a2');
    insert into comments values ('c1', 'Remarkable.', 'p1', 'a2', '2026-01-01'), ('c2', 'Thank you.', 'p1', 'a1', '2026-01-02');
  `)
  return { close: () => sqlite.close(), layer: databaseLayer(drizzle({ client: sqlite })) }
}
