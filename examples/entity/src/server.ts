/**
 * The server's interpretation of the domain: which table and columns store
 * each Entity. What a relation is comes from `domain.ts`; only how it is stored
 * is said here.
 */
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Schema } from 'effect'
import { databaseLayer, query, returning, source, writer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { PostId } from './domain.js'
import {
  AuthorsQuery,
  DeletePostMutation,
  EditPostMutation,
  PostsQuery,
  WritePostMutation,
} from './operations.js'
import { Db, authors, comments, ddl, posts } from './tables.js'

/** A `count(*)` row, as node:sqlite returns it. */
const Counted = Schema.Struct({ n: Schema.Number })

/**
 * An in-memory database with a little data, the server over it, and the layer
 * its sources read it through. A mutation is ordinary Drizzle: the binding only
 * pairs the columns it returns with the patches the client's store takes.
 */
export const openServer = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(ddl)
  sqlite.exec(`
    insert into authors values ('a1', 'Ada'), ('a2', 'Grace');
    insert into posts values ('p1', 'Notes on the Engine', 1, 'a1', null), ('p2', 'Compilers', 0, 'a1', 'a2');
    insert into comments values ('c1', 'Remarkable.', 'p1', 'a2', '2026-01-01'), ('c2', 'Thank you.', 'p1', 'a1', '2026-01-02');
  `)
  const db = drizzle({ client: sqlite })

  // A declared write: the binding's writer sets the post's columns and the
  // editor's foreign key, and answers the row as written.
  const EditPost = RemoteServer.write(EditPostMutation, writer(Db.Post))

  // The nested write: the author first, then the post that points at them, in
  // one transaction, so a post that fails leaves no author behind. Both come
  // back as patches, so the client's store has the new post and its author.
  // Drizzle's SQLite transaction is synchronous: an async callback would
  // commit before its awaits, and a later failure would roll nothing back.
  let serial = 2
  const writtenAuthor = returning(Db.Author, ['id', 'name'])
  const writtenPost = returning(Db.Post, ['id', 'title', 'published', 'author'])
  const WritePost = RemoteServer.mutation(WritePostMutation, ({ input }) =>
    Effect.sync(() => {
      // Ids the seed rows do not use; a count would reuse a deleted post's.
      serial += 1
      const authorId = `a${serial}`
      const postId = `p${serial}`
      return db.transaction(tx => {
        const authorRows = tx
          .insert(authors)
          .values({ id: authorId, name: input.author.name })
          .returning(writtenAuthor.columns)
          .all()
        const postRows = tx
          .insert(posts)
          .values({ id: postId, headline: input.title, published: false, authorId, editorId: null })
          .returning(writtenPost.columns)
          .all()
        return {
          output: { id: PostId.make(postId) },
          entities: [...writtenAuthor.patches(authorRows), ...writtenPost.patches(postRows)],
        }
      })
    }),
  )

  const DeletePost = RemoteServer.mutation(DeletePostMutation, ({ input }) =>
    Effect.sync(() => {
      // Together, or a post that cannot go keeps its comments.
      db.transaction(tx => {
        tx.delete(comments).where(eq(comments.postId, input.id)).run()
        tx.delete(posts).where(eq(posts.id, input.id)).run()
      })
      // Saying what is gone is enough: the client drops it from every list it is in.
      return { output: {}, deleted: [{ entity: 'Post', id: input.id }] }
    }),
  )

  return {
    server: RemoteServer.make({
      entities: [source(Db.Author), source(Db.Post), source(Db.Comment)],
      mutations: [EditPost, DeletePost, WritePost],
      // A list is a query someone declared: nothing lists a table because a relation points at it.
      queries: [
        // The body says the filter and the order. A title is not unique, so
        // ties break by id, and no sort is id order.
        query(PostsQuery, { entity: Db.Post }),
        query(AuthorsQuery, { entity: Db.Author }),
      ],
    }),
    layer: databaseLayer(db),
    /** The row as the database holds it, to check a write against. */
    row: (id: string) => sqlite.prepare('select * from posts where id = ?').get(id),
    count: (table: 'posts' | 'comments' | 'authors'): number =>
      Schema.decodeUnknownSync(Counted)(sqlite.prepare(`select count(*) as n from ${table}`).get())
        .n,
    /** Runs a statement as it is, for a test that needs a state no mutation makes. */
    exec: (statement: string) => sqlite.exec(statement),
    close: () => sqlite.close(),
  }
}
