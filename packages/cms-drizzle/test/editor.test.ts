/**
 * `Cms.editor` end to end: the real editor, through Remote, against the real
 * server over SQLite. Nothing of the server is faked, so what an author sees
 * here is what the two packages do together.
 */
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { DrizzleDatabase, bind, databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { CmsServer, Transaction, published, sqliteSchema, sqliteTables } from '../src/index.js'

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  publishedAt: text('published_at'),
})
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)),
    body: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', published: 'publishedAt' }))

const PostInput = Schema.Struct({ title: Post.fields.title.schema, body: Schema.String })
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), { debounce: 0 })
const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm,
  publish: {
    create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: Schema.String } }),
    update: Mutation.make('UpdatePost', {
      Input: { ...PostInput.fields, id: Schema.String },
      Output: {},
    }),
  },
  words: { one: 'Post', many: 'Posts' },
  // What an optimistic publish of a value would show: the row, with the value in it.
  preview: (value, id) => [{ entity: 'Post', id, values: value }],
})
const PostBody = Entity.select(Post, { title: true, body: true })

// ---- the application ----

const Editor = Cms.editor('PostEditor', { content: Posts, rest: 0 })
const Slot = Bundle.declare(Editor.bundle, 'editor')
const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  Opened: { entry: Schema.String },
  Created: { entry: Schema.String },
  Nudged: {},
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, ...Object.values(Cms.Entities)],
  mutations: [...Cms.operations],
})

const place = (editor: typeof Editor) => {
  const PostEditor = editor.at({ data: Data, model: App.model.editor })
  const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
  const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
  const update = PostEditor.after(
    Page.assemble(Placed).update((model: Model, message: Message) =>
      message._tag === 'Opened'
        ? Placed.helpers.open(message.entry)(model)
        : message._tag === 'Created'
          ? Placed.helpers.create(message.entry)(model)
          : Remote.reduces(message)
            ? { model: Data.reduce(model, message) }
            : { model },
    ),
  )
  return { PostEditor, update }
}

// ---- the server ----

type Principal = { readonly name: string } | null
const isAuthor = (principal: Principal): boolean => principal !== null
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
  { Post },
  { Post: { table: posts, visible: published<Principal>(posts.publishedAt, isAuthor) } },
)

