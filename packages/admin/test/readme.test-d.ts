// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import { Admin, type EditorStatus } from '../src/index.js'

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

const Editor = Admin.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

const Slot = Bundle.declare(Editor.bundle, 'editor')
const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

const PostEditor = Editor.at({ data: Data, model: App.model.editor })

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
const placements = Page.assemble(Placed)

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
Admin.editor('Mismatched', { form: EditPostForm, mutation: Other })
