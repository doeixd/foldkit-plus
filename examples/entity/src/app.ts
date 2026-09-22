/**
 * The client application: Remote over the domain's Entities, two lists, an
 * editor, and the page that holds them. Nothing here knows a table or a column;
 * that is `server.ts`. The trace in `demo.ts`, the drawn page in `view.ts`, and
 * the browser entry in `client.ts` all run this one application.
 */
import { Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { evo } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView, type FieldInput } from 'foldkit-mixins-form'
import { defineMessageUnion } from 'foldkit/message'
import { debounce } from 'foldkit-primitives/time'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { AuthorChoice, AuthorId, AuthorPage, Blog, PostId, PostPage, PostRow } from './domain.js'
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
  // The input is `{ id }`, so naming the key is enough: the remover is asked about a
  // PostId, the key's own type, and an AuthorId would not compile.
  id: 'id',
})
export const RemoverMessage = Remover.Message
const RemoveSlot = Bundle.declare(Remover.bundle, 'removePost')

/**
 * The search box, debounced.
 *
 * A `QueryRef`'s identity is its input, so a query input that changes as fast
 * as someone types mints a connection and a request per keystroke. The
 * debounce belongs here — between the input Message and the Model field the
 * query reads — and never inside Remote, whose job is to be a faithful
 * function of the Model.
 *
 * `latest` is what the box shows, so typing stays immediate; the settled
 * `OutMessage` is what moves `postSearch`, which is what the query reads.
 */
const SearchInput = debounce({ name: 'PostSearch', value: Schema.String })
const SearchBox = Bundle.declare(SearchInput, 'search')

export const Model = Schema.Struct({
  remote: Remote.Model,
  // What the query reads: the *settled* search, not every keystroke.
  postSearch: Schema.String,
  postSort: PostSort.Schema,
  ...EditSlot.fields,
  ...RemoveSlot.fields,
  ...SearchBox.fields,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
  ...Remote.messages,
  ...EditSlot.cases,
  ...RemoveSlot.cases,
  ...SearchBox.cases,
  AskedToDeletePost: { id: PostId },
  OpenedPost: { id: PostId },
  ClosedEditor: {},
  RequestedMorePosts: {},
  RetriedPosts: {},
  SortedPosts: { sort: PostSort.Schema },
})
export type Message = typeof Message.Type

/** A keystroke, on its way to the debounce rather than to the query. */
export const searched = (text: string): Message =>
  Message.GotSearchMessage({ message: SearchInput.Message.Changed({ value: text }) })

/**
 * The settled search, as the debounce's own Command would deliver it. Its
 * timing is the bundle's and is tested there; this is for driving the wiring
 * by hand, without a clock.
 */
export const searchSettled = (model: Model, text: string): Message =>
  Message.GotSearchMessage({
    message: SearchInput.Message.Settled({ value: text, generation: model.search.generation }),
  })

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
// The settled search, a quarter second after the last keystroke, is the only
// thing that changes the query's input — and so the only thing that fetches.
export const Search = Page.at(SearchBox, {
  args: { delayMs: 250 },
  onOut: out => (model: Model) => ({ model: evo(model, { postSearch: () => out.value }) }),
})

// One list for the page: the editor's placement, and Remote with what is on
// screen. Remote's Messages route to its reducer and its Subscriptions fetch what
// the lists and the open editor require.
export const placements = Page.assemble(
  EditForm,
  RemoveForm,
  Search,
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
      // A failed read is not asked for again on its own; this is the asking.
      case 'RetriedPosts':
        return { model: Posts.refresh(model) }
      case 'SortedPosts':
        return { model: evo(model, { postSort: () => message.sort }) }
      default:
        return { model }
    }
  }),
)

export const initial = (): Model =>
  placements.initial({ remote: Remote.initial, postSearch: '', postSort: PostSort.none }).model

export const PostSurface = App.surface('PostPage', {
  // A Surface's param is the id's own schema, so a route cannot hand a post an author's id.
  params: { postId: PostId },
  model: ({ params }) => ({ post: Data.get(PostPage, params.postId) }),
})

export const AuthorSurface = App.surface('AuthorPage', {
  params: { authorId: AuthorId },
  model: ({ params }) => ({ author: Data.get(AuthorPage, params.authorId) }),
})
