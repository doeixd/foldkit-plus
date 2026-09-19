import { Effect, Layer, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, RemoteClient, requirementsOf } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { beforeEach, describe, expect, it } from 'vitest'
import { Admin } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String.check(Schema.isMinLength(1)) }),
)
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })

const EditPostInput = Schema.Struct({
  id: Schema.String,
  title: Blog.Post.fields.title.schema,
  authorId: Schema.String,
})
const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
const EditPostForm = Form.make(
  'EditPost',
  Entity.input(Blog.Post, EditPostInput, { authorId: Relation.input(Blog.Post.relations.author) }),
  { inputs: { id: Input.hidden() } },
)

const Editor = Admin.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })
const Slot = Bundle.declare(Editor.bundle, 'editor')

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedPost: { id: Schema.String },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})
const PostEditor = Editor.at({ data: Data, model: App.model.editor })

// A save is a Command that needs `RemoteClient`, so the parent names that service.
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
const placements = Page.assemble(Placed)

const update = PostEditor.after(
  placements.update((model: Model, message: Message) =>
    message._tag === 'OpenedPost'
      ? Placed.helpers.open(message.id)(model)
      : Remote.reduces(message)
        ? { model: Data.reduce(model, message) }
        : { model },
  ),
)

// The server's facts, and a switch to make a save fail.
const server: { posts: Record<string, Record<string, unknown>> } = {
  posts: { p1: { title: 'Hello', author: 'Author:a1' } },
}
let failing = false
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      entities: batch.requests.flatMap(request =>
        server.posts[request.id] === undefined
          ? []
          : [
              {
                entity: request.entity,
                id: request.id,
                values: { id: request.id, ...server.posts[request.id] },
              },
            ],
      ),
    })),
  query: () => Effect.die('no queries'),
  mutate: request =>
    failing
      ? Effect.fail({ _tag: 'TransportError', message: 'offline' } as never)
      : Effect.sync(() => {
          const input = request.input as typeof EditPostInput.Type
          server.posts[input.id] = { title: input.title, author: `Author:${input.authorId}` }
          return {
            output: { id: input.id },
            entities: [{ entity: 'Post', id: input.id, values: server.posts[input.id]! }],
          }
        }),
  live: () => Stream.empty,
})

/** What the runtime does: update, run the Commands, feed their Messages back. */
const dispatch = async (model: Model, message: Message): Promise<Model> => {
  const next = update(model, message)
  let current = next.model
  for (const command of next.commands ?? []) {
    const settled = await Effect.runPromise(command.effect.pipe(Effect.provide(Client)))
    current = await dispatch(current, settled as Message)
  }
  return current
}
const form = (model: Model, message: typeof EditPostForm.Message.Type) =>
  dispatch(model, Message.GotEditorMessage({ message }))

/** What Remote's read Subscription does for the active Surface. */
const load = async (model: Model): Promise<Model> => {
  const projection = PostEditor.active.projectionOf(model)
  if (projection === undefined) return model
  const loaded = await Effect.runPromise(
    Data.prefetch(model, projection).pipe(Effect.provide(Client)),
  )
  // Any Message after the value arrives lets `after` show it; Remote's own do in an application.
  return dispatch(
    loaded,
    Message.GotEditorMessage({ message: EditPostForm.Message.Blurred({ key: 'id' }) }),
  )
}

const initial = placements.initial({ remote: Remote.initial }).model
const drafts = (model: Model) =>
  Object.fromEntries(
    EditPostForm.controls.map(({ key }) => [key, EditPostForm.field(model.editor.form, key).value]),
  )

beforeEach(() => {
  failing = false
  server.posts = { p1: { title: 'Hello', author: 'Author:a1' } }
})

