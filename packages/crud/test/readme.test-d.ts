// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import {
  Mutation,
  Query,
  Remote,
  type Page,
  type RemoteClient,
  type RemoteData,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import { Crud, type Choice, type EditorStatus } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })

const EditPostInput = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  authorId: Schema.String,
})
const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
const EditPostForm = Form.make(
  'EditPost',
  Entity.input(Blog.Post, EditPostInput, { authorId: Relation.input(Blog.Post.relations.author) }),
  { inputs: { id: Input.hidden() } },
)

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

const DeletePostMutation = Mutation.make('DeletePost', {
  Input: { id: Schema.String },
  Output: { id: Schema.String },
})
const Remover = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  input: id => ({ id }),
})

// The page: its own field and Messages, and the editor under `editor`.
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle),
  Bundle.withChild('remover', Remover.bundle),
)

const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation, DeletePostMutation],
})

// Where it lives: its slice of the Model, and the domain it saves through.
const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const PostRemover = Remover.at({ data: Data, model: App.model.remover })

const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', { onOut: PostEditor.onOut }),
  Bundle.configure('remover', { onOut: PostRemover.onOut }),
)
const Placed = Page.children.editor
const RemoveForm = Page.children.remover
const { placements } = Page
const Model = Page.Model
void RemoveForm.helpers.ask('p1')

const update = PostEditor.after(
  placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

const subscriptions = Data.subscriptions({ editor: PostEditor.active })
void subscriptions

type Root = typeof Model.Type
expectTypeOf(update).parameter(0).toEqualTypeOf<Root>()
expectTypeOf(PostEditor.status).returns.toEqualTypeOf<EditorStatus>()
declare const root: Root
expectTypeOf(Placed.helpers.open('p2')(root).model).toEqualTypeOf<Root>()
void Placed.helpers.blank()
void Placed.helpers.close()

// The form's value has to be the mutation's input.
const Other = Mutation.make('Other', { Input: { slug: Schema.String }, Output: {} })
// @ts-expect-error EditPostForm submits an EditPostInput, which `Other` does not take
Crud.editor('Mismatched', { form: EditPostForm, mutation: Other })

// The opening example: a list, bound, and its page read.
{
  const AuthorsQuery = Query.make('Authors', {
    Input: { search: Schema.String },
    Result: Query.connection(Blog.Author),
  })
  const OpeningModel = Schema.Struct({ remote: Remote.Model, search: Schema.String })
  const OpeningApp = Surface.application({
    Model: OpeningModel,
    Message: defineMessageUnion({ ...Remote.messages }),
  })
  const Data = Remote.make({
    model: OpeningApp.model.remote,
    entities: Object.values(Blog),
    queries: [AuthorsQuery],
  })

  const Authors = Crud.list('Authors', {
    query: AuthorsQuery,
    selection: Entity.select(Blog.Author, { id: true, name: true }),
  })
  const AuthorList = Authors.at({ data: Data, input: model => ({ search: model.search }) })

  const model: typeof OpeningModel.Type = { remote: Remote.initial, search: '' }
  expectTypeOf(AuthorList.page(model)).toEqualTypeOf<
    RemoteData<Page<{ readonly id: string; readonly name: string }>>
  >()
}

// A list, and its rows as a picker's choices.
{
  const AuthorsQuery = Query.make('Authors', {
    Input: { search: Schema.String },
    Result: Query.connection(Blog.Author),
  })
  const ListModel = Schema.Struct({ remote: Remote.Model, search: Schema.NullOr(Schema.String) })
  const ListApp = Surface.application({
    Model: ListModel,
    Message: defineMessageUnion({ ...Remote.messages }),
  })
  const Data = Remote.make({
    model: ListApp.model.remote,
    entities: Object.values(Blog),
    queries: [AuthorsQuery],
  })

  const Authors = Crud.list('Authors', {
    query: AuthorsQuery,
    selection: Entity.select(Blog.Author, { id: true, name: true }),
    pageSize: 25,
    choice: { value: row => row.id, label: row => row.name },
  })

  const AuthorList = Authors.at({
    data: Data,
    input: model => (model.search === null ? undefined : { search: model.search }),
  })

  const subscriptions = Data.subscriptions({ authors: AuthorList.active })
  void subscriptions

  const model: typeof ListModel.Type = { remote: Remote.initial, search: 'a' }
  expectTypeOf(AuthorList.page(model)).toEqualTypeOf<
    RemoteData<Page<{ readonly id: string; readonly name: string }>>
  >()
  expectTypeOf(Authors.columns[0]!.key).toEqualTypeOf<'id' | 'name'>()
  expectTypeOf(AuthorList.choices(model)).toEqualTypeOf<ReadonlyArray<Choice>>()
  const pickers = Crud.options(EditPostForm, [AuthorList])
  expectTypeOf(pickers(model)).toEqualTypeOf<{
    readonly id?: ReadonlyArray<Choice>
    readonly title?: ReadonlyArray<Choice>
    readonly authorId?: ReadonlyArray<Choice>
  }>()
  // @ts-expect-error the query's input is `{ search }`
  Authors.at({ data: Data, input: () => ({ term: 'a' }) })

  // When a picker searches: the chosen rows stay offered, and are required.
  const searching = Crud.options(EditPostForm, [AuthorList], {
    chosen: (_: typeof ListModel.Type) => EditPostForm.initial,
  })
  expectTypeOf(searching(model).authorId).toEqualTypeOf<ReadonlyArray<Choice> | undefined>()
  void Data.subscriptions({ authors: AuthorList.active, chosen: searching.active })
  expectTypeOf(EditPostForm.search(EditPostForm.initial, 'authorId')).toEqualTypeOf<string>()
}
