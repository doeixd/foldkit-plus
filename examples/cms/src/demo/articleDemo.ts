/**
 * An article's life in the CMS, its body a rich-text document (§124 §12, §140): the post's story
 * again, with the editor as the body's form control. A writer types — a Markdown marker, a
 * bold word — and every edit is a draft; a reload resumes it with the caret where it was; a
 * preview and a visitor read the document through the standard rendering; an editor
 * publishes, revises, goes back, and schedules. The editor adds no CMS state: every save,
 * revision, and publish is the CMS's, with the document as one form key's value.
 *
 * The content type is declared here and handed to the server, rather than exported: a form
 * holding the editor overflows what the compiler will print in a declaration (`TS7056`), and
 * only this story needs it.
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { Effect, Layer, Match, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms } from 'foldkit-cms'
import { published } from 'foldkit-cms-drizzle'
import { Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import {
  Mutation,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemotePolicy,
} from 'foldkit-remote'
import { bind, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { richTextInput } from 'foldkit-richtext-dom/input'
import { markdownInputRules, print } from 'foldkit-richtext-markdown'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { isAuthor, openServer, write, type Principal } from '../server/server.js'
import { memorySqlite } from '../server/sqlite-node.js'

const ArticleId = Schema.String.pipe(Schema.brand('ArticleId'))
type ArticleId = typeof ArticleId.Type

const Article = Entity.define(
  'Article',
  Schema.Struct({
    id: ArticleId,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    slug: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Address' }),
    body: RichText.Document.annotate({ title: 'Body' }),
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

const ArticleInput = Schema.Struct({
  title: Article.fields.title.schema,
  slug: Article.fields.slug.schema,
  body: Article.fields.body.schema,
})

const ArticleForm = Form.make('ArticleForm', Entity.input(Article, ArticleInput), {
  inputs: {
    slug: Cms.slug('title', { prefix: '/articles/' }),
    // The body's control is the editor, in the standard vocabulary with Markdown's markers.
    body: richTextInput('article-body', {
      vocabulary: {
        nodes: RichText.nodeRegistry(RichText.standardNodes),
        marks: RichText.markRegistry(RichText.standardMarks),
      },
      rendering: RichText.standardRendering,
      inputRules: markdownInputRules,
      placeholder: 'Write the article…',
    }),
  },
  debounce: 0,
})

const Articles = Cms.content('articles', {
  entity: Article,
  form: ArticleForm,
  publish: {
    create: Mutation.make('CreateArticle', { Input: ArticleInput, Output: { id: ArticleId } }),
    update: Mutation.make('UpdateArticle', {
      Input: { ...ArticleInput.fields, id: ArticleId },
      Output: {},
    }),
  },
  words: { one: 'Article', many: 'Articles' },
  preview: (value, id) => [{ entity: 'Article', id, values: value }],
})

/** The article's row: its body is JSON, which the document codec reads back. */
const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  body: text('body', { mode: 'json' }).notNull(),
  publishedAt: text('published_at'),
})
const Db = bind(
  { Article },
  { Article: { table: articles, visible: published<Principal>(articles.publishedAt, isAuthor) } },
)

// A rest of zero: the scripted run does not wait on a clock to save.
const Editor = Cms.editor('ArticleEditor', { content: Articles, rest: 0 })
const Slot = Bundle.declare(Editor.bundle, 'editor')

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedEntry: { entry: Schema.String },
  StartedArticle: { entry: Schema.String },
  Ticked: {},
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Article, ...Object.values(Cms.Entities)],
  queries: [Cms.Entries, Cms.bySlug(Articles)],
  mutations: [...Cms.operations],
})
const ArticleEditor = Editor.at({ data: Data, model: App.model.editor })
const ArticleView = Entity.select(Article, { title: true, body: true })
const actives = {
  ...ArticleEditor.actives,
  page: Data.active('ArticlePage', (model: Model) =>
    Option.map(ArticleEditor.pageId(model), id => Data.get(ArticleView, ArticleId.make(id))),
  ),
}

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const EditorSlot = Parent.at(Slot, { onOut: ArticleEditor.onOut })
const placements = Parent.assemble(EditorSlot, Data.wiring(actives))
const update = ArticleEditor.after(
  placements.update((model, message) => {
    // Remote's Messages go to its wiring, so they never reach here; the guard
    // narrows to the demo's own tags, which the match below covers all of.
    if (Remote.reduces(message)) return { model }
    return Match.valueTags(message, {
      OpenedEntry: ({ entry }) => EditorSlot.helpers.open(entry)(model),
      StartedArticle: ({ entry }) => EditorSlot.helpers.create(entry)(model),
      Ticked: () => ({ model }),
    })
  }),
)
const initial: Model = placements.initial({ remote: Remote.initial }).model

