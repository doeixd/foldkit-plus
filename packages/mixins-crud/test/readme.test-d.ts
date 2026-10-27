// The README's snippets, compiled. Keep the two in step.
import { Schema, Option } from 'effect'
import { Crud, Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Query, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import {
  ConfirmSlots,
  ConfirmView,
  DetailView,
  EditorSlots,
  EditorView,
  Empty,
  Failure,
  ListSlots,
  ListView,
  Loading,
  Toolbar,
} from '../src/index.js'
import { Confirm, Editor, List } from '../src/recipes.js'

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
const Posts = PostList.at({ data: Data, input: () => Option.some({}) })
const PostDetail = Crud.detail('PostDetail', { selection: PostRow })
const Shown = PostDetail.at({ data: Data, id: (model: Model) => Option.fromNullOr(model.shown) })

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

const StatusSlots = Slots.define({
  status: Slot.make({ capability: Capability.Container }),
})
type StatusSlots = SlotView.SlotBuilders<typeof StatusSlots, Message>

export const statuses = (slots: StatusSlots, h: HtmlBuilder<Message>): Html => {
  const loading = Loading.view(slots.status, h, 'Loading…')
  const empty = Empty.view(slots.status, h, 'Nothing yet.')
  const failure = Failure.view(slots.status, h, 'The pages could not be read.')
  const styled = Style.forSlots(StatusSlots)({ status: Loading.shown })
  void styled
  return h.div([], [loading, empty, failure])
}

// ---- An editor, a delete, and a toolbar ----
{
  type Message =
    | { readonly _tag: 'ClosedPost' }
    | { readonly _tag: 'Confirmed' }
    | { readonly _tag: 'Cancelled' }
  const h = SlotView.inertBuilder<Message>()
  const PostEditorView = EditorView.forMessages<Message>().define()
  const DeletePost = ConfirmView.forMessages<Message>().define()
  const PostTools = Toolbar.forMessages<Message>().define()
  PostEditorView(
    {
      id: 'post-editor',
      status: 'Editing',
      title: 'Edit post',
      form: h.form([], []),
      onClose: { _tag: 'ClosedPost' },
    },
    h,
  )
  DeletePost(
    {
      id: 'delete-post',
      status: 'Confirming',
      name: Option.some('Hello'),
      onConfirm: { _tag: 'Confirmed' },
      onCancel: { _tag: 'Cancelled' },
    },
    h,
  )
  PostTools({ search: h.input([]), actions: [h.button([], ['New post'])] }, h)
  DeletePost(
    {
      id: 'd',
      status: 'Confirming',
      // @ts-expect-error a delete names what it deletes as an Option, never a bare string
      name: 'Hello',
      onConfirm: { _tag: 'Confirmed' },
      onCancel: { _tag: 'Cancelled' },
    },
    h,
  )
}

// A look for each view: the recipes over the views' Slots, and one extended.
export const StyledTable = ListView.forMessages<Message>()
  .define(PostList)
  .pipe(Style.attach(Style.forSlots(ListSlots)(List({}))))
export const roomier = List.extend({ base: { cell: { padding: '1rem 0.5rem' } } })({})
export const editorLook = Style.forSlots(EditorSlots)(Editor({}))
export const confirmLook = Style.forSlots(ConfirmSlots)(Confirm({}))
// @ts-expect-error a List's open is 'row' or 'link'
List({ open: 'cell' })
