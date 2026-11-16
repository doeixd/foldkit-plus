/**
 * What a write answers a principal who may change unpublished work and may not
 * read it: of an entry, nothing that one who cannot read it could not already
 * say. Each refusal that a stored fact shapes is compared, as the encoded
 * answer a transport sends, with the answer for an entry that is not there.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity, Expr } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Guards } from 'foldkit-guard'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { Diagnostics, Mutation, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { DrizzleDatabase, bind, databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer, RemoteServerError } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { CmsServer, Transaction, sqliteSchema, sqliteTables } from '../src/index.js'

const Author = Schema.Struct({
  name: Schema.String,
  role: Schema.Literals(['author', 'dropbox', 'reader']),
})
type Principal = Option.Option<typeof Author.Type>
// Reads and writes, and may schedule and unpublish.
const ada: Principal = Option.some({ name: 'ada', role: 'author' })
// Reads and writes; what is scheduled or on show is not hers to change.
const bea: Principal = Option.some({ name: 'bea', role: 'author' })
// Changes unpublished work, and reads none of it. As senior as ada in everything else.
const dot: Principal = Option.some({ name: 'dot', role: 'dropbox' })
// As dot, and as junior as bea.
const dee: Principal = Option.some({ name: 'dee', role: 'dropbox' })
// Signed in, and no author of any kind.
const vic: Principal = Option.some({ name: 'vic', role: 'reader' })

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

const G = Guards.declare(
  'Cms',
  Author,
  guard => ({
    isAuthor: guard.principal(),
    isSenior: guard.principal(),
    isPublished: guard.row(Article, () => Expr.isNotNull(Article.fields.publishedAt)),
  }),
  { key: author => author.name, unguarded: 'allow' },
)
const Policy = G.implement({
  isAuthor: (principal, { interaction }) =>
    Option.exists(
      principal,
      ({ role }) => role === 'author' || (role === 'dropbox' && interaction !== 'Read'),
    ),
  isSenior: principal => Option.exists(principal, ({ name }) => name !== 'bea' && name !== 'dee'),
})
const GuardedArticle = Article.pipe(
  Guards.attach(G, { row: { Read: [G.isPublished, G.isAuthor] } }),
)
const Db = bind(
  { Article: GuardedArticle },
  { Article: { table: articles, visible: GuardDrizzle.visible(Policy, [GuardedArticle]).Article } },
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

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table articles (id text primary key, title text not null, slug text not null unique, published_at text);
    insert into articles values ('a1', 'Live', 'live', '2026-01-01'), ('a2', 'Hidden', 'hidden', null);
    insert into cms_entries values
      ('published', 'articles', 'a1', 'Live', 'ada', '2026-01-01T00:00:00.000Z', null, 1),
      ('unpublished', 'articles', 'a2', 'Hidden', 'ada', '2026-01-02T00:00:00.000Z', null, 1),
      ('drafted', 'articles', null, 'Secret plan', 'ada', '2026-01-03T00:00:00.000Z', null, null),
      ('archived', 'articles', null, 'Put away', 'ada', '2026-01-04T00:00:00.000Z', '2026-02-01T00:00:00.000Z', null),
      ('memo', 'memos', null, 'A memo', 'ada', '2026-01-05T00:00:00.000Z', null, null),
      ('clashing', 'articles', null, 'Clashing', 'ada', '2026-01-06T00:00:00.000Z', null, null),
      ('unready', 'articles', null, 'Unready', 'ada', '2026-01-07T00:00:00.000Z', null, null),
      ('scheduled', 'articles', null, 'Promised', 'ada', '2026-01-08T00:00:00.000Z', null, null),
      ('locked', 'articles', null, 'Locked', 'ada', '2026-01-09T00:00:00.000Z', null, null),
      ('broken', 'articles', null, 'Broken', 'ada', '2026-01-10T00:00:00.000Z', null, null),
      ('expired', 'articles', null, 'Expired', 'ada', '2026-01-11T00:00:00.000Z', null, null);
    insert into cms_drafts values
      ('drafted', '{"title":"Secret plan","slug":"secret-plan"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('archived', '{"title":"Put away","slug":"put-away"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('memo', '{"title":"A memo","slug":"a-memo"}', null, 'MemoForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('clashing', '{"title":"Clashing","slug":"hidden"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('unready', '{"title":"Unready"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('scheduled', '{"title":"Promised","slug":"promised"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, '2026-09-01T00:00:00.000Z', 'ada', null),
      ('locked', '{"title":"Locked","slug":"locked"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('broken', '{"title":"Fails","slug":"fails"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null),
      ('expired', '{"title":"Signed out","slug":"signed-out"}', null, 'ArticleForm@1', '2026-03-01T00:00:00.000Z', 'ada', null, null, null, null);
    insert into cms_revisions values
      ('published:1', 'published', 1, '{"title":"Live, as first written","slug":"live"}', '2026-01-01T00:00:00.000Z', 'ada'),
      ('unpublished:1', 'unpublished', 1, '{"title":"Hidden","slug":"hidden"}', '2026-01-02T00:00:00.000Z', 'ada');
  `)
  let made = 0
  const cms = CmsServer.make({
    tables: sqliteTables(),
    content: [
      {
        type: Articles,
        entity: GuardedArticle,
        binding: Db.Article,
        create: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof Input.Type,
          { id: string }
        >(Articles.publish.create, ({ input }) =>
          Effect.gen(function* () {
            if (input.title === 'Signed out')
              return yield* RemoteServer.unauthenticated('Your session ended')
            if (input.title === 'Fails')
              return yield* new RemoteServerError({ message: 'disk quota exceeded on shard 7' })
            const id = `made${++made}`
            yield* write(database => database.insert(articles).values({ id, ...input }))
            return { output: { id } }
          }),
        ),
        update: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof Input.Type & { readonly id: string },
          {}
        >(Articles.publish.update, ({ input: { id, ...values } }) =>
          write(database => database.update(articles).set(values).where(eq(articles.id, id))).pipe(
            Effect.as({ output: {} }),
          ),
        ),
      },
    ],
    transaction: Transaction.statements,
    policy: Policy,
    authors: [G.isAuthor],
    transitions: { schedule: [G.isSenior], unpublish: [G.isSenior] },
    // A rule about the entry itself: what is locked is nobody's to change.
    allow: (_principal, _transition, entry) => entry.label !== 'Locked',
    now: () => new Date('2026-06-01T00:00:00.000Z'),
    nameOf: principal => Option.getOrNull(Option.map(principal, ({ name }) => name)),
  })
  const server = RemoteServer.make({
    entities: [...cms.sources],
    queries: [...cms.queries],
    mutations: [...cms.mutations],
  })
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const collected = Diagnostics.collect()
  const run = <A>(effect: Effect.Effect<A, never, DrizzleDatabase>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(layer),
        Effect.provideService(Diagnostics.Reporter, collected.report),
      ),
    )
  return {
    operations: cms.mutations.map(source => source.mutation),
    /** One mutation, as the encoded answer a JSON transport sends: its status and its body, as text. */
    answered: (principal: Principal, mutation: string, input: unknown) =>
      run(
        RemoteServer.answer(RemoteServer.handlers(server, principal), {
          operation: 'mutate',
          payload: { requestId: 'r1', mutation, input },
        }),
      ).then(({ status, body }) => `${status} ${JSON.stringify(body)}`),
    read: (principal: Principal, entity: string, id: string, fields: ReadonlyArray<string>) =>
      run(
        RemoteServer.answer(RemoteServer.handlers(server, principal), {
          operation: 'read',
          payload: { version: REMOTE_PROTOCOL_VERSION, requests: [{ entity, id, fields }] },
        }),
      ).then(({ status, body }) => `${status} ${JSON.stringify(body)}`),
    listed: (principal: Principal, archived: boolean) =>
      run(
        RemoteServer.answer(RemoteServer.handlers(server, principal), {
          operation: 'query',
          payload: {
            query: 'CmsEntries',
            input: { type: 'articles', search: '', archived },
            window: { first: 20 },
          },
        }),
      ).then(({ status, body }) => `${status} ${JSON.stringify(body)}`),
    count: (where: string) =>
      Number((sqlite.prepare(`select count(*) as n from ${where}`).get() as { n: number }).n),
    reported: collected.reported,
  }
}

