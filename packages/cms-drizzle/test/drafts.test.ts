/**
 * The CMS server over real SQL, through the real Remote handlers: a visitor
 * against an author, over the same rows. The audience boundary first, because it
 * is the part a mistake in leaks unfinished work.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { DrizzleDatabase, bind, databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer, RemoteServerError } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { CmsServer, Transaction, published, sqliteSchema, sqliteTables } from '../src/index.js'

type Principal = { readonly name: string; readonly role: 'author' | 'intern' } | null
const isAuthor = (principal: Principal): boolean => principal !== null
const ada: Principal = { name: 'ada', role: 'author' }
const ian: Principal = { name: 'ian', role: 'intern' }

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  publishedAt: text('published_at'),
})
const pages = sqliteTable('pages', { id: text('id').primaryKey(), title: text('title').notNull() })

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', published: 'publishedAt' }))
// A content type with no `published` role: it cannot be unpublished.
const Page = Entity.define('Page', Schema.Struct({ id: Schema.String, title: Schema.String }))

const Input = Schema.Struct({ title: Schema.String })
const content = <E extends typeof Post | typeof Page>(name: string, entity: E) =>
  Cms.content(name, {
    entity,
    form: Form.make(`${name}Form`, Entity.input(entity as typeof Page, Input)) as never,
    publish: {
      create: Mutation.make(`Create${name}`, { Input, Output: { id: Schema.String } }),
      update: Mutation.make(`Update${name}`, {
        Input: { ...Input.fields, id: Schema.String },
        Output: {},
      }),
    } as never,
    words: { one: name, many: `${name}s` },
  })
const Posts = content('posts', Post)
const Pages = content('pages', Page)

// The application's own publish handlers. One that writes and then fails shows
// whether a publish is whole.
type Writes = {
  insert: (table: unknown) => { values: (values: object) => unknown }
  update: (table: unknown) => { set: (values: object) => { where: (where: unknown) => unknown } }
}
let made = 0
const handlers = (type: typeof Posts | typeof Pages, table: typeof posts | typeof pages) => ({
  create: RemoteServer.mutation<
    Principal,
    DrizzleDatabase,
    string,
    { title: string },
    { id: string }
  >(type.publish.create as never, ({ input }) =>
    Effect.gen(function* () {
      const database = (yield* DrizzleDatabase) as unknown as Writes
      const id = `made${++made}`
      yield* Effect.promise(() =>
        Promise.resolve(database.insert(table).values({ id, title: input.title })),
      )
      if (input.title === 'Fails')
        return yield* new RemoteServerError({ message: 'The application refused' })
      return { output: { id } }
    }),
  ),
  update: RemoteServer.mutation<
    Principal,
    DrizzleDatabase,
    string,
    { id: string; title: string },
    {}
  >(type.publish.update as never, ({ input }) =>
    Effect.gen(function* () {
      const database = (yield* DrizzleDatabase) as unknown as Writes
      yield* Effect.promise(() =>
        Promise.resolve(
          database.update(table).set({ title: input.title }).where(eq(table.id, input.id)),
        ),
      )
      if (input.title === 'Fails')
        return yield* new RemoteServerError({ message: 'The application refused' })
      return { output: {} }
    }),
  ),
})

const tables = sqliteTables()
const Db = bind(
  { Post, Page },
  {
    Post: { table: posts, visible: published<Principal>(posts.publishedAt, isAuthor) },
    Page: { table: pages },
  },
)

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table posts (id text primary key, title text not null, published_at text);
    create table pages (id text primary key, title text not null);
    insert into posts values ('p1', 'Live', '2026-01-01'), ('p2', 'Hidden', null);
    insert into cms_entries values
      ('e1', 'posts', 'p1', 'Live', 'ada', '2026-01-01T00:00:00.000Z', null),
      ('e2', 'posts', 'p2', 'Hidden', 'ada', '2026-01-02T00:00:00.000Z', null),
      ('e3', 'posts', null, 'Unwritten', 'ada', '2026-01-03T00:00:00.000Z', null),
      ('e4', 'posts', 'p1', 'Put away', 'ada', '2026-01-04T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    insert into cms_drafts values
      ('e1', '{"title":"Live, revised"}', null, 'postsForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, '2026-03-02T00:00:00.000Z', 'slug taken'),
      ('e3', '{"title":"Unwritten"}', null, 'postsForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null);
    insert into cms_revisions values ('e1:1', 'e1', 1, '{"title":"Live"}', '2026-01-01T00:00:00.000Z', 'ada');
  `)
  let clock = new Date('2026-06-01T00:00:00.000Z')
  let ids = 0
  let requests = 0
  const cms = CmsServer.make<Principal>({
    tables,
    content: [
      { type: Posts, binding: Db.Post, ...handlers(Posts, posts) },
      { type: Pages, binding: Db.Page, ...handlers(Pages, pages) },
    ],
    transaction: Transaction.statements,
    isAuthor,
    allow: principal => principal?.role !== 'intern',
    now: () => clock,
    newId: () => `n${++ids}`,
    nameOf: principal => principal?.name ?? null,
  })
  const server = RemoteServer.make({
    entities: [...cms.sources],
    queries: [...cms.queries],
    mutations: [...cms.mutations],
  })
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const as = (principal: Principal) => {
    const handlers = RemoteServer.handlers(server, principal)
    const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)
    return {
      read: (entity: string, ids: string[], fields: string[]) =>
        run(
          handlers
            .FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: ids.map(id => ({ entity, id, fields })),
            })
            .pipe(Effect.provide(layer)),
        ).then(result =>
          Object.fromEntries(
            result.entities.map(found => [`${found.entity}:${found.id}`, found.values]),
          ),
        ),
      list: (input: { type: string; search?: string; archived?: boolean }) =>
        run(
          handlers
            .FoldkitRemoteQuery({
              query: 'CmsEntries',
              input: { search: '', archived: false, ...input },
              window: { first: 20 },
            })
            .pipe(Effect.provide(layer)),
        ).then(page => page.edges.map(edge => edge.id)),
      mutate: (mutation: string, input: unknown) =>
        run(
          handlers
            .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
            .pipe(Effect.provide(layer)),
        ),
    }
  }
  return {
    as,
    sqlite,
    tick: (to: string) => {
      clock = new Date(to)
    },
    rows: (query: string) => sqlite.prepare(query).all() as ReadonlyArray<Record<string, unknown>>,
    count: (table: string) =>
      Number((sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n),
  }
}

const save = (over: object) => ({
  entry: null,
  type: 'posts',
  label: 'New post',
  values: { title: 'New post' },
  model: { fields: {} },
  form: 'postsForm@1',
  basedOn: null,
  ...over,
})

describe('the audience boundary', () => {
  it('shows a visitor nothing of unpublished work, by id or through the worklist', async () => {
    const { as, sqlite } = open()
    try {
      const visitor = as(null)
      expect(await visitor.read('CmsEntry', ['e1', 'e3'], ['label', 'draft', 'revisions'])).toEqual(
        {},
      )
      expect(await visitor.read('CmsDraft', ['e1'], ['values'])).toEqual({})
      expect(await visitor.read('CmsRevision', ['e1:1'], ['values'])).toEqual({})
      expect(await visitor.list({ type: 'posts' })).toEqual([])

      const author = as(ada)
      expect(Object.keys(await author.read('CmsDraft', ['e1'], ['values']))).toEqual([
        'CmsDraft:e1',
      ])
      expect(await author.list({ type: 'posts' })).toEqual(['e3', 'e2', 'e1'])
    } finally {
      sqlite.close()
    }
  })

  it('shows a visitor only the published rows of a content type', async () => {
    const { as, sqlite } = open()
    try {
      expect(Object.keys(await as(null).read('Post', ['p1', 'p2'], ['title']))).toEqual(['Post:p1'])
      expect(Object.keys(await as(ada).read('Post', ['p1', 'p2'], ['title']))).toEqual([
        'Post:p1',
        'Post:p2',
      ])
    } finally {
      sqlite.close()
    }
  })

  it('refuses a visitor every operation, and changes nothing', async () => {
    const { as, sqlite, count } = open()
    try {
      await expect(as(null).mutate('CmsSaveDraft', save({}))).rejects.toMatchObject({
        message: 'Only an author may change unpublished work',
      })
      await expect(as(null).mutate('CmsDiscardDraft', { entry: 'e1' })).rejects.toThrow()
      expect([count('cms_entries'), count('cms_drafts')]).toEqual([4, 2])
    } finally {
      sqlite.close()
    }
  })

  it('refuses, when it is made, a content type that can be unpublished and is bound open to everyone', () => {
    const Open = bind({ Post }, { Post: { table: posts } })
    expect(() =>
      CmsServer.make<Principal>({
        tables,
        content: [{ type: Posts, binding: Open.Post, ...handlers(Posts, posts) }],
        transaction: Transaction.statements,
        isAuthor,
      }),
    ).toThrow('content "posts" can be unpublished, but its binding shows every row to everyone')
    // A type with no `published` role has nothing to hide.
    expect(() =>
      CmsServer.make<Principal>({
        tables,
        content: [{ type: Pages, binding: Db.Page, ...handlers(Pages, pages) }],
        transaction: Transaction.statements,
        isAuthor,
      }),
    ).not.toThrow()
  })
})

describe('an entry’s state, derived with the server’s clock', () => {
  it.each([
    ['published, with work beside it, and a publish that is overdue', 'e1', 'Changed', true],
    ['a row a visitor cannot see', 'e2', 'Unpublished', null],
    ['nothing published yet', 'e3', 'New', null],
    ['put away', 'e4', 'Archived', null],
  ])('%s', async (_, id, tag, overdue) => {
    const { as, sqlite } = open()
    try {
      const read = await as(ada).read('CmsEntry', [id], ['state'])
      const state = read[`CmsEntry:${id}`]?.state as {
        _tag: string
        schedule: { overdue: boolean; error: string | null } | null
      }
      expect(state._tag).toBe(tag)
      expect(state.schedule?.overdue ?? null).toBe(overdue)
      if (overdue) expect(state.schedule?.error).toBe('slug taken')
    } finally {
      sqlite.close()
    }
  })

  it('is read beside what else was asked for, and only that', async () => {
    const { as, sqlite } = open()
    try {
      const read = await as(ada).read('CmsEntry', ['e3'], ['label', 'state'])
      expect(Object.keys(read['CmsEntry:e3'] ?? {}).sort()).toEqual(['label', 'state'])
    } finally {
      sqlite.close()
    }
  })
})

describe('saving a draft', () => {
  it('makes the entry on its first save, and answers with both so the client holds them', async () => {
    const { as, sqlite, count } = open()
    try {
      const result = await as(ada).mutate('CmsSaveDraft', save({}))
      expect(result.output).toEqual({ entry: 'n1', updatedAt: '2026-06-01T00:00:00.000Z' })
      expect(result.entities.map(patch => `${patch.entity}:${patch.id}`)).toEqual([
        'CmsEntry:n1',
        'CmsDraft:n1',
      ])
      expect(result.entities[1]?.values).toMatchObject({
        values: { title: 'New post' },
        updatedBy: 'ada',
        baseRevision: null,
      })
      expect([count('cms_entries'), count('cms_drafts')]).toEqual([5, 3])
      expect(await as(ada).list({ type: 'posts', search: 'New' })).toEqual(['n1'])
    } finally {
      sqlite.close()
    }
  })

  it('saves over the draft it was made from, and refuses one made from an older draft', async () => {
    const { as, sqlite, tick } = open()
    try {
      const first = await as(ada).mutate('CmsSaveDraft', save({}))
      const { entry, updatedAt } = first.output as { entry: string; updatedAt: string }
      tick('2026-06-01T00:00:05.000Z')
      const second = await as(ada).mutate(
        'CmsSaveDraft',
        save({ entry, basedOn: updatedAt, label: 'Renamed', values: { title: 'Renamed' } }),
      )
      expect((second.output as { updatedAt: string }).updatedAt).toBe('2026-06-01T00:00:05.000Z')
      expect(second.entities[0]?.values).toMatchObject({ label: 'Renamed' })

      // Someone still holding the first save: their write would silently undo the second.
      await expect(
        as(ada).mutate('CmsSaveDraft', save({ entry, basedOn: updatedAt })),
      ).rejects.toMatchObject({
        message: 'CmsConflict: this draft was saved by someone else since',
      })
    } finally {
      sqlite.close()
    }
  })

  it('tells two saves in one instant apart, so the next one can', async () => {
    const { as, sqlite } = open()
    try {
      const first = (await as(ada).mutate('CmsSaveDraft', save({}))).output as {
        entry: string
        updatedAt: string
      }
      const second = (
        await as(ada).mutate('CmsSaveDraft', save({ entry: first.entry, basedOn: first.updatedAt }))
      ).output as { updatedAt: string }
      expect(second.updatedAt > first.updatedAt).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  it.each([
    [
      'a type of content the server does not know',
      save({ type: 'recipes' }),
      'is not a type of content',
    ],
    ['an entry that is not there', save({ entry: 'nope' }), 'There is no such entry'],
    ['an entry of another type', save({ entry: 'e1', type: 'pages' }), 'This entry is of "posts"'],
    ['an archived entry', save({ entry: 'e4' }), 'An archived entry takes no draft'],
  ])('refuses %s', async (_, input, message) => {
    const { as, sqlite } = open()
    try {
      await expect(as(ada).mutate('CmsSaveDraft', input)).rejects.toThrow(message)
    } finally {
      sqlite.close()
    }
  })

  it('asks the application who may, once the entry is known', async () => {
    const { as, sqlite } = open()
    try {
      await expect(
        as(ian).mutate('CmsSaveDraft', save({ entry: 'e3', basedOn: '2026-03-01T00:00:00.000Z' })),
      ).rejects.toThrow('This author may not save this entry')
    } finally {
      sqlite.close()
    }
  })
})

describe('discarding a draft', () => {
  it('leaves a published entry as it was published', async () => {
    const { as, sqlite, count } = open()
    try {
      const result = await as(ada).mutate('CmsDiscardDraft', { entry: 'e1' })
      expect(result.deleted).toEqual([{ entity: 'CmsDraft', id: 'e1' }])
      expect(count('cms_entries')).toBe(4)
      const read = await as(ada).read('CmsEntry', ['e1'], ['state'])
      expect(read['CmsEntry:e1']?.state).toMatchObject({ _tag: 'Published', schedule: null })
    } finally {
      sqlite.close()
    }
  })

  it('removes an entry that was never published: there is nothing left of it', async () => {
    const { as, sqlite, count } = open()
    try {
      const result = await as(ada).mutate('CmsDiscardDraft', { entry: 'e3' })
      expect(result.deleted).toEqual([
        { entity: 'CmsDraft', id: 'e3' },
        { entity: 'CmsEntry', id: 'e3' },
      ])
      expect([count('cms_entries'), count('cms_drafts')]).toEqual([3, 1])
    } finally {
      sqlite.close()
    }
  })
})

describe('publishing', () => {
  it('runs the application’s own mutation with the draft, and leaves a revision and no draft', async () => {
    const { as, rows, count } = open()
    const result = await as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })
    expect(result.output).toEqual({ entry: 'e1', targetId: 'p1', revision: 2 })
    expect(rows(`select title from posts where id = 'p1'`)).toEqual([{ title: 'Live, revised' }])
    expect(
      rows(`select n, "values", published_by from cms_revisions where entry_id = 'e1' order by n`),
    ).toEqual([
      { n: 1, values: '{"title":"Live"}', published_by: 'ada' },
      { n: 2, values: '{"title":"Live, revised"}', published_by: 'ada' },
    ])
    expect(count(`cms_drafts where id = 'e1'`)).toBe(0)
    // The client holds the outcome with no refetch.
    expect(result.deleted).toEqual([{ entity: 'CmsDraft', id: 'e1' }])
    expect(result.entities.map(patch => `${patch.entity}:${patch.id}`).sort()).toEqual([
      'CmsEntry:e1',
      'CmsRevision:e1:2',
      'Post:p1',
    ])
    expect(await as(ada).read('CmsEntry', ['e1'], ['state'])).toEqual({
      'CmsEntry:e1': { state: { _tag: 'Published', schedule: null } },
    })
  })

  it('makes the row of something new, shows it to a visitor, and names it on the entry', async () => {
    const { as, rows } = open()
    expect(await as(null).list({ type: 'posts' })).toEqual([])
    const result = await as(ada).mutate('CmsPublish', { entry: 'e3', basedOn: null })
    const { targetId } = result.output as { targetId: string }
    expect(result.output).toEqual({ entry: 'e3', targetId, revision: 1 })
    expect(rows(`select target_id from cms_entries where id = 'e3'`)).toEqual([
      { target_id: targetId },
    ])
    expect(rows(`select title, published_at from posts where id = '${targetId}'`)).toEqual([
      { title: 'Unwritten', published_at: '2026-06-01T00:00:00.000Z' },
    ])
    expect(await as(null).read('Post', [targetId], ['title'])).toEqual({
      [`Post:${targetId}`]: { title: 'Unwritten' },
    })
  })

  it('keeps the date something was first published on', async () => {
    const { as, rows } = open()
    await as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })
    expect(rows(`select published_at from posts where id = 'p1'`)).toEqual([
      { published_at: '2026-01-01' },
    ])
  })

  it('happens entirely or does not: a handler that fails after writing leaves nothing behind', async () => {
    const { as, rows, count } = open()
    const saved = await as(ada).mutate('CmsSaveDraft', save({ values: { title: 'Fails' } }))
    const { entry } = saved.output as { entry: string }
    const before = count('posts')
    await expect(as(ada).mutate('CmsPublish', { entry, basedOn: null })).rejects.toThrow(
      'The application refused',
    )
    expect(count('posts')).toBe(before)
    expect(count(`cms_revisions where entry_id = '${entry}'`)).toBe(0)
    expect(rows(`select target_id from cms_entries where id = '${entry}'`)).toEqual([
      { target_id: null },
    ])
    expect(count(`cms_drafts where id = '${entry}'`)).toBe(1)
    // The connection is left usable: the next publish is its own transaction.
    await as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })
  })

  it('refuses a publish made from an older revision than the latest', async () => {
    const { as, count } = open()
    await expect(as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: null })).rejects.toThrow(
      'CmsConflict',
    )
    expect(count(`cms_revisions where entry_id = 'e1'`)).toBe(1)
    expect(count(`cms_drafts where id = 'e1'`)).toBe(1)
  })

  it('refuses a draft the publish mutation would not take, and says why', async () => {
    const { as, count } = open()
    const saved = await as(ada).mutate('CmsSaveDraft', save({ values: { title: 7 } }))
    const { entry } = saved.output as { entry: string }
    await expect(as(ada).mutate('CmsPublish', { entry, basedOn: null })).rejects.toThrow(
      'not ready to publish',
    )
    expect(count(`cms_drafts where id = '${entry}'`)).toBe(1)
  })

  it('refuses an entry with nothing to publish, a visitor, and an author who may not', async () => {
    const { as, count } = open()
    await expect(as(ada).mutate('CmsPublish', { entry: 'e2', basedOn: null })).rejects.toThrow(
      'cannot be published',
    )
    await expect(as(null).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })).rejects.toThrow(
      'Only an author',
    )
    await expect(as(ian).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })).rejects.toThrow(
      'may not publish',
    )
    // A visitor is not told which entries there are.
    for (const mutation of ['CmsPublish', 'CmsUnpublish', 'CmsDiscardDraft'])
      await expect(as(null).mutate(mutation, { entry: 'nothing', basedOn: null })).rejects.toThrow(
        'Only an author',
      )
    expect(count(`cms_revisions where entry_id = 'e1'`)).toBe(1)
  })

  it('refuses, when it is made, a handler of some other mutation', () => {
    expect(() =>
      CmsServer.make<Principal>({
        tables,
        content: [{ type: Pages, binding: Db.Page, ...handlers(Posts, posts) }],
        transaction: Transaction.statements,
        isAuthor,
      }),
    ).toThrow('publishes through "Createpages", but was given the handler of "Createposts"')
  })
})

describe('unpublishing', () => {
  it('hides the row from a visitor and keeps it, and publishing shows it again', async () => {
    const { as, rows } = open()
    const result = await as(ada).mutate('CmsUnpublish', { entry: 'e1' })
    expect(result.entities).toEqual([
      { entity: 'Post', id: 'p1', values: { id: 'p1', publishedAt: null } },
    ])
    expect(await as(null).read('Post', ['p1'], ['title'])).toEqual({})
    expect(rows(`select title from posts where id = 'p1'`)).toEqual([{ title: 'Live' }])

    await as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })
    expect(rows(`select published_at from posts where id = 'p1'`)).toEqual([
      { published_at: '2026-06-01T00:00:00.000Z' },
    ])
  })

  it('refuses what is not published, and a type that has no such thing', async () => {
    const { as } = open()
    await expect(as(ada).mutate('CmsUnpublish', { entry: 'e2' })).rejects.toThrow(
      'cannot be unpublished',
    )
    await expect(as(ian).mutate('CmsUnpublish', { entry: 'e1' })).rejects.toThrow(
      'may not unpublish',
    )
  })
})

describe('Transaction.drizzle', () => {
  // A driver whose transaction takes a promise: it commits when the promise
  // resolves and rolls back when it rejects.
  const driver = () => {
    const log: Array<string> = []
    const inner = { name: 'inner' }
    const database = {
      transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
        try {
          const result = await run(inner)
          log.push('commit')
          return result
        } catch (error) {
          log.push('rollback')
          throw error
        }
      },
    }
    return { log, inner, layer: databaseLayer(database) }
  }

  it('gives the work the transaction as its database, and commits', async () => {
    const { log, inner, layer } = driver()
    const seen = await Effect.runPromise(
      Transaction.drizzle(
        Effect.gen(function* () {
          return yield* DrizzleDatabase
        }),
      ).pipe(Effect.provide(layer)),
    )
    expect(seen).toBe(inner)
    expect(log).toEqual(['commit'])
  })

  it('rolls back work that fails, and fails with its error', async () => {
    const { log, layer } = driver()
    const exit = await Effect.runPromiseExit(
      Transaction.drizzle(Effect.fail('refused' as const)).pipe(Effect.provide(layer)),
    )
    expect(log).toEqual(['rollback'])
    expect(String(exit)).toContain('refused')
    expect(exit._tag).toBe('Failure')
  })
})
