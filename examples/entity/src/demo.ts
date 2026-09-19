/**
 * One domain declaration read from both ends. `domain.ts` declares Entities,
 * Selections, and an operation's input with `foldkit-entity` alone. Here the
 * client registers the Entities with Remote, reads Selections as Projections,
 * and places a form built from the input; `server.ts` binds the same Entities to
 * SQLite tables. The demo joins the two in process and traces a read from plan
 * to decoded value, then an edit from keystroke to SQL row.
 */
import { Effect, Layer, Schema } from 'effect'
import { Admin } from 'foldkit-admin'
import { Bundle } from 'foldkit-bundle'
import * as FieldValidation from 'foldkit/fieldValidation'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, RemoteData, type RemoteClient } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { AuthorPage, Blog, PostPage } from './domain.js'
import { EditPostForm } from './editForm.js'
import { EditPostMutation } from './operations.js'
import { openServer } from './server.js'

// The form and the mutation its value feeds, joined. The editor is a Submodel of
// the page: a Model field and a Message variant.
const Editor = Admin.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })
const EditSlot = Bundle.declare(Editor.bundle, 'editPost')

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

// Where the editor lives: its slice of the Model, and the domain it saves through.
const PostEditor = Editor.at({ data: Data, model: App.model.editPost })

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
// The form knows nothing of Remote. The editor's `onOut` is what turns a decoded
// `EditPostInput` into the mutation.
const EditForm = Page.at(EditSlot, { onOut: PostEditor.onOut })
const placements = Page.assemble(EditForm)

// `after` lets the editor show the loaded value whichever Message brings it.
const update = PostEditor.after(
  placements.update((model: Model, message: Message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
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
      FieldValidation.match(EditPostForm.field(model.editPost.form, key), {
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
    lines.push(`row before: ${JSON.stringify(backend.row('p2'))}`)
    // Opening an id makes what the form writes a requirement, as a Surface's is.
    let model = EditForm.helpers.open('p2')(both).model
    const editing = PostEditor.active.projectionOf(model)!
    lines.push(
      `editor plan: ${Data.plan(model, editing)
        .map(entry => `${entry.entity}:${entry.id} [${entry.fields.join(',')}]`)
        .join(', ')}; status ${PostEditor.status(model)}`,
    )
    // In an application Remote's read Subscription fetches it and its Messages
    // pass through `update`, where `after` runs this same `sync`.
    const fetched = await Effect.runPromise(
      Data.prefetch(model, editing).pipe(Effect.provide(client)),
    )
    model = PostEditor.sync(fetched).model
    // Nothing here says what to load or how to fill: both follow from the form's input.
    lines.push(`filled: ${describeForm(model)}; status ${PostEditor.status(model)}`)

    // Clearing the title fails the input's own schema, so the submit goes nowhere.
    model = await form(EditPostForm.Message.Changed({ key: 'title', value: '' }))(model)
    model = await form(EditPostForm.Message.Submitted())(model)
    lines.push(`invalid submit: ${describeForm(model)}; status ${PostEditor.status(model)}`)

    model = await form(EditPostForm.Message.Changed({ key: 'title', value: 'Compilers, revised' }))(
      model,
    )
    model = await form(EditPostForm.Message.Changed({ key: 'published', value: true }))(model)
    // No editor chosen: the empty draft submits `null`, which the input admits.
    model = await form(EditPostForm.Message.Changed({ key: 'editorId', value: '' }))(model)
    lines.push('valid submit:')
    model = await form(EditPostForm.Message.Submitted())(model)

    lines.push(`status: ${PostEditor.status(model)}`)
    lines.push(`row after: ${JSON.stringify(backend.row('p2'))}`)
    // The mutation's patches reached the store, so every Projection over the post moved.
    lines.push(`edited: ${describe(editing.read(model) as RemoteData<unknown>)}`)
    lines.push(`author again: ${describe(author.read(model).author)}`)
  } finally {
    backend.close()
  }
  return lines
}
