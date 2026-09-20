// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { Cms, type State } from '../src/index.js'

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