const saved = (entry: string, over: object = {}) => ({
  entry,
  type: 'articles',
  label: 'Sent in',
  values: { title: 'Sent in', slug: 'sent-in' },
  model: null,
  form: 'ArticleForm@1',
  // A save that names what it was made from: of an entry that is not there, a conflict.
  basedOn: '2026-01-01T00:00:00.000Z',
  ...over,
})

/**
 * Every refusal a stored fact shapes: the operation, what is asked of the
 * entry, and the fact. `author` is who reads the precise sentence, where it is
 * not ada: one the fact refuses.
 */
const refusals: ReadonlyArray<{
  readonly mutation: string
  readonly fact: string
  readonly input: (entry: string) => object
  readonly entry: string
  /** Asked by bea, and by dee of those who may not read: neither may schedule or unpublish. */
  readonly junior?: true
  readonly precise: string
}> = [
  {
    mutation: 'CmsSaveDraft',
    fact: 'it is of another type',
    input: saved,
    entry: 'memo',
    precise: 'This entry is of \\"memos\\", not \\"articles\\"',
  },
  {
    mutation: 'CmsSaveDraft',
    fact: 'it is archived',
    input: saved,
    entry: 'archived',
    precise: 'An archived entry takes no draft',
  },
  {
    mutation: 'CmsSaveDraft',
    fact: 'allow refuses it',
    input: saved,
    entry: 'locked',
    precise: 'This author may not save this entry',
  },
  {
    mutation: 'CmsSaveDraft',
    fact: 'its draft is scheduled',
    input: saved,
    entry: 'scheduled',
    junior: true,
    precise: 'This draft is scheduled',
  },
  {
    mutation: 'CmsSaveDraft',
    fact: 'its draft was saved since',
    input: saved,
    entry: 'drafted',
    precise: 'This draft was saved by someone else since',
  },
  {
    mutation: 'CmsDiscardDraft',
    fact: 'allow refuses it',
    input: entry => ({ entry }),
    entry: 'locked',
    precise: 'This author may not discard this entry',
  },
  {
    mutation: 'CmsDiscardDraft',
    fact: 'its draft is scheduled',
    input: entry => ({ entry }),
    entry: 'scheduled',
    junior: true,
    precise: 'This draft is scheduled',
  },
  {
    mutation: 'CmsPublish',
    fact: 'its type is not served',
    input: entry => ({ entry, basedOn: null }),
    entry: 'memo',
    precise: '\\"memos\\" is not a type of content this server knows',
  },
  {
    mutation: 'CmsPublish',
    fact: 'it is archived',
    input: entry => ({ entry, basedOn: null }),
    entry: 'archived',
    precise: 'This entry cannot be published as it stands',
  },
  {
    mutation: 'CmsPublish',
    fact: 'it is published and has no draft',
    input: entry => ({ entry, basedOn: 1 }),
    entry: 'published',
    precise: 'This entry cannot be published as it stands',
  },
  {
    mutation: 'CmsPublish',
    fact: 'its revision is another',
    input: entry => ({ entry, basedOn: 4 }),
    entry: 'drafted',
    precise: 'This entry was published by someone else since',
  },
  {
    mutation: 'CmsPublish',
    fact: 'its draft is not ready',
    input: entry => ({ entry, basedOn: null }),
    entry: 'unready',
    precise: 'This draft is not ready to publish: check slug',
  },
  {
    mutation: 'CmsPublish',
    fact: 'its draft’s address is another row’s',
    input: entry => ({ entry, basedOn: null }),
    entry: 'clashing',
    precise: 'That address is taken: \\"hidden\\" is already used',
  },
  {
    mutation: 'CmsPublish',
    fact: 'allow refuses it',
    input: entry => ({ entry, basedOn: null }),
    entry: 'locked',
    precise: 'This author may not publish this entry',
  },
  {
    mutation: 'CmsPublish',
    fact: 'the type’s own handler refuses its draft',
    input: entry => ({ entry, basedOn: null }),
    entry: 'expired',
    precise: 'Your session ended',
  },
  {
    mutation: 'CmsUnpublish',
    fact: 'it was never published',
    input: entry => ({ entry }),
    entry: 'drafted',
    precise: 'This entry cannot be unpublished as it stands',
  },
  {
    mutation: 'CmsUnpublish',
    fact: 'it is not on show',
    input: entry => ({ entry }),
    entry: 'unpublished',
    precise: 'This entry cannot be unpublished as it stands',
  },
  {
    mutation: 'CmsSchedule',
    fact: 'it has no draft',
    input: entry => ({ entry, at: '2026-07-01T09:00:00.000Z' }),
    entry: 'published',
    precise: 'This entry cannot be scheduled as it stands',
  },
  {
    mutation: 'CmsSchedule',
    fact: 'it is scheduled already',
    input: entry => ({ entry, at: '2026-07-01T09:00:00.000Z' }),
    entry: 'scheduled',
    precise: 'This entry cannot be scheduled as it stands',
  },
  {
    mutation: 'CmsSchedule',
    fact: 'its draft is not ready',
    input: entry => ({ entry, at: '2026-07-01T09:00:00.000Z' }),
    entry: 'unready',
    precise: 'This draft is not ready to publish: check slug',
  },
  {
    mutation: 'CmsUnschedule',
    fact: 'it is not scheduled',
    input: entry => ({ entry }),
    entry: 'drafted',
    precise: 'This entry cannot be unscheduled as it stands',
  },
  {
    mutation: 'CmsArchive',
    fact: 'it is archived already',
    input: entry => ({ entry }),
    entry: 'archived',
    precise: 'This entry cannot be archived as it stands',
  },
  {
    mutation: 'CmsArchive',
    fact: 'it is on show',
    input: entry => ({ entry }),
    entry: 'published',
    junior: true,
    precise: 'This author may not unpublish this entry',
  },
  {
    mutation: 'CmsUnarchive',
    fact: 'it is not archived',
    input: entry => ({ entry }),
    entry: 'drafted',
    precise: 'This entry cannot be unarchived as it stands',
  },
  {
    mutation: 'CmsRestore',
    fact: 'it was never published',
    input: entry => ({ entry, revision: 1 }),
    entry: 'drafted',
    precise: 'This entry cannot be restored as it stands',
  },
  {
    mutation: 'CmsRestore',
    fact: 'it has no such revision',
    input: entry => ({ entry, revision: 7 }),
    entry: 'published',
    precise: 'This entry has no revision 7',
  },
]

