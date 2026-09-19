import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, type EntityRef } from '../src/index.js'
import { Blog } from './blogFixture.js'

const AuthorOption = Entity.select(Blog.Author, { id: true, name: true })
const CommentBody = Entity.select(Blog.Comment, { body: true, post: true })

const PostRow = Entity.select(Blog.Post, {
  title: true,
  commentCount: true,
  author: AuthorOption,
  editor: AuthorOption,
  comments: CommentBody,
})

expectTypeOf<typeof PostRow.schema.Type>().toEqualTypeOf<{
  readonly title: string
  readonly commentCount: number
  readonly author: { readonly id: string; readonly name: string }
  readonly editor: { readonly id: string; readonly name: string } | null
  readonly comments: ReadonlyArray<{ readonly body: string; readonly post: EntityRef<'Post'> }>
}>()

const PostRefs = Entity.select(Blog.Post, { author: true, editor: true, comments: true })
expectTypeOf<typeof PostRefs.schema.Type>().toEqualTypeOf<{
  readonly author: EntityRef<'Author'>
  readonly editor: EntityRef<'Author'> | null
  readonly comments: ReadonlyArray<EntityRef<'Comment'>>
}>()

// Through a cycle: an Author's posts, each with its author again.
const AuthorPage = Entity.select(Blog.Author, {
  name: true,
  posts: Entity.select(Blog.Post, { title: true, author: AuthorOption }),
})
expectTypeOf<
  (typeof AuthorPage.schema.Type)['posts'][number]['author']['name']
>().toEqualTypeOf<string>()

expectTypeOf(PostRow.members.author).toEqualTypeOf<typeof AuthorOption>()
expectTypeOf(PostRow.entity.name).toEqualTypeOf<'Post'>()

// @ts-expect-error "subtitle" is not a member of Post
Entity.select(Blog.Post, { subtitle: true })
// @ts-expect-error a field takes true, not a nested Selection
Entity.select(Blog.Post, { title: AuthorOption })
// @ts-expect-error a derived member takes true, not a nested Selection
Entity.select(Blog.Post, { commentCount: AuthorOption })
// @ts-expect-error comments are Comments, not Authors
Entity.select(Blog.Post, { comments: AuthorOption })
// @ts-expect-error the Selection is given once; `many` already makes it an array
Entity.select(Blog.Post, { comments: [CommentBody] })
// @ts-expect-error a member is selected with true, not false
Entity.select(Blog.Post, { title: false })

expectTypeOf(Schema.decodeUnknownSync(AuthorOption.schema)).returns.toEqualTypeOf<{
  readonly id: string
  readonly name: string
}>()

{
  const Body = Entity.select(Blog.Comment, { body: true })
  const Paged = Entity.select(Blog.Post, { comments: Entity.page(Body, { first: 2 }) })
  expectTypeOf<typeof Paged.schema.Type>().toEqualTypeOf<{
    readonly comments: {
      readonly items: ReadonlyArray<{ readonly body: string }>
      readonly hasNext: boolean
      readonly hasPrevious: boolean
    }
  }>()

  const Name = Entity.select(Blog.Author, { name: true })
  // @ts-expect-error a one relation has no pages
  Entity.select(Blog.Post, { author: Entity.page(Name, { first: 1 }) })
  // @ts-expect-error a page of another Entity than the relation's target
  Entity.select(Blog.Post, { comments: Entity.page(Name, { first: 1 }) })
}
