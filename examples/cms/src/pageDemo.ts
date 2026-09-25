/**
 * A page's life in the CMS, built with the page Builder: the post's story again,
 * with Blocks instead of a body. A writer builds a page, a reload resumes the
 * draft, a preview draws it through the site's own views, an editor publishes
 * it, revises it, goes back, schedules a change, and meets a writer on the same
 * entry. The Builder adds no CMS state: every save, revision and publish is the
 * CMS's, with the page as one form key's value.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { Message as BuilderMessage, type Model as BuilderModel } from 'foldkit-builder'
import { Cms } from 'foldkit-cms'
import { Composition, type Document } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { Display } from 'foldkit-crud'
import { REMOTE_PROTOCOL_VERSION, RemoteClient, RemotePolicy } from 'foldkit-remote'
import type { DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { inertHtml, type Html } from 'foldkit/html'
import {
  Data,
  Editor,
  Message,
  PageEditor,
  actives,
  initial,
  pageView,
  update,
  type Model,
} from './pageApp.js'
import { PageForm, Pages } from './pageDomain.js'
import { openServer, type Principal } from './server.js'
import { PageBuilder, Site, SiteRenderer } from './site.js'

/** A drawn page as a visitor would read it: its text, element by element. */
const read = (document: Document): string => {
  const texts: string[] = []
  const walk = (node: Html | string): void => {
    if (node === null) return
    if (typeof node === 'string') return void texts.push(node)
    if (node.text !== undefined) texts.push(node.text)
    for (const child of node.children ?? []) walk(child)
  }
  for (const root of Renderer.render(SiteRenderer, document, inertHtml)) walk(root)
  return texts.join(' | ') || '(nothing)'
}

/** The page as an indented outline, one Block per line, on one line of the transcript. */
const outline = (document: Document): string =>
  Composition.describe(Site, document)
    .split('\n')
    .map(line => line.trim().replace(/ [0-9a-f-]{36}/, ''))
    .join(' > ')

