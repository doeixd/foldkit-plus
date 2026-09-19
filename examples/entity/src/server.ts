/**
 * The server's interpretation of the domain: which table and columns store
 * each Entity. What a relation is comes from `domain.ts`; only how it is stored
 * is said here.
 */
import { DatabaseSync } from 'node:sqlite'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import { bind, databaseLayer, query, returning, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Blog } from './domain.js'
import { AuthorsQuery, DeletePostMutation, EditPostMutation, PostsQuery } from './operations.js'

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

/**
 * An in-memory database with a little data, the server over it, and the layer
 * its sources read it through. A mutation is ordinary Drizzle: the binding only
 * pairs the columns it returns with the patches the client's store takes.
 */
export const openServer = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table authors (id text primary key, name text not null);
    create table posts (id text primary key, headline text not null, published integer not null, author_id text not null, editor_id text);
    create table comments (id text primary key, body text not null, post_id text not null, author_id text not null, created_at text not null);
    insert into authors values ('a1', 'Ada'), ('a2', 'Grace');
    insert into posts values ('p1', 'Notes on the Engine', 1, 'a1', null), ('p2', 'Compilers', 0, 'a1', 'a2');
    insert into comments values ('c1', 'Remarkable.', 'p1', 'a2', '2026-01-01'), ('c2', 'Thank you.', 'p1', 'a1', '2026-01-02');
  `)
  const db = drizzle({ client: sqlite })

  const edited = returning(Db.Post, ['id', 'title', 'published', 'editor'])
  const EditPost = RemoteServer.mutation(EditPostMutation, ({ input }) =>
    Effect.promise(async () => {
      const rows = await db
        .update(posts)
        .set({ headline: input.title, published: input.published, editorId: input.editorId })
        .where(eq(posts.id, input.id))
        .returning(edited.columns)
      return { output: { id: input.id }, entities: edited.patches(rows) }
    }),
  )

  const DeletePost = RemoteServer.mutation(DeletePostMutation, ({ input }) =>
    Effect.promise(async () => {
      await db.delete(comments).where(eq(comments.postId, input.id))
      await db.delete(posts).where(eq(posts.id, input.id))
      // Saying what is gone is enough: the client drops it from every list it is in.
      return { output: {}, deleted: [{ entity: 'Post', id: input.id }] }
    }),
  )

  return {
    server: RemoteServer.make({
      entities: [source(Db.Author), source(Db.Post), source(Db.Comment)],
      mutations: [EditPost, DeletePost],
      // A list is a query someone declared: nothing lists a table because a relation points at it.
      queries: [
        query(PostsQuery, {
          entity: Db.Post,
          where: ({ search }) => (search === '' ? undefined : like(posts.headline, `%${search}%`)),
          // The order reads the input. A title is not unique, so the adapter breaks ties by id.
          orderBy: ({ sort }) =>
            sort === 'oldest'
              ? [{ column: posts.id, direction: 'asc' }]
              : [{ column: posts.headline, direction: sort === 'title' ? 'asc' : 'desc' }],
        }),
        query(AuthorsQuery, {
          entity: Db.Author,
          where: ({ search }) => (search === '' ? undefined : like(authors.name, `%${search}%`)),
          orderBy: [{ column: authors.id, direction: 'asc' }],
        }),
      ],
    }),
    layer: databaseLayer(db),
    /** The row as the database holds it, to check a write against. */
    row: (id: string) => sqlite.prepare('select * from posts where id = ?').get(id),
    count: (table: 'posts' | 'comments'): number =>
      Number(
        (sqlite.prepare(`select count(*) as n from ${table}`).get() as { readonly n: number }).n,
      ),
    close: () => sqlite.close(),
  }
}
