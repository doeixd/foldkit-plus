/**
 * One domain declaration read from both ends. `domain.ts` declares Entities,
 * Selections, and an operation's input with `foldkit-entity` alone; `app.ts` is
 * the client over them; `server.ts` binds the same Entities to SQLite tables.
 * This joins the two in process and traces a read from plan to decoded value,
 * then a managed edit from a list row to the SQL row.
 */
import { Effect, Layer, Schema } from 'effect'
import * as FieldValidation from 'foldkit/fieldValidation'
import { Remote, RemoteData } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import {
  AuthorSurface,
  Authors,
  Data,
  EditForm,
  Message,
  PostEditor,
  PostRemover,
  PostSurface,
  Posts,
  RemoverMessage,
  initial as initialModel,
  pickers,
  update,
  type Model,
} from './app.js'
import { PostId, PostPage } from './domain.js'
import { EditPostForm } from './editForm.js'
import { openServer } from './server.js'

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
  const initial = initialModel()
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
    // --- Managing ---
    const describeList = (root: Model): string => {
      const page = Posts.page(root)
      return page._tag === 'Ready'
        ? page.value.items
            .map(row => `${row.id} "${row.title}"${row.published ? '' : ' (draft)'}`)
            .join(', ')
        : page._tag
    }
    let listed = both
    for (const list of [Posts, Authors]) {
      listed = await Effect.runPromise(
        Data.prefetch(listed, list.active.projectionOf(listed)!).pipe(Effect.provide(client)),
      )
    }
    lines.push(`post list: ${describeList(listed)}`)
    const row = Posts.page(listed)
    const draft = row._tag === 'Ready' ? row.value.items.find(post => !post.published) : undefined
    if (draft === undefined) throw new Error('the list has no draft to open')

    lines.push(`row before: ${JSON.stringify(backend.row(draft.id))}`)
    // Opening a row makes what the form writes a requirement, as a Surface's is.
    let model = EditForm.helpers.open(draft.id)(listed).model
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
    const choices = pickers(model).editorId ?? []
    lines.push(
      `editor choices: ${choices.map(choice => `${choice.value} ${choice.label}`).join(', ')}`,
    )

    // Clearing the title fails the input's own schema, so the submit goes nowhere.
    model = await form(EditPostForm.Message.Changed({ key: 'title', value: '' }))(model)
    model = await form(EditPostForm.Message.Submitted())(model)
    lines.push(`invalid submit: ${describeForm(model)}; status ${PostEditor.status(model)}`)

    model = await form(EditPostForm.Message.Changed({ key: 'title', value: 'Compilers, revised' }))(
      model,
    )
    model = await form(EditPostForm.Message.Changed({ key: 'published', value: true }))(model)
    // Picked from the author list's rows, as a drawn picker would offer them.
    model = await form(
      EditPostForm.Message.Changed({ key: 'editorId', value: choices[0]?.value ?? '' }),
    )(model)
    lines.push('valid submit:')
    model = await form(EditPostForm.Message.Submitted())(model)

    lines.push(`status: ${PostEditor.status(model)}`)
    lines.push(`row after: ${JSON.stringify(backend.row('p2'))}`)
    // The mutation's patches reached the store, so every Projection over the post moved.
    lines.push(`edited: ${describe(editing.read(model) as RemoteData<unknown>)}`)
    lines.push(`author again: ${describe(author.read(model).author)}`)
    // The list too: its row is the same normalized post.
    lines.push(`post list again: ${describeList(model)}`)

    // --- Deleting ---
    const remover = (message: typeof RemoverMessage.Type) => (root: Model) =>
      dispatch(root, Message.GotRemovePostMessage({ message }))
    model = await dispatch(model, Message.AskedToDeletePost({ id: PostId.make('p1') }))
    lines.push(
      `asked to delete p1: ${PostRemover.status(model)}; rows ${backend.count('posts')} posts, ${backend.count('comments')} comments`,
    )
    model = await remover(RemoverMessage.Confirmed())(model)
    lines.push(
      `confirmed: ${PostRemover.status(model)}; rows ${backend.count('posts')} posts, ${backend.count('comments')} comments`,
    )
    // The server said what is gone and named no list; every list dropped it.
    lines.push(`post list after delete: ${describeList(model)}`)
    lines.push(`author after delete: ${describe(author.read(model).author)}`)
  } finally {
    backend.close()
  }
  return lines
}
