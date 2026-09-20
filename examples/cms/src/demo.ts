/**
 * A post's life, from its first keystroke to being taken off show, told from
 * three chairs: a writer who may not publish, an editor who may, and a visitor
 * who is nobody. One server, in process; each chair has its own Model. The clock
 * is the script's, so the schedule comes due when the story says.
 */
import { Effect, Layer, Stream } from 'effect'
import { Cms } from 'foldkit-cms'
import { Display } from 'foldkit-crud'
import { REMOTE_PROTOCOL_VERSION, RemoteClient, RemotePolicy } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import {
  Data,
  Editor,
  Message,
  PostEditor,
  Worklist,
  actives,
  initial,
  postPage,
  update,
  type Model,
} from './app.js'
import { PostForm, Posts } from './domain.js'
import { openServer, type Principal } from './server.js'

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const say = (line: string) => lines.push(line)

  let now = new Date('2026-03-01T09:00:00.000Z')
  const backend = openServer(() => now)

  /** One chair: a principal, a Remote client that asks as them, and a Model of their own. */
  const chair = (principal: Principal) => {
    const handlers = RemoteServer.handlers(backend.server, principal)
    const served = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(backend.database)) as never
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

    /** What the runtime does: update, run the Commands, feed their Messages back. */
    const send = async (message: Message): Promise<void> => {
      const next = update(model, message)
      model = next.model
      for (const command of next.commands ?? []) {
        const settled = await Effect.runPromise(
          (command.effect as Effect.Effect<Message, never, RemoteClient>).pipe(
            Effect.provide(client),
          ),
        )
        await send(settled)
      }
    }
    /** What Remote's read Subscriptions do for what is on screen. */
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
    const editor = (message: typeof PostForm.Message.Type | typeof Editor.Message.Type) =>
      send(Message.GotEditorMessage({ message }))

    return {
      send,
      look,
      editor,
      type: (key: 'title' | 'slug' | 'body', value: string) =>
        editor(PostForm.Message.Changed({ key, value })),
      /** What was sent since this was last asked. */
      sent: () => sent.splice(0).join(', ') || 'nothing',
      status: () => PostEditor.status(model),
      state: () => {
        const state = PostEditor.state(model)
        return state === undefined ? '?' : Display.show(Cms.Display.State.of({}), state)
      },
      why: () => PostEditor.error(model)?.message.replace(/^.*?: /, '') ?? 'no error',
      field: (key: 'title' | 'slug' | 'body') => PostForm.field(model.editor.form, key).value,
      resumed: () => PostEditor.resumed(model),
      worklist: () => {
        const page = Worklist.page(model)
        return page._tag === 'Ready' || page._tag === 'Refreshing'
          ? page.value.items
              .map(row => `${row.label} (${Display.show(Cms.Display.State.of({}), row.state)})`)
              .join(', ') || 'empty'
          : page._tag
      },
      /** A post as this chair's own pages read it. */
      page: async (id: string): Promise<string> => {
        const projection = postPage(id)
        const held = projection.read(model)
        if (held._tag !== 'Ready' && held._tag !== 'Refreshing')
          model = await Effect.runPromise(
            Data.prefetch(model, projection).pipe(Effect.provide(client)),
          )
        const read = projection.read(model)
        return read._tag === 'Ready' || read._tag === 'Refreshing'
          ? `"${read.value.title}" at /blog/${read.value.slug}: ${read.value.body}`
          : read._tag
      },
      /** The site's page for an address: what `bySlug` finds, read as a page. */
      visit: async (slug: string): Promise<string> => {
        const found = await Effect.runPromise(
          served(
            handlers.FoldkitRemoteQuery({
              query: Cms.bySlug(Posts).name,
              input: { slug },
              window: { first: 1 },
            }),
          ) as Effect.Effect<{ readonly edges: ReadonlyArray<{ readonly id: string }> }>,
        )
        const id = found.edges[0]?.id
        if (id === undefined) return '404'
        const read = (await Effect.runPromise(
          served(
            handlers.FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: [{ entity: 'Post', id, fields: ['title', 'body'] }],
            } as never),
          ),
        )) as { readonly entities: ReadonlyArray<{ readonly values: Record<string, unknown> }> }
        const values = read.entities[0]?.values
        return values === undefined ? '404' : `"${values['title']}": ${values['body']}`
      },
    }
  }

  const wren = chair({ name: 'wren', role: 'author' })
  const edda = chair({ name: 'edda', role: 'editor' })
  const visitor = chair(null)

  say('— a writer starts a post —')
  await wren.send(Message.StartedPost({ entry: 'entry-1' }))
  await wren.type('body', 'A first post.')
  say(
    `no title yet, so it could not be published, and it is saved: ${wren.status()}; sent ${wren.sent()}`,
  )
  await wren.type('title', 'Hello, World!')
  say(`the address follows the title: ${wren.field('slug')}`)
  await wren.look()
  say(`worklist: ${wren.worklist()}`)
  say(`a visitor at /blog/hello-world: ${await visitor.visit('hello-world')}`)
  await visitor.look()
  say(`a visitor's worklist: ${visitor.worklist()}`)

  say('— a preview, in the application’s own page, sending nothing —')
  wren.sent()
  await wren.editor(Editor.Message.PreviewShown())
  say(`the writer's page: ${await wren.page('entry-1')}`)
  await wren.editor(Editor.Message.PreviewHidden())
  say(`preview off: ${await wren.page('entry-1')}; sent ${wren.sent()}`)

  say('— the writer may not publish; the editor may —')
  await wren.editor(Editor.Message.PublishAsked())
  say(`writer: ${wren.status()} (${wren.why()})`)
  await edda.send(Message.OpenedEntry({ entry: 'entry-1' }))
  await edda.look()
  say(`editor opens it: resumed from the ${edda.resumed()}; body "${edda.field('body')}"`)
  await edda.editor(Editor.Message.PublishAsked())
  say(`editor: ${edda.status()}; sent ${edda.sent()}; state ${edda.state()}`)
  say(`a visitor at /blog/hello-world: ${await visitor.visit('hello-world')}`)

  say('— a change, promised for tomorrow morning —')
  await edda.type('body', 'A first post, revised.')
  say(`state ${edda.state()}; a visitor still reads: ${await visitor.visit('hello-world')}`)
  await edda.editor(Editor.Message.ScheduleAsked({ at: '2026-03-02T08:00:00.000Z' }))
  say(`editor: ${edda.status()}; state ${edda.state()}`)
  const due = (at: string) =>
    Effect.runPromise(
      backend.cms
        .due(new Date(at), { as: name => (name === 'edda' ? { name, role: 'editor' } : null) })
        .pipe(Effect.provide(backend.database)),
    )
  say(
    `the host asks what is due that evening: ${JSON.stringify(await due('2026-03-01T20:00:00.000Z'))}`,
  )
  now = new Date('2026-03-02T08:00:30.000Z')
  say(`and the next morning: ${JSON.stringify(await due(now.toISOString()))}`)
  say(`a visitor reads: ${await visitor.visit('hello-world')}`)

  say('— two people on one entry —')
  await wren.send(Message.OpenedEntry({ entry: 'entry-1' }))
  await wren.look()
  await edda.send(Message.OpenedEntry({ entry: 'entry-1' }))
  await edda.look()
  await wren.type('body', 'Wren was here.')
  await edda.type('body', 'Edda was here.')
  say(
    `writer: ${wren.status()}; editor: ${edda.status()}, with "${edda.field('body')}" still in the form`,
  )
  await edda.editor(Editor.Message.OverwriteAsked())
  await edda.look()
  say(`the editor saves over it: ${edda.status()}`)
  await edda.editor(Editor.Message.PublishAsked())

  say('— going back —')
  say(
    `revisions: ${backend
      .rows(`select n, json_extract("values", '$.body') as body from cms_revisions order by n`)
      .map(row => `${row['n']} "${row['body']}"`)
      .join(', ')}`,
  )
  await edda.editor(Editor.Message.RestoreAsked({ revision: 1 }))
  await edda.look()
  say(`restored as a draft: "${edda.field('body')}"; state ${edda.state()}`)
  say(`nothing was published by that: ${await visitor.visit('hello-world')}`)
  await edda.editor(Editor.Message.DiscardAsked())
  await edda.look()
  say(`discarded: "${edda.field('body')}"; state ${edda.state()}`)

  say('— off show —')
  await edda.editor(Editor.Message.UnpublishAsked())
  say(
    `state ${edda.state()}; a visitor at /blog/hello-world: ${await visitor.visit('hello-world')}`,
  )
  await edda.look()
  say(`the editor's worklist still has it: ${edda.worklist()}`)
  say(
    `and the row was never a draft's to spoil: ${JSON.stringify(backend.rows('select id, title, slug, published_at from posts'))}`,
  )

  return lines
}