describe('a refusal that a stored fact shapes', () => {
  it('is listed here for every operation the server has', () => {
    // A new operation fails this until its refusals are in the table above.
    expect([...new Set(refusals.map(({ mutation }) => mutation))].sort()).toEqual(
      [...open().operations].sort(),
    )
  })

  it.each(refusals)(
    '$mutation, when $fact: an author reads why, and one who may not read is answered as for no entry',
    async ({ mutation, input, entry, junior, precise }) => {
      const { answered } = open()
      const [author, unreading] = junior === true ? [bea, dee] : [ada, dot]
      const missing = await answered(unreading, mutation, input('nowhere'))
      // The fixture tells the cases apart: who may read is told this entry's own fact.
      const told = await answered(author, mutation, input(entry))
      expect(told).toContain(precise)
      expect(told).not.toBe(missing)
      // Who may not read is told what an author is of an entry that is not there, and no more.
      expect(missing).toBe(await answered(author, mutation, input('nowhere')))
      expect(missing).not.toMatch(/^200 /)
      expect(await answered(unreading, mutation, input(entry))).toBe(missing)
    },
  )

  it('is refused whole, before any entry is looked up, to one who is no author', async () => {
    const { answered } = open()
    for (const { mutation, input, entry } of refusals) {
      const refused = await answered(vic, mutation, input(entry))
      expect(refused).toContain('Only an author may change unpublished work')
      expect(refused).toBe(await answered(vic, mutation, input('nowhere')))
    }
  })
})