export const runPageDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const say = (line: string) => lines.push(line)

  let now = new Date('2026-03-01T09:00:00.000Z')
  const backend = openServer(() => now)

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

    /** A Command as the runtime runs it: with a Remote client that asks as this chair. */
    const run = (effect: Effect.Effect<Message, never, RemoteClient>): Promise<Message> =>
      Effect.runPromise(effect.pipe(Effect.provide(client)))
    const send = async (message: Message): Promise<void> => {
      const next = update(model, message)
      model = next.model
      for (const command of next.commands ?? []) {
        // The live region's timers read and clear what the Builder announces.
        // A runtime runs them beside everything else; this story follows each
        // Command in turn and has no clock to wait on, so it leaves them out.
        if (command.name.startsWith('LiveAnnounce.')) continue
        await send(await run(command.effect))
      }
    }
    const look = async (): Promise<void> => {
      for (let round = 0; round < 2; round++) {
        for (const active of Object.values(actives)) {
          const projection = active.projectionOf(model)
          if (projection === undefined) continue
          model = await Effect.runPromise(
            Data.prefetch(model, projection, { policy: RemotePolicy.networkOnly }).pipe(
              Effect.provide(client),
            ),
          )
        }
        await send(Message.Ticked())
      }
    }
    const editor = (message: typeof PageForm.Message.Type | typeof Editor.Message.Type) =>
      send(Message.GotEditorMessage({ message }))
    const document = PageForm.control('document')
    /** The Builder's Model, as the page form holds it. */
    const builder = (): BuilderModel => document.field(model.editor.form).value
    /** One of the Builder's own Messages, carried by the form and the editor. */
    const build = (message: BuilderMessage) => editor(document.send(message))

    return {
      send,
      look,
      editor,
      title: (value: string) => editor(PageForm.Message.Changed({ key: 'title', value })),
      /** Adds a Block where the Builder's palette would, and selects it. */
      add: (block: 'Section' | 'Heading' | 'Button') => {
        const at = PageBuilder.placeFor(builder().page.present, builder().selected, block)
        return at === undefined
          ? Promise.resolve()
          : build(BuilderMessage.InsertAsked({ block, at }))
      },
      /** Sets a prop of the selected Block, as typing in the inspector does. */
      set: (prop: string, value: string) => {
        const selected = builder().selected
        return selected === null
          ? Promise.resolve()
          : build(BuilderMessage.Applied({ op: Composition.Op.setProp(selected, prop, value) }))
      },
      /** Selects the first Block of a kind, as clicking it in the layers does. */
      select: (block: string) => {
        const id = Object.entries(builder().page.present.nodes).find(
          ([, node]) => node.block === block,
        )?.[0]
        return id === undefined
          ? Promise.resolve()
          : build(BuilderMessage.Selected({ id: Composition.NodeId.make(id) }))
      },
      builder,
      outline: () => outline(builder().page.present),
      sent: () => sent.splice(0).join(', ') || 'nothing',
      status: () => PageEditor.status(model),
      state: () => {
        const state = PageEditor.state(model)
        return state === undefined ? '?' : Display.show(Cms.Display.State.of({}), state)
      },
      resumed: () => PageEditor.resumed(model),
      /** The page as this chair's own site reads it: what a preview is drawn through. */
      page: async (): Promise<string> => {
        const id = PageEditor.pageId(model)
        if (id === null) return 'no page'
        const projection = pageView(id)
        const held = projection.read(model)
        if (held._tag !== 'Ready' && held._tag !== 'Refreshing')
          model = await Effect.runPromise(
            Data.prefetch(model, projection).pipe(Effect.provide(client)),
          )
        const found = projection.read(model)
        return found._tag === 'Ready' || found._tag === 'Refreshing'
          ? read(found.value.document)
          : found._tag
      },
      /** The public site at an address: what a visitor is sent, drawn. */
      visit: async (slug: string): Promise<string> => {
        const found = await Effect.runPromise(
          served(
            handlers.FoldkitRemoteQuery({
              query: Cms.bySlug(Pages).name,
              input: { slug },
              window: { first: 1 },
            }),
          ),
        )
        const id = found.edges[0]?.id
        if (id === undefined) return '404'
        const answer = await Effect.runPromise(
          served(
            handlers.FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: [{ entity: 'Page', id, fields: ['document'] }],
            }),
          ),
        )
        const stored = answer.entities[0]?.values['document']
        return stored === undefined
          ? '404'
          : read(Schema.decodeUnknownSync(Composition.Document)(stored))
      },
    }
  }

  const wren = chair({ name: 'wren', role: 'author' })
  const edda = chair({ name: 'edda', role: 'editor' })
  const visitor = chair(null)

  say('— a writer builds a page —')
  await wren.send(Message.StartedPage({ entry: 'page-entry-1' }))
  await wren.title('Home')
  await wren.add('Section')
  await wren.add('Heading')
  await wren.set('text', 'Welcome')
  await wren.add('Button')
  say(`the page: ${wren.outline()}`)
  say(`every change is saved as a draft: ${wren.status()}; sent ${wren.sent()}`)
  say(`undo steps on hand: ${wren.builder().page.past.length}`)
  say(`a visitor at /home: ${await visitor.visit('home')}`)

  say('— a reload resumes the draft —')
  const again = chair({ name: 'wren', role: 'author' })
  await again.send(Message.OpenedEntry({ entry: 'page-entry-1' }))
  await again.look()
  say(`resumed from the ${again.resumed()}: ${again.outline()}`)
  say(`undo starts over after a reload: ${again.builder().page.past.length} steps`)

  say('— a preview, drawn by the site’s own views, sending nothing —')
  wren.sent()
  await wren.editor(Editor.Message.PreviewShown())
  say(`the writer's page: ${await wren.page()}`)
  await wren.editor(Editor.Message.PreviewHidden())
  say(`preview off: ${await wren.page()}; sent ${wren.sent()}`)

  say('— an editor publishes it —')
  await edda.send(Message.OpenedEntry({ entry: 'page-entry-1' }))
  await edda.look()
  await edda.editor(Editor.Message.PublishAsked())
  say(`editor: ${edda.status()}; sent ${edda.sent()}; state ${edda.state()}`)
  say(`a visitor at /home: ${await visitor.visit('home')}`)

  say('— a second revision, and going back to the first —')
  await edda.select('Heading')
  await edda.add('Heading')
  await edda.set('text', 'News')
  await edda.editor(Editor.Message.PublishAsked())
  say(`published again: ${await visitor.visit('home')}`)
  say(
    `revisions: ${backend
      .rows(`select n from cms_revisions order by n`)
      .map(row => String(row['n']))
      .join(', ')}`,
  )
  await edda.editor(Editor.Message.RestoreAsked({ revision: 1 }))
  await edda.look()
  say(`the first, restored as a draft: ${edda.outline()}; state ${edda.state()}`)
  say(`nothing was published by that: ${await visitor.visit('home')}`)
  await edda.editor(Editor.Message.DiscardAsked())
  await edda.look()
  say(`discarded: ${edda.outline()}; state ${edda.state()}`)

  say('— a change promised for the morning —')
  await edda.select('Heading')
  await edda.set('text', 'Good morning')
  await edda.editor(Editor.Message.ScheduleAsked({ at: '2026-03-02T08:00:00.000Z' }))
  say(`editor: ${edda.status()}; state ${edda.state()}`)
  say(`tonight a visitor reads: ${await visitor.visit('home')}`)
  now = new Date('2026-03-02T08:00:30.000Z')
  const due = await Effect.runPromise(
    backend.cms
      .due(now, { as: name => (name === 'edda' ? { name, role: 'editor' } : null) })
      .pipe(Effect.provide(backend.database)),
  )
  say(`the host asks what is due: ${JSON.stringify(due)}`)
  say(`in the morning a visitor reads: ${await visitor.visit('home')}`)

  say('— two people on one page —')
  await wren.send(Message.OpenedEntry({ entry: 'page-entry-1' }))
  await wren.look()
  await edda.send(Message.OpenedEntry({ entry: 'page-entry-1' }))
  await edda.look()
  await wren.select('Button')
  await wren.set('label', 'Read the news')
  await edda.select('Button')
  await edda.set('label', 'All posts')
  say(`writer: ${wren.status()}; editor: ${edda.status()}`)
  await edda.editor(Editor.Message.OverwriteAsked())
  await edda.look()
  say(`the editor saves over it: ${edda.status()}`)

  say(
    `and the row holds only what was published: ${JSON.stringify(
      backend.rows('select id, title, slug, published_at from pages'),
    )}`,
  )
  return lines
}