/** A document as its Markdown, on one line of the transcript. */
const markdown = (document: RichText.Document): string =>
  JSON.stringify(print(document).markdown.trimEnd())
/** A document as a visitor's page draws it. */
const html = (document: unknown): string =>
  RichText.documentToHtml(RichText.decodeDocument(document), RichText.standardRendering)

export const runArticleDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const say = (line: string) => lines.push(line)

  let now = new Date('2026-03-01T09:00:00.000Z')
  let madeArticles = 0
  const backend = openServer(() => now, memorySqlite(), {
    schema: `create table articles (
      id text primary key, title text not null, slug text not null unique,
      body text not null, published_at text
    );`,
    content: [
      {
        type: Articles,
        binding: Db.Article,
        create: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof ArticleInput.Type,
          { id: ArticleId }
        >(Articles.publish.create, ({ input }) =>
          Effect.gen(function* () {
            const id = ArticleId.make(`article-${++madeArticles}`)
            yield* write(database => database.insert(articles).values({ id, ...input }))
            return { output: { id } }
          }),
        ),
        update: RemoteServer.mutation<
          Principal,
          DrizzleDatabase,
          string,
          typeof ArticleInput.Type & { readonly id: ArticleId },
          {}
        >(Articles.publish.update, ({ input: { id, ...values } }) =>
          write(database => database.update(articles).set(values).where(eq(articles.id, id))).pipe(
            Effect.as({ output: {} }),
          ),
        ),
      },
    ],
  })

  /** One chair: a principal, a Remote client that asks as them, and a Model of their own. */
  const chair = (principal: Principal) => {
    const handlers = RemoteServer.handlers(backend.server, principal)
    const served = <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) =>
      effect.pipe(Effect.provide(backend.database))
    const sent: string[] = []
    const service: (typeof RemoteClient)['Service'] = {
      read: batch => served(handlers.FoldkitRemoteRead(batch)),
      query: request => served(handlers.FoldkitRemoteQuery(request)),
      mutate: request => {
        sent.push(request.mutation.replace('Cms', ''))
        return served(handlers.FoldkitRemoteMutate(request))
      },
      live: () => Stream.empty,
    }
    const client = Layer.succeed(RemoteClient, service)
    let model: Model = initial

    const send = async (message: Message): Promise<void> => {
      const next = update(model, message)
      model = next.model
      for (const command of next.commands ?? []) {
        // The editor's patch Command draws into a host element this story has none of.
        if (command.name === 'RichText.patch') continue
        await send(
          await Effect.runPromise(
            (command.effect as Effect.Effect<Message, never, RemoteClient>).pipe(
              Effect.provide(client),
            ),
          ),
        )
      }
    }
    const look = async (): Promise<void> => {
      for (let round = 0; round < 2; round++) {
        for (const active of Object.values(actives)) {
          const projection = active.projectionOf(model)
          if (Option.isNone(projection)) continue
          model = await Effect.runPromise(
            Data.prefetch(model, projection.value, { policy: RemotePolicy.networkOnly }).pipe(
              Effect.provide(client),
            ),
          )
        }
        await send(Message.Ticked())
      }
    }
    const editor = (message: typeof ArticleForm.Message.Type | typeof Editor.Message.Type) =>
      send(Message.GotEditorMessage({ message }))
    const body = ArticleForm.control('body')
    /** What the body's editor holds: the key's draft, which is the editor's own Model. */
    const draft = () => body.field(model.editor.form).value

    return {
      send,
      look,
      editor,
      /** A Message to the body's editor, as a keystroke or a toolbar button sends it. */
      edit: (message: EditorMessage) => editor(body.send(message)),
      /** Types into the body where the caret is, one character at a time, as a person does. */
      typeText: async (text: string) => {
        for (const character of text)
          await editor(body.send(EditorMessage.Typed({ text: character })))
      },
      title: (value: string) => editor(ArticleForm.Message.Changed({ key: 'title', value })),
      body: () => markdown(draft().document),
      caret: () => {
        const selection = draft().selection
        return selection?.type === 'Range'
          ? `${selection.anchor.offset} in ${selection.anchor.node}`
          : 'none'
      },
      sent: () => sent.splice(0).join(', ') || 'nothing',
      status: () => ArticleEditor.status(model),
      state: () =>
        Option.match(ArticleEditor.state(model), {
          onNone: () => '?',
          onSome: state => Display.show(Cms.Display.State.of({}), state),
        }),
      resumed: () => Option.getOrElse(ArticleEditor.resumed(model), () => 'not opened'),
      /** The article as this chair's own preview reads it. */
      preview: async (): Promise<string> => {
        const id = ArticleEditor.pageId(model)
        if (Option.isNone(id)) return 'no page'
        const projection = Data.get(ArticleView, ArticleId.make(id.value))
        model = await Effect.runPromise(
          Data.prefetch(model, projection).pipe(Effect.provide(client)),
        )
        const read = projection.read(model)
        return read._tag === 'Ready' || read._tag === 'Refreshing'
          ? html(read.value.body)
          : read._tag
      },
      /** The site's page for an address, as a visitor's browser gets it. */
      visit: async (slug: string): Promise<string> => {
        const found = await Effect.runPromise(
          served(
            handlers.FoldkitRemoteQuery({
              query: Cms.bySlug(Articles).name,
              input: { slug },
              window: { first: 1 },
            }),
          ) as Effect.Effect<{ readonly edges: ReadonlyArray<{ readonly id: string }> }, unknown>,
        )
        const id = found.edges[0]?.id
        if (id === undefined) return '404'
        const read = (await Effect.runPromise(
          served(
            handlers.FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: [{ entity: 'Article', id, fields: ['body'] }],
            } as never),
          ),
        )) as { readonly entities: ReadonlyArray<{ readonly values: Record<string, unknown> }> }
        const values = read.entities[0]?.values
        return values === undefined ? '404' : html(values['body'])
      },
    }
  }

  const wren = chair({ name: 'wren', role: 'author' })
  const edda = chair({ name: 'edda', role: 'editor' })
  const visitor = chair(null)
  const caret = (node: string, offset: number): RichText.Selection => ({
    type: 'Range',
    anchor: { node: RichText.NodeId.make(node), offset, affinity: 'after' },
    focus: { node: RichText.NodeId.make(node), offset, affinity: 'after' },
  })

  say('— a writer starts an article —')
  await wren.send(Message.StartedArticle({ entry: 'entry-a' }))
  await wren.title('On gardens')
  await wren.edit(EditorMessage.Selected({ selection: caret('blank-t', 0) }))
  // `# ` is a Markdown marker the placement's input rules turn into a heading as it is typed.
  await wren.typeText('# Tending')
  await wren.edit(EditorMessage.Entered())
  await wren.typeText('Water ')
  await wren.edit(EditorMessage.ToggledMark({ mark: 'Bold' }))
  await wren.typeText('early')
  say(`the body: ${wren.body()}; caret at ${wren.caret()}`)
  const saves = wren.sent().split(', ')
  say(
    `every edit is a draft: ${wren.status()}; ${saves.length} saves, each ${[...new Set(saves)].join()}`,
  )

  say('— a reload resumes the draft —')
  const reloaded = chair({ name: 'wren', role: 'author' })
  await reloaded.send(Message.OpenedEntry({ entry: 'entry-a' }))
  await reloaded.look()
  say(`resumed from the ${reloaded.resumed()}: ${reloaded.body()}; caret at ${reloaded.caret()}`)

  say('— a preview draws the document, sending nothing —')
  reloaded.sent()
  await reloaded.editor(Editor.Message.PreviewShown())
  say(`the writer's preview: ${await reloaded.preview()}; sent ${reloaded.sent()}`)
  await reloaded.editor(Editor.Message.PreviewHidden())

  say('— the editor publishes —')
  await edda.send(Message.OpenedEntry({ entry: 'entry-a' }))
  await edda.look()
  await edda.editor(Editor.Message.PublishAsked())
  say(`editor: ${edda.status()}; state ${edda.state()}`)
  say(`a visitor at /articles/on-gardens: ${await visitor.visit('on-gardens')}`)

  say('— a revision, then going back —')
  await edda.edit(EditorMessage.Selected({ selection: caret('e0', 0) }))
  await edda.typeText('Always ')
  await edda.editor(Editor.Message.PublishAsked())
  say(`published again: ${await visitor.visit('on-gardens')}`)
  say(
    `revisions: ${backend
      .rows(`select n from cms_revisions order by n`)
      .map(row => row['n'])
      .join(', ')}`,
  )
  await edda.editor(Editor.Message.RestoreAsked({ revision: 1 }))
  await edda.look()
  say(`restored as a draft: ${edda.body()}; state ${edda.state()}`)
  say(`nothing was published by that: ${await visitor.visit('on-gardens')}`)

  say('— promised for the morning —')
  await edda.editor(Editor.Message.ScheduleAsked({ at: '2026-03-02T08:00:00.000Z' }))
  say(`editor: ${edda.status()}; state ${edda.state()}`)
  now = new Date('2026-03-02T08:00:30.000Z')
  const due = await Effect.runPromise(
    backend.cms
      .due(now, { as: name => (name === 'edda' ? { name, role: 'editor' } : null) })
      .pipe(Effect.provide(backend.database)),
  )
  say(`the host asks what is due: ${JSON.stringify(due)}`)
  say(`a visitor reads: ${await visitor.visit('on-gardens')}`)
  return lines
}
