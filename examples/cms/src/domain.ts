/**
 * The domain, declared once and read from both ends. Nothing here is a CMS
 * until the last two declarations: a Post is an Entity, editing it is a form,
 * and publishing it is two mutations of the application's own.
 */
import { Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'

export const PostId = Schema.String.pipe(Schema.brand('PostId'))
export type PostId = typeof PostId.Type

export const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: PostId,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    slug: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Address' }),
    body: Schema.String.annotate({ title: 'Body' }),
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(
  // Which members play a CMS part is a fact about the Entity.
  Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }),
)

/** What an author enters, which is what publishing takes. */
export const PostInput = Schema.Struct({
  title: Post.fields.title.schema,
  slug: Post.fields.slug.schema,
  body: Post.fields.body.schema,
})

export const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  // The address follows the title until the author writes it themselves.
  inputs: { slug: Cms.slug('title', { prefix: '/blog/' }) },
  debounce: 0,
}).pipe(
  // And says while it is typed what a publish would refuse. The post keeps its
  // own address because `Cms.editor` tells the form which row it is editing.
  // Asking needs `RemoteClient`; the step adds that to what the form needs.
  Form.checks({ slug: Cms.addressFree('posts') }),
)

export const CreatePost = Mutation.make('CreatePost', {
  Input: PostInput,
  Output: { id: PostId },
})
export const UpdatePost = Mutation.make('UpdatePost', {
  Input: { ...PostInput.fields, id: PostId },
  Output: {},
})

/** How posts are authored: a fact about the application. */
export const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm,
  publish: { create: CreatePost, update: UpdatePost },
  words: { one: 'Post', many: 'Posts' },
  // How a value would look in the store: what an optimistic publish would show.
  preview: (value, id) => [{ entity: 'Post', id, values: value }],
})

/** The public page's reading of a post, and the worklist's reading of an entry. */
export const PostPage = Entity.select(Post, { title: true, slug: true, body: true })
export const EntryRow = Entity.select(Cms.Entities.Entry, { id: true, label: true, state: true })
