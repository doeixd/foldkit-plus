// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Crud, Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Query, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import { DetailView, ListView } from '../src/index.js'

const PostSort = Schema.Literals(['oldest', 'title'])
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, published: Schema.Boolean }),
).pipe(Entity.annotateMembers({ id: Display.of(Display.hidden()) }))
const PostRow = Entity.select(Post, { id: true, title: true, published: true })

const PostsQuery = Query.make('Posts', { Input: {}, Result: Query.connection(Post) })
const Model = Schema.Struct({
  remote: Remote.Model,
  postSort: PostSort,
  shown: Schema.NullOr(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  OpenedPost: { id: Schema.String },
  RequestedMorePosts: {},
  SortedPosts: { sort: PostSort },
})
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Post], queries: [PostsQuery] })

const PostList = Crud.list('Posts', { query: PostsQuery, selection: PostRow })
const Posts = PostList.at({ data: Data, input: () => ({}) })
const PostDetail = Crud.detail('PostDetail', { selection: PostRow })
const Shown = PostDetail.at({ data: Data, id: (model: Model) => model.shown ?? undefined })

const PostTable = ListView.forMessages<Message>().define(PostList)

export const table = (model: Model, h: HtmlBuilder<Message>): Html =>
  PostTable(
    {
      page: Posts.page(model), // Posts = PostList.at({ data, input })
      onOpen: row => Message.OpenedPost({ id: row.id }),
    },
    h,
  )

export const full = (model: Model, h: HtmlBuilder<Message>): Html =>
  PostTable(
    {
      page: Posts.page(model),
      onOpen: row => {
        // The row is the list's Selection's value, hidden columns included.
        expectTypeOf(row).toEqualTypeOf<typeof PostRow.schema.Type>()
        return Message.OpenedPost({ id: row.id })
      },
      onMore: Message.RequestedMorePosts(), // shown while the page has a next one
      sort: {
        title: {
          direction: model.postSort === 'title' ? 'asc' : undefined,
          message: Message.SortedPosts({ sort: 'title' }),
        },
      },
      cells: {
        published: (row, h) => h.span([h.Class(row.published ? 'live' : 'draft')], ['●']),
      },
      words: { yes: 'Live', no: 'Draft', empty: 'No posts yet.', more: 'Load more' },
    },
    h,
  )

const PostLines = DetailView.forMessages<Message>().define(PostDetail)
export const lines = (model: Model, h: HtmlBuilder<Message>): Html =>
  PostLines({ value: Shown.value(model) }, h) // Shown = PostDetail.at({ data, id })

export const wrong = (model: Model, h: HtmlBuilder<Message>): Html =>
  PostTable(
    {
      page: Posts.page(model),
      // @ts-expect-error "slug" is not a column of the list
      sort: { slug: { message: Message.RequestedMorePosts() } },
    },
    h,
  )