const world = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    ${sqliteSchema}
    create table posts (id text primary key, title text not null, body text not null, published_at text);
    insert into posts values ('p1', 'Live', 'As published', '2026-01-01');
    insert into cms_entries values ('e1', 'posts', 'p1', 'Live', 'ada', '2026-01-01T00:00:00.000Z', null, 1);
  `)
  let made = 0
  const cms = CmsServer.make<Principal>({
    tables: sqliteTables(),
    content: [
      {
        type: Posts,
        binding: Db.Post,
        create: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof PostInput.Type,
          { id: string }
        >(Posts.publish.create, ({ input }) =>
          Effect.gen(function* () {
            const id = `made${++made}`
            yield* write(database => database.insert(posts).values({ id, ...input }))
            return { output: { id } }
          }),
        ),
        update: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof PostInput.Type & { id: string },
          {}
        >(Posts.publish.update, ({ input }) =>
          write(database =>
            database
              .update(posts)
              .set({ title: input.title, body: input.body })
              .where(eq(posts.id, input.id)),
          ).pipe(Effect.as({ output: {} })),
        ),
      },
    ],
    transaction: Transaction.statements,
    isAuthor,
    nameOf: principal => principal?.name ?? null,
  })
  const server = RemoteServer.make({
    entities: [...cms.sources],
    queries: [...cms.queries],
    mutations: [...cms.mutations],
  })
  const database = databaseLayer(drizzle({ client: sqlite }))
  const sent: Array<string> = []
  const reads: Array<string> = []

  /** One author's browser: its own Model, the same server. */
  const author = (name: string, editor: typeof Editor = Editor) => {
    const { PostEditor, update } = place(editor)
    const handlers = RemoteServer.handlers(server, { name })
    const served = <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) =>
      effect.pipe(Effect.provide(database)) as Effect.Effect<A, never>
    const service: (typeof RemoteClient)['Service'] = {
      read: batch => {
        reads.push(...batch.requests.map(request => `${request.entity}:${request.id}`))
        return served(handlers.FoldkitRemoteRead(batch)) as never
      },
      query: request => served(handlers.FoldkitRemoteQuery(request)) as never,
      mutate: request => {
        sent.push(request.mutation)
        return served(handlers.FoldkitRemoteMutate(request)) as never
      },
      live: () => Stream.empty,
    }
    const Client = Layer.succeed(RemoteClient, service)

    let model: Model = { remote: Remote.initial, editor: Editor.bundle.init().model } as Model
    type Commands = ReadonlyArray<{ readonly effect: Effect.Effect<unknown, never, RemoteClient> }>
    const settle = async (commands: Commands): Promise<void> => {
      for (const command of commands) {
        const settled = await Effect.runPromise(command.effect.pipe(Effect.provide(Client)))
        await send(settled as Message)
      }
    }
    /** What the runtime does: update, run the Commands, feed their Messages back. */
    const send = async (message: Message): Promise<void> => {
      const next = update(model, message)
      model = next.model
      await settle((next.commands ?? []) as Commands)
    }
    /** An update whose Commands are held, to be run when the test says. */
    const hold = (message: Message): Commands => {
      const next = update(model, message)
      model = next.model
      return (next.commands ?? []) as Commands
    }
    /** What Remote's read Subscriptions do for the editor's requirements. */
    const load = async (): Promise<void> => {
      for (let round = 0; round < 3; round++) {
        for (const active of Object.values(PostEditor.actives)) {
          const projection = active.projectionOf(model)
          if (projection === undefined) continue
          model = await Effect.runPromise(
            Data.prefetch(model, projection).pipe(Effect.provide(Client)),
          )
        }
        await send(Message.Nudged())
      }
    }
    const form = (message: typeof PostForm.Message.Type | typeof Editor.Message.Type) =>
      Message.GotEditorMessage({ message })
    const type = (key: 'title' | 'body', value: string) =>
      form(PostForm.Message.Changed({ key, value }))

    return {
      send,
      hold,
      settle,
      load,
      form,
      type,
      open: async (entry: string) => {
        await send(Message.Opened({ entry }))
        await load()
      },
      status: () => PostEditor.status(model),
      resumed: () => PostEditor.resumed(model),
      state: () => PostEditor.state(model)?._tag,
      schedule: () => PostEditor.state(model)?.schedule,
      previewing: () => PostEditor.previewing(model),
      /** The post as any view of the application reads it. */
      post: (id: string) => {
        const read = Data.get(PostBody, id).read(model)
        return read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value : read._tag
      },
      error: () => PostEditor.error(model)?.message,
      field: (key: 'title' | 'body') => PostForm.field(model.editor.form, key),
    }
  }

  const rows = (query: string) =>
    sqlite.prepare(query).all() as ReadonlyArray<Record<string, unknown>>
  return { author, rows, sent, reads, sqlite }
}

describe('something new', () => {
  it('is saved as it is typed, under the id it was made with, and is on the worklist by its title', async () => {
    const { author, rows, reads } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    expect(ada.status()).toBe('Editing')
    expect(ada.resumed()).toBe('Blank')
    // Nothing of it is on the server yet, so nothing is asked of the server.
    await ada.load()
    expect(reads).toEqual([])

    await ada.send(ada.type('title', 'Hello'))
    expect(ada.status()).toBe('Saved')
    expect(rows(`select id, type, label, target_id from cms_entries where id = 'new1'`)).toEqual([
      { id: 'new1', type: 'posts', label: 'Hello', target_id: null },
    ])
    expect(rows(`select "values", form, updated_by from cms_drafts where id = 'new1'`)).toEqual([
      { values: '{"title":"Hello","body":""}', form: 'PostForm@1', updated_by: 'ada' },
    ])
  })

  it('saves the edit that is still the last one when its rest ends, and no other', async () => {
    const { author, sent } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    const first = ada.hold(ada.type('title', 'H'))
    const second = ada.hold(ada.type('title', 'He'))
    await ada.settle(first)
    expect(sent).toEqual([])
    expect(ada.status()).toBe('Editing')
    await ada.settle(second)
    expect(sent).toEqual(['CmsSaveDraft'])
  })

  it('saves a form that does not validate, and publishes nothing of it', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    await ada.send(ada.type('body', 'A body with no title yet'))
    expect(ada.status()).toBe('Saved')
    // What does not decode is no part of the values; the Model holds all of it.
    expect(rows(`select "values", label from cms_drafts join cms_entries using (id)`)).toEqual([
      { values: '{"body":"A body with no title yet"}', label: 'Untitled' },
    ])

    await ada.send(ada.form(Editor.Message.PublishAsked()))
    expect(sent).toEqual(['CmsSaveDraft'])
    expect(ada.field('title')._tag).toBe('Invalid')
    expect(rows(`select id from posts where id <> 'p1'`)).toEqual([])
  })

  it('is published through the application’s own mutation, and again from the revision that made', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    await ada.send(ada.type('title', 'Hello'))
    await ada.send(ada.form(Editor.Message.PublishAsked()))
    expect(ada.status()).toBe('Published')
    expect(rows(`select title, body from posts where id = 'made1'`)).toEqual([
      { title: 'Hello', body: '' },
    ])
    await ada.load()
    expect(ada.state()).toBe('Published')

    await ada.send(ada.type('title', 'Hello again'))
    expect(ada.status()).toBe('Saved')
    await ada.load()
    expect(ada.state()).toBe('Changed')
    await ada.send(ada.form(Editor.Message.PublishAsked()))
    expect(ada.error()).toBeUndefined()
    expect(ada.status()).toBe('Published')
    expect(rows(`select title from posts where id = 'made1'`)).toEqual([{ title: 'Hello again' }])
    expect(rows(`select revision from cms_entries where id = 'new1'`)).toEqual([{ revision: 2 }])
    expect(sent).toEqual(['CmsSaveDraft', 'CmsPublish', 'CmsSaveDraft', 'CmsPublish'])
  })

  it('saves first when a publish is asked of edits that have not rested', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    ada.hold(ada.type('title', 'Unrested'))
    await ada.send(ada.form(Editor.Message.PublishAsked()))
    expect(sent).toEqual(['CmsSaveDraft', 'CmsPublish'])
    expect(rows(`select title from posts where id = 'made1'`)).toEqual([{ title: 'Unrested' }])
  })

  it('is gone when its draft is discarded', async () => {
    const { author, rows } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    await ada.send(ada.type('title', 'Never mind'))
    await ada.send(ada.form(Editor.Message.DiscardAsked()))
    expect(rows(`select id from cms_entries where id = 'new1'`)).toEqual([])
    expect(ada.status()).toBe('Closed')
  })

  it('is closed without a word to the server when it was never saved', async () => {
    const { author, sent } = world()
    const ada = author('ada')
    await ada.send(Message.Created({ entry: 'new1' }))
    ada.hold(ada.type('title', 'Never rested'))
    await ada.send(ada.form(Editor.Message.DiscardAsked()))
    expect(ada.status()).toBe('Closed')
    expect(sent).toEqual([])
  })
})

describe('opening an entry', () => {
  it('shows what is published when there is no draft, and saves nothing until an edit', async () => {
    const { author, sent } = world()
    const ada = author('ada')
    await ada.send(Message.Opened({ entry: 'e1' }))
    expect(ada.status()).toBe('Loading')
    await ada.load()
    expect(ada.resumed()).toBe('Published')
    expect(ada.field('title').value).toBe('Live')
    expect(ada.field('body').value).toBe('As published')
    expect(ada.state()).toBe('Published')
    expect(sent).toEqual([])
  })

  it('resumes the draft exactly as it was left, errors and all', async () => {
    const { author } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('title', ''))
    await ada.send(ada.form(PostForm.Message.Blurred({ key: 'title' })))
    await ada.send(ada.type('body', 'Half done'))

    const later = author('ada')
    await later.open('e1')
    expect(later.resumed()).toBe('Model')
    expect(later.field('body').value).toBe('Half done')
    expect(later.field('title')._tag).toBe('Invalid')
    expect(later.state()).toBe('Changed')
  })

  it('fills from the draft’s values when the form has moved on from its saved Model', async () => {
    const { author } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('body', 'Written under version one'))

    const Moved = Cms.editor('PostEditor', { content: Posts, rest: 0, version: '2' })
    const later = author('ada', Moved as never)
    await later.open('e1')
    expect(later.resumed()).toBe('Values')
    expect(later.field('body').value).toBe('Written under version one')
    expect(later.field('title').value).toBe('Live')
  })

  it('keeps the keys of a draft the form still accepts, and drops the rest', async () => {
    const { author, sqlite } = world()
    sqlite.exec(`insert into cms_drafts values
      ('e1', '{"title":7,"body":"Still fits","gone":"a key of an older form"}', null, 'OlderForm@1', '2026-03-01T00:00:00.000Z', 'ada', 1, null, null, null)`)
    const ada = author('ada')
    await ada.open('e1')
    expect(ada.resumed()).toBe('Values')
    expect(ada.field('body').value).toBe('Still fits')
    expect(ada.field('title').value).toBe('')
  })

  it('never fails to open: a draft nothing of which fits shows what is published, and says so', async () => {
    const { author, rows, sqlite } = world()
    sqlite.exec(`insert into cms_drafts values
      ('e1', '"not even an object"', '{"nonsense":true}', 'PostForm@1', '2026-03-01T00:00:00.000Z', 'ada', 1, null, null, null)`)
    const ada = author('ada')
    await ada.open('e1')
    expect(ada.resumed()).toBe('Lost')
    expect(ada.status()).toBe('Editing')
    expect(ada.field('title').value).toBe('Live')
    // The stored draft is kept until the author saves over it.
    expect(rows(`select "values" from cms_drafts where id = 'e1'`)).toEqual([
      { values: '"not even an object"' },
    ])
  })

  it('says an entry that is not there is not there', async () => {
    const { author } = world()
    const ada = author('ada')
    await ada.open('nothing')
    expect(ada.status()).toBe('NotFound')
  })
})

describe('discarding the draft of something published', () => {
  it('shows what is published again, and takes the edits still resting with it', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('body', 'Second thoughts'))
    const resting = ada.hold(ada.type('body', 'Third thoughts'))
    await ada.send(ada.form(Editor.Message.DiscardAsked()))
    // The rest of an edit made before the discard ends after it.
    await ada.settle(resting)
    await ada.load()

    expect(sent).toEqual(['CmsSaveDraft', 'CmsDiscardDraft'])
    expect(rows(`select id from cms_drafts`)).toEqual([])
    expect(ada.resumed()).toBe('Published')
    expect(ada.field('body').value).toBe('As published')
    expect(ada.state()).toBe('Published')
  })
})

describe('two authors on one entry', () => {
  const both = async () => {
    const w = world()
    const ada = w.author('ada')
    const bo = w.author('bo')
    await ada.open('e1')
    await bo.open('e1')
    await ada.send(ada.type('body', 'Ada was here'))
    await bo.send(bo.type('body', 'Bo was here'))
    return { ...w, ada, bo }
  }

  it('makes the second save a conflict, with the author’s text still in the form', async () => {
    const { ada, bo, rows } = await both()
    expect(ada.status()).toBe('Saved')
    expect(bo.status()).toBe('Conflict')
    expect(bo.field('body').value).toBe('Bo was here')
    expect(rows(`select "values" from cms_drafts where id = 'e1'`)).toEqual([
      { values: '{"title":"Live","body":"Ada was here"}' },
    ])
  })

  it('shows the other author’s copy on a reload', async () => {
    const { bo } = await both()
    await bo.send(bo.form(Editor.Message.ReloadAsked()))
    expect(bo.status()).toBe('Loading')
    await bo.load()
    expect(bo.field('body').value).toBe('Ada was here')
    expect(bo.resumed()).toBe('Model')
    expect(bo.status()).toBe('Editing')
  })

  it('waits, on a reload, for the copy the server holds now and not the one it held before', async () => {
    const w = world()
    const ada = w.author('ada')
    await ada.open('e1')
    await ada.send(ada.type('body', 'Ada, first'))
    // Bo opens the entry with Ada's first draft in it, and holds that.
    const bo = w.author('bo')
    await bo.open('e1')
    await ada.send(ada.type('body', 'Ada, second'))
    await bo.send(bo.type('body', 'Bo was here'))
    expect(bo.status()).toBe('Conflict')

    await bo.send(bo.form(Editor.Message.ReloadAsked()))
    expect(bo.status()).toBe('Loading')
    await bo.load()
    expect(bo.field('body').value).toBe('Ada, second')
  })

  it('saves over the other author’s copy on an overwrite, based on that copy', async () => {
    const { bo, rows } = await both()
    await bo.send(bo.form(Editor.Message.OverwriteAsked()))
    expect(bo.status()).toBe('Saving')
    await bo.load()
    expect(bo.status()).toBe('Saved')
    expect(rows(`select "values", updated_by from cms_drafts where id = 'e1'`)).toEqual([
      { values: '{"title":"Live","body":"Bo was here"}', updated_by: 'bo' },
    ])
  })
})

describe('scheduling from the editor', () => {
  const at = '2030-01-01T09:00:00.000Z'

  it('submits and saves the form now, and leaves the publishing to the server', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.open('e1')
    ada.hold(ada.type('body', 'For the new year'))
    await ada.send(ada.form(Editor.Message.ScheduleAsked({ at })))

    expect(sent).toEqual(['CmsSaveDraft', 'CmsSchedule'])
    expect(ada.status()).toBe('Scheduled')
    expect(
      rows(`select "values", scheduled_for, scheduled_by from cms_drafts where id = 'e1'`),
    ).toEqual([
      {
        values: '{"title":"Live","body":"For the new year"}',
        scheduled_for: at,
        scheduled_by: 'ada',
      },
    ])
    // Nothing is published, and the entry says what was promised, with no refetch.
    expect(rows(`select body from posts where id = 'p1'`)).toEqual([{ body: 'As published' }])
    expect(ada.schedule()).toEqual({ at, overdue: false, error: null })
  })

  it('promises nothing of a form that does not validate', async () => {
    const { author, sent } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('title', ''))
    await ada.send(ada.form(Editor.Message.ScheduleAsked({ at })))
    expect(sent).toEqual(['CmsSaveDraft'])
    expect(ada.field('title')._tag).toBe('Invalid')
  })

  it.each([
    ['the form’s own submit', () => PostForm.Message.Submitted()],
    ['a publish', () => Editor.Message.PublishAsked()],
  ])('publishes now when %s follows a schedule that was asked and not kept', async (_, message) => {
    const { author, sent } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('title', ''))
    await ada.send(ada.form(Editor.Message.ScheduleAsked({ at })))
    await ada.send(ada.type('title', 'Fixed'))
    await ada.send(ada.form(message()))
    expect(sent.at(-1)).toBe('CmsPublish')
    expect(ada.status()).toBe('Published')
  })

  it('takes the promise back, and archives and unarchives, and the state follows each', async () => {
    const { author } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('body', 'Later'))
    await ada.send(ada.form(Editor.Message.ScheduleAsked({ at })))
    await ada.send(ada.form(Editor.Message.UnscheduleAsked()))
    expect(ada.error()).toBeUndefined()
    expect(ada.schedule()).toBeNull()

    await ada.send(ada.form(Editor.Message.ArchiveAsked()))
    expect(ada.state()).toBe('Archived')
    await ada.send(ada.form(Editor.Message.UnarchiveAsked()))
    expect(ada.error()).toBeUndefined()
    expect(ada.state()).toBe('Unpublished')
  })
})

describe('restoring a revision', () => {
  it('makes what was published before the working copy, and publishes nothing', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.open('e1')
    // Two more revisions, so there is a past to go back to.
    await ada.send(ada.type('body', 'Second'))
    await ada.send(ada.form(Editor.Message.PublishAsked()))
    await ada.send(ada.type('body', 'Third'))
    await ada.send(ada.form(Editor.Message.PublishAsked()))
    await ada.send(ada.type('body', 'Unsaved musings'))

    await ada.send(ada.form(Editor.Message.RestoreAsked({ revision: 2 })))
    await ada.load()
    expect(ada.error()).toBeUndefined()
    expect(ada.field('body').value).toBe('Second')
    expect(ada.resumed()).toBe('Values')
    expect(ada.state()).toBe('Changed')
    expect(rows(`select body from posts where id = 'p1'`)).toEqual([{ body: 'Third' }])
    expect(sent.at(-1)).toBe('CmsRestore')
    // The Model saved with the musings is not the restored value's, and goes.
    expect(rows(`select model from cms_drafts where id = 'e1'`)).toEqual([{ model: null }])

    // It is a draft like any other: publishing it makes the next revision.
    await ada.send(ada.form(Editor.Message.PublishAsked()))
    expect(rows(`select body from posts where id = 'p1'`)).toEqual([{ body: 'Second' }])
    expect(rows(`select revision from cms_entries where id = 'e1'`)).toEqual([{ revision: 4 }])
  })

  it('says a revision that is not there is not there, and leaves the draft alone', async () => {
    const { author, rows } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.type('body', 'Kept'))
    await ada.send(ada.form(Editor.Message.RestoreAsked({ revision: 9 })))
    await ada.load()
    expect(ada.error()).toContain('no revision 9')
    expect(rows(`select "values" from cms_drafts where id = 'e1'`)).toEqual([
      { values: '{"title":"Live","body":"Kept"}' },
    ])
    expect(ada.field('body').value).toBe('Kept')
  })
})

describe('previewing', () => {
  it('lays what is in the form over the store for the application’s own views, and sends nothing', async () => {
    const { author, rows, sent } = world()
    const ada = author('ada')
    await ada.open('e1')
    expect(ada.post('p1')).toEqual({ title: 'Live', body: 'As published' })

    await ada.send(ada.form(Editor.Message.PreviewShown()))
    ada.hold(ada.type('body', 'As it will read'))
    expect(ada.post('p1')).toEqual({ title: 'Live', body: 'As it will read' })
    // It follows the form, edit by edit.
    ada.hold(ada.type('title', 'Retitled'))
    expect(ada.post('p1')).toEqual({ title: 'Retitled', body: 'As it will read' })
    expect(sent).toEqual([])
    expect(rows(`select body from posts where id = 'p1'`)).toEqual([{ body: 'As published' }])

    await ada.send(ada.form(Editor.Message.PreviewHidden()))
    expect(ada.post('p1')).toEqual({ title: 'Live', body: 'As published' })
  })

  it('shows only what decodes: a title that is not valid yet stays as published', async () => {
    const { author } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.form(Editor.Message.PreviewShown()))
    ada.hold(ada.type('title', ''))
    ada.hold(ada.type('body', 'Half done'))
    expect(ada.post('p1')).toEqual({ title: 'Live', body: 'Half done' })
  })

  it('is lifted when the editor closes or the draft is discarded, however preview was left', async () => {
    const { author } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.form(Editor.Message.PreviewShown()))
    await ada.send(ada.type('body', 'Second thoughts'))
    await ada.send(ada.form(Editor.Message.DiscardAsked()))
    await ada.load()
    expect(ada.previewing()).toBe(false)
    expect(ada.post('p1')).toEqual({ title: 'Live', body: 'As published' })
  })

  it('is a capability declared, never implied', () => {
    const { preview: _, ...unpreviewed } = Posts
    const Plain = Cms.editor('PlainEditor', { content: unpreviewed, rest: 0 })
    const open = {
      ...Plain.bundle.init(undefined).model,
      mode: 'edit' as const,
      entry: 'e1',
      filled: true,
    }
    const asked = (editor: typeof Plain | typeof Editor) =>
      editor.bundle.update(open as never, Editor.Message.PreviewShown(), undefined).model.previewing
    expect(asked(Plain)).toBe(false)
    expect(asked(Editor)).toBe(true)
  })
})

describe('unpublishing from the editor', () => {
  it('hides the row, and the state follows', async () => {
    const { author, rows } = world()
    const ada = author('ada')
    await ada.open('e1')
    await ada.send(ada.form(Editor.Message.UnpublishAsked()))
    expect(ada.error()).toBeUndefined()
    expect(rows(`select published_at from posts where id = 'p1'`)).toEqual([{ published_at: null }])
    await ada.load()
    expect(ada.state()).toBe('Unpublished')
  })
})