describe('a refusal of what was sent alone', () => {
  it.each([
    {
      mutation: 'CmsSaveDraft',
      input: (entry: string) => saved(entry, { type: 'memos' }),
      precise: '\\"memos\\" is not a type of content this server knows',
    },
    {
      mutation: 'CmsSaveDraft',
      input: (entry: string) => saved(entry, { values: { title: 'x'.repeat(1_000_001) } }),
      precise: 'This draft is too large to save',
    },
    {
      mutation: 'CmsSchedule',
      input: (entry: string) => ({ entry, at: 'the first of never' }),
      precise: '\\"the first of never\\" is not a time',
    },
  ])(
    '$mutation is said as it is to one who may not read, of any entry',
    async ({ mutation, input, precise }) => {
      const { answered } = open()
      const told = await answered(dot, mutation, input('drafted'))
      expect(told).toContain(precise)
      expect(told).toBe(await answered(dot, mutation, input('nowhere')))
      expect(told).toBe(await answered(ada, mutation, input('drafted')))
    },
  )
})

describe('a failure of this side', () => {
  it('stays one to one who may not read: reported, and answered with its incident', async () => {
    const { answered, reported } = open()
    const failed = await answered(dot, 'CmsPublish', { entry: 'broken', basedOn: null })
    expect(failed).toMatch(/^500 \{"error":"Internal error","incident":"[0-9a-f]{16}"\}$/)
    expect(reported).toContainEqual(
      expect.objectContaining({
        _tag: 'ServerDefect',
        message: expect.stringContaining('disk quota exceeded on shard 7'),
      }),
    )
  })
})