describe('Admin.editor', () => {
  it('starts closed, requiring and showing nothing', () => {
    expect(PostEditor.status(initial)).toBe('Closed')
    expect(PostEditor.active.projectionOf(initial)).toBeUndefined()
  })

  it('loads exactly what the form writes, and is Loading until it arrives', async () => {
    const opened = await dispatch(initial, Message.OpenedPost({ id: 'p1' }))
    const projection = PostEditor.active.projectionOf(opened)

    expect(PostEditor.status(opened)).toBe('Loading')
    expect(requirementsOf(projection!)).toEqual([
      { entity: 'Post', id: 'p1', fields: ['id', 'title', 'author'] },
    ])
    expect(Editor.selection.members).toEqual({ id: true, title: true, author: true })
  })

  it('fills the form once the value arrives, the relation as the id it holds', async () => {
    const ready = await load(await dispatch(initial, Message.OpenedPost({ id: 'p1' })))

    expect(PostEditor.status(ready)).toBe('Editing')
    expect(drafts(ready)).toEqual({ id: 'p1', title: 'Hello', authorId: 'a1' })
  })

  it('does not overwrite what the user typed when the value is read again', async () => {
    const ready = await load(await dispatch(initial, Message.OpenedPost({ id: 'p1' })))
    const typed = await form(ready, EditPostForm.Message.Changed({ key: 'title', value: 'Mine' }))
    server.posts.p1 = { title: 'Theirs', author: 'Author:a1' }

    expect(drafts(await load(typed)).title).toBe('Mine')
  })

  it('starts no mutation for an invalid submit', async () => {
    const ready = await load(await dispatch(initial, Message.OpenedPost({ id: 'p1' })))
    const cleared = await form(ready, EditPostForm.Message.Changed({ key: 'title', value: '' }))
    const submitted = update(
      cleared,
      Message.GotEditorMessage({ message: EditPostForm.Message.Submitted() }),
    )

    expect(submitted.commands ?? []).toEqual([])
    expect(PostEditor.status(submitted.model)).toBe('Editing')
  })

  it('turns a valid submit into the mutation: Saving, then Saved, then Editing again', async () => {
    const ready = await load(await dispatch(initial, Message.OpenedPost({ id: 'p1' })))
    const typed = await form(
      ready,
      EditPostForm.Message.Changed({ key: 'title', value: 'Revised' }),
    )
    const started = update(
      typed,
      Message.GotEditorMessage({ message: EditPostForm.Message.Submitted() }),
    )

    expect(PostEditor.status(started.model)).toBe('Saving')
    expect(started.commands).toHaveLength(1)

    const saved = await form(typed, EditPostForm.Message.Submitted())
    expect(PostEditor.status(saved)).toBe('Saved')
    expect(server.posts.p1).toEqual({ title: 'Revised', author: 'Author:a1' })

    const again = await form(
      saved,
      EditPostForm.Message.Changed({ key: 'title', value: 'Revised!' }),
    )
    expect(PostEditor.status(again)).toBe('Editing')
  })

  it('reports a failed save and keeps the drafts', async () => {
    const ready = await load(await dispatch(initial, Message.OpenedPost({ id: 'p1' })))
    const typed = await form(
      ready,
      EditPostForm.Message.Changed({ key: 'title', value: 'Revised' }),
    )
    failing = true
    const failed = await form(typed, EditPostForm.Message.Submitted())

    expect(PostEditor.status(failed)).toBe('SaveFailed')
    expect(PostEditor.saveError(failed)).toMatchObject({ message: 'offline' })
    expect(PostEditor.saveError(typed)).toBeUndefined()
    expect(drafts(failed).title).toBe('Revised')
    expect(server.posts.p1).toEqual({ title: 'Hello', author: 'Author:a1' })
  })

  it('says when the id it was opened on does not exist', async () => {
    const opened = await dispatch(initial, Message.OpenedPost({ id: 'nope' }))
    expect(PostEditor.status(opened)).toBe('Loading')
    // The server answers the read without it, which is how Remote learns it is not there.
    expect(PostEditor.status(await load(opened))).toBe('NotFound')
  })

  it('joins the Remote Subscriptions as an active Surface: a read entry follows the open id', () => {
    const entries = Data.subscriptions({ editor: PostEditor.active })
    const read = entries['editor.read']
    const opened = Placed.helpers.open('p1')(initial).model

    expect(Object.keys(entries)).toEqual(['editor.read', 'editor.live', 'retain'])
    expect(read.modelToDependencies(initial).requirements).toEqual([])
    expect(read.modelToDependencies(opened).requirements).toEqual([
      { entity: 'Post', id: 'p1', fields: ['id', 'title', 'author'] },
    ])
  })

  it('opens blank for a new one: nothing to load, editing at once', () => {
    const blank = Placed.helpers.blank()(initial).model

    expect(PostEditor.status(blank)).toBe('Editing')
    expect(PostEditor.active.projectionOf(blank)).toBeUndefined()
    expect(drafts(blank)).toEqual({ id: '', title: '', authorId: '' })
    expect(PostEditor.status(Placed.helpers.close()(blank).model)).toBe('Closed')
  })

  it('empties the form when another id is opened', async () => {
    const ready = await load(await dispatch(initial, Message.OpenedPost({ id: 'p1' })))
    const other = await dispatch(ready, Message.OpenedPost({ id: 'p9' }))

    expect(drafts(other)).toEqual({ id: '', title: '', authorId: '' })
    expect(PostEditor.status(other)).toBe('Loading')
  })
})
