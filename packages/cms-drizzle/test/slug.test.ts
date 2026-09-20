/**
 * A content type with an address: found by its slug behind the audience
 * boundary, and a taken slug refused by name, whether the check saw it or the
 * unique index did.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { DrizzleDatabase, bind, databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { CmsServer, Transaction, published, sqliteSchema, sqliteTables } from '../src/index.js'

type Principal = 'author' | null
const isAuthor = (principal: Principal): boolean => principal === 'author'

const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  publishedAt: text('published_at'),
})
const Article = Entity.define(
  'Article',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

const Input = Schema.Struct({ title: Schema.String, slug: Schema.String })
const Articles = Cms.content('articles', {
  entity: Article,
  form: Form.make('ArticleForm', Entity.input(Article, Input)),
  publish: {
    create: Mutation.make('CreateArticle', { Input, Output: { id: Schema.String } }),
    update: Mutation.make('UpdateArticle', {
      Input: { ...Input.fields, id: Schema.String },
      Output: {},
    }),
  },
  words: { one: 'Article', many: 'Articles' },
})

type Writes = {
  insert: (table: unknown) => { values: (values: object) => unknown }
  update: (table: unknown) => { set: (values: object) => { where: (where: unknown) => unknown } }
}
const write = (run: (database: Writes) => unknown) =>
  Effect.gen(function* () {
    const database = (yield* DrizzleDatabase) as unknown as Writes
    yield* Effect.promise(() => Promise.resolve(run(database)))
  })

const Db = bind(
  { Article },
  { Article: { table: articles, visible: published<Principal>(articles.publishedAt, isAuthor) } },
)

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table articles (id text primary key, title text not null, slug text not null unique, published_at text);
    insert into articles values ('a1', 'Live', 'live', '2026-01-01'), ('a2', 'Hidden', 'hidden', null);
    insert into cms_entries values
      ('e1', 'articles', 'a1', 'Live', null, '2026-01-01T00:00:00.000Z', null),
      ('e5', 'articles', null, 'New', null, '2026-01-05T00:00:00.000Z', null);
  `)
  let made = 0
  const cms = CmsServer.make<Principal>({
    tables: sqliteTables(),
    content: [
      {
        type: Articles,
        binding: Db.Article,
        create: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof Input.Type,
          { id: string }
        >(Articles.publish.create, ({ input }) =>
          Effect.gen(function* () {
            // Someone else's publish, landing between the check and this one.
            if (input.title === 'Raced')
              yield* write(database =>
                database.insert(articles).values({ id: 'other', title: 'Other', slug: input.slug }),
              )
            // A unique index refusing, and not the slug's: the primary key.
            const id = input.title === 'Collides' ? 'a1' : `made${++made}`
            yield* write(database => database.insert(articles).values({ id, ...input }))
            return { output: { id } }
          }),
        ),
        update: RemoteServer.mutation<Principal, DrizzleDatabase>(Articles.publish.update, () =>
          Effect.die(new Error('the database is on fire')),
        ),
      },
    ],
    transaction: Transaction.statements,
    isAuthor,
  })
  const server = RemoteServer.make({
    entities: [...cms.sources],
    queries: [...cms.queries],
    mutations: [...cms.mutations],
  })
  const layer = databaseLayer(drizzle({ client: sqlite }))
  let requests = 0
  const as = (principal: Principal) => {
    const handlers = RemoteServer.handlers(server, principal)
    const mutate = (mutation: string, input: unknown) =>
      Effect.runPromise(
        handlers
          .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
          .pipe(Effect.provide(layer)),
      )
    return {
      mutate,
      bySlug: (slug: string) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteQuery({ query: 'articlesBySlug', input: { slug }, window: { first: 5 } })
            .pipe(Effect.provide(layer)),
        ).then(page => page.edges.map(edge => edge.id)),
      draft: (entry: string, values: object) =>
        mutate('CmsSaveDraft', {
          entry,
          type: 'articles',
          label: 'x',
          values,
          model: null,
          form: 'ArticleForm@1',
          basedOn: null,
        }),
    }
  }
  const count = (where: string) =>
    Number((sqlite.prepare(`select count(*) as n from ${where}`).get() as { n: number }).n)
  return { as, count }
}

describe('finding content by its slug', () => {
  it('finds the one row with that address, and none with another', async () => {
    const { as } = open()
    expect(await as('author').bySlug('live')).toEqual(['a1'])
    expect(await as('author').bySlug('liv')).toEqual([])
  })

  it('does not find, for a visitor, what is not published', async () => {
    const { as } = open()
    expect(await as('author').bySlug('hidden')).toEqual(['a2'])
    expect(await as(null).bySlug('hidden')).toEqual([])
    expect(await as(null).bySlug('live')).toEqual(['a1'])
  })

  it('is declared, never implied: a type with no slug role has no such query', () => {
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String, title: Schema.String }))
    const Plains = Cms.content('plains', {
      entity: Plain,
      form: Form.make('PlainForm', Entity.input(Plain, Schema.Struct({ title: Schema.String }))),
      publish: Articles.publish as never,
      words: { one: 'Plain', many: 'Plains' },
    })
    expect(() => Cms.bySlug(Plains)).toThrow('has no slug role')
  })
})

describe('publishing to a slug that is taken', () => {
  it('is refused by name, on the slug’s key, and nothing is published', async () => {
    const { as, count } = open()
    await as('author').draft('e5', { title: 'New', slug: 'hidden' })
    const refused = await as('author')
      .mutate('CmsPublish', { entry: 'e5', basedOn: null })
      .catch((error: unknown) => String(error))
    expect(refused).toContain('CmsSlugTaken: slug: "hidden" is already used')
    expect(Cms.slugTaken.key(String(refused))).toBe('slug')
    expect(count('articles')).toBe(2)
    expect(count(`cms_drafts where id = 'e5'`)).toBe(1)
  })

  it('is the same news when the check passed and the unique index refused', async () => {
    const { as, count } = open()
    await as('author').draft('e5', { title: 'Raced', slug: 'fresh' })
    const refused = await as('author')
      .mutate('CmsPublish', { entry: 'e5', basedOn: null })
      .catch((error: unknown) => String(error))
    expect(Cms.slugTaken.key(String(refused))).toBe('slug')
    // The transaction took the other writer's row with it: in a real race that
    // row is another connection's, and stays.
    expect(count('articles')).toBe(2)
    expect(count('cms_revisions')).toBe(0)
  })

  it('does not blame the slug for another unique index', async () => {
    const { as } = open()
    await as('author').draft('e5', { title: 'Collides', slug: 'fresh' })
    const refused = await as('author')
      .mutate('CmsPublish', { entry: 'e5', basedOn: null })
      .catch((error: unknown) => String(error))
    expect(refused).toContain('Failed query')
    expect(Cms.slugTaken.key(String(refused))).toBeUndefined()
  })

  it('lets a row keep its own slug', async () => {
    const { as } = open()
    await as('author').draft('e1', { title: 'Live', slug: 'live' })
    // The update handler here always dies: reaching it means the check let the slug by.
    await expect(
      as('author').mutate('CmsPublish', { entry: 'e1', basedOn: null }),
    ).rejects.toThrow()
    const refused = await as('author')
      .mutate('CmsPublish', { entry: 'e1', basedOn: null })
      .catch((error: unknown) => String(error))
    expect(Cms.slugTaken.key(String(refused))).toBeUndefined()
  })

  it('says nothing of slugs for an error that is not about one', () => {
    expect(Cms.slugTaken.key('CmsConflict: this draft was saved by someone else since')).toBe(
      undefined,
    )
  })
})
