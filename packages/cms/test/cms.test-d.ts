import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { Cms } from '../src/index.js'

const PostId = Schema.String.pipe(Schema.brand('PostId'))
const BasePost = Entity.define(
  'Post',
  Schema.Struct({
    id: PostId,
    title: Schema.String,
    views: Schema.Number,
    publishedAt: Schema.NullOr(Schema.String),
  }),
)

// A role names a member that can play it.
const Post = BasePost.pipe(Cms.roles({ label: 'title', published: 'publishedAt' }))
expectTypeOf(Post).toEqualTypeOf<typeof BasePost>()
// @ts-expect-error a number is not an address
BasePost.pipe(Cms.roles({ slug: 'views' }))
// @ts-expect-error a title admits no null, so it cannot say a row is unpublished
BasePost.pipe(Cms.roles({ published: 'title' }))
// @ts-expect-error "slugg" is not a member
BasePost.pipe(Cms.roles({ slug: 'slugg' }))

const PostInput = Schema.Struct({ title: Schema.String })
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput))
const words = { one: 'Post', many: 'Posts' }

const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm,
  publish: {
    create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: PostId } }),
    update: Mutation.make('UpdatePost', { Input: { ...PostInput.fields, id: PostId }, Output: {} }),
  },
  words,
})
expectTypeOf(Posts.name).toEqualTypeOf<'posts'>()

Cms.content('posts', {
  entity: Post,
  form: PostForm,
  publish: {
    // @ts-expect-error the form's value is `{ title }`, not `{ headline }`
    create: Mutation.make('Create', { Input: { headline: Schema.String }, Output: { id: PostId } }),
    update: Mutation.make('UpdatePost', { Input: { ...PostInput.fields, id: PostId }, Output: {} }),
  },
  words,
})
