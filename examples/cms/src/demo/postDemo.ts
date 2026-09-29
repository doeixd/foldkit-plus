/**
 * A post's life, from its first keystroke to being taken off show, told from
 * three chairs: a writer who may not publish, an editor who may, and a visitor
 * who is nobody. One server, in process; each chair has its own Model. The clock
 * is the script's, so the schedule comes due when the story says.
 */
import { Effect, Option } from 'effect'
import { Cms } from 'foldkit-cms'
import { Display } from 'foldkit-crud'
import { RemotePolicy } from 'foldkit-remote'
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
} from '../apps/app.js'
import { PostForm, Posts } from '../content/domain.js'
import type { Principal } from '../server/server.js'
import { chairHarness, openBackend, visitBySlug } from './harness.js'

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const say = (line: string) => lines.push(line)

  const { backend, setNow } = openBackend()

  /** One chair: a principal, a Remote client that asks as them, and a Model of their own. */
  const chair = (principal: Principal) => {
    const harness = chairHarness({
      backend,
      principal,
      initial,
      update,
      ticked: Message.Ticked(),
      actives,
      prefetch: (model, projection) =>
        Data.prefetch(model, projection, { policy: RemotePolicy.networkOnly }),
      runCommand: (effect, client) => Effect.runPromise(effect.pipe(Effect.provide(client))),
    })
    const { send, look, sent } = harness
    const editor = (message: typeof PostForm.Message.Type | typeof Editor.Message.Type) =>
      send(Message.GotEditorMessage({ message }))

    return {
      send,
      look,
      editor,
      type: (key: 'title' | 'slug' | 'body', value: string) =>
        editor(PostForm.Message.Changed({ key, value })),
      /** What was sent since this was last asked. */
      sent,
      status: () => PostEditor.status(harness.model()),
      state: () => {
        return Option.match(PostEditor.state(harness.model()), {
          onNone: () => '?',
          onSome: state => Display.show(Cms.Display.State.of({}), state),
        })
      },
      why: () =>
        Option.match(PostEditor.error(harness.model()), {
          onNone: () => 'no error',
          onSome: ({ message }) => message.replace(/^.*?: /, ''),
        }),
      field: (key: 'title' | 'slug' | 'body') =>
        PostForm.field(harness.model().editor.form, key).value,
      resumed: () => Option.getOrElse(PostEditor.resumed(harness.model()), () => 'not opened'),
      worklist: () => {
        const page = Worklist.page(harness.model())
        return page._tag === 'Ready' || page._tag === 'Refreshing'
          ? page.value.items
              .map(row => `${row.label} (${Display.show(Cms.Display.State.of({}), row.state)})`)
              .join(', ') || 'empty'
          : page._tag
      },
      /** A post as this chair's own pages read it. */
      page: async (id: string): Promise<string> => {
        const projection = postPage(id)
        const held = projection.read(harness.model())
        if (held._tag !== 'Ready' && held._tag !== 'Refreshing')
          harness.setModel(
            await Effect.runPromise(
              Data.prefetch(harness.model(), projection).pipe(Effect.provide(harness.client)),
            ),
          )
        const read = projection.read(harness.model())
        return read._tag === 'Ready' || read._tag === 'Refreshing'
          ? `"${read.value.title}" at /blog/${read.value.slug}: ${read.value.body}`
          : read._tag
      },
      /** The site's page for an address: what `bySlug` finds, read as a page. */
      visit: (slug: string) =>
        visitBySlug({
          chair: harness,
          query: Cms.bySlug(Posts),
          entity: 'Post',
          fields: ['title', 'body'],
          render: values => `"${values['title']}": ${values['body']}`,
          slug,
        }),
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
  const morning = new Date('2026-03-02T08:00:30.000Z')
  setNow(morning)
  say(`and the next morning: ${JSON.stringify(await due(morning.toISOString()))}`)
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