describe('a first save, by one who may not read', () => {
  const first = (entry: string) => saved(entry, { basedOn: null })

  it('makes an entry under an id nobody has, and answers what was sent and no more', async () => {
    const { answered, count } = open()
    const made = await answered(dot, 'CmsSaveDraft', first('mine'))
    expect(made).toMatch(/^200 /)
    expect(count(`cms_drafts where id = 'mine'`)).toBe(1)
    expect(JSON.parse(made.slice(4)).result).toEqual({
      output: { entry: 'mine', updatedAt: '2026-06-01T00:00:00.000Z' },
      entities: [],
      connections: [],
      deleted: [],
    })
  })

  it('says of an id that is taken only that the draft was not saved, whatever the entry is', async () => {
    const { answered } = open()
    const answers = new Set<string>()
    for (const entry of ['memo', 'archived', 'locked', 'scheduled', 'drafted'])
      answers.add(await answered(dot, 'CmsSaveDraft', first(entry)))
    expect([...answers]).toEqual([
      expect.stringContaining('This draft cannot be saved as this entry'),
    ])
    // An author is told each: the fixture can tell them apart.
    expect(await answered(ada, 'CmsSaveDraft', first('memo'))).toContain('This entry is of')
    expect(await answered(ada, 'CmsSaveDraft', first('archived'))).toContain('An archived entry')
  })

  it('goes on saving a draft it made, from what its own save answered', async () => {
    const { answered, count } = open()
    const made = JSON.parse((await answered(dot, 'CmsSaveDraft', first('mine'))).slice(4)).result
    const again = await answered(
      dot,
      'CmsSaveDraft',
      saved('mine', { basedOn: made.output.updatedAt, label: 'Sent in, again' }),
    )
    expect(again).toMatch(/^200 /)
    expect(count(`cms_entries where id = 'mine' and label = 'Sent in, again'`)).toBe(1)
  })
})

describe('a write that is made, by one who may not read', () => {
  // What each stored row holds that the caller never sent.
  const stored = /Secret plan|secret-plan|Live, as first written|Hidden|ada|2026-0[1-3]/

  it.each([
    { mutation: 'CmsPublish', input: { entry: 'drafted', basedOn: null } },
    { mutation: 'CmsSchedule', input: { entry: 'drafted', at: '2026-07-01T09:00:00.000Z' } },
    { mutation: 'CmsUnschedule', input: { entry: 'scheduled' } },
    { mutation: 'CmsRestore', input: { entry: 'published', revision: 1 } },
    { mutation: 'CmsArchive', input: { entry: 'published' } },
    { mutation: 'CmsUnarchive', input: { entry: 'archived' } },
    { mutation: 'CmsUnpublish', input: { entry: 'published' } },
    { mutation: 'CmsDiscardDraft', input: { entry: 'drafted' } },
    { mutation: 'CmsSaveDraft', input: saved('published', { basedOn: null }) },
  ])('$mutation answers its output, and no row', async ({ mutation, input }) => {
    // The same write by an author answers rows: there was something to leave out.
    const read = JSON.parse((await open().answered(ada, mutation, input)).slice(4)).result
    expect(read.entities.length + read.deleted.length).toBeGreaterThan(0)
    const answer = await open().answered(dot, mutation, input)
    expect(answer).toMatch(/^200 /)
    expect(answer).not.toMatch(stored)
    expect(JSON.parse(answer.slice(4)).result).toEqual({
      output: read.output,
      entities: [],
      connections: [],
      deleted: [],
    })
  })

  it('is made: a publish by one who may not read is on show', async () => {
    const { answered, count } = open()
    await answered(dot, 'CmsPublish', { entry: 'drafted', basedOn: null })
    expect(count(`articles where slug = 'secret-plan' and published_at is not null`)).toBe(1)
    expect(count(`cms_revisions where entry_id = 'drafted'`)).toBe(1)
  })
})

describe('what one who may not read is shown', () => {
  it('is no entry, draft or revision, by id or through the worklist, and of content what is published', async () => {
    const { read, listed } = open()
    for (const [entity, id, fields] of [
      ['CmsEntry', 'published', ['type', 'label', 'state', 'may']],
      ['CmsEntry', 'drafted', ['type', 'label', 'state', 'may']],
      ['CmsDraft', 'drafted', ['values']],
      ['CmsRevision', 'published:1', ['values']],
      ['Article', 'a2', ['title']],
    ] as const) {
      expect(await read(ada, entity, id, fields)).toMatch(/Live|Secret plan|Hidden|articles/)
      expect(await read(dot, entity, id, fields)).not.toMatch(/Live|Secret plan|Hidden|articles/)
    }
    expect(await listed(ada, false)).toContain('drafted')
    expect(await listed(dot, false)).not.toMatch(/drafted|published|scheduled/)
    expect(await listed(dot, true)).not.toContain('archived')
    // What is published is anyone's to read, as a row of the content.
    expect(await read(dot, 'Article', 'a1', ['title'])).toContain('Live')
  })
})
