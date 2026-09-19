/**
 * The client application: Remote over the domain's Entities, two lists, an
 * editor, and the page that holds them. Nothing here knows a table or a column;
 * that is `server.ts`. The trace in `demo.ts`, the drawn page in `view.ts`, and
 * the browser entry in `client.ts` all run this one application.
 */
import { Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView, type FieldInput } from 'foldkit-mixins-form'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { AuthorChoice, AuthorPage, Blog, PostId, PostPage, PostRow } from './domain.js'
import { EditPostForm } from './editForm.js'
import {
  AuthorsQuery,
  DeletePostMutation,
  EditPostMutation,
  PostSort,
  WritePostMutation,
  PostsQuery,
} from './operations.js'

// The form drawn through Mixins slots, styled where it is used.
const Field = FormView.field(EditPostForm).pipe(
  Style.attach(
    Style.forSlots(FieldSlots)({
      root: Style.class('field'),
      text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
      error: Style.class('field-error'),
    }),
  ),
)
const EditPostView = FormView.define(EditPostForm, { field: Field }).pipe(
  Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') })),
)

// The form and the mutation its value feeds, joined, and given the form's view.
// The editor is a Submodel of the page: a Model field and a Message variant.
export const Editor = Crud.editor('PostEditor', {
  form: EditPostForm,
  mutation: EditPostMutation,
})
const EditSlot = Bundle.declare(
  Editor.bundle.pipe(
    Bundle.withView(Crud.editorView(FormView.submodel(EditPostForm, EditPostView))),
  ),
  'editPost',
)

// Deleting is a mutation with a yes in between.
const Remover = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  // The id it is asked about is a PostId; an AuthorId would not compile.
  input: (id: PostId) => ({ id }),
})
export const RemoverMessage = Remover.Message
const RemoveSlot = Bundle.declare(Remover.bundle, 'removePost')

export const Model = Schema.Struct({
  remote: Remote.Model,
  // What the post list shows is the page's state, and the query's input.
  postSearch: Schema.String,
  postSort: PostSort.Schema,
  ...EditSlot.fields,
  ...RemoveSlot.fields,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
  ...Remote.messages,
  ...EditSlot.cases,
  ...RemoveSlot.cases,
  AskedToDeletePost: { id: PostId },
  OpenedPost: { id: PostId },
  ClosedEditor: {},
  RequestedMorePosts: {},
  SearchedPosts: { text: Schema.String },
  SortedPosts: { sort: PostSort.Schema },
})
export type Message = typeof Message.Type

export const App = Surface.application({ Model, Message })

// The client's interpretation: Remote registers the Entities as they are. It
// never sees a table; relations arrive as refs and the store follows them.
export const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation, DeletePostMutation, WritePostMutation],
  queries: [PostsQuery, AuthorsQuery],
})

// Two lists: a query and a Selection each. They hold no state, so nothing is
// placed; the pages are Remote's.
export const PostList = Crud.list('Posts', { query: PostsQuery, selection: PostRow })
export const Posts = PostList.at({
  data: Data,
  input: (model: Model) => ({ search: model.postSearch, sort: model.postSort }),
})
export const Authors = Crud.list('Authors', {
  query: AuthorsQuery,
  selection: AuthorChoice,
  // How an author reads as a choice: this list feeds the editor's picker.
  choice: { value: row => row.id, label: row => row.name },
}).at({
  data: Data,
  // The picker's search text is the form's; here it becomes the query's input.
  input: (model: Model) => ({ search: EditPostForm.search(model.editPost.form, 'editorId') }),
})

// Where the editor lives: its slice of the Model, and the domain it saves through.
export const PostEditor = Editor.at({ data: Data, model: App.model.editPost })

export const PostRemover = Remover.at({ data: Data, model: App.model.removePost })

// Every relation picker of the form, fed by the list over its target.
// `chosen` keeps the editor a post already has among the choices when a search
// no longer finds them, and `pickers.active` reads them so they can be named.
export const pickers = Crud.options(EditPostForm, [Authors], {
  chosen: (model: Model) => model.editPost.form,
})

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
// The form knows nothing of Remote. The editor's `onOut` is what turns a decoded
// `EditPostInput` into the mutation.
export const EditForm = Page.at(EditSlot, { onOut: PostEditor.onOut })
export const RemoveForm = Page.at(RemoveSlot, { onOut: PostRemover.onOut })

// One list for the page: the editor's placement, and Remote with what is on
// screen. Remote's Messages route to its reducer and its Subscriptions fetch what
// the lists and the open editor require.
export const placements = Page.assemble(
  EditForm,
  RemoveForm,
  // Every piece on the page, handed over: each one's requirement is gathered.
  Data.wiring(Crud.actives({ posts: Posts, authors: Authors, editor: PostEditor, pickers })),
)

// `after` lets the editor show the loaded value whichever Message brings it.
export const update = PostEditor.after(
  placements.update((model: Model, message: Message) => {
    switch (message._tag) {
      case 'OpenedPost':
        return EditForm.helpers.open(message.id)(model)
      case 'AskedToDeletePost':
        return RemoveForm.helpers.ask(message.id)(model)
      case 'ClosedEditor':
        return EditForm.helpers.close()(model)
      case 'RequestedMorePosts': {
        const more = Posts.more(model)
        return more === undefined ? { model } : { model, commands: [more] }
      }
      // Nothing is fetched here: the list's input changed, so Remote requires another connection.
      case 'SearchedPosts':
        return { model: { ...model, postSearch: message.text } }
      case 'SortedPosts':
        return { model: { ...model, postSort: message.sort } }
      default:
        return { model }
    }
  }),
)

export const initial = (): Model =>
  placements.initial({ remote: Remote.initial, postSearch: '', postSort: PostSort.none }).model

export const PostSurface = App.surface('PostPage', {
  params: { postId: Schema.String },
  model: ({ params }) => ({ post: Data.get(PostPage, params.postId) }),
})

export const AuthorSurface = App.surface('AuthorPage', {
  params: { authorId: Schema.String },
  model: ({ params }) => ({ author: Data.get(AuthorPage, params.authorId) }),
})
