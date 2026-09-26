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
import {
  DrizzleDatabase,
  bind,
  databaseLayer,
  drizzleWrites,
  query,
  type DrizzleWrites,
} from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Post, PostById, PostInput, Posts, RecentPosts, PostId } from './domain.js'
import { Page, PageId, PageInput, Pages } from './pageDomain.js'
import { seed } from './seed.js'

/** Who is asking. A visitor is nobody. */
export type Principal = { readonly name: string; readonly role: 'author' | 'editor' } | null
const isAuthor = (principal: Principal): boolean => principal !== null

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  // The check that a slug is free is advice. This index is the rule.
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt').notNull(),
  cover: text('cover').notNull(),
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

const write = (run: (database: DrizzleWrites) => PromiseLike<unknown>) =>
  Effect.gen(function* () {
    const database = yield* drizzleWrites
    yield* Effect.promise(() => Promise.resolve(run(database)))
  })

/** `seeded`: start with the posts and pages of `seed.ts`, as `pnpm dev` does. */
export const openServer = (clock: () => Date, options: { readonly seeded?: boolean } = {}) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table posts (
      id text primary key, title text not null, slug text not null unique,
      excerpt text not null, cover text not null, body text not null, published_at text
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
            const id = PostId.make(`post-${++made}`)
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
    // The blog's own queries, over the Post binding: its `visible` rule applies to them too.
    queries: [
      ...cms.queries,
      query(RecentPosts, { entity: Db.Post }),
      query(PostById, { entity: Db.Post }),
    ],
    mutations: [...cms.mutations],
  })

  if (options.seeded === true) seed(sqlite, clock())

  return {
    server,
    cms,
    database: databaseLayer(drizzle({ client: sqlite })),
    rows: (query: string) =>
      sqlite.prepare(query).all() as ReadonlyArray<Readonly<Record<string, unknown>>>,
  }
}
