/**
 * The CMS server over real SQL, through the real Remote handlers: a visitor
 * against an author, over the same rows. The audience boundary first, because it
 * is the part a mistake in leaks unfinished work.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity, Expr } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { DrizzleDatabase, bind, databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer, RemoteServerError } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Guards } from 'foldkit-guard'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import {
  CmsServer,
  Transaction,
  sqliteSchema,
  sqliteTables,
  type CmsServerConfig,
} from '../src/index.js'

const Author = Schema.Struct({
  name: Schema.String,
  role: Schema.Literals(['author', 'writer', 'intern', 'reviewer']),
})
type Principal = Option.Option<typeof Author.Type>
const ada: Principal = Option.some({ name: 'ada', role: 'author' })
const ian: Principal = Option.some({ name: 'ian', role: 'intern' })
// May write, and may not put anything in front of a visitor.
const wren: Principal = Option.some({ name: 'wren', role: 'writer' })
const visitor: Principal = Option.none()
// An author like ada, and not the one a stricter server lets publish.
const bea: Principal = Option.some({ name: 'bea', role: 'author' })
// Reads unpublished work, and changes none of it.
const rex: Principal = Option.some({ name: 'rex', role: 'reviewer' })

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

// Every author reads everything; anyone else, what is published.
const G = Guards.declare(
  'Cms',
  Author,
  guard => ({
    isAuthor: guard.principal(),
    isSenior: guard.principal(),
    isPublished: guard.row(Post, () => Expr.isNotNull(Post.fields.publishedAt)),
  }),
  { key: author => author.name },
)
const Policy = G.implement({
  // A reviewer is an author for reading the work, and for nothing else.
  isAuthor: (principal, { interaction }) =>
    Option.exists(principal, ({ role }) => role !== 'reviewer' || interaction === 'Read'),
  isSenior: principal => Option.exists(principal, ({ name }) => name === 'ada'),
})
const GuardedPost = Post.pipe(Guards.attach(G, { row: { Read: [G.isPublished, G.isAuthor] } }))
const guarded = { policy: Policy, authors: [G.isAuthor] }

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
/** The request ids the application's own mutations were run under, in order. */
const ranAs: string[] = []
const handlers = (type: typeof Posts | typeof Pages, table: typeof posts | typeof pages) => ({
  create: RemoteServer.mutation<
    Principal,
    DrizzleDatabase,
    string,
    { title: string },
    { id: string }
  >(type.publish.create as never, ({ input, requestId }) =>
    Effect.gen(function* () {
      ranAs.push(requestId)
      const database = (yield* DrizzleDatabase) as unknown as Writes
      const id = `made${++made}`
      yield* Effect.promise(() =>
        Promise.resolve(database.insert(table).values({ id, title: input.title })),
      )
      // Long enough for another request to get a word in, if anything lets it.
      if (input.title === 'Fails slowly') yield* Effect.sleep('20 millis')
      if (input.title.startsWith('Fails'))
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
  >(type.publish.update as never, ({ input, requestId }) =>
    Effect.gen(function* () {
      ranAs.push(requestId)
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
  { Post: GuardedPost, Page },
  {
    Post: { table: posts, visible: GuardDrizzle.visible(Policy, [GuardedPost]).Post },
    Page: { table: pages },
  },
)

const open = (options: Pick<CmsServerConfig<typeof Author.Type>, 'transitions'> = {}) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table posts (id text primary key, title text not null, published_at text);
    create table pages (id text primary key, title text not null);
    insert into posts values ('p1', 'Live', '2026-01-01'), ('p2', 'Hidden', null);
    insert into cms_entries values
      ('e1', 'posts', 'p1', 'Live', 'ada', '2026-01-01T00:00:00.000Z', null, 1),
      ('e2', 'posts', 'p2', 'Hidden', 'ada', '2026-01-02T00:00:00.000Z', null, null),
      ('e3', 'posts', null, 'Unwritten', 'ada', '2026-01-03T00:00:00.000Z', null, null),
      ('e4', 'posts', 'p1', 'Put away', 'ada', '2026-01-04T00:00:00.000Z', '2026-02-01T00:00:00.000Z', null);
    insert into cms_drafts values
      ('e1', '{"title":"Live, revised"}', null, 'postsForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, '2026-03-02T00:00:00.000Z', 'ada', 'slug taken'),
      ('e3', '{"title":"Unwritten"}', null, 'postsForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null);
    insert into cms_revisions values ('e1:1', 'e1', 1, '{"title":"Live"}', '2026-01-01T00:00:00.000Z', 'ada');
  `)
  let clock = new Date('2026-06-01T00:00:00.000Z')
  let requests = 0
  const cms = CmsServer.make({
    tables,
    content: [
      { type: Posts, entity: GuardedPost, binding: Db.Post, ...handlers(Posts, posts) },
      { type: Pages, entity: Page, binding: Db.Page, ...handlers(Pages, pages) },
    ],
    transaction: Transaction.statements,
    ...guarded,
    ...options,
    allow: (principal, transition) =>
      Option.exists(
        principal,
        ({ role }) =>
          role !== 'intern' &&
          (role !== 'writer' ||
            !['publish', 'unpublish', 'schedule', 'unschedule'].includes(transition)),
      ),
    now: () => clock,
    nameOf: principal => Option.getOrNull(Option.map(principal, ({ name }) => name)),
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
  // Who a stored name is, when a schedule comes due with nobody at the keyboard.
  const known: Record<string, Principal> = { ada, ian }
  let fired = false
  return {
    due: (at: string) =>
      Effect.runPromise(
        cms
          .due(new Date(at), { as: name => (fired ? visitor : (known[name ?? ''] ?? visitor)) })
          .pipe(Effect.provide(layer)),
      ),
    /** Everyone who scheduled anything has since lost the right to. */
    fire: () => {
      fired = true
    },
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
  entry: 'n1',
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
      const stranger = as(visitor)
      expect(
        await stranger.read('CmsEntry', ['e1', 'e3'], ['label', 'draft', 'revisions']),
      ).toEqual({})
      expect(await stranger.read('CmsDraft', ['e1'], ['values'])).toEqual({})
      expect(await stranger.read('CmsRevision', ['e1:1'], ['values'])).toEqual({})
      expect(await stranger.list({ type: 'posts' })).toEqual([])

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
      expect(Object.keys(await as(visitor).read('Post', ['p1', 'p2'], ['title']))).toEqual([
        'Post:p1',
      ])
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
      await expect(as(visitor).mutate('CmsSaveDraft', save({}))).rejects.toMatchObject({
        message: 'Only an author may change unpublished work',
      })
      await expect(as(visitor).mutate('CmsDiscardDraft', { entry: 'e1' })).rejects.toThrow()
      expect([count('cms_entries'), count('cms_drafts')]).toEqual([4, 2])
    } finally {
      sqlite.close()
    }
  })

  it('refuses, when it is made, a content type that can be unpublished and is shown to everyone', () => {
    // Its rules never ask whether it is published.
    const Unruled = Post.pipe(Guards.attach(G, { row: { Read: [G.isAuthor] } }))
    expect(() =>
      CmsServer.make({
        tables,
        content: [{ type: Posts, entity: Unruled, binding: Db.Post, ...handlers(Posts, posts) }],
        transaction: Transaction.statements,
        ...guarded,
      }),
    ).toThrow('content "posts" can be unpublished, but its Read rule does not read "publishedAt"')
    // Its rules ask, and its table is bound without them.
    const Open = bind({ Post: GuardedPost }, { Post: { table: posts } })
    expect(() =>
      CmsServer.make({
        tables,
        content: [
          { type: Posts, entity: GuardedPost, binding: Open.Post, ...handlers(Posts, posts) },
        ],
        transaction: Transaction.statements,
        ...guarded,
      }),
    ).toThrow("Post's Source does not apply its Read rules")
    // Another Entity's guards.
    expect(() =>
      CmsServer.make({
        tables,
        content: [{ type: Posts, entity: Page, binding: Db.Post, ...handlers(Posts, posts) }],
        transaction: Transaction.statements,
        ...guarded,
      }),
    ).toThrow('content "posts" is of Post, but was given Page')
    // A type with no `published` role has nothing to hide.
    expect(() =>
      CmsServer.make({
        tables,
        content: [{ type: Pages, entity: Page, binding: Db.Page, ...handlers(Pages, pages) }],
        transaction: Transaction.statements,
        ...guarded,
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
        message: 'This draft was saved by someone else since',
        refusal: { _tag: 'Conflict' },
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
    [
      'a save made from a draft that is gone, and makes no entry for it',
      save({ entry: 'nope', basedOn: '2026-01-01T00:00:00.000Z' }),
      'This draft was discarded',
    ],
    ['an entry of another type', save({ entry: 'e1', type: 'pages' }), 'This entry is of "posts"'],
    ['an archived entry', save({ entry: 'e4' }), 'An archived entry takes no draft'],
  ])('refuses %s', async (_, input, message) => {
    const { as, sqlite, count } = open()
    try {
      await expect(as(ada).mutate('CmsSaveDraft', input)).rejects.toThrow(message)
      expect(count(`cms_entries where id = 'nope'`)).toBe(0)
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
    ranAs.length = 0
    const result = await as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })
    expect(result.output).toEqual({ entry: 'e1', targetId: 'p1', revision: 2 })
    // Named by the publish, not the client's request: scheduled publishing has none.
    expect(ranAs).toEqual(['publish:e1:1'])
    expect(rows(`select title from posts where id = 'p1'`)).toEqual([{ title: 'Live, revised' }])
    // The row as the handler left it goes to the client, though the handler returned no patch.
    expect(
      result.entities.find(patch => patch.entity === 'Post' && patch.id === 'p1')?.values,
    ).toMatchObject({ title: 'Live, revised' })
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
    expect(await as(visitor).list({ type: 'posts' })).toEqual([])
    ranAs.length = 0
    const result = await as(ada).mutate('CmsPublish', { entry: 'e3', basedOn: null })
    expect(ranAs).toEqual(['publish:e3:new'])
    const { targetId } = result.output as { targetId: string }
    expect(result.output).toEqual({ entry: 'e3', targetId, revision: 1 })
    expect(rows(`select target_id from cms_entries where id = 'e3'`)).toEqual([
      { target_id: targetId },
    ])
    expect(rows(`select title, published_at from posts where id = '${targetId}'`)).toEqual([
      { title: 'Unwritten', published_at: '2026-06-01T00:00:00.000Z' },
    ])
    expect(await as(visitor).read('Post', [targetId], ['title'])).toEqual({
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
    await expect(
      as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: null }),
    ).rejects.toMatchObject({
      message: 'This entry was published by someone else since',
      refusal: { _tag: 'Conflict' },
    })
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
    await expect(as(visitor).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })).rejects.toThrow(
      'Only an author',
    )
    await expect(as(ian).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })).rejects.toThrow(
      'may not publish',
    )
    // A visitor is not told which entries there are.
    for (const mutation of ['CmsPublish', 'CmsUnpublish', 'CmsDiscardDraft'])
      await expect(
        as(visitor).mutate(mutation, { entry: 'nothing', basedOn: null }),
      ).rejects.toThrow('Only an author')
    expect(count(`cms_revisions where entry_id = 'e1'`)).toBe(1)
  })

  it('refuses, when it is made, a handler of some other mutation', () => {
    expect(() =>
      CmsServer.make({
        tables,
        content: [{ type: Pages, entity: Page, binding: Db.Page, ...handlers(Posts, posts) }],
        transaction: Transaction.statements,
        ...guarded,
      }),
    ).toThrow('publishes through "Createpages", but was given the handler of "Createposts"')
  })
})

describe('who may make a transition', () => {
  it('is an author its guards let, refused to another, and said with the entry', async () => {
    const { as } = open({ transitions: { publish: [G.isSenior] } })
    await as(bea).mutate('CmsSaveDraft', save({ entry: 'n1' }))
    await expect(
      as(bea).mutate('CmsPublish', { entry: 'n1', basedOn: null }),
    ).rejects.toMatchObject({
      _tag: 'Forbidden',
      message: 'This author may not publish this entry',
    })
    // What the wire carries, read as the client would: decoded, not assumed.
    const may = async (principal: Principal) =>
      Schema.decodeUnknownSync(Schema.Array(Schema.String))(
        (await as(principal).read('CmsEntry', ['n1'], ['may']))['CmsEntry:n1']?.may,
      )
    expect(await may(bea)).not.toContain('publish')
    expect(await may(ada)).toContain('publish')
    await as(ada).mutate('CmsPublish', { entry: 'n1', basedOn: null })
  })

  it('asks who is an author as what they are doing: a reviewer reads, and changes nothing', async () => {
    const { as } = open()
    expect(await as(rex).list({ type: 'posts' })).toContain('e2')
    await expect(as(rex).mutate('CmsDiscardDraft', { entry: 'e3' })).rejects.toMatchObject({
      _tag: 'Forbidden',
      message: 'Only an author may change unpublished work',
    })
  })

  it('asks unpublish of archiving what is on show, which takes it off', async () => {
    const { as } = open({ transitions: { unpublish: [G.isSenior] } })
    // e1 is published: putting it away unpublishes it.
    await expect(as(bea).mutate('CmsArchive', { entry: 'e1' })).rejects.toMatchObject({
      _tag: 'Forbidden',
      message: 'This author may not unpublish this entry',
    })
    // e2 is not on show: archiving it hides nothing.
    await as(bea).mutate('CmsArchive', { entry: 'e2' })
    await as(ada).mutate('CmsArchive', { entry: 'e1' })
  })

  it('keeps what one who may schedule promised from an author who may not', async () => {
    const { as } = open({ transitions: { schedule: [G.isSenior] } })
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: '2026-07-01T09:00:00.000Z' })
    await expect(as(bea).mutate('CmsDiscardDraft', { entry: 'e3' })).rejects.toMatchObject({
      _tag: 'Forbidden',
      message: 'This draft is scheduled, and only someone who may schedule it may change it',
    })
  })
})

describe('unpublishing', () => {
  it('hides the row from a visitor and keeps it, and publishing shows it again', async () => {
    const { as, rows } = open()
    const result = await as(ada).mutate('CmsUnpublish', { entry: 'e1' })
    // The row, and the entry with the state it is now in: the client holds both.
    expect(result.entities[0]).toEqual({
      entity: 'Post',
      id: 'p1',
      values: { id: 'p1', publishedAt: null },
    })
    expect(result.entities[1]).toMatchObject({
      entity: 'CmsEntry',
      id: 'e1',
      values: { state: { _tag: 'Unpublished' } },
    })
    expect(await as(visitor).read('Post', ['p1'], ['title'])).toEqual({})
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

describe('scheduling', () => {
  const soon = '2026-07-01T09:00:00.000Z'
  const stateOf = async (as: ReturnType<typeof open>['as'], entry: string) =>
    (await as(ada).read('CmsEntry', [entry], ['state']))[`CmsEntry:${entry}`]!['state']

  it('promises a draft for later, and the entry says so until the time comes', async () => {
    const { as, rows } = open()
    const result = await as(ada).mutate('CmsSchedule', {
      entry: 'e3',
      at: '2026-07-01T11:00:00+02:00',
    })
    expect(rows(`select scheduled_for, scheduled_by from cms_drafts where id = 'e3'`)).toEqual([
      { scheduled_for: soon, scheduled_by: 'ada' },
    ])
    // The client holds the entry's new state and the draft's schedule with no refetch.
    expect(result.entities.map(patch => patch.entity).sort()).toEqual(['CmsDraft', 'CmsEntry'])
    expect(await stateOf(as, 'e3')).toEqual({
      _tag: 'New',
      schedule: { at: soon, overdue: false, error: null },
    })
  })

  it('does not promise for later what could not be published now', async () => {
    const { as, rows } = open()
    await as(ada).mutate(
      'CmsSaveDraft',
      save({ entry: 'e3', values: { title: 7 }, basedOn: '2026-03-01T00:00:00.000Z' }),
    )
    await expect(as(ada).mutate('CmsSchedule', { entry: 'e3', at: soon })).rejects.toThrow(
      'not ready to publish',
    )
    await expect(as(ada).mutate('CmsSchedule', { entry: 'e3', at: 'whenever' })).rejects.toThrow()
    expect(rows(`select scheduled_for from cms_drafts where id = 'e3'`)).toEqual([
      { scheduled_for: null },
    ])
  })

  it('refuses an entry with nothing to schedule, one already scheduled, and an author who may not', async () => {
    const { as } = open()
    await expect(as(ada).mutate('CmsSchedule', { entry: 'e2', at: soon })).rejects.toThrow(
      'cannot be scheduled',
    )
    await expect(as(ada).mutate('CmsSchedule', { entry: 'e1', at: soon })).rejects.toThrow(
      'cannot be scheduled',
    )
    await expect(as(ian).mutate('CmsSchedule', { entry: 'e3', at: soon })).rejects.toThrow(
      'may not schedule',
    )
    await expect(as(ada).mutate('CmsUnschedule', { entry: 'e3' })).rejects.toThrow(
      'cannot be unscheduled',
    )
  })

  it('takes the promise back', async () => {
    const { as, rows } = open()
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: soon })
    await as(ada).mutate('CmsUnschedule', { entry: 'e3' })
    expect(rows(`select scheduled_for, scheduled_by from cms_drafts where id = 'e3'`)).toEqual([
      { scheduled_for: null, scheduled_by: null },
    ])
    expect(await stateOf(as, 'e3')).toEqual({ _tag: 'New', schedule: null })
  })
})

describe('what comes due', () => {
  const soon = '2026-07-01T09:00:00.000Z'

  it('is published when its time has come, not before, as whoever scheduled it', async () => {
    const { as, rows, due, tick } = open()
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: soon })
    expect(await due('2026-07-01T08:59:59.000Z')).toEqual([])
    expect(rows(`select id from cms_revisions where entry_id = 'e3'`)).toEqual([])

    tick('2026-07-01T09:00:05.000Z')
    expect(await due('2026-07-01T09:00:05.000Z')).toEqual([{ entry: 'e3', error: null }])
    expect(rows(`select n, published_by from cms_revisions where entry_id = 'e3'`)).toEqual([
      { n: 1, published_by: 'ada' },
    ])
    expect(rows(`select id from cms_drafts where id = 'e3'`)).toEqual([])
    // Done is done: the next call finds nothing.
    expect(await due('2026-07-01T09:05:00.000Z')).toEqual([])
  })

  it('leaves a publish that failed scheduled, with the reason, and does not try it again until the draft changes', async () => {
    const { as, rows, due, sqlite, tick } = open()
    await as(ada).mutate('CmsSaveDraft', save({ entry: 'e9', values: { title: 'Fails' } }))
    await as(ada).mutate('CmsSchedule', { entry: 'e9', at: soon })
    const before = Number(
      (sqlite.prepare('select count(*) as n from posts').get() as { n: number }).n,
    )

    tick('2026-07-02T00:00:00.000Z')
    expect(await due('2026-07-02T00:00:00.000Z')).toEqual([
      { entry: 'e9', error: 'The application refused' },
    ])
    // Nothing of the failed publish is left, and the entry reads overdue, with why.
    expect(rows('select count(*) as n from posts')).toEqual([{ n: before }])
    expect((await as(ada).read('CmsEntry', ['e9'], ['state']))['CmsEntry:e9']!['state']).toEqual({
      _tag: 'New',
      schedule: { at: soon, overdue: true, error: 'The application refused' },
    })
    expect(await due('2026-07-02T00:01:00.000Z')).toEqual([])

    // The author fixes it: the draft changed, so its time comes again.
    const [{ updated_at: basedOn }] = rows(`select updated_at from cms_drafts where id = 'e9'`) as [
      { updated_at: string },
    ]
    await as(ada).mutate('CmsSaveDraft', save({ entry: 'e9', values: { title: 'Works' }, basedOn }))
    expect(await due('2026-07-02T00:02:00.000Z')).toEqual([{ entry: 'e9', error: null }])
  })

  it('one failure does not stop the rest', async () => {
    const { as, due } = open()
    await as(ada).mutate('CmsSaveDraft', save({ entry: 'e9', values: { title: 'Fails' } }))
    await as(ada).mutate('CmsSchedule', { entry: 'e9', at: soon })
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: soon })
    const outcomes = await due('2026-07-02T00:00:00.000Z')
    expect([...outcomes].sort((a, b) => a.entry.localeCompare(b.entry))).toEqual([
      { entry: 'e3', error: null },
      { entry: 'e9', error: 'The application refused' },
    ])
  })

  it('publishes nothing for someone who has since lost the right', async () => {
    const { as, rows, due, fire } = open()
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: soon })
    fire()
    expect(await due('2026-07-02T00:00:00.000Z')).toEqual([
      { entry: 'e3', error: 'Whoever scheduled this is no longer an author' },
    ])
    expect(rows(`select id from cms_revisions where entry_id = 'e3'`)).toEqual([])
  })
})

describe('a statement the database refuses', () => {
  it('fails as a server error that says nothing of the SQL', async () => {
    const { as, sqlite } = open()
    // Reads still work; the delete a discard makes is refused.
    sqlite.exec(
      "create trigger keep before delete on cms_drafts begin select raise(abort, 'kept in cms_drafts'); end",
    )
    const failed = as(ada).mutate('CmsDiscardDraft', { entry: 'e3' })
    await expect(failed).rejects.toMatchObject({
      _tag: 'RemoteMutationError',
      message: 'Database write failed',
    })
    await failed.catch(error => expect(JSON.stringify(error)).not.toContain('cms_drafts'))
  })
})

describe('archiving', () => {
  it('puts the entry away and takes what can be hidden off show; unarchiving leaves it unpublished', async () => {
    const { as, rows } = open()
    expect(await as(visitor).read('Post', ['p1'], ['title'])).not.toEqual({})
    const result = await as(ada).mutate('CmsArchive', { entry: 'e1' })
    expect(result.entities.map(patch => patch.entity).sort()).toEqual(['CmsEntry', 'Post'])
    expect(await as(visitor).read('Post', ['p1'], ['title'])).toEqual({})
    expect(await as(ada).list({ type: 'posts', archived: true })).toContain('e1')
    expect(await as(ada).list({ type: 'posts' })).not.toContain('e1')
    // Put away, nothing else applies.
    await expect(as(ada).mutate('CmsPublish', { entry: 'e1', basedOn: 1 })).rejects.toThrow(
      'cannot be published',
    )

    await as(ada).mutate('CmsUnarchive', { entry: 'e1' })
    expect(rows(`select archived_at from cms_entries where id = 'e1'`)).toEqual([
      { archived_at: null },
    ])
    expect(
      (await as(ada).read('CmsEntry', ['e1'], ['state']))['CmsEntry:e1']!['state'],
    ).toMatchObject({
      _tag: 'Unpublished',
    })
  })

  it('does not come due while it is put away', async () => {
    const { as, due, rows } = open()
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: '2026-07-01T09:00:00.000Z' })
    await as(ada).mutate('CmsArchive', { entry: 'e3' })
    expect(await due('2026-07-02T00:00:00.000Z')).toEqual([])
    expect(rows(`select id from cms_revisions where entry_id = 'e3'`)).toEqual([])
  })

  it('refuses what is already put away, and an author who may not', async () => {
    const { as } = open()
    await expect(as(ada).mutate('CmsArchive', { entry: 'e4' })).rejects.toThrow(
      'cannot be archived',
    )
    await expect(as(ada).mutate('CmsUnarchive', { entry: 'e1' })).rejects.toThrow(
      'cannot be unarchived',
    )
    await expect(as(ian).mutate('CmsArchive', { entry: 'e1' })).rejects.toThrow('may not archive')
  })
})

describe('restoring', () => {
  it('takes back a promise made of what the draft held before', async () => {
    const { as, rows } = open()
    // e1's draft is scheduled, and its last try failed.
    await as(ada).mutate('CmsRestore', { entry: 'e1', revision: 1 })
    expect(
      rows(
        `select "values", model, form, scheduled_for, schedule_error, base_revision from cms_drafts where id = 'e1'`,
      ),
    ).toEqual([
      {
        values: '{"title":"Live"}',
        model: null,
        form: 'restored@1',
        scheduled_for: null,
        schedule_error: null,
        base_revision: 1,
      },
    ])
  })

  it('restores an entry’s own revisions, and no other entry’s', async () => {
    const { as, sqlite } = open()
    sqlite.exec(
      `insert into cms_revisions values ('e2:5', 'e2', 5, '{"title":"Not yours"}', '2026-01-02T00:00:00.000Z', 'ada')`,
    )
    await expect(as(ada).mutate('CmsRestore', { entry: 'e1', revision: 5 })).rejects.toThrow(
      'no revision 5',
    )
  })

  it('refuses what was never published, a visitor, and an author who may not', async () => {
    const { as } = open()
    await expect(as(ada).mutate('CmsRestore', { entry: 'e3', revision: 1 })).rejects.toThrow(
      'cannot be restored',
    )
    await expect(as(visitor).mutate('CmsRestore', { entry: 'e1', revision: 1 })).rejects.toThrow(
      'Only an author',
    )
    await expect(as(ian).mutate('CmsRestore', { entry: 'e1', revision: 1 })).rejects.toThrow(
      'may not restore',
    )
  })
})

describe('a scheduled draft is published as whoever scheduled it', () => {
  const soon = '2026-07-01T09:00:00.000Z'

  it('so one who may not schedule may not change, replace or remove what was promised', async () => {
    const { as, rows } = open()
    // Before the promise, the draft is the writer's to change.
    const saved = await as(wren).mutate(
      'CmsSaveDraft',
      save({ entry: 'e3', values: { title: 'By Wren' }, basedOn: '2026-03-01T00:00:00.000Z' }),
    )
    const { updatedAt } = saved.output as { updatedAt: string }
    await as(ada).mutate('CmsSchedule', { entry: 'e3', at: soon })

    const swapped = save({
      entry: 'e3',
      values: { title: 'Not what Ada read' },
      basedOn: updatedAt,
    })
    await expect(as(wren).mutate('CmsSaveDraft', swapped)).rejects.toThrow(
      'This draft is scheduled',
    )
    await expect(as(wren).mutate('CmsDiscardDraft', { entry: 'e3' })).rejects.toThrow(
      'This draft is scheduled',
    )
    // e1 is scheduled too, and has a past to restore.
    await expect(as(wren).mutate('CmsRestore', { entry: 'e1', revision: 1 })).rejects.toThrow(
      'This draft is scheduled',
    )
    expect(rows(`select "values" from cms_drafts where id = 'e3'`)).toEqual([
      { values: '{"title":"By Wren"}' },
    ])

    // Someone who could have promised it may change it, and the promise stands.
    await as(ada).mutate('CmsSaveDraft', swapped)
    expect(rows(`select scheduled_for from cms_drafts where id = 'e3'`)).toEqual([
      { scheduled_for: soon },
    ])
  })
})

describe('one connection, two requests', () => {
  it('a save that arrives while a publish is failing is not undone with it', async () => {
    const { as, rows } = open()
    await as(ada).mutate('CmsSaveDraft', save({ entry: 'e9', values: { title: 'Fails slowly' } }))
    const [publish, saved] = await Promise.allSettled([
      as(ada).mutate('CmsPublish', { entry: 'e9', basedOn: null }),
      new Promise(resolve => setTimeout(resolve, 5)).then(() =>
        as(ada).mutate(
          'CmsSaveDraft',
          save({ entry: 'e3', values: { title: 'Kept' }, basedOn: '2026-03-01T00:00:00.000Z' }),
        ),
      ),
    ])
    expect(publish.status).toBe('rejected')
    expect(saved.status).toBe('fulfilled')
    expect(rows(`select "values" from cms_drafts where id = 'e3'`)).toEqual([
      { values: '{"title":"Kept"}' },
    ])
  })

  it('makes each operation one transaction', async () => {
    let transactions = 0
    const counted = CmsServer.make({
      tables,
      content: [{ type: Posts, entity: GuardedPost, binding: Db.Post, ...handlers(Posts, posts) }],
      transaction: work => {
        transactions += 1
        return Transaction.statements(work)
      },
      ...guarded,
    })
    const { sqlite } = open()
    const layer = databaseLayer(drizzle({ client: sqlite }))
    const handlersOf = RemoteServer.handlers(
      RemoteServer.make({ entities: [...counted.sources], mutations: [...counted.mutations] }),
      ada,
    )
    const mutate = (mutation: string, input: unknown, requestId: string) =>
      Effect.runPromise(
        handlersOf.FoldkitRemoteMutate({ requestId, mutation, input }).pipe(Effect.provide(layer)),
      )
    await mutate('CmsSaveDraft', save({ entry: 'e8' }), 'c1')
    expect(transactions).toBe(1)
    await mutate('CmsPublish', { entry: 'e8', basedOn: null }, 'c2')
    expect(transactions).toBe(2)
  })
})

describe('the worklist’s search', () => {
  it('looks for what was typed as it was typed: % and _ are characters, not wildcards', async () => {
    const { as } = open()
    await as(ada).mutate('CmsSaveDraft', save({ entry: 'e7', label: '100% done' }))
    expect(await as(ada).list({ type: 'posts', search: '100%' })).toEqual(['e7'])
    expect(await as(ada).list({ type: 'posts', search: '1_0' })).toEqual([])
    expect(await as(ada).list({ type: 'posts', search: '%' })).toEqual(['e7'])
  })
})

describe('a draft’s size', () => {
  it('is bounded: an author is trusted with their content, not with the disk', async () => {
    const { as, count } = open()
    const huge = save({ entry: 'e8', values: { title: 'x'.repeat(1_000_001) } })
    await expect(as(ada).mutate('CmsSaveDraft', huge)).rejects.toThrow('too large to save')
    expect(count(`cms_entries where id = 'e8'`)).toBe(0)
    // The Model counts too: it is the larger half of most drafts.
    const heavy = save({ entry: 'e8', model: { fields: { title: 'x'.repeat(1_000_001) } } })
    await expect(as(ada).mutate('CmsSaveDraft', heavy)).rejects.toThrow('too large to save')
  })
})
