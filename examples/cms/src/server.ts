/**
 * The server: the same Entities bound to SQLite tables, the application's own
 * publish handlers, and the CMS around them. The clock is passed in, so the demo
 * can move it.
 */
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import { CmsServer, Transaction, published, sqliteSchema, sqliteTables } from 'foldkit-cms-drizzle'
import { DrizzleDatabase, bind, databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Post, PostInput, Posts, type PostId } from './domain.js'
import { Page, PageId, PageInput, Pages } from './pageDomain.js'

/** Who is asking. A visitor is nobody. */
export type Principal = { readonly name: string; readonly role: 'author' | 'editor' } | null
const isAuthor = (principal: Principal): boolean => principal !== null

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  // The check that a slug is free is advice. This index is the rule.
  slug: text('slug').notNull().unique(),
  body: text('body').notNull(),
  publishedAt: text('published_at'),
})

/** A page's row. Its document is JSON: the composition's tolerant codec reads it back. */
const pages = sqliteTable('pages', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  document: text('document', { mode: 'json' }).notNull(),
  publishedAt: text('published_at'),
})

const Db = bind(
  { Post, Page },
  {
    Post: {
      table: posts,
      // A visitor sees what is published; an author sees every row.
      visible: published<Principal>(posts.publishedAt, isAuthor),
    },
    Page: { table: pages, visible: published<Principal>(pages.publishedAt, isAuthor) },
  },
)

type Writes = {
  insert: (table: unknown) => { values: (values: object) => unknown }
  update: (table: unknown) => { set: (values: object) => { where: (where: unknown) => unknown } }
}
const write = (run: (database: Writes) => unknown) =>
  Effect.gen(function* () {
    const database = (yield* DrizzleDatabase) as unknown as Writes
    yield* Effect.promise(() => Promise.resolve(run(database)))
  })

export const openServer = (clock: () => Date) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table posts (
      id text primary key, title text not null, slug text not null unique,
      body text not null, published_at text
    );
    create table pages (
      id text primary key, title text not null, slug text not null unique,
      document text not null, published_at text
    );
  `)
  let made = 0
  let madePages = 0

  const cms = CmsServer.make<Principal>({
    tables: sqliteTables(),
    content: [
      {
        type: Posts,
        binding: Db.Post,
        // What publishing a post does is the application's own code.
        create: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof PostInput.Type,
          { id: PostId }
        >(Posts.publish.create, ({ input }) =>
          Effect.gen(function* () {
            const id = `post-${++made}` as PostId
            yield* write(database => database.insert(posts).values({ id, ...input }))
            return { output: { id } }
          }),
        ),
        update: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof PostInput.Type & { readonly id: PostId },
          {}
        >(Posts.publish.update, ({ input: { id, ...values } }) =>
          write(database => database.update(posts).set(values).where(eq(posts.id, id))).pipe(
            Effect.as({ output: {} }),
          ),
        ),
      },
      {
        type: Pages,
        binding: Db.Page,
        create: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof PageInput.Type,
          { id: PageId }
        >(Pages.publish.create, ({ input }) =>
          Effect.gen(function* () {
            const id = PageId.make(`page-${++madePages}`)
            yield* write(database => database.insert(pages).values({ id, ...input }))
            return { output: { id } }
          }),
        ),
        update: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof PageInput.Type & { readonly id: PageId },
          {}
        >(Pages.publish.update, ({ input: { id, ...values } }) =>
          write(database => database.update(pages).set(values).where(eq(pages.id, id))).pipe(
            Effect.as({ output: {} }),
          ),
        ),
      },
    ],
    // One connection, so begin and commit as statements. Postgres: Transaction.drizzle.
    transaction: Transaction.statements,
    isAuthor,
    // Anyone may write; only an editor may put it in front of visitors.
    allow: (principal, transition) =>
      !['publish', 'schedule', 'unpublish'].includes(transition) || principal?.role === 'editor',
    now: clock,
    nameOf: principal => principal?.name ?? null,
  })

  const server = RemoteServer.make({
    // cms.sources, not source(Db.Post): that is how the boundary cannot be forgotten.
    entities: [...cms.sources],
    queries: [...cms.queries],
    mutations: [...cms.mutations],
  })

  return {
    server,
    cms,
    database: databaseLayer(drizzle({ client: sqlite })),
    rows: (query: string) =>
      sqlite.prepare(query).all() as ReadonlyArray<Readonly<Record<string, unknown>>>,
  }
}
