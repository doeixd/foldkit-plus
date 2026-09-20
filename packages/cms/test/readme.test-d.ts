// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Cms, type EditorStatus, type State } from '../src/index.js'

const PostId = Schema.String.pipe(Schema.brand('PostId'))
const Blog = {
  Post: Entity.define(
    'Post',
    Schema.Struct({
      id: PostId,
      title: Schema.String,
      slug: Schema.String,
      publishedAt: Schema.NullOr(Schema.String),
    }),
  ),
}
const PostInput = Schema.Struct({ title: Schema.String, slug: Schema.String })
const CreatePostMutation = Mutation.make('CreatePost', { Input: PostInput, Output: { id: PostId } })
const UpdatePostMutation = Mutation.make('UpdatePost', {
  Input: { ...PostInput.fields, id: PostId },
  Output: {},
})

// Which members play a CMS part is a fact about the Entity: metadata, by a pipe step.
const Post = Blog.Post.pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput))

// How a type of content is authored is a fact about the application.
const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm, // an ordinary form: Form.make('PostForm', Entity.input(Post, PostInput))
  publish: { create: CreatePostMutation, update: UpdatePostMutation },
  words: { one: 'Post', many: 'Posts' },
})

expectTypeOf(Cms.rolesOf(Post).slug).toEqualTypeOf<(typeof Posts)['roles']['slug']>()

declare const scheduledFor: string
declare const now: Date
expectTypeOf(
  Cms.state(
    { archivedAt: null, row: 'visible', draft: { scheduledFor, scheduleError: null } },
    now,
  ),
).toEqualTypeOf<State>()
expectTypeOf(
  Cms.offers({ archivedAt: null, row: 'none', draft: null }, now, Posts)[0],
).toEqualTypeOf<
  | 'save'
  | 'discard'
  | 'publish'
  | 'schedule'
  | 'unschedule'
  | 'unpublish'
  | 'archive'
  | 'unarchive'
  | 'restore'
  | undefined
>()

// ---- The editor ----

const Editor = Cms.editor('PostEditor', { content: Posts })
const Slot = Bundle.declare(Editor.bundle, 'editor') // its Model and its Messages, in yours

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, ...Object.values(Cms.Entities)],
  mutations: [...Cms.operations],
})
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()

const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
export const update = PostEditor.after(
  Page.assemble(Placed).update((model: typeof Model.Type, message: typeof Message.Type) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

export const subscriptions = Data.subscriptions({ ...PostEditor.actives })

declare const model: typeof Model.Type
Placed.helpers.open('an entry id')
Placed.helpers.create(Cms.newEntryId())
Editor.Message.PublishAsked()
expectTypeOf(PostEditor.status(model)).toEqualTypeOf<EditorStatus>()
expectTypeOf(PostEditor.state(model)).toEqualTypeOf<State | undefined>()
// The editor's form is the content type's own, typed.
expectTypeOf(model.editor.form.fields.title.value).toEqualTypeOf<string>()
