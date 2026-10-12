/**
 * The server: the same Entities bound to SQLite tables, the application's own
 * publish handlers, and the CMS around them. The clock is passed in, so the demo
 * can move it, and so is the database: Node's own SQLite for the scripted run and
 * `pnpm dev` (`sqlite-node.ts`), SQLite compiled to WebAssembly for the published
 * demo, which runs this server in the page (`sqlite-browser.ts`).
 */
import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import {
  CmsServer,
  Transaction,
  sqliteSchema,
  sqliteTables,
  type ServedContent,
} from 'foldkit-cms-drizzle'
import { Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import {
  DrizzleDatabase,
  bind,
  databaseLayer,
  drizzleWrites,
  query,
  runStatement,
  type DrizzleWrites,
} from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Article } from '../content/articleDomain.js'
import { Post, PostById, PostInput, Posts, RecentPosts, PostId } from '../content/domain.js'
import { Page, PageId, PageInput, Pages } from '../content/pageDomain.js'
import { seed, SEEDED_AT } from '../content/seed.js'

/** A SQLite database the server runs on, and whether it is new, so needs its tables. */
export interface Sqlite {
  readonly fresh: boolean
  readonly exec: (statements: string) => void
  readonly all: (query: string) => ReadonlyArray<Readonly<Record<string, unknown>>>
  /** The Drizzle database over it, for `databaseLayer`. */
  readonly drizzle: unknown
}

/** Who is asking: an author, or an editor; `none` is a visitor. */
export const Author = Schema.Struct({
  name: Schema.String,
  role: Schema.Literals(['author', 'editor']),
})
export type Principal = Option.Option<typeof Author.Type>

/**
 * Who reads and who publishes, once for every content type: an author reads
 * everything and writes; an editor also puts it in front of visitors; a visitor
 * reads what is published.
 */
export const G = Guards.declare(
  'Cms',
  Author,
  guard => ({
    isAuthor: guard.principal(),
    isEditor: guard.principal(),
    isPostPublished: guard.row(Post, () => Expr.isNotNull(Post.fields.publishedAt)),
    isPagePublished: guard.row(Page, () => Expr.isNotNull(Page.fields.publishedAt)),
    isArticlePublished: guard.row(Article, () => Expr.isNotNull(Article.fields.publishedAt)),
  }),
  { key: author => author.name },
)
export const Policy = G.implement({
  isAuthor: Option.isSome,
  isEditor: principal => Option.exists(principal, author => author.role === 'editor'),
})
const ServedPost = Post.pipe(Guards.attach(G, { row: { Read: [G.isPostPublished, G.isAuthor] } }))
const ServedPage = Page.pipe(Guards.attach(G, { row: { Read: [G.isPagePublished, G.isAuthor] } }))
/** The article story's content, guarded here with the rest. */
export const ServedArticle = Article.pipe(
  Guards.attach(G, { row: { Read: [G.isArticlePublished, G.isAuthor] } }),
)

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

// Each table applies its Entity's Read rules, compiled to SQL.
const visible = GuardDrizzle.visible(Policy, [ServedPost, ServedPage])
const Db = bind(
  { Post: ServedPost, Page: ServedPage },
  {
    Post: { table: posts, visible: visible.Post },
    Page: { table: pages, visible: visible.Page },
  },
)

export const write = (run: (database: DrizzleWrites) => PromiseLike<unknown>) =>
  Effect.gen(function* () {
    const database = yield* drizzleWrites
    yield* runStatement(() => run(database), 'Database write failed')
  })

/**
 * More content for the same server: its tables' SQL and how it is served. The article story
 * keeps its content type in its own module and hands it over here, so nothing exported has to
 * spell out its form's type.
 */
export interface MoreContent {
  readonly schema: string
  readonly content: ReadonlyArray<ServedContent<Principal>>
}

export const openServer = (
  clock: () => Date,
  sqlite: Sqlite,
  more: MoreContent = { schema: '', content: [] },
) => {
  if (sqlite.fresh)
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
      ${more.schema}
    `)
  // Ids go on from the highest held, so a database kept from an earlier visit mints none twice.
  const highest = (table: string, prefix: string) =>
    Number(
      sqlite.all(
        `select coalesce(max(cast(substr(id, ${prefix.length + 1}) as integer)), 0) as n from ${table}`,
      )[0]?.['n'] ?? 0,
    )
  let made = highest('posts', 'post-')
  let madePages = highest('pages', 'page-')

  const cms = CmsServer.make({
    tables: sqliteTables(),
    content: [
      {
        type: Posts,
        entity: ServedPost,
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
        entity: ServedPage,
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
      ...more.content,
    ],
    // One connection, so begin and commit as statements. Postgres: Transaction.drizzle.
    transaction: Transaction.statements,
    policy: Policy,
    authors: [G.isAuthor],
    // Any author may write; only an editor may put it in front of visitors.
    transitions: { publish: [G.isEditor], schedule: [G.isEditor], unpublish: [G.isEditor] },
    now: clock,
    nameOf: principal => Option.getOrNull(Option.map(principal, author => author.name)),
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

  const database = databaseLayer(sqlite.drizzle)
  return {
    server,
    cms,
    database,
    /** Starts with the posts and pages of `seed.ts`, imported as an editor, as `pnpm dev` does. */
    seed: () =>
      Effect.runPromise(
        seed(
          item => cms.import({ ...item, as: Option.some({ name: 'edda', role: 'editor' }) }),
          SEEDED_AT,
        ).pipe(Effect.provide(database)),
      ),
    rows: sqlite.all,
  }
}
