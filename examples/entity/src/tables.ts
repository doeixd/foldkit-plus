/**
 * How the domain is stored: the tables, the binding of each Entity to its
 * table, and the DDL. Nothing here opens a database, so a browser page can
 * compile statements against it as the server does.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { bind } from 'foldkit-remote-drizzle'
import { Blog } from './domain.js'

export const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  // The column is `headline`; the domain calls it `title`.
  headline: text('headline').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull(),
  authorId: text('author_id').notNull(),
  editorId: text('editor_id'),
})
export const comments = sqliteTable('comments', {
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
        orderBy: [{ key: comments.createdAt, direction: 'asc' }],
      },
    },
    derived: { commentCount: { relation: 'comments' } },
  },
  Comment: {
    table: comments,
    relations: { post: { field: comments.postId }, author: { field: comments.authorId } },
  },
})

/** The tables, as SQLite creates them: what `Db` binds. */
export const ddl = `
    create table authors (id text primary key, name text not null);
    create table posts (id text primary key, headline text not null, published integer not null, author_id text not null, editor_id text);
    create table comments (id text primary key, body text not null, post_id text not null, author_id text not null, created_at text not null);`
