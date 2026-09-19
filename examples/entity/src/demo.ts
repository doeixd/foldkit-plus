/**
 * One domain declaration read from both ends. `domain.ts` declares Entities,
 * Selections, and an operation's input with `foldkit-entity` alone. Here the
 * client registers the Entities with Remote, reads Selections as Projections,
 * and places a form built from the input; `server.ts` binds the same Entities to
 * SQLite tables. The demo joins the two in process and traces a read from plan
 * to decoded value, then an edit from keystroke to SQL row.
 */
import { Effect, Layer, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as FieldValidation from 'foldkit/fieldValidation'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, RemoteData } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { Entity } from 'foldkit-entity'
import { AuthorPage, Blog, PostPage } from './domain.js'
import { EditPostForm } from './editForm.js'
import { EditPostMutation } from './operations.js'
import { openServer } from './server.js'

// The form is a Submodel of the page: a Model field and a Message variant.
const EditSlot = Bundle.declare(EditPostForm.bundle, 'editPost')

const Model = Schema.Struct({ remote: Remote.Model, ...EditSlot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, ...EditSlot.cases })
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })

// The client's interpretation: Remote registers the Entities as they are. It
// never sees a table; relations arrive as refs and the store follows them.
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

const Page = Bundle.parent({ Model, Message })
const EditForm = Page.at(EditSlot, {
  // The form hands over a decoded `EditPostInput`. That it becomes a Remote
  // mutation is this page's decision; the form knows nothing of Remote.
  onOut: submitted => model => {
    const started = Data.mutate(model, EditPostMutation, submitted.value)
    return { model: started.model, commands: [started.command] }
  },
})
const placements = Page.assemble(EditForm)

const update = placements.update((model: Model, message: Message) =>
  Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
)

const PostSurface = App.surface('PostPage', {
  params: { postId: Schema.String },
  model: ({ params }) => ({ post: Data.get(PostPage, params.postId) }),
})

const AuthorSurface = App.surface('AuthorPage', {
  params: { authorId: Schema.String },
  model: ({ params }) => ({ author: Data.get(AuthorPage, params.authorId) }),
})

const describe = <Value>(data: RemoteData<Value>): string =>
  RemoteData.match(data, {
    Initial: () => 'Initial',
    Loading: () => 'Loading',
    Ready: value => `Ready ${JSON.stringify(value)}`,
    Refreshing: value => `Refreshing ${JSON.stringify(value)}`,
    Failed: error => `Failed ${error._tag}`,
    NotFound: () => 'NotFound',
  })

const describeForm = (model: Model): string =>
  EditPostForm.controls
    .filter(entry => entry.control._tag !== 'Hidden')
    .map(({ key, label }) =>
      FieldValidation.match(EditPostForm.field(model.editPost, key), {
        onNotValidated: value => `${label}=${JSON.stringify(value)}`,
        onValidating: value => `${label}=${JSON.stringify(value)}…`,
        onValid: value => `${label}=${JSON.stringify(value)} ok`,
        onInvalid: ({ value, errors }) =>
          `${label}=${JSON.stringify(value)} (${errors.join('; ')})`,
      }),
    )
    .join(', ')

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const backend = openServer()
  // In process: the server's handlers are the client's transport, and the
  // database is what those handlers need.
  const client = Remote.clientLayer(RemoteServer.handlers(backend.server, null)).pipe(
    Layer.provide(backend.layer),
  )
  const initial = placements.initial({ remote: Remote.initial }).model
  /** What the runtime does with a Message: update, run the Commands, feed their Messages back. */
  const dispatch = async (model: Model, message: Message): Promise<Model> => {
    const next = update(model, message)
    let current = next.model
    for (const command of next.commands ?? []) {
      const settled = await Effect.runPromise(command.effect.pipe(Effect.provide(client)))
      lines.push(`  command ${command.name}: ${settled._tag}`)
      current = await dispatch(current, settled)
    }
    return current
  }
  const form = (message: typeof EditPostForm.Message.Type) => (model: Model) =>
    dispatch(model, Message.GotEditPostMessage({ message }))

  try {
    // --- Reading ---
    const post = PostSurface.projection({ postId: 'p1' })
    const [plan] = Data.plan(initial, post)
    lines.push(`plan: ${plan?.entity}:${plan?.id} [${plan?.fields.join(',')}]`)
    lines.push(`plan follows: ${Object.keys(plan?.relations ?? {}).join(',')}`)
    lines.push(`before fetch: ${describe(post.read(initial).post)}`)

    const loaded = await Effect.runPromise(
      Data.prefetch(initial, post).pipe(Effect.provide(client)),
    )
    const read = post.read(loaded).post
    lines.push(`after fetch: ${describe(read)}`)
    // The value the client assembled satisfies the schema the domain declared.
    lines.push(
      `matches the domain's Selection: ${read._tag === 'Ready' && Schema.is(PostPage.schema)(read.value)}`,
    )

    // A second Surface walks the same graph from the other side. Ada's name came
    // in as the post's author, so only her posts are planned.
    const author = AuthorSurface.projection({ authorId: 'a1' })
    lines.push(
      `second plan: ${Data.plan(loaded, author)
        .map(entry => `${entry.entity}:${entry.id} [${entry.fields.join(',')}]`)
        .join(', ')}`,
    )
    const both = await Effect.runPromise(Data.prefetch(loaded, author).pipe(Effect.provide(client)))
    lines.push(`author: ${describe(author.read(both).author)}`)

    // --- Editing ---
    lines.push(
      `form controls: ${EditPostForm.controls
        .filter(entry => entry.control._tag !== 'Hidden')
        .map(entry => `${entry.label}:${entry.control._tag}${entry.required ? '*' : ''}`)
        .join(', ')}`,
    )
    // What to load is what the form writes: its fields, and each relation as a ref.
    const editing = Data.get(Entity.selectFor(EditPostForm.input), 'p2')
    const ready = await Effect.runPromise(Data.prefetch(both, editing).pipe(Effect.provide(client)))
    const current = editing.read(ready)
    if (current._tag !== 'Ready') throw new Error('the post to edit did not load')
    lines.push(`row before: ${JSON.stringify(backend.row('p2'))}`)

    // An edit form starts from what is there. The editor arrives as a ref, and
    // `valuesFor` reads it back as the id the form holds.
    let model = EditForm.helpers.fill(Entity.valuesFor(EditPostForm.input, current.value))(
      ready,
    ).model
    lines.push(`filled: ${describeForm(model)}`)

    // Clearing the title fails the input's own schema, so the submit goes nowhere.
    model = await form(EditPostForm.Message.Changed({ key: 'title', value: '' }))(model)
    model = await form(EditPostForm.Message.Submitted())(model)
    lines.push(`invalid submit: ${describeForm(model)}`)

    model = await form(EditPostForm.Message.Changed({ key: 'title', value: 'Compilers, revised' }))(
      model,
    )
    model = await form(EditPostForm.Message.Changed({ key: 'published', value: true }))(model)
    // No editor chosen: the empty draft submits `null`, which the input admits.
    model = await form(EditPostForm.Message.Changed({ key: 'editorId', value: '' }))(model)
    lines.push('valid submit:')
    model = await form(EditPostForm.Message.Submitted())(model)

    lines.push(`row after: ${JSON.stringify(backend.row('p2'))}`)
    // The mutation's patches reached the store, so every Projection over the post moved.
    lines.push(`edited: ${describe(editing.read(model))}`)
    lines.push(`author again: ${describe(author.read(model).author)}`)
  } finally {
    backend.close()
  }
  return lines
}
