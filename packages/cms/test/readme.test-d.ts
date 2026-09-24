// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
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
  // Optional: how a value would look in the store, for in-app preview.
  preview: (value, id) => [{ entity: 'Post', id, values: value }],
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
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle), // its Model and its Messages, in yours
)
const Model = Base.Model
const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, ...Object.values(Cms.Entities)],
  mutations: [...Cms.operations],
})

const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', { onOut: PostEditor.onOut }),
)
const Placed = Page.children.editor
export const update = PostEditor.after(
  Page.placements.update((model, message) =>
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

// ---- Kinds ----

const Scheduled = Entity.define(
  'Scheduled',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    goesLiveAt: Schema.String,
  }),
)
export const ScheduledForm = Form.make(
  'ScheduledForm',
  Entity.input(
    Scheduled,
    Schema.Struct({ title: Schema.String, slug: Schema.String, goesLiveAt: Schema.String }),
  ),
  {
    inputs: {
      slug: Cms.slug('title', { prefix: '/blog/' }), // follows the title until the author writes it
      goesLiveAt: Cms.dateTime(), // a datetime-local input, submitted as an ISO string
    },
  },
)
